import net from 'node:net';

export const PROXY_TYPES = Object.freeze({
  RESIDENTIAL: 'residential',
  ISP: 'isp',
  MOBILE: 'mobile',
  DATACENTER: 'datacenter',
});

const PROVIDER_PRESETS = Object.freeze({
  iproyal: { defaultType: PROXY_TYPES.RESIDENTIAL, label: 'IPRoyal' },
  brightdata: { defaultType: PROXY_TYPES.RESIDENTIAL, label: 'Bright Data' },
  oxylabs: { defaultType: PROXY_TYPES.RESIDENTIAL, label: 'Oxylabs' },
  smartproxy: { defaultType: PROXY_TYPES.RESIDENTIAL, label: 'Smartproxy' },
  netnut: { defaultType: PROXY_TYPES.ISP, label: 'NetNut' },
  proxyempire: { defaultType: PROXY_TYPES.RESIDENTIAL, label: 'ProxyEmpire' },
  custom: { defaultType: PROXY_TYPES.RESIDENTIAL, label: 'Custom' },
  'free-proxy': { defaultType: PROXY_TYPES.DATACENTER, label: 'Free Proxy Pool' },
});

const COUNTRY_TIMEZONE_HINTS = Object.freeze({
  russia: 'Europe/Moscow',
  ukraine: 'Europe/Kyiv',
  kazakhstan: 'Asia/Almaty',
  indonesia: 'Asia/Jakarta',
  india: 'Asia/Kolkata',
  usa: 'America/New_York',
  us: 'America/New_York',
  korea: 'Asia/Seoul',
  kr: 'Asia/Seoul',
  england: 'Europe/London',
  uk: 'Europe/London',
  canada: 'America/Toronto',
  australia: 'Australia/Sydney',
  germany: 'Europe/Berlin',
});

