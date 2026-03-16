#!/usr/bin/env node
/**
 * Google Account Age Verification — SMS via 5sim
 *
 * Verifies age for existing Google accounts using phone SMS verification.
 * Reads account credentials from accounts.csv.
 *
 * Usage:
 *   node account/verify-age.mjs --dry-run                                    # preview accounts
 *   xvfb-run node account/verify-age.mjs --start 1 --end 5 --api-key <key>  # verify qws94301~05
 *   xvfb-run node account/verify-age.mjs --headed --api-key <key>            # headed mode
 */

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";
process.env.REBROWSER_PATCHES_UTILITY_WORLD_NAME = "util";
process.env.REBROWSER_PATCHES_SOURCE_URL = "jquery.min.js";

import { chromium } from "rebrowser-playwright";
import { createCursor } from "ghost-cursor-playwright";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const DRY_RUN = args.includes("--dry-run");
const START = parseInt(getArg("start", "1"), 10);
const END = parseInt(getArg("end", "50"), 10);
const HEADED = args.includes("--headed");
const FIVESIM_API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "").trim();
const SMS_PROVIDER = getArg("sms-provider", process.env.SMS_PROVIDER || "5sim").trim().toLowerCase();
const SMS_API_KEY = getArg("sms-key", "").trim() || FIVESIM_API_KEY;
const FIVESIM_REGION = getArg("region", process.env.FIVESIM_REGION || "russia").trim();
const PROXY_SERVER = getArg("proxy", process.env.PROXY_SERVER || "").trim();
const PROXY_USER = getArg("proxy-user", process.env.PROXY_USER || "").trim();
const PROXY_PASS = getArg("proxy-pass", process.env.PROXY_PASS || "").trim();
const FORCE_OPERATOR = getArg("operator", "").trim();

const PREFIX = "qws943";
const CSV_FILE = join(import.meta.dirname, "..", "accounts.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "..", "screenshots");

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-infobars",
  "--disable-features=IsolateOrigins,site-per-process,WebRtcHideLocalIpsWithMdns",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--enforce-webrtc-ip-permission-check",
  "--disable-web-security",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-component-update",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
  "--disable-webrtc-hw-encoding",
  "--disable-webrtc-hw-decoding",
];

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

async function getBodyText(page) {
  return (await page.textContent("body").catch(() => "")) || "";
}

function extractSmsCode(body) {
  if (!body?.sms || !Array.isArray(body.sms) || body.sms.length === 0) return "";
  const first = body.sms[0];
  const fromCodeField = String(first?.code || "").trim();
  if (fromCodeField) return fromCodeField;

  const text = String(first?.text || "");
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1] : "";
}

const REGION_COUNTRY_CODE = {
  russia: "+7", ukraine: "+380", kazakhstan: "+7", china: "+86",
  philippines: "+63", indonesia: "+62", malaysia: "+60", kenya: "+254",
  india: "+91", usa: "+1", england: "+44", korea: "+82",
};

function normalizePhone(phone, region) {
  let p = String(phone || "").trim();
  const prefix = REGION_COUNTRY_CODE[region];
  if (prefix && p.startsWith(prefix)) {
    p = p.slice(prefix.length);
  } else if (p.startsWith("+")) {
    p = p.slice(1);
  }
  return p;
}

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function cursorClick(cursor, page, locator) {
  try {
    const el = await locator.elementHandle({ timeout: 5000 });
    if (el) {
      await cursor.click(el);
      return;
    }
  } catch {}
  await locator.click();
}

function selectorForText(text) {
  const safe = text.replaceAll('"', '\\"');
  return `button:has-text("${safe}"), a:has-text("${safe}"), [role="button"]:has-text("${safe}"), span:has-text("${safe}")`;
}

async function clickByTexts(page, cursor, texts, timeout = 3000) {
  for (const text of texts) {
    const locator = page.locator(selectorForText(text)).first();
    const visible = await locator.isVisible({ timeout }).catch(() => false);
    if (!visible) continue;

    if (cursor) {
      await cursorClick(cursor, page, locator);
    } else {
      await locator.click();
    }
    return true;
  }
  return false;
}

