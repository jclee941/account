#!/usr/bin/env node
/**
 * Antigravity Initial Authentication
 *
 * Complete flow:
 *   1. Start OAuth callback server
 *   2. Build Antigravity auth URL (Client ID 1071006060591)
 *   3. Launch browser → Google login
 *   4. Detect & handle SMS verification challenge via 5sim
 *   5. Complete OAuth consent
 *   6. Exchange auth code → refresh token
 *   7. Output results (JSON)
 *
 * Usage:
 *   node antigravity-auth.mjs --batch qws94302@gmail.com,qws94303@gmail.com --api-key <5SIM_KEY> [--region indonesia] [--headed] [--password bingogo1]
 */

import crypto from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCallbackServer } from '../lib/oauth-callback-server.mjs';
import { exchangeAuthCode } from '../lib/token-exchange.mjs';

// ── Antigravity OAuth constants ──────────────────────────────────────────────
const CLIENT_ID = '<REDACTED>';
const CLIENT_SECRET = '<REDACTED>';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_PASSWORD = 'bingogo1';
const DEFAULT_REGION = 'indonesia';
const SCREENSHOT_DIR = join(import.meta.dirname, '..', 'screenshots');
const RESULTS_FILE = join(import.meta.dirname, 'antigravity-auth-results.json');

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--password-store=basic',
  '--use-mock-keychain',
];

const DESKTOP_DEVICE = {
  viewport: { width: 1280, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// ── CLI parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const BATCH = getArg('batch', '');
const ACCOUNTS = String(BATCH || '').split(',').map((v) => v.trim()).filter(Boolean);
const PASSWORD = getArg('password', DEFAULT_PASSWORD).trim();
const HEADED = args.includes('--headed');
const FIVESIM_API_KEY = getArg('api-key', process.env.FIVESIM_API_KEY || '').trim();
const FIVESIM_REGION = getArg('region', process.env.FIVESIM_REGION || DEFAULT_REGION).trim();

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage:');
  console.log('  node antigravity-auth.mjs --batch email1@gmail.com,email2@gmail.com --api-key <5SIM_KEY> [--region indonesia] [--headed] [--password bingogo1]');
  console.log('');
  console.log('Options:');
  console.log('  --batch      Comma-separated email addresses');
  console.log('  --api-key    5sim API key (or FIVESIM_API_KEY env)');
  console.log('  --region     5sim region (default: indonesia)');
  console.log('  --password   Google password (default: bingogo1)');
  console.log('  --headed     Show browser window');
  process.exit(0);
}

if (ACCOUNTS.length === 0) {
  console.error('Missing --batch with at least one email address');
  process.exit(1);
}

if (!FIVESIM_API_KEY) {
  console.error('Missing 5sim API key. Use --api-key <KEY> or set FIVESIM_API_KEY');
  process.exit(1);
}

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// ── Utilities ────────────────────────────────────────────────────────────────
let stepNo = 0;
function logStep(msg) {
  stepNo += 1;
  console.log(`[${stepNo}] ${msg}`);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getBodyText(page) {
  return (await page.textContent('body').catch(() => '')) || '';
}

async function humanType(page, locator, text) {
  await locator.click();
  await delay(randomInt(200, 500));
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i], { delay: randomInt(150, 450) });
    if (i > 0 && i % randomInt(3, 5) === 0) {
      await delay(randomInt(400, 800));
    }
  }
  await delay(randomInt(500, 1000));
}

function normalizePhone(phone) {
  const p = String(phone || '').trim();
  if (!p) return '';
  if (p.startsWith('+')) return `+${p.slice(1).replace(/\D/g, '')}`;
  return p.replace(/\D/g, '');
}

function extractSmsCode(body) {
  if (!body?.sms || !Array.isArray(body.sms) || body.sms.length === 0) return '';
  const first = body.sms[0];
  const fromCodeField = String(first?.code || '').trim();
  if (fromCodeField) return fromCodeField;
  const text = String(first?.text || '');
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1] : '';
}

function selectorForText(text) {
  const safe = text.replaceAll('"', '\\"');
  return `button:has-text("${safe}"), a:has-text("${safe}"), [role="button"]:has-text("${safe}"), span:has-text("${safe}")`;
}

async function clickByTexts(page, texts, timeout = 3000) {
  for (const text of texts) {
    const locator = page.locator(selectorForText(text)).first();
    const visible = await locator.isVisible({ timeout }).catch(() => false);
    if (!visible) continue;
    await locator.click().catch(() => {});
    return true;
  }
  return false;
}

