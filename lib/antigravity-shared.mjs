/**
 * Shared utilities for Antigravity automation scripts.
 *
 * Consolidates duplicated code from antigravity-auth.mjs and unlock-features.mjs:
 *   - OAuth constants (CLIENT_ID, CLIENT_SECRET, SCOPES)
 *   - Browser stealth + device config (STEALTH_ARGS, DESKTOP_DEVICE)
 *   - Utility functions (delay, humanType, normalizePhone, normalizeEmail, etc.)
 *   - 5sim SMS verification integration
 *   - Google verification UI detection & interaction
 *   - Unified SMS verification flow (handleSmsVerification)
 *   - CLI helpers (getArg)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Antigravity OAuth Constants ──────────────────────────────────────────────

export const CLIENT_ID = '<REDACTED>';
export const CLIENT_SECRET = '<REDACTED>';
export const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PASSWORD = 'bingogo1';
export const DEFAULT_REGION = 'indonesia';

export const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--password-store=basic',
  '--use-mock-keychain',
];

export const DESKTOP_DEVICE = {
  viewport: { width: 1280, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// ── Utility Functions ────────────────────────────────────────────────────────

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function getBodyText(page) {
  return (await page.textContent('body').catch(() => '')) || '';
}

export async function humanType(page, locator, text) {
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

export function normalizePhone(phone) {
  const p = String(phone || '').trim();
  if (!p) return '';
  if (p.startsWith('+')) return `+${p.slice(1).replace(/\D/g, '')}`;
  return p.replace(/\D/g, '');
}

export function extractSmsCode(body) {
  if (!body?.sms || !Array.isArray(body.sms) || body.sms.length === 0) return '';
  const first = body.sms[0];
  const fromCodeField = String(first?.code || '').trim();
  if (fromCodeField) return fromCodeField;
  const text = String(first?.text || '');
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1] : '';
}

/**
 * Extract order cost from 5sim order response.
 * Handles all known field names: price, cost, amount.
 */
export function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize email — append @gmail.com if missing domain.
 * Fixes bug where bare usernames (e.g. "qws94302") were stored without domain.
 */
export function normalizeEmail(email) {
  if (!email) return '';
  const trimmed = String(email).trim();
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed : `${trimmed}@gmail.com`;
}

// ── Browser Helpers ──────────────────────────────────────────────────────────

export function selectorForText(text) {
  const safe = text.replaceAll('"', '\\"');
  return `button:has-text("${safe}"), a:has-text("${safe}"), [role="button"]:has-text("${safe}"), span:has-text("${safe}")`;
}

export async function clickByTexts(page, texts, timeout = 3000) {
  for (const text of texts) {
    const locator = page.locator(selectorForText(text)).first();
    const visible = await locator.isVisible({ timeout }).catch(() => false);
    if (!visible) continue;
    await locator.click().catch(() => {});
    return true;
  }
  return false;
}

/**
 * Save screenshot with configurable prefix and directory.
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {string} label
 * @param {{ prefix?: string, dir?: string }} [opts]
 */
