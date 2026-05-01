import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { launchBrowser } from '../lib/browser-launch.mjs';
import { parseCliArgs, printUsageBase } from '../lib/cli-args.mjs';
import { createCallbackServer } from '../lib/oauth-callback-server.mjs';
import { automateGoogleAuth } from '../lib/google-auth-browser.mjs';
import { exchangeAuthCode } from '../lib/token-exchange.mjs';

const CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const CALLBACK_TIMEOUT_MS = 180_000;
const AUTH_URL =
  `https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.settings.basic&response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const { help: HELP, headed: HEADED, batch: BATCH, positional } = parseCliArgs();
const EMAIL = positional[0] || process.env.GMAIL_EMAIL || '';
const PASSWORD = positional[1] || process.env.GMAIL_PASSWORD || '';

const ACCOUNTS_PATH = path.join(os.homedir(), '.config', 'opencode', 'antigravity-accounts.json');

function printUsage() {
  printUsageBase('oauth-login.mjs');
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

function oauth2ScreenshotPathBuilder({ label }) {
  if (label === 'after-email') {
    return '/home/jclee/dev/gmail/screenshots/oauth2-01-after-email.png';
  }
  if (label === 'after-password') {
    return '/home/jclee/dev/gmail/screenshots/oauth2-02-after-pw.png';
  }
  if (label.startsWith('consent-')) {
    return `/home/jclee/dev/gmail/screenshots/oauth2-03-${label}.png`;
  }
  return '/home/jclee/dev/gmail/screenshots/oauth2-final.png';
}

async function automateOAuthPage(page, email, password) {
  console.log('[2] Opening OAuth URL...');
  await automateGoogleAuth(page, {
    authUrl: AUTH_URL,
    email,
    password,
    callbackUrlPattern: 'localhost:3000',
    screenshotDir: '/home/jclee/dev/gmail/screenshots',
    screenshotPrefix: 'oauth2',
    maxConsentAttempts: 12,
    includeSignInButtons: false,
    screenshotPathBuilder: oauth2ScreenshotPathBuilder,
  });
  console.log('    Final URL:', page.url().substring(0, 100));
}

async function exchangeCodeForRefreshToken(code) {
  const json = await exchangeAuthCode({
    code,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
  });

  if (!json.refresh_token) {
    throw new Error('Token exchange succeeded but refresh_token was not returned');
  }

  return json.refresh_token;
}

async function onboardSingleAccount(email, password) {
  console.log(`\n=== Onboarding ${email} ===`);
  console.log('[1] Starting callback server...');
  const callback = createCallbackServer({
    port: 3000,
    callbackPath: '/oauth2callback',
    timeoutMs: CALLBACK_TIMEOUT_MS,
    host: 'localhost',
    baseUrl: 'http://localhost:3000',
  });

  const { browser, page } = await launchBrowser({
    headed: HEADED,
    playwrightModule: 'rebrowser-playwright',
  });

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