async function saveShot(page, email, label) {
  const safeEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = join(SCREENSHOT_DIR, `ag-${safeEmail}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

// ── 5sim integration ─────────────────────────────────────────────────────────
async function fiveSimGetJson(url, apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, { method: 'GET', headers });
  const rawText = await response.text();
  let body = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = { message: rawText }; }

  if (!response.ok) {
    let message = body?.message || rawText || `5sim request failed (${response.status})`;
    if (response.status === 401) {
      message = 'Unauthorized 5sim API key. Verify --api-key value.';
    }
    throw new Error(`5sim HTTP ${response.status}: ${String(message).slice(0, 200)}`);
  }
  return body;
}

async function getBestOperator(apiKey, region) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/guest/prices?country=${encodeURIComponent(region)}&product=google`,
    apiKey,
  );
  const operatorMap = body?.google?.[region] || body?.[region]?.google;
  if (!operatorMap || typeof operatorMap !== 'object') {
    throw new Error(`No operators for region: ${region}`);
  }
  const sorted = Object.entries(operatorMap)
    .filter(([, info]) => (info?.count || 0) > 0)
    .sort(([, a], [, b]) => Number(b?.rate || 0) - Number(a?.rate || 0));
  if (sorted.length === 0) throw new Error(`No operator data for region: ${region}`);
  return sorted[0][0];
}

async function buyNumber(apiKey, region, operator) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/user/buy/activation/${region}/${operator}/google`,
    apiKey,
  );
  return { phone: normalizePhone(body?.phone), id: body?.id, cost: Number(body?.price ?? body?.cost ?? 0), raw: body };
}

async function checkSms(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/check/${encodeURIComponent(id)}`, apiKey);
}

async function finishNumber(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/finish/${encodeURIComponent(id)}`, apiKey);
}

async function cancelNumber(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/cancel/${encodeURIComponent(id)}`, apiKey);
}

async function getFiveSimBalance(apiKey) {
  const body = await fiveSimGetJson('https://5sim.net/v1/user/profile', apiKey);
  const balance = Number(body?.balance);
  return Number.isFinite(balance) ? balance : 0;
}

// ── Verification UI detection & SMS handling ─────────────────────────────────
function hasVerificationChallenge(bodyText, pageUrl) {
  const lower = String(bodyText || '').toLowerCase();
  const url = String(pageUrl || '');
  return (
    lower.includes('verify your identity')
    || lower.includes('verification code')
    || lower.includes('text message')
    || lower.includes('send a code')
    || lower.includes('phone number')
    || lower.includes('take steps')
    || lower.includes('certain features')
    || lower.includes('access to certain')
    || bodyText.includes('신원 확인')
    || bodyText.includes('본인 확인')
    || bodyText.includes('문자 메시지')
    || bodyText.includes('인증 코드')
    || bodyText.includes('전화번호')
    || bodyText.includes('전화번호 인증')
    || bodyText.includes('확인하세요')
    || bodyText.includes('정보를 확인')
    || bodyText.includes('Подтвердите')
    || bodyText.includes('проверочный код')
    || bodyText.includes('номер телефона')
    || bodyText.includes('Kirim SMS')
    || bodyText.includes('Dapatkan kode verifikasi')
    || url.includes('speedbump')
    || url.includes('challenge')
    || url.includes('idv')
    || url.includes('verification')
    || url.includes('signin/v2')
  );
}

async function selectSmsOption(page, email) {
  const clicked = await clickByTexts(page, [
    '전화번호 인증', '전화번호로 인증', '문자 메시지', '인증 코드 보내기',
    'SMS', 'SMS verification', 'Text message', 'Phone verification',
    'Verify with phone number', 'Send a code', 'Phone number',
    'Verify your identity', '신원 확인', '본인 확인', '휴대전화 번호', '전화번호',
    'СМС', 'Текстовое сообщение', 'Номер телефона', 'Отправить код',
    'Kirim SMS', 'Kirim', 'Dapatkan kode verifikasi',
    'Try another way', '다른 방법으로 인증',
  ], 6000);

  if (!clicked) {
    await saveShot(page, email, 'sms-option-not-found');
    throw new Error('Could not select SMS verification option');
  }
  await delay(randomInt(1500, 3000));
}