export async function saveShot(page, email, label, opts = {}) {
  const screenshotDir = opts.dir || join(process.cwd(), 'screenshots');
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });
  const safeEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = opts.prefix || '';
  const file = join(screenshotDir, `${prefix}${safeEmail}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

/**
 * Create a bound saveShot with fixed prefix and directory.
 * Returns a 3-arg function: (page, email, label) => Promise<string>
 */
export function createSaveShot({ prefix = '', dir } = {}) {
  return (page, email, label) => saveShot(page, email, label, { prefix, dir });
}

/**
 * Create a prefixed log-step counter.
 */
export function createLogStep(prefix = '') {
  let step = 0;
  const logStep = (msg) => {
    step += 1;
    const tag = prefix ? `[${prefix}][${step}]` : `[${step}]`;
    console.log(`${tag} ${msg}`);
  };
  logStep.reset = () => { step = 0; };
  return logStep;
}

// ── CLI Helpers ──────────────────────────────────────────────────────────────

export function getArg(argv, name, fallback) {
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

// ── OAuth Token Validation ───────────────────────────────────────────────────

/**
 * Validate a refresh token against Google OAuth2 endpoint.
 * @param {string} refreshToken
 * @returns {Promise<{ valid: boolean, accessToken?: string, expiresIn?: number, scope?: string, error?: string, description?: string }>}
 */
export async function validateRefreshToken(refreshToken) {
  if (!refreshToken) {
    return { valid: false, error: 'no_token', description: 'No refresh token provided' };
  }
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });
    const data = await response.json();
    if (response.ok && data.access_token) {
      return {
        valid: true,
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        scope: data.scope,
      };
    }
    return {
      valid: false,
      error: data.error || 'unknown',
      description: data.error_description || '',
    };
  } catch (err) {
    return {
      valid: false,
      error: 'network_error',
      description: String(err.message),
    };
  }
}

// ── 5sim Integration ─────────────────────────────────────────────────────────

export async function fiveSimGetJson(url, apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, { method: 'GET', headers });
  const rawText = await response.text();
  let body = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = { message: rawText }; }

  if (!response.ok) {
    let message = body?.message || rawText || `5sim request failed (${response.status})`;
    if (response.status === 401) {
      message = 'Unauthorized API key. 5sim v1/user endpoints require Authorization: Bearer <API_KEY>. '
        + 'Verify --api-key/FIVESIM_API_KEY from your 5sim account.';
    }
    throw new Error(`5sim HTTP ${response.status}: ${String(message).slice(0, 200)}`);
  }
  return body;
}

export async function getBestOperator(apiKey, region) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/guest/prices?country=${encodeURIComponent(region)}&product=google`,
    apiKey,
  );
  const operatorMap = body?.google?.[region] || body?.[region]?.google;
  if (!operatorMap || typeof operatorMap !== 'object') {
    throw new Error(`No operators available for region: ${region}`);
  }
  const sorted = Object.entries(operatorMap)
    .filter(([, info]) => (info?.count || 0) > 0)
    .sort(([, a], [, b]) => Number(b?.rate || 0) - Number(a?.rate || 0));
  if (sorted.length === 0) throw new Error(`No operator data found for region: ${region}`);
  return sorted[0][0];
}

export async function buyNumber(apiKey, region, operator) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/user/buy/activation/${region}/${operator}/google`,
    apiKey,
  );
  return {
    phone: normalizePhone(body?.phone),
    id: body?.id,
    cost: extractOrderCost(body),
    raw: body,
  };
}

export async function checkSms(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/check/${encodeURIComponent(id)}`, apiKey);
}

export async function finishNumber(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/finish/${encodeURIComponent(id)}`, apiKey);
}

export async function cancelNumber(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/cancel/${encodeURIComponent(id)}`, apiKey);
}

export async function getFiveSimBalance(apiKey) {
  const body = await fiveSimGetJson('https://5sim.net/v1/user/profile', apiKey);
  const balance = Number(body?.balance);
  return Number.isFinite(balance) ? balance : 0;
}

// ── Verification UI Detection ────────────────────────────────────────────────

/**
 * Detect Google verification challenge on page.
 * Merged superset of all detection patterns (EN/KR/RU/ID + URL patterns).
 */
