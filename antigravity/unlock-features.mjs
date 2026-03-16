#!/usr/bin/env node

// Use regular playwright — rebrowser-playwright's CDP patches corrupt fill() on password fields
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const DEFAULT_REGION = "indonesia";
const DEFAULT_PASSWORD = "bingogo1";
const SCREENSHOT_DIR = join(import.meta.dirname, "..", "screenshots");

const DESKTOP_DEVICE = {
  viewport: { width: 1280, height: 800 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
];

const TARGET_URLS = [
  "https://accounts.google.com/speedbump/idvreenable",
  "https://myaccount.google.com/security",
  "https://gds.google.com/web/chip",
  "https://accounts.google.com/signin/v2/challenge/selection",
  "https://myaccount.google.com/",
  "https://myaccount.google.com/signinoptions/rescuephone",
];

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function usage() {
  console.log("Usage:");
  console.log(
    "  node unlock-features.mjs --batch email1@gmail.com,email2@gmail.com [password] --api-key <5sim_key> --region indonesia --headed"
  );
  console.log("");
  console.log("Examples:");
  console.log("  node unlock-features.mjs --batch qws94302@gmail.com,qws94303@gmail.com bingogo1 --api-key <KEY>");
  console.log("  node unlock-features.mjs --batch qws94302@gmail.com --password bingogo1 --headed");
}

function parseAccounts(batchValue) {
  return String(batchValue || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parsePassword() {
  const fromFlag = getArg("password", "").trim();
  if (fromFlag) return fromFlag;
  return DEFAULT_PASSWORD;
}

const BATCH = getArg("batch", "");
const ACCOUNTS = parseAccounts(BATCH);
const PASSWORD = parsePassword();
const HEADED = args.includes("--headed");
const FIVESIM_API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "").trim();
const FIVESIM_REGION = getArg("region", process.env.FIVESIM_REGION || DEFAULT_REGION).trim();

if (ACCOUNTS.length === 0) {
  usage();
  throw new Error("Missing --batch with at least one email address");
}

if (!FIVESIM_API_KEY) {
  usage();
  throw new Error("Missing 5sim API key. Use --api-key or FIVESIM_API_KEY");
}

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

let stepNo = 0;
function logStep(message) {
  stepNo += 1;
  console.log(`[${stepNo}] ${message}`);
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getBodyText(page) {
  return (await page.textContent("body").catch(() => "")) || "";
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
  const p = String(phone || "").trim();
  if (!p) return "";
  if (p.startsWith("+")) {
    return `+${p.slice(1).replace(/\D/g, "")}`;
  }
  return p.replace(/\D/g, "");
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
      message =
        "Unauthorized API key. 5sim v1/user endpoints require Authorization: Bearer <API_KEY>. Verify --api-key/FIVESIM_API_KEY from your 5sim account.";
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

  // 5sim API returns { google: { country: { operator: {...} } } }
  // Try new format first, then legacy format
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
    `https://5sim.net/v1/user/buy/activation/${region}/${operator}/google`,
    apiKey
  );

  return {
    phone: normalizePhone(body?.phone),
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

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
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
  const safeEmail = email.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = join(SCREENSHOT_DIR, `${safeEmail}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

async function waitForPhoneInput(page) {
  const phoneSelector =
    '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"], input[placeholder*="phone"], input[placeholder*="전화"], input[placeholder*="телефон"]';

  for (let i = 0; i < 12; i++) {
    const loc = page.locator(phoneSelector).first();
    const visible = await loc.isVisible({ timeout: 2500 }).catch(() => false);
    if (visible) return loc;
    await delay(2000);
  }
  throw new Error("Phone number input field did not appear");
}

async function waitForCodeInput(page) {
  const codeInput = page
    .locator(
      '#code, input[name="code"], input[type="tel"][inputmode="numeric"], input[autocomplete="one-time-code"], input[aria-label*="code"], input[aria-label*="인증"], input[aria-label*="код"]'
    )
    .first();
  await codeInput.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const visible = await codeInput.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) {
    throw new Error("Verification code input field did not appear");
  }
  return codeInput;
}

function hasLikelyVerificationUi(bodyText, currentUrl) {
  const lower = String(bodyText || "").toLowerCase();
  const url = String(currentUrl || "");
  return (
    lower.includes("verify your identity") ||
    lower.includes("verification code") ||
    lower.includes("text message") ||
    lower.includes("send a code") ||
    lower.includes("phone number") ||
    lower.includes("take steps") ||
    lower.includes("certain features") ||
    lower.includes("access to certain") ||
    bodyText.includes("신원 확인") ||
    bodyText.includes("본인 확인") ||
    bodyText.includes("문자 메시지") ||
    bodyText.includes("인증 코드") ||
    bodyText.includes("전화번호") ||
    bodyText.includes("전화번호 인증") ||
    bodyText.includes("Подтвердите") ||
    bodyText.includes("проверочный код") ||
    bodyText.includes("номер телефона") ||
    bodyText.includes("Kirim SMS") ||
    bodyText.includes("Dapatkan kode verifikasi") ||
    url.includes("speedbump") ||
    url.includes("challenge") ||
    url.includes("idv")
  );
}

async function ensureSmsOption(page, email) {
  const optionClicked = await clickByTexts(
    page,
    [
      "전화번호 인증",
      "전화번호로 인증",
      "문자 메시지",
      "인증 코드 보내기",
      "SMS",
      "SMS verification",
      "Text message",
      "Phone verification",
      "Verify with phone number",
      "Send a code",
      "Phone number",
      "Verify your identity",
      "신원 확인",
      "본인 확인",
      "휴대전화 번호",
      "전화번호",
      "СМС",
      "Текстовое сообщение",
      "Номер телефона",
      "Отправить код",
      "Подтвердите личность",
      "Kirim SMS",
      "Kirim",
      "Dapatkan kode verifikasi",
    ],
    6000
  );

  if (!optionClicked) {
    const phoneHint = await page
      .locator(
        'text=/전화번호 인증|문자 메시지|SMS|Text message|Phone verification|Verify your identity|신원 확인|본인 확인|номер телефона|СМС|Kirim SMS|Dapatkan kode verifikasi/'
      )
      .first()
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    if (!phoneHint) {
      await saveShot(page, email, "sms-option-not-found");
      throw new Error("Could not select phone/SMS verification option");
    }
  }

  await delay(randomInt(1500, 3000));
}

async function openVerificationFlow(page, email) {
  const openClicked = await clickByTexts(
    page,
    [
      "Take steps",
      "Gain access",
      "Continue",
      "Start",
      "Verify",
      "Try another way",
      "다음",
      "계속",
      "시작",
      "확인",
      "본인 확인",
      "신원 확인",
      "Продолжить",
      "Проверить",
      "Далее",
      "Lanjutkan",
      "Berikutnya",
      "Verifikasi",
    ],
    5000
  );
  if (openClicked) {
    await delay(randomInt(1800, 3200));
    await saveShot(page, email, "verification-flow-opened");
  }
}

async function handleFeaturePhoneVerification(page, email, apiKey, region) {
  let activePhoneId = null;
  let totalCost = 0;

  try {
    const operator = await getBestOperator(apiKey, region);
    console.log(`    [5sim] Using operator: ${operator}`);

    for (let numberAttempt = 1; numberAttempt <= 5; numberAttempt++) {
      let order = null;

      for (let buyAttempt = 1; buyAttempt <= 3; buyAttempt++) {
        try {
          const currentBalance = await getFiveSimBalance(apiKey);
          if (currentBalance < 1) {
            throw new Error(`5sim balance too low (${currentBalance.toFixed(4)}). Cannot buy number.`);
          }

          order = await buyNumber(apiKey, region, operator);
          if (!order?.id || !order?.phone) {
            throw new Error("5sim buy returned invalid order payload");
          }
          break;
        } catch (err) {
          console.log(`    ⚠️ Buy number failed (${buyAttempt}/3): ${String(err.message || err).slice(0, 120)}`);
          if (buyAttempt < 3) await delay(randomInt(1500, 2500));
        }
      }

      if (!order) {
        throw new Error("Unable to buy phone number after 3 attempts");
      }

      activePhoneId = order.id;
      totalCost += extractOrderCost(order);
      console.log(`    📱 Number ${numberAttempt}/5: ${order.phone} (id=${order.id})`);

      const phoneInput = await waitForPhoneInput(page);
      await phoneInput.fill("");
      await delay(randomInt(400, 800));
      await humanType(page, phoneInput, order.phone);
      await saveShot(page, email, `phone-filled-${numberAttempt}`);

      const clickedNext = await clickByTexts(
        page,
        [
          "다음",
          "Next",
          "Continue",
          "확인",
          "Verify",
          "제출",
          "Submit",
          "Далее",
          "Продолжить",
          "Подтвердить",
          "Berikutnya",
          "Lanjutkan",
          "Kirim",
        ],
        6000
      );
      if (!clickedNext) {
        throw new Error("Next/Verify button not found after entering phone number");
      }

      await delay(10000);
      await saveShot(page, email, `phone-submitted-${numberAttempt}`);

      const phoneBody = await getBodyText(page);
      const rejected =
        phoneBody.includes("This phone number cannot be used for verification") ||
        phoneBody.includes("cannot be used for verification") ||
        phoneBody.includes("이 전화번호는 인증에 사용할 수 없습니다") ||
        phoneBody.includes("이 전화번호는 인증용으로 사용할 수 없습니다") ||
        phoneBody.includes("Этот номер телефона нельзя использовать для подтверждения") ||
        phoneBody.includes("нельзя использовать для подтверждения") ||
        phoneBody.includes("Nomor telepon ini tidak dapat digunakan");

      if (rejected) {
        console.log("    ⚠️ Phone rejected by Google. Cancelling number and retrying...");
        await cancelNumber(apiKey, activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(randomInt(1000, 2500));
        continue;
      }

      console.log("    ⏳ Number accepted. Polling SMS code...");
      const codeInput = await waitForCodeInput(page);

      let code = "";
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        const smsState = await checkSms(apiKey, activePhoneId);
        code = smsState?.code || extractSmsCode(smsState);
        if (code) break;
        await delay(5000);
      }

      if (!code) {
        console.log("    ⚠️ SMS timeout reached. Cancelling number and retrying...");
        await cancelNumber(apiKey, activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      console.log(`    🔐 Received code: ${code}`);
      await codeInput.fill("");
      await delay(randomInt(200, 500));
      await humanType(page, codeInput, code);
      await saveShot(page, email, `code-filled-${numberAttempt}`);

      const clickedVerify = await clickByTexts(
        page,
        [
          "다음",
          "Next",
          "Verify",
          "확인",
          "확인하기",
          "제출",
          "Submit",
          "Далее",
          "Подтвердить",
          "Продолжить",
          "Berikutnya",
          "Verifikasi",
        ],
        6000
      );
      if (!clickedVerify) {
        throw new Error("Verify/Next button not found after SMS code input");
      }

      await delay(randomInt(5000, 8000));
      await saveShot(page, email, `verification-submitted-${numberAttempt}`);
      await finishNumber(apiKey, activePhoneId).catch(() => {});
      activePhoneId = null;

      return { verified: true, cost: totalCost };
    }

    throw new Error("Phone verification failed after 5 different numbers");
  } catch (err) {
    if (activePhoneId) {
      await cancelNumber(apiKey, activePhoneId).catch(() => {});
      activePhoneId = null;
    }
    throw err;
  }
}

async function login(page, email, password) {
  logStep(`Logging in: ${email}`);
  await page.goto("https://accounts.google.com/signin", { waitUntil: "domcontentloaded", timeout: 45000 });
  await saveShot(page, email, "login-page");

  const emailInput = page.locator('input[type="email"], input[name="identifier"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(email);
  await saveShot(page, email, "email-filled");

  const emailNext = page.locator('#identifierNext button, button:has-text("Next"), button:has-text("다음")').first();
  await emailNext.click();
  await delay(4000);
  await saveShot(page, email, "after-email-next");

  const pwInput = page.locator('input[type="password"], input[name="Passwd"]').first();
  await pwInput.waitFor({ state: "visible", timeout: 20000 });
  // Use fill() for password - humanType on masked fields can be unreliable
  await pwInput.fill(password);
  await saveShot(page, email, "password-filled");

  const pwNext = page.locator('#passwordNext button, button:has-text("Next"), button:has-text("다음")').first();
  await pwNext.click();
  await delay(8000);
  await saveShot(page, email, "after-password-next");

  // Detect login failure - check for error indicators
  const bodyText = await page.locator("body").textContent().catch(() => "");
  if (bodyText.includes("잘못된 비밀번호") || bodyText.includes("Wrong password") || bodyText.includes("Incorrect password")) {
    throw new Error("Login failed: Wrong password (잘못된 비밀번호)");
  }

  const currentUrl = page.url();
  if (currentUrl.includes("/challenge") && !currentUrl.includes("challenge/selection")) {
    throw new Error(`Login stuck on challenge page: ${currentUrl}`);
  }

  // Dismiss recovery options interstitial if present (gds.google.com/web/recoveryoptions)
  if (currentUrl.includes("recoveryoptions") || currentUrl.includes("gds.google.com")) {
    logStep(`Dismissing recovery options page: ${email}`);
    const cancelBtn = page
      .locator('button:has-text("취소"), button:has-text("Cancel"), a:has-text("취소"), a:has-text("Cancel")')
      .first();
    const dismissible = await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (dismissible) {
      await cancelBtn.click();
      await delay(3000);
    } else {
      // Navigate away directly
      await page.goto("https://myaccount.google.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await delay(2000);
    }
  }

  logStep(`Login successful: ${email}`);
}

async function tryVerificationUrls(page, email) {
  const visited = [];

  for (let i = 0; i < TARGET_URLS.length; i++) {
    const url = TARGET_URLS[i];
    const idx = i + 1;
    logStep(`Opening candidate verification URL ${idx}/${TARGET_URLS.length}: ${url}`);

    await page
      .goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      })
      .catch(() => {});

    await delay(randomInt(2500, 4500));
    await saveShot(page, email, `candidate-${idx}-loaded`);

    const title = await page.title().catch(() => "");
    const finalUrl = page.url();
    const bodyText = await getBodyText(page);
    const bodySnippet = String(bodyText || "").replace(/\s+/g, " ").slice(0, 260);

    visited.push({
      requested: url,
      finalUrl,
      title,
      snippet: bodySnippet,
    });

    await openVerificationFlow(page, email);
    await ensureSmsOption(page, email).catch(() => {});
    await delay(randomInt(1000, 2000));
    await saveShot(page, email, `candidate-${idx}-post-clicks`);

    const postBody = await getBodyText(page);
    if (hasLikelyVerificationUi(postBody, page.url())) {
      const phoneVisible = await page
        .locator(
          '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]'
        )
        .first()
        .isVisible({ timeout: 2500 })
        .catch(() => false);

      if (phoneVisible || postBody.includes("SMS") || postBody.includes("문자") || postBody.includes("код") || postBody.includes("Kirim")) {
        return { found: true, visited };
      }
    }
  }

  return { found: false, visited };
}

function verificationSucceeded(bodyText, pageUrl) {
  const body = String(bodyText || "");
  return (
    body.includes("인증") ||
    body.includes("확인") ||
    body.includes("verified") ||
    body.includes("verification complete") ||
    body.includes("완료") ||
    body.includes("успешно") ||
    body.includes("berhasil") ||
    pageUrl.includes("myaccount.google.com")
  );
}

async function runForAccount(browser, email, password, apiKey, region) {
  const context = await browser.newContext({
    ...DESKTOP_DEVICE,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
  });

  const page = await context.newPage();

  try {
    await login(page, email, password);

    logStep(`Searching feature-unlock verification flow: ${email}`);
    const flow = await tryVerificationUrls(page, email);
    if (!flow.found) {
      const visitedSummary = flow.visited
        .map((v, idx) => `${idx + 1}) ${v.finalUrl || v.requested} | ${v.title || "(no title)"} | ${v.snippet}`)
        .join(" || ");
      throw new Error(`No SMS/phone verification path found across target URLs. Seen: ${visitedSummary.slice(0, 1400)}`);
    }

    await ensureSmsOption(page, email);
    await saveShot(page, email, "sms-option-selected");

    const result = await handleFeaturePhoneVerification(page, email, apiKey, region);

    const bodyText = await getBodyText(page);
    const successHint = verificationSucceeded(bodyText, page.url());
    if (!successHint) {
      throw new Error("Verification result could not be confirmed from page state");
    }

    await saveShot(page, email, "feature-unlock-verified-success");
    return { email, success: true, cost: result.cost, error: "" };
  } catch (err) {
    await saveShot(page, email, "error").catch(() => {});
    return { email, success: false, cost: 0, error: String(err.message || err) };
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  logStep("Launching browser");
  const browser = await chromium.launch({
    headless: !HEADED,
    args: STEALTH_ARGS,
  });

  const results = [];

  try {
    for (const email of ACCOUNTS) {
      logStep(`Starting feature unlock: ${email}`);
      const result = await runForAccount(browser, email, PASSWORD, FIVESIM_API_KEY, FIVESIM_REGION);
      results.push(result);

      if (result.success) {
        console.log(`✅ Unlocked: ${email} (cost=${result.cost.toFixed(4)})`);
      } else {
        console.log(`❌ Failed: ${email} (${result.error})`);
      }

      await delay(randomInt(8000, 15000));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  const totalCost = results.reduce((sum, r) => sum + Number(r.cost || 0), 0);

  logStep("Final summary");
  console.log(`Total accounts: ${results.length}`);
  console.log(`Unlocked: ${ok}`);
  console.log(`Failed: ${fail}`);
  console.log(`Estimated total SMS cost: ${totalCost.toFixed(4)}`);

  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${String(err.message || err)}`);
  process.exit(1);
});
