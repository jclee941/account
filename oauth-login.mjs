import { chromium } from 'rebrowser-playwright';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CLIENT_ID = '<REDACTED>';
const CLIENT_SECRET = '<REDACTED>';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALLBACK_TIMEOUT_MS = 120_000;
const AUTH_URL =
  'https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.settings.basic&response_type=code&client_id=<REDACTED>&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth2callback';

const args = process.argv.slice(2);
const HELP = args.includes('--help') || args.includes('-h');
const HEADED = args.includes('--headed');
const BATCH = args.includes('--batch');
const positional = args.filter((arg) => !arg.startsWith('--'));
const EMAIL = positional[0] || process.env.GMAIL_EMAIL || '';
const PASSWORD = positional[1] || process.env.GMAIL_PASSWORD || '';

const ACCOUNTS_PATH = path.join(os.homedir(), '.config', 'opencode', 'antigravity-accounts.json');

function printUsage() {
  console.log('Usage: node oauth-login.mjs <email> <password> [--headed]');
  console.log('       node oauth-login.mjs --batch <email1,email2,...> <password> [--headed]');
  console.log('       node oauth-login.mjs --help');
  console.log('');
  console.log('Environment fallback:');
  console.log('  GMAIL_EMAIL, GMAIL_PASSWORD');
  console.log('');
  console.log('Options:');
  console.log('  --batch    Onboard comma-separated emails with one password');
  console.log('  --headed   Launch browser with UI (default: headless)');
  console.log('  -h, --help Show this help and exit');
}

function parseTargetEmails() {
  if (BATCH) {
    return EMAIL.split(',').map((email) => email.trim()).filter(Boolean);
  }
  return EMAIL ? [EMAIL] : [];
}

function createFingerprint() {
  const uaOptions = [
    { suffix: 'darwin/arm64', platform: 'MACOS' },
    { suffix: 'win32/x64', platform: 'WINDOWS' },
    { suffix: 'linux/x64', platform: 'LINUX' },
  ];
  const apiClientOptions = [
    'vscode/1.86.0',
    'vscode/1.87.0',
    'vscode/1.88.0',
    'vscode_cloudshelleditor/0.1',
  ];

  const uaPick = uaOptions[Math.floor(Math.random() * uaOptions.length)];
  const apiClientPick = apiClientOptions[Math.floor(Math.random() * apiClientOptions.length)];

  return {
    deviceId: crypto.randomUUID(),
    sessionToken: crypto.randomBytes(16).toString('hex'),
    userAgent: `antigravity/1.20.5 ${uaPick.suffix}`,
    apiClient: `google-cloud-sdk ${apiClientPick}`,
    clientMetadata: {
      ideType: 'ANTIGRAVITY',
      platform: uaPick.platform,
      pluginType: 'GEMINI',
    },
    createdAt: Date.now(),
  };
}

function startCallbackServer() {
  let timeoutId = null;
  let resolved = false;
  let started = false;
  let server = null;
  let rejectCodePromise = null;
  let resolveStarted = null;
  let rejectStarted = null;

  const startedPromise = new Promise((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });

  const codePromise = new Promise((resolve, reject) => {
    rejectCodePromise = reject;

    server = createServer((req, res) => {
      const requestUrl = new URL(req.url || '/', 'http://localhost:3000');

      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }

      if (requestUrl.pathname !== '/oauth2callback') {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const code = requestUrl.searchParams.get('code');
      const scope = requestUrl.searchParams.get('scope');
      if (!code) {
        res.statusCode = 400;
        res.end('Missing authorization code');
        return;
      }

      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Authorization successful! You can close this tab.', () => {
          server.close();
        });
        resolve({ code, scope: scope || '' });
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeoutId);
      if (!started) {
        rejectStarted(err);
      }
      reject(err);
    });

    server.listen(3000, () => {
      started = true;
      resolveStarted();
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          server.close(() => {
            reject(new Error('OAuth callback timeout after 120 seconds'));
          });
        }
      }, CALLBACK_TIMEOUT_MS);
    });
  });

  return {
    waitUntilListening: () => startedPromise,
    waitForCode: () => codePromise,
    close: async () => {
      clearTimeout(timeoutId);
      if (!resolved && rejectCodePromise) {
        resolved = true;
        rejectCodePromise(new Error('OAuth callback server closed before receiving code'));
      }
      if (server && started) {
        await new Promise((resolve) => {
          server.close(() => resolve());
        });
      }
    },
  };
}