async function clickNextLike(page, cursor) {
  return clickByTexts(page, cursor, ["다음", "Next", "Continue", "다음으로", "Verify", "확인", "Далее", "Продолжить", "Подтвердить", "Berikutnya", "Lanjutkan", "Verifikasi"]);
}

async function fiveSimGetJson(url, apiKey) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  const rawText = await response.text();
  let body = {};
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { message: rawText };
  }

  if (!response.ok) {
    let message = body?.message || rawText || `5sim request failed (${response.status})`;
    if (response.status === 401) {
      message = "Unauthorized API key. 5sim v1/user endpoints require Authorization: Bearer <API_KEY>. Verify --api-key/FIVESIM_API_KEY from your 5sim account.";
    }
    throw new Error(`5sim HTTP ${response.status}: ${String(message).slice(0, 200)}`);
  }
  return body;
}

async function getBestOperator(apiKey, region) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/guest/prices?country=${encodeURIComponent(region)}&product=google`,
    apiKey
  );

  const operatorMap = body?.google?.[region] || body?.[region]?.google;
  if (!operatorMap || typeof operatorMap !== "object") {
    throw new Error(`No operators available for region: ${region}`);
  }

  const sorted = Object.entries(operatorMap)
    .filter(([, info]) => (info?.count || 0) > 0)
    .sort(([, a], [, b]) => {
      return Number(b?.rate || 0) - Number(a?.rate || 0);
    });

  if (sorted.length === 0) {
    throw new Error(`No operator data found for region: ${region}`);
  }

  return sorted[0][0];
}

async function buyNumber(apiKey, region, operator) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/user/buy/activation/${encodeURIComponent(region)}/${encodeURIComponent(operator)}/google`,
    apiKey
  );

  return {
    phone: normalizePhone(body?.phone, region),
    id: body?.id,
    cost: extractOrderCost(body),
    raw: body,
  };
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
  const body = await fiveSimGetJson("https://5sim.net/v1/user/profile", apiKey);
  const balance = Number(body?.balance);
  return Number.isFinite(balance) ? balance : 0;
}

const SMSACTIVATE_COUNTRY_CODES = {
  russia: "0", ukraine: "1", kazakhstan: "2", indonesia: "6",
  india: "22", usa: "12", england: "16", korea: "19",
  china: "3", philippines: "4", malaysia: "7", kenya: "36",
};

async function smsActivateRequest(apiKey, action, params = {}) {
  const url = new URL("https://api.sms-activate.org/stubs/handler_api.php");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("action", action);
  url.searchParams.set("json", "1");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const resp = await fetch(url.toString());
  const text = (await resp.text()).trim();

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const statusText =
    typeof parsed === "string"
      ? parsed
      : parsed?.message || parsed?.error || parsed?.status || text;

  if (String(statusText).startsWith("BAD_KEY")) throw new Error("sms-activate: Invalid API key");
  if (String(statusText).startsWith("NO_NUMBERS")) throw new Error("sms-activate: No numbers available for this country/service");
  if (String(statusText).startsWith("NO_BALANCE")) throw new Error("sms-activate: Insufficient balance");
  if (String(statusText).startsWith("BAD_ACTION")) throw new Error(`sms-activate: Bad action '${action}'`);
  if (String(statusText).startsWith("BAD_SERVICE")) throw new Error("sms-activate: Bad service code");
  if (String(statusText).startsWith("ERROR_SQL")) throw new Error("sms-activate: Server SQL error");

  return parsed ?? text;
}

async function smsActivateBuyNumber(apiKey, region) {
  const countryCode = SMSACTIVATE_COUNTRY_CODES[region] ?? SMSACTIVATE_COUNTRY_CODES.russia;
  const body = await smsActivateRequest(apiKey, "getNumber", { service: "go", country: countryCode });

  const asText = typeof body === "string" ? body : "";
  let id = "";
  let rawPhone = "";

  if (asText) {
    const match = asText.match(/^ACCESS_NUMBER:(\d+):(\d+)$/);
    if (match) {
      id = match[1];
      rawPhone = match[2];
    }
  } else if (body && typeof body === "object") {
    id = String(body?.activation || body?.id || "");
    rawPhone = String(body?.phone || body?.number || "").replace(/\D/g, "");
  }

  if (!id || !rawPhone) {
    const preview = asText || JSON.stringify(body || {}).slice(0, 100);
    throw new Error(`sms-activate: Unexpected getNumber response: ${preview.slice(0, 100)}`);
  }

  return {
    phone: normalizePhone(rawPhone, region),
    id,
    cost: 0,
    raw: { activationId: id, phoneNumber: rawPhone, response: body },
  };
}