export function hasVerificationChallenge(bodyText, pageUrl) {
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

/**
 * Detect verification success on page.
 * Checks for success indicators in EN/KR/RU/ID + myaccount URL.
 */
export function verificationSucceeded(bodyText, pageUrl) {
  const body = String(bodyText || '');
  return (
    body.includes('인증')
    || body.includes('확인')
    || body.includes('verified')
    || body.includes('verification complete')
    || body.includes('완료')
    || body.includes('успешно')
    || body.includes('berhasil')
    || (pageUrl || '').includes('myaccount.google.com')
  );
}

// ── SMS Option Selection ─────────────────────────────────────────────────────

const SMS_OPTION_TEXTS = [
  '전화번호 인증', '전화번호로 인증', '문자 메시지', '인증 코드 보내기',
  'SMS', 'SMS verification', 'Text message', 'Phone verification',
  'Verify with phone number', 'Send a code', 'Phone number',
  'Verify your identity', '신원 확인', '본인 확인', '휴대전화 번호', '전화번호',
  'СМС', 'Текстовое сообщение', 'Номер телефона', 'Отправить код',
  'Подтвердите личность',
  'Kirim SMS', 'Kirim', 'Dapatkan kode verifikasi',
  'Try another way', '다른 방법으로 인증',
];

/**
 * Select SMS/phone verification option with fallback detection.
 * Merged superset: includes phoneHint regex fallback from unlock-features.
 */
export async function selectSmsOption(page, email, shotFn) {
  const clicked = await clickByTexts(page, SMS_OPTION_TEXTS, 6000);

  if (!clicked) {
    // Fallback: check if phone-related text is already visible on page
    const phoneHint = await page
      .locator(
        'text=/전화번호 인증|문자 메시지|SMS|Text message|Phone verification|Verify your identity|신원 확인|본인 확인|номер телефона|СМС|Kirim SMS|Dapatkan kode verifikasi/',
      )
      .first()
      .isVisible({ timeout: 4000 })
      .catch(() => false);

    if (!phoneHint) {
      if (shotFn) await shotFn(page, email, 'sms-option-not-found');
      throw new Error('Could not select phone/SMS verification option');
    }
  }

  await delay(randomInt(1500, 3000));
}

// ── Verification Flow Opener ─────────────────────────────────────────────────

const FLOW_OPENER_TEXTS = [
  'Take steps', 'Gain access', 'Continue', 'Start', 'Verify',
  'Try another way', '다음', '계속', '시작', '확인', '본인 확인', '신원 확인',
  'Продолжить', 'Проверить', 'Далее', 'Lanjutkan', 'Berikutnya', 'Verifikasi',
];

export async function openVerificationFlow(page, email, shotFn) {
  const clicked = await clickByTexts(page, FLOW_OPENER_TEXTS, 5000);
  if (clicked) {
    await delay(randomInt(1800, 3200));
    if (shotFn) await shotFn(page, email, 'verification-flow-opened');
  }
}

// ── Phone Input Helpers ──────────────────────────────────────────────────────

const PHONE_INPUT_SELECTOR = [
  '#phoneNumberId',
  'input[name="phoneNumber"]',
  'input[type="tel"]',
  'input[autocomplete="tel"]',
  'input[aria-label*="phone"]',
  'input[aria-label*="전화"]',
  'input[aria-label*="телефон"]',
  'input[placeholder*="phone"]',
  'input[placeholder*="전화"]',
  'input[placeholder*="телефон"]',
].join(', ');

export async function waitForPhoneInput(page) {
  for (let i = 0; i < 12; i++) {
    const loc = page.locator(PHONE_INPUT_SELECTOR).first();
    const visible = await loc.isVisible({ timeout: 2500 }).catch(() => false);
    if (visible) return loc;
    await delay(2000);
  }
  throw new Error('Phone number input field did not appear');
}

const CODE_INPUT_SELECTOR = [
  '#code',
  'input[name="code"]',
  'input[type="tel"][inputmode="numeric"]',
  'input[autocomplete="one-time-code"]',
  'input[aria-label*="code"]',
  'input[aria-label*="인증"]',
  'input[aria-label*="код"]',
].join(', ');

export async function waitForCodeInput(page) {
  const codeInput = page.locator(CODE_INPUT_SELECTOR).first();
  await codeInput.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const visible = await codeInput.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) throw new Error('Verification code input field did not appear');
  return codeInput;
}

// ── Phone Rejection Detection ────────────────────────────────────────────────

const PHONE_NEXT_TEXTS = [
  '다음', 'Next', 'Continue', '확인', 'Verify', '제출', 'Submit',
  'Далее', 'Продолжить', 'Подтвердить', 'Berikutnya', 'Lanjutkan', 'Kirim',
];