async function openVerificationFlow(page, email) {
  const clicked = await clickByTexts(page, [
    'Take steps', 'Gain access', 'Continue', 'Start', 'Verify',
    'Try another way', '다음', '계속', '시작', '확인', '본인 확인', '신원 확인',
    'Продолжить', 'Проверить', 'Далее', 'Lanjutkan', 'Berikutnya', 'Verifikasi',
  ], 5000);
  if (clicked) {
    await delay(randomInt(1800, 3200));
    await saveShot(page, email, 'verification-flow-opened');
  }
}

async function waitForPhoneInput(page) {
  const sel = '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"], input[placeholder*="phone"], input[placeholder*="전화"]';
  for (let i = 0; i < 12; i++) {
    const loc = page.locator(sel).first();
    const visible = await loc.isVisible({ timeout: 2500 }).catch(() => false);
    if (visible) return loc;
    await delay(2000);
  }
  throw new Error('Phone number input field did not appear');
}

async function waitForCodeInput(page) {
  const codeInput = page.locator(
    '#code, input[name="code"], input[type="tel"][inputmode="numeric"], input[autocomplete="one-time-code"], input[aria-label*="code"], input[aria-label*="인증"], input[aria-label*="код"]',
  ).first();
  await codeInput.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const visible = await codeInput.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) throw new Error('Verification code input field did not appear');
  return codeInput;
}

async function handleSmsVerification(page, email, apiKey, region) {
  let activePhoneId = null;
  let totalCost = 0;

  try {
    const operator = await getBestOperator(apiKey, region);
    logStep(`[5sim] Best operator for ${region}: ${operator}`);

    for (let attempt = 1; attempt <= 5; attempt++) {
      let order = null;

      for (let buyTry = 1; buyTry <= 3; buyTry++) {
        try {
          const balance = await getFiveSimBalance(apiKey);
          if (balance < 1) throw new Error(`5sim balance too low (${balance.toFixed(4)})`);
          order = await buyNumber(apiKey, region, operator);
          if (!order?.id || !order?.phone) throw new Error('Invalid 5sim order payload');
          break;
        } catch (err) {
          console.log(`    ⚠️ Buy attempt ${buyTry}/3 failed: ${String(err.message).slice(0, 120)}`);
          if (buyTry < 3) await delay(randomInt(1500, 2500));
        }
      }

      if (!order) throw new Error('Unable to buy phone number after 3 attempts');

      activePhoneId = order.id;
      totalCost += order.cost;
      logStep(`📱 Number ${attempt}/5: ${order.phone} (id=${order.id})`);

      const phoneInput = await waitForPhoneInput(page);
      await phoneInput.fill('');
      await delay(randomInt(400, 800));
      await humanType(page, phoneInput, order.phone);
      await saveShot(page, email, `phone-filled-${attempt}`);

      const clickedNext = await clickByTexts(page, [
        '다음', 'Next', 'Continue', '확인', 'Verify', '제출', 'Submit',
        'Далее', 'Продолжить', 'Подтвердить', 'Berikutnya', 'Lanjutkan', 'Kirim',
      ], 6000);
      if (!clickedNext) throw new Error('Next/Verify button not found after phone input');

      await delay(10000);
      await saveShot(page, email, `phone-submitted-${attempt}`);

      const phoneBody = await getBodyText(page);
      const rejected = phoneBody.includes('cannot be used for verification')
        || phoneBody.includes('이 전화번호는 인증에 사용할 수 없습니다')
        || phoneBody.includes('이 전화번호는 인증용으로 사용할 수 없습니다')
        || phoneBody.includes('нельзя использовать для подтверждения')
        || phoneBody.includes('Nomor telepon ini tidak dapat digunakan');

      if (rejected) {
        console.log('    ⚠️ Phone rejected by Google. Cancelling & retrying...');
        await cancelNumber(apiKey, activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(randomInt(1000, 2500));
        continue;
      }

      logStep('⏳ Phone accepted. Polling SMS...');
      const codeInput = await waitForCodeInput(page);

      let code = '';
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const smsState = await checkSms(apiKey, activePhoneId);
        code = smsState?.code || extractSmsCode(smsState);
        if (code) break;
        await delay(5000);
      }

      if (!code) {
        console.log('    ⚠️ SMS timeout. Cancelling & retrying...');
        await cancelNumber(apiKey, activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      logStep(`🔐 SMS code: ${code}`);
      await codeInput.fill('');
      await delay(randomInt(200, 500));
      await humanType(page, codeInput, code);
      await saveShot(page, email, `code-filled-${attempt}`);

      const clickedVerify = await clickByTexts(page, [
        '다음', 'Next', 'Verify', '확인', '확인하기', '제출', 'Submit',
        'Далее', 'Подтвердить', 'Продолжить', 'Berikutnya', 'Verifikasi',
      ], 6000);
      if (!clickedVerify) throw new Error('Verify button not found after SMS code');

      await delay(randomInt(5000, 8000));
      await saveShot(page, email, `verification-done-${attempt}`);
      await finishNumber(apiKey, activePhoneId).catch(() => {});
      activePhoneId = null;

      return { verified: true, cost: totalCost };
    }

    throw new Error('SMS verification failed after 5 numbers');
  } catch (err) {
    if (activePhoneId) await cancelNumber(apiKey, activePhoneId).catch(() => {});
    throw err;
  }
}

// ── OAuth consent handling (post-verification) ───────────────────────────────
async function handleOAuthConsent(page, callbackUrlPattern, maxAttempts = 15) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentUrl = page.url();

    if (currentUrl.includes(callbackUrlPattern)) return true;

    // Advanced / unsafe link
    const advancedLink = page.locator('a:has-text("고급"), a:has-text("Advanced"), button:has-text("Advanced")');
    if (await advancedLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await advancedLink.first().click().catch(() => {});
      await delay(2000);
    }

    const goToLink = page.locator('a#proceed-link, a:has-text("Go to"), a:has-text("(unsafe)"), a:has-text("이동")');
    if (await goToLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await goToLink.first().click().catch(() => {});
      await delay(3000);
      continue;
    }

    // Checkboxes (scope consent)
    const checkboxes = page.locator('input[type="checkbox"]:not(:checked)');
    const checkCount = await checkboxes.count().catch(() => 0);
    if (checkCount > 0) {
      for (let i = 0; i < checkCount; i++) {
        await checkboxes.nth(i).check().catch(() => {});
      }
      await delay(1000);
    }

    // Allow / Continue buttons
    const allowBtn = page.locator([
      'button:has-text("허용")', 'button:has-text("Allow")',
      'button:has-text("계속")', 'button:has-text("Continue")',
      'button:has-text("로그인")', 'button:has-text("Sign in")',
    ].join(', '));
    if (await allowBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await allowBtn.first().click().catch(() => {});
      await delay(5000);
      if (page.url().includes(callbackUrlPattern)) return true;
    }

    await delay(2000);
  }
  return false;
}