async function smsActivateCheckSms(apiKey, id) {
  const body = await smsActivateRequest(apiKey, "getStatus", { id });

  if (typeof body === "string") {
    if (body === "STATUS_WAIT_CODE") return { status: "waiting" };
    const codeMatch = body.match(/^STATUS_OK:(\d+)$/);
    if (codeMatch) return { status: "received", code: codeMatch[1] };
    if (body === "STATUS_CANCEL") return { status: "cancelled" };
    return { status: "unknown", raw: body };
  }

  const status = String(body?.status || "").toUpperCase();
  if (status === "STATUS_WAIT_CODE" || status === "WAIT_CODE") return { status: "waiting" };
  const code = String(body?.code || body?.sms || "").trim();
  if (code) return { status: "received", code };
  if (status === "STATUS_CANCEL" || status === "CANCEL") return { status: "cancelled" };
  return { status: "unknown", raw: body };
}

async function smsActivateFinish(apiKey, id) {
  return smsActivateRequest(apiKey, "setStatus", { id, status: "6" });
}

async function smsActivateCancel(apiKey, id) {
  return smsActivateRequest(apiKey, "setStatus", { id, status: "8" });
}

async function smsActivateGetBalance(apiKey) {
  const body = await smsActivateRequest(apiKey, "getBalance", {});

  if (typeof body === "string") {
    const match = body.match(/^ACCESS_BALANCE:([\d.]+)$/);
    if (!match) throw new Error(`sms-activate: Unexpected balance response: ${body.slice(0, 100)}`);
    return parseFloat(match[1]);
  }

  const value = Number(body?.balance);
  if (!Number.isFinite(value)) {
    throw new Error(`sms-activate: Unexpected balance response: ${JSON.stringify(body || {}).slice(0, 100)}`);
  }
  return value;
}

function createSmsProvider(providerName, apiKey, region) {
  if (providerName === "sms-activate") {
    return {
      name: "sms-activate",
      buyNumber: () => smsActivateBuyNumber(apiKey, region),
      checkSms: (id) => smsActivateCheckSms(apiKey, id),
      finishNumber: (id) => smsActivateFinish(apiKey, id),
      cancelNumber: (id) => smsActivateCancel(apiKey, id),
      getBalance: () => smsActivateGetBalance(apiKey),
    };
  }
  return {
    name: "5sim",
    buyNumber: async () => {
      const operator = FORCE_OPERATOR || await getBestOperator(apiKey, region);
      console.log(`  [5sim] Using operator: ${operator}${FORCE_OPERATOR ? " (forced)" : " (auto-selected)"}`);
      return buyNumber(apiKey, region, operator);
    },
    checkSms: (id) => checkSms(apiKey, id),
    finishNumber: (id) => finishNumber(apiKey, id),
    cancelNumber: (id) => cancelNumber(apiKey, id),
    getBalance: () => getFiveSimBalance(apiKey),
  };
}