const PHONE_REJECTION_PATTERNS = [
  'This phone number cannot be used for verification',
  'cannot be used for verification',
  '이 전화번호는 인증에 사용할 수 없습니다',
  '이 전화번호는 인증용으로 사용할 수 없습니다',
  'Этот номер телефона нельзя использовать для подтверждения',
  'нельзя использовать для подтверждения',
  'Nomor telepon ini tidak dapat digunakan',
];

const CODE_VERIFY_TEXTS = [
  '다음', 'Next', 'Verify', '확인', '확인하기', '제출', 'Submit',
  'Далее', 'Подтвердить', 'Продолжить', 'Berikutnya', 'Verifikasi',
];

/**
 * Unified SMS verification flow.
 * Merged superset from antigravity-auth.mjs and unlock-features.mjs:
 *   - Uses extractOrderCost for consistent cost tracking
 *   - Includes all phone rejection patterns (EN/KR/RU/ID)
 *   - 5 number attempts × 3 buy retries, 120s SMS poll timeout
 *
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {string} apiKey - 5sim API key
 * @param {string} region - 5sim region
 * @param {{ shotFn?: Function, logFn?: Function }} [opts]
 * @returns {Promise<{ verified: boolean, cost: number }>}
 */
export async function handleSmsVerification(page, email, apiKey, region, opts = {}) {
  const log = opts.logFn || ((msg) => console.log(msg));
  const shot = opts.shotFn || ((p, e, l) => saveShot(p, e, l));
  let activePhoneId = null;
  let totalCost = 0;

  try {
    const operator = await getBestOperator(apiKey, region);
    log(`    [5sim] Best operator for ${region}: ${operator}`);

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
          log(`    ⚠️ Buy attempt ${buyTry}/3 failed: ${String(err.message).slice(0, 120)}`);
          if (buyTry < 3) await delay(randomInt(1500, 2500));
        }
      }

      if (!order) throw new Error('Unable to buy phone number after 3 attempts');

      activePhoneId = order.id;
      totalCost += order.cost;
      log(`    📱 Number ${attempt}/5: ${order.phone} (id=${order.id})`);

      const phoneInput = await waitForPhoneInput(page);
      await phoneInput.fill('');
      await delay(randomInt(400, 800));
      await humanType(page, phoneInput, order.phone);
      await shot(page, email, `phone-filled-${attempt}`);

      const clickedNext = await clickByTexts(page, PHONE_NEXT_TEXTS, 6000);
      if (!clickedNext) throw new Error('Next/Verify button not found after phone input');

      await delay(10000);
      await shot(page, email, `phone-submitted-${attempt}`);

      const phoneBody = await getBodyText(page);
      const rejected = PHONE_REJECTION_PATTERNS.some((p) => phoneBody.includes(p));

      if (rejected) {
        log('    ⚠️ Phone rejected by Google. Cancelling & retrying...');
        await cancelNumber(apiKey, activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(randomInt(1000, 2500));
        continue;
      }

      log('    ⏳ Phone accepted. Polling SMS...');
      const codeInput = await waitForCodeInput(page);

      let code = '';
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const smsState = await checkSms(apiKey, activePhoneId);
        code = smsState?.code || extractSmsCode(smsState);
        if (code) break;
        await delay(5000);
      }

      if (!code) {
        log('    ⚠️ SMS timeout. Cancelling & retrying...');
        await cancelNumber(apiKey, activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      log(`    🔐 SMS code: ${code}`);
      await codeInput.fill('');
      await delay(randomInt(200, 500));
      await humanType(page, codeInput, code);
      await shot(page, email, `code-filled-${attempt}`);

      const clickedVerify = await clickByTexts(page, CODE_VERIFY_TEXTS, 6000);
      if (!clickedVerify) throw new Error('Verify button not found after SMS code');

      await delay(randomInt(5000, 8000));
      await shot(page, email, `verification-done-${attempt}`);
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

// ── Exported Constants for Selectors (testing) ───────────────────────────────

export { SMS_OPTION_TEXTS, FLOW_OPENER_TEXTS, PHONE_INPUT_SELECTOR, CODE_INPUT_SELECTOR };
export { PHONE_NEXT_TEXTS, PHONE_REJECTION_PATTERNS, CODE_VERIFY_TEXTS };