// ── Per-account flow ─────────────────────────────────────────────────────────
async function runForAccount(browser, email, password, apiKey, region) {
  const state = crypto.randomUUID();

  // 1. Start callback server
  const callback = createCallbackServer({
    port: 0,
    callbackPath: '/oauth-callback',
    timeoutMs: 300_000,
    host: 'localhost',
  });
  await callback.waitUntilListening();
  const port = callback.getPort();
  const redirectUri = `http://localhost:${port}/oauth-callback`;

  // 2. Build auth URL
  const params = new URLSearchParams({
    access_type: 'offline',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // 3. Browser context
  const context = await browser.newContext({
    ...DESKTOP_DEVICE,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  });
  const page = await context.newPage();

  // URL monitoring
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url.includes('verification') || url.includes('idv') || url.includes('speedbump')
        || url.includes('challenge') || url.includes('signin/v2') || url.includes('deniedsigninrejected')) {
        console.log(`  🔔 ${url.substring(0, 150)}`);
      }
    }
  });

  try {
    logStep(`Starting Antigravity auth: ${email}`);

    // 4. Navigate to OAuth URL
    await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await delay(2000);
    await saveShot(page, email, 'initial');

    // 5. Google login — email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ timeout: 10_000 });
    await emailInput.fill(email);
    await page.locator('#identifierNext button, button:has-text("다음"), button:has-text("Next")').first().click();
    await delay(4000);
    await saveShot(page, email, 'after-email');

    // 6. Google login — password
    const pwInput = page.locator('input[type="password"]');
    await pwInput.waitFor({ timeout: 10_000 });
    await pwInput.fill(password);
    await page.locator('#passwordNext button, button:has-text("다음"), button:has-text("Next")').first().click();
    await delay(6000);
    await saveShot(page, email, 'after-password');

    // Check login failure
    const loginBody = await getBodyText(page);
    if (loginBody.includes('잘못된 비밀번호') || loginBody.includes('Wrong password')) {
      throw new Error('Login failed: Wrong password');
    }

    // 7. Check for verification challenge
    const bodyText = await getBodyText(page);
    const currentUrl = page.url();
    const needsVerification = hasVerificationChallenge(bodyText, currentUrl);

    if (needsVerification) {
      logStep(`🛡️ Verification challenge detected for ${email}`);
      await saveShot(page, email, 'verification-detected');

      // Try to open the verification flow
      await openVerificationFlow(page, email);
      await delay(2000);

      // Select SMS option
      await selectSmsOption(page, email);
      await saveShot(page, email, 'sms-selected');

      // Handle SMS verification via 5sim
      const result = await handleSmsVerification(page, email, apiKey, region);
      logStep(`✅ SMS verification passed for ${email} (cost: ${result.cost.toFixed(4)})`);
      await delay(3000);
    } else {
      logStep(`No verification challenge for ${email}. Proceeding to consent.`);
    }

    // 8. Handle OAuth consent
    const callbackPattern = `localhost:${port}`;
    const callbackPromise = callback.waitForCode();

    // Check if already redirected
    if (!page.url().includes(callbackPattern)) {
      const consentOk = await handleOAuthConsent(page, callbackPattern);
      if (!consentOk) {
        await saveShot(page, email, 'consent-failed');
        throw new Error('OAuth consent flow did not reach callback');
      }
    }

    // 9. Wait for auth code
    logStep('Waiting for OAuth callback...');
    const callbackResult = await Promise.race([
      callbackPromise,
      delay(30_000).then(() => null),
    ]);

    if (!callbackResult || !callbackResult.code) {
      await saveShot(page, email, 'no-callback');
      const finalBody = await getBodyText(page);
      throw new Error(`No auth code received. Page: ${page.url()} Content: ${finalBody.substring(0, 500)}`);
    }

    const { code } = callbackResult;
    logStep(`📥 Auth code received: ${code.substring(0, 25)}...`);

    // 10. Exchange for tokens
    const tokens = await exchangeAuthCode({
      code,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri,
    });

    if (tokens.error) {
      throw new Error(`Token exchange error: ${tokens.error} — ${tokens.error_description}`);
    }

    logStep(`🎉 Refresh token obtained for ${email}`);
    console.log(`  Access token: ${tokens.access_token.substring(0, 30)}...`);
    console.log(`  Refresh token: ${tokens.refresh_token || 'NONE'}`);
    console.log(`  Scope: ${tokens.scope}`);

    // 11. Quick Gemini API test
    try {
      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
            'x-goog-user-project': 'anthropic-antigravity',
          },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello in one word' }] }] }),
        },
      );
      console.log(`  Gemini API test: ${geminiRes.status}`);
    } catch (err) {
      console.log(`  Gemini API test failed: ${err.message}`);
    }

    return {
      email,
      success: true,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      scope: tokens.scope,
      expiresIn: tokens.expires_in,
      error: '',
    };
  } catch (err) {
    await saveShot(page, email, 'error').catch(() => {});
    return { email, success: false, refreshToken: '', accessToken: '', error: String(err.message || err) };
  } finally {
    await context.close().catch(() => {});
    await callback.close().catch(() => {});
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Antigravity Initial Authentication ===');
  console.log(`Accounts: ${ACCOUNTS.join(', ')}`);
  console.log(`Region: ${FIVESIM_REGION}`);
  console.log(`Headed: ${HEADED}\n`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: !HEADED,
    args: STEALTH_ARGS,
  });

  const results = [];

  try {
    for (const email of ACCOUNTS) {
      stepNo = 0;
      const result = await runForAccount(browser, email, PASSWORD, FIVESIM_API_KEY, FIVESIM_REGION);
      results.push(result);

      if (result.success) {
        console.log(`\n✅ ${email}: refresh_token=${result.refreshToken?.substring(0, 30)}...\n`);
      } else {
        console.log(`\n❌ ${email}: ${result.error}\n`);
      }

      if (ACCOUNTS.indexOf(email) < ACCOUNTS.length - 1) {
        await delay(randomInt(8000, 15000));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Save results
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${RESULTS_FILE}`);

  // Summary
  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${results.length} | Success: ${ok} | Failed: ${fail}`);

  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