function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizeProxyType(value, fallback = PROXY_TYPES.RESIDENTIAL) {
  const normalized = normalizeText(value).toLowerCase();
  if (Object.values(PROXY_TYPES).includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function parseHostPort(server) {
  const input = normalizeText(server);
  if (!input) {
    return { protocol: 'http', host: '', port: 0, server: '' };
  }

  const withProtocol = /^[a-z]+:\/\//i.test(input) ? input : `http://${input}`;
  try {
    const parsed = new URL(withProtocol);
    const protocol = parsed.protocol.replace(':', '') || 'http';
    const port = Number(parsed.port || (protocol.startsWith('socks') ? 1080 : 80));
    return {
      protocol,
      host: parsed.hostname,
      port,
      server: `${protocol}://${parsed.hostname}:${port}`,
    };
  } catch {
    return { protocol: 'http', host: '', port: 0, server: '' };
  }
}

function getProviderEnv(provider, env) {
  const key = normalizeText(provider).toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (!key) {
    return {};
  }
  return {
    host: normalizeText(env[`${key}_PROXY_HOST`]),
    port: normalizeText(env[`${key}_PROXY_PORT`]),
    user: normalizeText(env[`${key}_PROXY_USER`]),
    pass: normalizeText(env[`${key}_PROXY_PASS`]),
    country: normalizeText(env[`${key}_PROXY_COUNTRY`]),
    timezone: normalizeText(env[`${key}_PROXY_TIMEZONE`]),
    type: normalizeText(env[`${key}_PROXY_TYPE`]),
  };
}

export function createProxyConfig(input = {}, env = process.env) {
  const provider = normalizeText(input.provider || env.PROXY_PROVIDER || 'custom').toLowerCase();
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  const providerEnv = getProviderEnv(provider, env);

  const explicitServer = normalizeText(input.server || env.PROXY_SERVER);
  const envHost = normalizeText(input.host || env.PROXY_HOST || providerEnv.host);
  const envPort = normalizeText(input.port || env.PROXY_PORT || providerEnv.port);

  const parsedServer = parseHostPort(explicitServer || (envHost && envPort ? `${envHost}:${envPort}` : ''));

  const protocol = normalizeText(input.protocol || parsedServer.protocol || env.PROXY_PROTOCOL || 'http').toLowerCase();
  const host = normalizeText(parsedServer.host || envHost);
  const port = Number(input.port || parsedServer.port || envPort || (protocol.startsWith('socks') ? 1080 : 80));
  const user = normalizeText(input.user || env.PROXY_USER || providerEnv.user);
  const pass = normalizeText(input.pass || env.PROXY_PASS || providerEnv.pass);
  const country = normalizeText(input.country || env.PROXY_COUNTRY || providerEnv.country).toLowerCase();
  const timezone = normalizeText(input.timezone || env.PROXY_TIMEZONE || providerEnv.timezone);
  const type = normalizeProxyType(input.type || env.PROXY_TYPE || providerEnv.type, preset.defaultType);

  const server = host && port > 0 ? `${protocol}://${host}:${port}` : '';
  const warnings = [];
  const requested = Boolean(
    explicitServer ||
    envHost ||
    envPort ||
    normalizeText(input.user || input.pass || input.country || input.timezone || input.type)
  );

  if (type === PROXY_TYPES.DATACENTER) {
    warnings.push('Datacenter proxy selected: high signup failure risk compared to residential/ISP.');
  }
  if (requested && (!host || !Number.isFinite(port) || port <= 0)) {
    warnings.push('Proxy host/port is incomplete. Proxy is disabled.');
  }

  return {
    enabled: Boolean(host && Number.isFinite(port) && port > 0),
    provider,
    providerLabel: preset.label,
    type,
    protocol,
    server,
    host,
    port,
    user,
    pass,
    country,
    timezone,
    warnings,
  };
}

export function evaluateProxyLocationMatch(proxyConfig, expected = {}) {
  const warnings = [];
  const expectedCountry = normalizeText(expected.country).toLowerCase();
  const expectedTimezone = normalizeText(expected.timezone);
  const countryMatches = !expectedCountry || !proxyConfig?.country || proxyConfig.country === expectedCountry;
  const timezoneMatches = !expectedTimezone || !proxyConfig?.timezone || proxyConfig.timezone === expectedTimezone;

  if (!countryMatches) {
    warnings.push(`Proxy country (${proxyConfig.country}) does not match target region (${expectedCountry}).`);
  }
  if (!timezoneMatches) {
    warnings.push(`Proxy timezone (${proxyConfig.timezone}) does not match target timezone (${expectedTimezone}).`);
  }

  return {
    countryMatches,
    timezoneMatches,
    warnings,
  };
}

export function pickTimezoneForProxy(proxyConfig, fallbackTimezones = []) {
  const fallback = Array.isArray(fallbackTimezones) && fallbackTimezones.length > 0
    ? fallbackTimezones
    : ['America/New_York'];

  if (proxyConfig?.timezone) {
    return proxyConfig.timezone;
  }
  if (proxyConfig?.country && COUNTRY_TIMEZONE_HINTS[proxyConfig.country]) {
    return COUNTRY_TIMEZONE_HINTS[proxyConfig.country];
  }
  return fallback[Math.floor(Math.random() * fallback.length)];
}

export async function validateProxyConnectivity(proxyConfig, opts = {}) {
  if (!proxyConfig?.enabled) {
    return {
      ok: true,
      skipped: true,
      message: 'Proxy disabled; connectivity check skipped.',
    };
  }

  const timeoutMs = Number(opts.timeoutMs || 7000);
  const start = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: proxyConfig.host,
      port: proxyConfig.port,
      timeout: timeoutMs,
    });

    const done = (result) => {
      if (!socket.destroyed) socket.destroy();
      resolve({
        ...result,
        latencyMs: Date.now() - start,
      });
    };

    socket.on('connect', () => {
      done({ ok: true, skipped: false, message: 'TCP connectivity to proxy endpoint succeeded.' });
    });

    socket.on('timeout', () => {
      done({ ok: false, skipped: false, message: `Proxy connectivity timeout after ${timeoutMs}ms.` });
    });

    socket.on('error', (error) => {
      done({ ok: false, skipped: false, message: `Proxy connectivity failed: ${String(error?.message || error)}` });
    });
  });
}

export function formatProxySummary(proxyConfig) {
  if (!proxyConfig?.enabled) {
    return 'proxy=disabled';
  }
  const auth = proxyConfig.user ? 'auth=yes' : 'auth=no';
  const loc = [proxyConfig.country || '-', proxyConfig.timezone || '-'].join('/');
  return `provider=${proxyConfig.providerLabel} type=${proxyConfig.type} endpoint=${proxyConfig.server} ${auth} location=${loc}`;
}
