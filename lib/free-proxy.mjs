import { execFileSync } from 'node:child_process';

const DEFAULT_SOURCES = [
  {
    name: 'Geonode',
    url: 'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks5',
    parser: async (response) => {
      const json = await response.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      return rows
        .map((row) => `${String(row?.ip || '').trim()}:${String(row?.port || '').trim()}`)
        .filter((value) => value !== ':');
    },
  },
  {
    name: 'ProxyScrape',
    url: 'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all',
    parser: async (response) => parseIpPortLines(await response.text()),
  },
  {
    name: 'proxifly',
    url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt',
    parser: async (response) => parseIpPortLines(await response.text()),
  },
  {
    name: 'TheSpeedX',
    url: 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt',
    parser: async (response) => parseIpPortLines(await response.text()),
  },
  {
    name: 'monosans',
    url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
    parser: async (response) => parseIpPortLines(await response.text()),
  },
  {
    name: 'hookzof',
    url: 'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
    parser: async (response) => parseIpPortLines(await response.text()),
  },
];

function parseIpPortLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$/.test(line));
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = list[i];
    list[i] = list[j];
    list[j] = temp;
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; FreeProxyPool/1.0)',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export class FreeProxyPool {
  constructor(options = {}) {
    this.protocol = options.protocol || 'socks5';
    this.validateTimeout = Number(options.validateTimeout || 10000);
    this.validateUrl = options.validateUrl || 'https://www.google.com';
    this.maxValidateRetries = Number(options.maxValidateRetries || 2);
    this.sources = options.sources || DEFAULT_SOURCES;

    this.pool = [];
    this.cursor = 0;
    this.badSet = new Set();
    this.validatedSet = new Set();
  }

  async fetch() {
    console.log(`🌐 Fetching free ${this.protocol.toUpperCase()} proxies from ${this.sources.length} sources...`);

    const results = await Promise.allSettled(
      this.sources.map(async (source) => {
        try {
          const response = await fetchWithTimeout(source.url, 15000);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const proxies = await source.parser(response);
          console.log(`✅ ${source.name}: ${proxies.length} proxies`);
          return proxies;
        } catch (error) {
          console.log(`❌ ${source.name}: ${String(error?.message || error).slice(0, 120)}`);
          return [];
        }
      })
    );

    const merged = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        merged.push(...result.value);
      }
    }

    const deduped = Array.from(new Set(merged)).filter((proxy) => !this.badSet.has(proxy));
    shuffleInPlace(deduped);

    this.pool = deduped;
    this.cursor = 0;

    console.log(`🌐 Proxy pool ready: ${this.pool.length} total (deduped + shuffled)`);
    return this.pool.length;
  }

  async validate(proxy) {
    if (!proxy || this.badSet.has(proxy)) {
      return false;
    }

    const proxyUrl = `${this.protocol}://${proxy}`;

    for (let attempt = 1; attempt <= this.maxValidateRetries; attempt += 1) {
      try {
        execFileSync(
          'curl',
          [
            '--proxy',
            proxyUrl,
            '--head',
            '--silent',
            '--show-error',
            '--location',
            '--connect-timeout',
            String(Math.ceil(this.validateTimeout / 1000)),
            '--max-time',
            String(Math.ceil(this.validateTimeout / 1000) + 5),
            this.validateUrl,
          ],
          {
            stdio: 'ignore',
            timeout: this.validateTimeout + 5000,
          }
        );

        this.validatedSet.add(proxy);
        return true;
      } catch {
        if (attempt >= this.maxValidateRetries) {
          this.badSet.add(proxy);
        }
      }
    }

    return false;
  }

  async next() {
    if (this.pool.length === 0 || this.cursor >= this.pool.length) {
      await this.refresh();
    }

    let tried = 0;
    while (tried < 10 && this.cursor < this.pool.length) {
      const proxy = this.pool[this.cursor];
      this.cursor += 1;
      tried += 1;

      if (this.badSet.has(proxy)) {
        continue;
      }

      const ok = await this.validate(proxy);
      if (ok) {
        return `${this.protocol}://${proxy}`;
      }
    }

    return null;
  }

  markBad(proxy) {
    if (!proxy) {
      return;
    }

    const normalized = String(proxy).startsWith(`${this.protocol}://`)
      ? String(proxy).slice(`${this.protocol}://`.length)
      : String(proxy);

    this.badSet.add(normalized);
    this.pool = this.pool.filter((item) => item !== normalized);
    if (this.cursor > this.pool.length) {
      this.cursor = this.pool.length;
    }
  }

  async refresh() {
    console.log('🌐 Refreshing free proxy pool...');
    return this.fetch();
  }

  get stats() {
    const remaining = this.pool
      .slice(this.cursor)
      .filter((proxy) => !this.badSet.has(proxy)).length;

    return {
      total: this.pool.length,
      validated: this.validatedSet.size,
      bad: this.badSet.size,
      remaining,
    };
  }
}