async function exchangeCodeForRefreshToken(code) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(json)}`);
  }

  if (!json.refresh_token) {
    throw new Error('Token exchange succeeded but refresh_token was not returned');
  }

  return json.refresh_token;
}

async function appendAccount(email, refreshToken) {
  await fs.mkdir(path.dirname(ACCOUNTS_PATH), { recursive: true });

  let parsed = { version: 4, accounts: [] };
  try {
    const existing = await fs.readFile(ACCOUNTS_PATH, 'utf8');
    parsed = JSON.parse(existing);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  if (!Array.isArray(parsed.accounts)) {
    parsed.accounts = [];
  }

  // Deduplicate: update existing account or append new one
  const existingIndex = parsed.accounts.findIndex((a) => a.email === email);
  const now = Date.now();
  const entry = {
    email,
    refreshToken,
    addedAt: existingIndex >= 0 ? parsed.accounts[existingIndex].addedAt : now,
    lastUsed: 0,
    enabled: true,
    rateLimitResetTimes: {},
    fingerprint: existingIndex >= 0 ? parsed.accounts[existingIndex].fingerprint : createFingerprint(),
    cachedQuota: {},
    cachedQuotaUpdatedAt: 0,
  };

  if (existingIndex >= 0) {
    console.log(`    Updating existing account entry for ${email}`);
    parsed.accounts[existingIndex] = entry;
  } else {
    parsed.accounts.push(entry);
  }

  await fs.writeFile(ACCOUNTS_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

async function automateOAuthPage(page, email, password) {
  console.log('[2] Opening OAuth URL...');
  await page.goto(AUTH_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  console.log('    Page loaded:', page.url().substring(0, 80));

  console.log('[3] Entering email...');
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ timeout: 10_000 });
  await emailInput.fill(email);
  await page.locator('#identifierNext button, button:has-text("Next"), button:has-text("다음")').first().click();
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: '/home/jclee/dev/gmail/screenshots/oauth2-01-after-email.png' });
  console.log('    After email next:', page.url().substring(0, 80));

  console.log('[4] Entering password...');
  const pwInput = page.locator('input[type="password"]');
  await pwInput.waitFor({ timeout: 10_000 });
  await pwInput.fill(password);
  await page.locator('#passwordNext button, button:has-text("Next"), button:has-text("다음")').first().click();
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: '/home/jclee/dev/gmail/screenshots/oauth2-02-after-pw.png' });
  console.log('    After pw next:', page.url().substring(0, 80));

  for (let attempt = 0; attempt < 8; attempt++) {
    const currentUrl = page.url();
    console.log(`[5.${attempt}] Checking page state...`, currentUrl.substring(0, 80));
    await page.screenshot({ path: `/home/jclee/dev/gmail/screenshots/oauth2-03-consent-${attempt}.png` });

    if (currentUrl.includes('localhost:3000')) {
      console.log('    Callback redirect reached in browser.');
      break;
    }

    const advancedLink = page.locator('a:has-text("Advanced"), a:has-text("고급"), button:has-text("Advanced")');
    if (await advancedLink.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      console.log('    Clicking Advanced...');
      await advancedLink.first().click().catch(() => {});
      await page.waitForTimeout(2_000);
    }

    const goToLink = page.locator(
      'a#proceed-link, a:has-text("Go to"), a:has-text("(unsafe)"), a:has-text("이동")'
    );
    if (await goToLink.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      console.log('    Clicking Go to (unsafe)...');
      await goToLink.first().click().catch(() => {});
      await page.waitForTimeout(3_000);
      continue;
    }

    const checkboxes = page.locator('input[type="checkbox"]:not(:checked)');
    const checkCount = await checkboxes.count().catch(() => 0);
    if (checkCount > 0) {
      console.log(`    Checking ${checkCount} scope checkboxes...`);
      for (let i = 0; i < checkCount; i++) {
        await checkboxes.nth(i).check().catch(() => {});
      }
      await page.waitForTimeout(1_000);
    }

    const allowBtn = page.locator(
      'button:has-text("Allow"), button:has-text("허용"), button:has-text("Continue"), button:has-text("계속")'
    );
    if (await allowBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      console.log('    Clicking Allow/Continue...');
      await allowBtn.first().click().catch(() => {});
      await page.waitForTimeout(4_000);
      continue;
    }

    await page.waitForTimeout(2_500);
  }

  await page.screenshot({ path: '/home/jclee/dev/gmail/screenshots/oauth2-final.png' });
  console.log('    Final URL:', page.url().substring(0, 100));
}

async function onboardSingleAccount(email, password) {
  console.log(`\n=== Onboarding ${email} ===`);
  console.log('[1] Starting callback server...');
  const callback = startCallbackServer();

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await callback.waitUntilListening();
    const callbackPromise = callback.waitForCode();
    await automateOAuthPage(page, email, password);

    console.log('[6] Waiting for OAuth callback code...');
    const { code } = await callbackPromise;
    console.log('[7] Exchanging authorization code for refresh token...');
    const refreshToken = await exchangeCodeForRefreshToken(code);

    console.log('[8] Appending account to antigravity-accounts.json...');
    await appendAccount(email, refreshToken);

    console.log(`✅ Account onboarded: ${email} (refreshToken: ${refreshToken.substring(0, 20)}...)`);
  } catch (err) {
    console.error(`❌ Onboarding failed for ${email}:`, err.message);
    await page.screenshot({ path: '/home/jclee/dev/gmail/screenshots/oauth2-error.png' }).catch(() => {});
    throw err;
  } finally {
    await browser.close().catch(() => {});
    await callback.close().catch(() => {});
  }
}

async function main() {
  if (HELP) {
    printUsage();
    process.exit(0);
  }

  const targetEmails = parseTargetEmails();
  if (!targetEmails.length || !PASSWORD) {
    printUsage();
    process.exit(1);
  }

  for (const email of targetEmails) {
    await onboardSingleAccount(email, PASSWORD);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