const DESKTOP_DEVICE = {
  viewport: { width: 1920, height: 1080 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  deviceScaleFactor: 1.25,
  isMobile: false,
  hasTouch: false,
};

function padNum(n) {
  return String(n).padStart(2, "0");
}

function screenshotPath(email, step) {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const safeEmail = String(email).replace(/[^a-zA-Z0-9@._-]/g, "_");
  return join(SCREENSHOT_DIR, `verify-age-${safeEmail}-${step}.png`);
}

async function takeShot(page, email, step) {
  const p = screenshotPath(email, step);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

function parseAccountsCsvRaw(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let current = "";
  const rowEndPattern = /,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*$/;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    current = current ? `${current}\n${line}` : line;
    if (rowEndPattern.test(current)) {
      out.push(current);
      current = "";
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

function readAccounts() {
  if (!existsSync(CSV_FILE)) {
    throw new Error(`accounts.csv not found: ${CSV_FILE}`);
  }
  const csv = readFileSync(CSV_FILE, "utf-8");
  const rows = parseAccountsCsvRaw(csv);
  const byUsername = new Map();

  for (const row of rows) {
    const firstComma = row.indexOf(",");
    const secondComma = row.indexOf(",", firstComma + 1);
    const thirdComma = row.indexOf(",", secondComma + 1);
    if (firstComma === -1 || secondComma === -1 || thirdComma === -1) continue;
    const username = row.slice(0, firstComma).trim();
    const email = row.slice(firstComma + 1, secondComma).trim();
    const password = row.slice(secondComma + 1, thirdComma).trim();
    if (!username || !email || !password) continue;
    byUsername.set(username, { username, email, password });
  }

  return byUsername;
}

async function selectPhoneVerificationMethod(page, cursor) {
  const clickedPreferred = await clickByTexts(page, cursor, ["전화번호 인증"], 2500);
  if (clickedPreferred) return true;
  return clickByTexts(page, cursor, ["Phone number", "Verify by phone", "전화번호로 인증", "전화번호", "Номер телефона"], 2500);
}

async function openAgeVerification(page, cursor, email) {
  const urls = [
    "https://myaccount.google.com/personal-info",
    "https://myaccount.google.com/u/0/age-verification",
    "https://accounts.google.com/speedbump/ageverification",
  ];

  const ageTexts = [
    "나이 인증",
    "연령 확인",
    "age verification",
    "verify your age",
    "Подтвердите возраст",
  ];

  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await delay(randomInt(1500, 3000));

    const body = (await getBodyText(page)).toLowerCase();
    const hasText = ageTexts.some((t) => body.includes(t.toLowerCase()));
    const hasPhoneAction = await selectPhoneVerificationMethod(page, cursor).catch(() => false);

    if (hasText || hasPhoneAction) {
      await takeShot(page, email, "age-verification-found");
      return true;
    }
  }

  return false;
}

async function waitForGoogleLoginResult(page) {
  const timeoutAt = Date.now() + 60000;
  while (Date.now() < timeoutAt) {
    const url = page.url();
    if (url.includes("myaccount.google.com") || url.includes("mail.google.com") || url.includes("accounts.google.com/v3/signin/challenge/pwd")) {
      if (url.includes("myaccount.google.com") || url.includes("mail.google.com")) return { ok: true };
    }
    const body = await getBodyText(page);
    const challenge =
      body.includes("2-Step Verification") ||
      body.includes("2단계 인증") ||
      body.includes("보안 확인") ||
      body.includes("security check") ||
      body.includes("전화번호를 확인") ||
      body.includes("기기에서 확인") ||
      body.includes("Try another way");
    if (challenge) {
      return { ok: false, reason: "security-prompt" };
    }
    await delay(1500);
  }
  return { ok: false, reason: "login-timeout" };
}

async function handlePhoneVerification(page, cursor, smsProvider, email) {
  let activePhoneId = null;
  let totalCost = 0;

  try {
    const phoneInput = page.locator('#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
    const phoneInputVisible = await phoneInput.isVisible({ timeout: 5000 }).catch(() => false);

    const bodyText = await getBodyText(page);
    const phonePromptDetected =
      bodyText.includes("phone number") ||
      bodyText.includes("전화번호") ||
      bodyText.includes("verification") ||
      bodyText.includes("номер телефона") ||
      bodyText.includes("подтверждение");

    if (!phoneInputVisible && !phonePromptDetected) {
      return { cost: totalCost, activePhoneId: null, status: "no-phone-step" };
    }

    for (let numberAttempt = 1; numberAttempt <= 5; numberAttempt++) {
      let order = null;

      for (let buyAttempt = 1; buyAttempt <= 3; buyAttempt++) {
        try {
          const currentBalance = await smsProvider.getBalance();
          if (currentBalance < 1) {
            throw new Error(`${smsProvider.name} balance too low (${currentBalance.toFixed(4)}). Cannot buy number.`);
          }
          order = await smsProvider.buyNumber();
          if (!order?.id || !order?.phone) {
            throw new Error(`${smsProvider.name} buy returned invalid order payload`);
          }
          break;
        } catch (err) {
          console.log(`    ⚠️ Buy number failed (${buyAttempt}/3): ${err.message.slice(0, 120)}`);
          if (buyAttempt < 3) {
            await delay(randomInt(1500, 2500));
          }
        }
      }

      if (!order) {
        throw new Error("Unable to buy phone number after 3 attempts");
      }

      activePhoneId = order.id;
      totalCost += extractOrderCost(order);
      console.log(`    📱 Number ${numberAttempt}/5: ${order.phone} (id=${order.id})`);

      let phoneReady = false;
      for (let waitAttempt = 0; waitAttempt < 12; waitAttempt++) {
        const freshPhoneInput = page.locator('#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
        const visible = await freshPhoneInput.isVisible({ timeout: 3000 }).catch(() => false);
        if (visible) {
          phoneReady = true;
          await takeShot(page, email, "phone-input-visible");
          break;
        }
        await delay(2000);
      }

      if (!phoneReady) {
        throw new Error("Phone input field not found on page after extended wait");
      }

      const readyPhoneInput = page.locator('#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
      await readyPhoneInput.fill("");
      await delay(randomInt(400, 800));
      await humanType(page, readyPhoneInput, order.phone);

      const clickedNext = await clickNextLike(page, cursor);
      if (!clickedNext) {
        throw new Error("Next button not found after entering phone number");
      }

      await delay(10000);

      const phoneBody = await getBodyText(page);
      const rejected =
        phoneBody.includes("This phone number cannot be used for verification") ||
        phoneBody.includes("cannot be used for verification") ||
        phoneBody.includes("이 전화번호는 인증에 사용할 수 없습니다") ||
        phoneBody.includes("이 전화번호는 인증용으로 사용할 수 없습니다") ||
        phoneBody.includes("Этот номер телефона нельзя использовать для подтверждения") ||
        phoneBody.includes("нельзя использовать для подтверждения") ||
        phoneBody.includes("Nomor telepon ini tidak dapat digunakan untuk verifikasi") ||
        phoneBody.includes("tidak dapat digunakan untuk verifikasi");

      if (rejected) {
        await smsProvider.cancelNumber(activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(randomInt(1000, 2500));
        continue;
      }

      const codeInput = page.locator('#code, input[name="code"], input[type="tel"][inputmode="numeric"]').first();
      await codeInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      await takeShot(page, email, "code-input-visible");

      let code = "";
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        const smsState = await smsProvider.checkSms(activePhoneId);
        code = smsState?.code || extractSmsCode(smsState);
        if (code) break;
        await delay(5000);
      }

      if (!code) {
        await smsProvider.cancelNumber(activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      await codeInput.fill("");
      await delay(randomInt(200, 500));
      await humanType(page, codeInput, code);

      const clickedVerify = await clickByTexts(page, cursor, ["다음", "Next", "Verify", "확인", "확인하기", "Далее", "Подтвердить", "Berikutnya", "Verifikasi", "Konfirmasi"]);
      if (!clickedVerify) {
        throw new Error("Verify/Next button not found after SMS code input");
      }

      await delay(randomInt(4000, 6000));
      await smsProvider.finishNumber(activePhoneId).catch(() => {});
      activePhoneId = null;
      await takeShot(page, email, "verification-success");
      return { cost: totalCost, activePhoneId: null, status: "verified" };
    }

    throw new Error("Phone verification failed after 5 different numbers");
  } catch (err) {
    if (activePhoneId) {
      await smsProvider.cancelNumber(activePhoneId).catch(() => {});
      activePhoneId = null;
    }
    throw err;
  }
}

async function verifyAge(account, smsProvider) {
  const proxyArgs = PROXY_SERVER ? [`--proxy-server=${PROXY_SERVER}`] : [];
  const launchOptions = {
    headless: !HEADED,
    args: [...STEALTH_ARGS, ...proxyArgs],
  };

  if (PROXY_SERVER && PROXY_USER && !PROXY_SERVER.startsWith("socks")) {
    launchOptions.proxy = {
      server: PROXY_SERVER,
      username: PROXY_USER,
      password: PROXY_PASS,
    };
  }

  const browser = await chromium.launch(launchOptions);
  const contextOptions = {
    ...DESKTOP_DEVICE,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    extraHTTPHeaders: { "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7" },
  };

  if (PROXY_USER && PROXY_PASS) {
    contextOptions.httpCredentials = { username: PROXY_USER, password: PROXY_PASS };
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const cursor = await createCursor(page);

  let cost = 0;

  try {
    await page.goto("https://accounts.google.com/signin", { waitUntil: "domcontentloaded", timeout: 30000 });
    await takeShot(page, account.email, "login-page");

    const emailInput = page.locator('input[type="email"], input[name="identifier"]').first();
    await emailInput.waitFor({ state: "visible", timeout: 15000 });
    await humanType(page, emailInput, account.email);
    if (!(await clickNextLike(page, cursor))) {
      throw new Error("Next button not found on email step");
    }

    const passwordInput = page.locator('input[type="password"], input[name="Passwd"]').first();
    await passwordInput.waitFor({ state: "visible", timeout: 25000 });
    await humanType(page, passwordInput, account.password);
    if (!(await clickNextLike(page, cursor))) {
      throw new Error("Next button not found on password step");
    }

    const loginResult = await waitForGoogleLoginResult(page);
    if (!loginResult.ok) {
      await takeShot(page, account.email, "login-error");
      throw new Error(`Login not completed: ${loginResult.reason}`);
    }
    await takeShot(page, account.email, "login-success");

    const foundAgeVerification = await openAgeVerification(page, cursor, account.email);
    if (!foundAgeVerification) {
      return { status: "no-age-prompt", cost };
    }

    await selectPhoneVerificationMethod(page, cursor);

    const phoneResult = await handlePhoneVerification(page, cursor, smsProvider, account.email);
    cost += Number(phoneResult?.cost || 0);
    return { status: phoneResult?.status || "verified", cost };
  } catch (err) {
    await takeShot(page, account.email, "error");
    throw err;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function targetUsername(n) {
  return `${PREFIX}${padNum(n)}`;
}

function ensureScreenshotDir() {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function main() {
  ensureScreenshotDir();
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, "username,email,password,firstName,lastName,koreanName,cost,status,timestamp\n");
  }

  const accountsByUsername = readAccounts();
  const targets = [];
  for (let n = START; n <= END; n++) {
    const username = targetUsername(n);
    const account = accountsByUsername.get(username);
    if (account) targets.push(account);
  }

  if (targets.length === 0) {
    console.log(`No matching accounts found for range ${START}..${END}`);
    return;
  }

  console.log(`Target range: ${START}..${END}`);
  console.log(`Matched accounts: ${targets.length}`);
  console.log(`SMS provider: ${SMS_PROVIDER}`);
  console.log(`Region: ${FIVESIM_REGION}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Accounts to verify:");
    for (const a of targets) {
      console.log(`- ${a.username} (${a.email})`);
    }
    return;
  }

  if (!SMS_API_KEY) {
    throw new Error("Missing SMS API key. Use --api-key or FIVESIM_API_KEY (or --sms-key for sms-activate).");
  }

  const smsProvider = createSmsProvider(SMS_PROVIDER, SMS_API_KEY, FIVESIM_REGION);
  const startBalance = await smsProvider.getBalance().catch(() => null);
  if (startBalance !== null) {
    console.log(`Starting balance (${smsProvider.name}): ${Number(startBalance).toFixed(4)}`);
  }

  let success = 0;
  let fail = 0;
  let totalCost = 0;

  for (const account of targets) {
    console.log(`\n=== ${account.username} / ${account.email} ===`);
    try {
      const result = await verifyAge(account, smsProvider);
      totalCost += Number(result.cost || 0);
      if (result.status === "verified" || result.status === "no-age-prompt" || result.status === "no-phone-step") {
        success += 1;
      } else {
        fail += 1;
      }
      console.log(`✅ Result: ${result.status} | cost +${Number(result.cost || 0).toFixed(4)}`);
    } catch (err) {
      fail += 1;
      console.log(`❌ Failed: ${err.message}`);
    }

    await delay(randomInt(30000, 60000));
  }

  const endBalance = await smsProvider.getBalance().catch(() => null);
  console.log("\n=== Summary ===");
  console.log(`Success: ${success}`);
  console.log(`Fail: ${fail}`);
  console.log(`Total cost: ${totalCost.toFixed(4)}`);
  if (startBalance !== null && endBalance !== null) {
    console.log(`Balance: ${Number(startBalance).toFixed(4)} -> ${Number(endBalance).toFixed(4)}`);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
