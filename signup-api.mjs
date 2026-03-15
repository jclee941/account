#!/usr/bin/env node

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";
process.env.REBROWSER_PATCHES_UTILITY_WORLD_NAME = "util";
process.env.REBROWSER_PATCHES_SOURCE_URL = "jquery.min.js";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PASSWORD = "bingogo1";
const PREFIX = "qws943";
const CSV_FILE = join(import.meta.dirname, "accounts.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "screenshots");
const DEFAULT_REGION = "indonesia";
const DEFAULT_RECAPTCHA_KEY =
  process.env.RECAPTCHA_ENTERPRISE_KEY || "6Lf-_ekqAAAAAO4AXrJISaHw4_bW76NcfwhLN7Is";
const SIGNUP_URL =
  "https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=en&service=mail&biz=false&pnv_flow=1";
const BATCH_ENDPOINT =
  "https://accounts.google.com/lifecycle/_/AccountLifecyclePlatformSignupUi/data/batchexecute";
const CANNOT_CREATE_ERROR = "GOOGLE_CANNOT_CREATE";

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const START = parseInt(getArg("start", "1"), 10);
const END = parseInt(getArg("end", "50"), 10);
const DRY_RUN = args.includes("--dry-run");
const HEADED = args.includes("--headed");
const API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "").trim();
const REGION = getArg("region", process.env.FIVESIM_REGION || DEFAULT_REGION).trim().toLowerCase();
const PROXY_SERVER = getArg("proxy", process.env.PROXY_SERVER || "").trim();
const PROXY_USER = getArg("proxy-user", process.env.PROXY_USER || "").trim();
const PROXY_PASS = getArg("proxy-pass", process.env.PROXY_PASS || "").trim();
const RECAPTCHA_KEY = getArg("recaptcha-key", DEFAULT_RECAPTCHA_KEY).trim();

const FIRST_NAMES = [
  "James",
  "John",
  "Robert",
  "Michael",
  "David",
  "William",
  "Daniel",
  "Matthew",
  "Joseph",
  "Anthony",
  "Ryan",
  "Jason",
  "Nathan",
  "Adam",
  "Justin",
  "Brian",
  "Andrew",
  "Kevin",
  "Eric",
  "Thomas",
  "Budi",
  "Agus",
  "Adi",
  "Dedi",
  "Eko",
  "Fajar",
  "Hendra",
  "Irwan",
  "Joko",
  "Rizki",
];

const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Wilson",
  "Taylor",
  "Moore",
  "Anderson",
  "Thomas",
  "Jackson",
  "Martin",
  "Lee",
  "Harris",
  "Clark",
  "Lewis",
  "King",
  "Pratama",
  "Saputra",
  "Wijaya",
  "Hidayat",
  "Nugraha",
  "Permana",
  "Kusuma",
  "Santoso",
  "Setiawan",
  "Maulana",
];

const REGION_COUNTRY_CODE = {
  russia: "+7",
  ukraine: "+380",
  kazakhstan: "+7",
  china: "+86",
  philippines: "+63",
  indonesia: "+62",
  malaysia: "+60",
  kenya: "+254",
  india: "+91",
  usa: "+1",
  england: "+44",
  korea: "+82",
};

function randomPick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padNum(value) {
  return String(value).padStart(2, "0");
}

function formatCost(cost) {
  const value = Number(cost);
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function normalizePhone(phone, region) {
  let normalized = String(phone || "").trim();
  const prefix = REGION_COUNTRY_CODE[region];
  if (prefix && normalized.startsWith(prefix)) {
    normalized = normalized.slice(prefix.length);
  } else if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function extractSmsCode(payload) {
  if (!payload?.sms || !Array.isArray(payload.sms) || payload.sms.length === 0) {
    return "";
  }

  const firstSms = payload.sms[0];
  const explicitCode = String(firstSms?.code || "").trim();
  if (explicitCode) {
    return explicitCode;
  }

  const text = String(firstSms?.text || "");
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1] : "";
}

function logStatus(message) {
  console.error(message);
}

function initCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, "username,email,password,firstName,lastName,koreanName,cost,status,timestamp\n");
  }
}

function appendCsv(row) {
  const line = `${row.username},${row.email},${row.password},${row.firstName},${row.lastName},,${formatCost(row.cost)},${row.status},${row.timestamp}\n`;
  writeFileSync(CSV_FILE, line, { flag: "a" });
}

function getCompletedUsernames() {
  if (!existsSync(CSV_FILE)) {
    return new Set();
  }

  const text = readFileSync(CSV_FILE, "utf-8").trim();
  if (!text) {
    return new Set();
  }

  return new Set(
    text
      .split("\n")
      .slice(1)
      .filter((line) => line.includes(",success,"))
      .map((line) => line.split(",")[0])
      .filter(Boolean)
  );
}

function generateProfile(accountNumber) {
  const year = randomInt(1985, 2000);
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  const username = `${PREFIX}${padNum(accountNumber)}`;

  return {
    username,
    email: `${username}@gmail.com`,
    password: PASSWORD,
    firstName: randomPick(FIRST_NAMES),
    lastName: randomPick(LAST_NAMES),
    birthMonth: String(month),
    birthDay: String(day),
    birthYear: String(year),
    gender: randomPick([1, 2]),
  };
}

function isGoogleSuccessUrl(url) {
  return (
    url.includes("myaccount.google.com") ||
    url.includes("gds.google.com") ||
    url.includes("accounts.google.com/b/")
  );
}

async function getBodyText(page) {
  return (await page.textContent("body").catch(() => "")) || "";
}

async function detectCannotCreate(page) {
  const bodyText = await getBodyText(page);
  return (
    bodyText.includes("Sorry, we could not create your Google Account") ||
    bodyText.includes("cannot create your Google Account") ||
    bodyText.includes("죄송합니다. Google 계정을 만들 수 없습니다") ||
    bodyText.includes("Не удалось создать аккаунт")
  );
}

async function assertNotCannotCreate(page) {
  if (await detectCannotCreate(page)) {
    throw new Error(CANNOT_CREATE_ERROR);
  }
}

function selectorForText(text) {
  const safe = text.replaceAll('"', '\\"');
  return `button:has-text("${safe}"), a:has-text("${safe}"), [role="button"]:has-text("${safe}"), span:has-text("${safe}")`;
}

async function clickByTexts(page, texts, timeout = 3000) {
  for (const text of texts) {
    const locator = page.locator(selectorForText(text)).first();
    const visible = await locator.isVisible({ timeout }).catch(() => false);
    if (!visible) {
      continue;
    }

    await locator.click().catch(async () => {
      await locator.click({ force: true });
    });
    return true;
  }

  return false;
}

async function clickNextLike(page) {
  return clickByTexts(page, [
    "Next",
    "Continue",
    "Verify",
    "Confirm",
    "Berikutnya",
    "Lanjutkan",
    "Verifikasi",
  ]);
}

async function clickSkipLike(page) {
  return clickByTexts(page, ["Skip", "Lewati"]);
}

async function clickAgreeLike(page) {
  return clickByTexts(page, ["I agree", "Agree", "Saya setuju", "Setuju"]);
}

async function clickPostVerificationButton(page) {
  return clickByTexts(page, [
    "Skip",
    "Next",
    "Continue",
    "Yes, I'm in",
    "I agree",
    "Agree",
    "Lewati",
    "Berikutnya",
    "Lanjutkan",
    "Saya setuju",
    "Setuju",
    "Verifikasi",
  ]);
}

async function fiveSimGetJson(url, apiKey) {
  const headers = { Accept: "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

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
    const message = body?.message || rawText || `5sim request failed (${response.status})`;
    throw new Error(`5sim HTTP ${response.status}: ${String(message).slice(0, 200)}`);
  }

  return body;
}

async function getBestOperator(apiKey, region) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/guest/prices?country=${encodeURIComponent(region)}&product=google`,
    apiKey
  );

  const operatorMap = body?.[region]?.google;
  if (!operatorMap || typeof operatorMap !== "object") {
    throw new Error(`No operators available for region: ${region}`);
  }

  const sorted = Object.entries(operatorMap).sort(([, left], [, right]) => {
    return Number(right?.rate || 0) - Number(left?.rate || 0);
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

function createSmsProvider(apiKey, region) {
  return {
    name: "5sim",
    buyNumber: async () => {
      const operator = await getBestOperator(apiKey, region);
      logStatus(`  [5sim] Using operator: ${operator}`);
      return buyNumber(apiKey, region, operator);
    },
    checkSms: (id) => checkSms(apiKey, id),
    finishNumber: (id) => finishNumber(apiKey, id),
    cancelNumber: (id) => cancelNumber(apiKey, id),
    getBalance: () => getFiveSimBalance(apiKey),
  };
}

async function loadChromium() {
  try {
    const rebrowser = await import("rebrowser-playwright");
    return {
      chromium: rebrowser.chromium,
      engine: "rebrowser-playwright",
    };
  } catch {
    const playwright = await import("playwright");
    return {
      chromium: playwright.chromium,
      engine: "playwright",
    };
  }
}

function extractByRegex(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "";
}

async function extractSessionState(page, previous = {}) {
  const html = await page.content();
  const url = new URL(page.url());

  const state = {
    at:
      extractByRegex(html, [
        /"SNlM0e":"([^"]+)"/,
        /SNlM0e',\s*'([^']+)'/,
        /"at":"([^"]+)"/,
      ]) || previous.at || "",
    fsid:
      extractByRegex(html, [
        /"FdrFJe":"([^"]+)"/,
        /"f\.sid":"?([^",}]+)"?/,
        /'FdrFJe',\s*'([^']+)'/,
      ]) || previous.fsid || "",
    bl:
      extractByRegex(html, [
        /"cfb2h":"([^"]+)"/,
        /(boq_identityfrontendauthuiserver_[^"'\\\s<]+)/,
        /(boq_[^"'\\\s<]+)/,
      ]) || previous.bl || "",
    dsh: url.searchParams.get("dsh") || previous.dsh || "",
    tl: url.searchParams.get("TL") || previous.tl || "",
  };

  if (!state.at || !state.fsid || !state.bl) {
    const snippet = html.replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`Failed to extract signup session tokens: at=${Boolean(state.at)} f.sid=${Boolean(state.fsid)} bl=${Boolean(state.bl)} snippet=${snippet}`);
  }

  return state;
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }

  return output;
}

function parseBatchExecuteResponse(text) {
  const cleaned = text.replace(/^\)\]\}'\n?/, "").trim();
  const frames = [];

  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const parsedWhole = tryParse(cleaned);
  if (parsedWhole !== null) {
    frames.push(parsedWhole);
  } else {
    const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\d+$/.test(line) && lines[index + 1]) {
        const parsedNext = tryParse(lines[index + 1]);
        if (parsedNext !== null) {
          frames.push(parsedNext);
          index += 1;
          continue;
        }
      }

      const parsedLine = tryParse(line);
      if (parsedLine !== null) {
        frames.push(parsedLine);
      }
    }
  }

  const strings = collectStrings(frames);
  const nextUrl =
    strings.find((value) => value.startsWith("https://accounts.google.com/")) ||
    cleaned.match(/https:\/\/accounts\.google\.com\/[^"'\\\s]+/)?.[0] ||
    "";
  const nextPath =
    strings.find((value) => value.startsWith("/")) ||
    cleaned.match(/\/(?:lifecycle|signin|challenge|devicephoneverification)[^"'\\\s]+/)?.[0] ||
    "";
  const nextStep = cleaned.match(/\/lifecycle\/steps\/signup\/([a-zA-Z0-9_-]+)/)?.[1] || "";
  const tl =
    strings.map((value) => value.match(/[?&]TL=([^&]+)/)?.[1]).find(Boolean) ||
    cleaned.match(/[?&]TL=([^&"'\\]+)/)?.[1] ||
    "";
  const usernameTaken =
    cleaned.includes("That username is taken") ||
    cleaned.includes("Choose a different username") ||
    cleaned.includes("username already exists");
  const cannotCreate =
    cleaned.includes("could not create your Google Account") ||
    cleaned.includes("cannot create your Google Account");

  return {
    frames,
    raw: cleaned,
    nextUrl,
    nextPath,
    nextStep,
    tl,
    usernameTaken,
    cannotCreate,
  };
}

function buildNextUrlFromCurrent(currentUrl, pathOrUrl, nextTl) {
  const nextUrl = new URL(pathOrUrl, currentUrl);
  if (nextTl) {
    nextUrl.searchParams.set("TL", nextTl);
  }
  return nextUrl.toString();
}

async function getRecaptchaToken(page, siteKey, action = "signup") {
  await page.waitForLoadState("domcontentloaded");
  return page.evaluate(
    async ([key, tokenAction]) => {
      const waitForEnterprise = () =>
        new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(new Error("grecaptcha.enterprise not available after 30s"));
          }, 30000);

          const check = () => {
            if (window.grecaptcha?.enterprise?.execute) {
              window.clearTimeout(timeout);
              resolve(window.grecaptcha.enterprise);
              return;
            }
            window.setTimeout(check, 250);
          };

          check();
        });

      const enterprise = await waitForEnterprise();
      return enterprise.execute(key, { action: tokenAction });
    },
    [siteKey, action]
  );
}

async function batchexecute(page, session, request, reqidState) {
  const freq = JSON.stringify([[request.rpcid, JSON.stringify(request.payload), null, request.requestMode || "generic"]]);
  const body = new URLSearchParams({
    "f.req": freq,
    at: session.at,
  }).toString();

  const url = new URL(BATCH_ENDPOINT);
  url.searchParams.set("rpcids", request.rpcid);
  url.searchParams.set("source-path", request.sourcePath);
  url.searchParams.set("f.sid", session.fsid);
  url.searchParams.set("bl", session.bl);
  url.searchParams.set("hl", "en");
  url.searchParams.set("_reqid", String(reqidState.current));
  url.searchParams.set("rt", "c");

  reqidState.current += 1;

  logStatus(`    → batchexecute ${request.rpcid} ${request.sourcePath}`);

  const text = await page.evaluate(async ([requestUrl, requestBody]) => {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: requestBody,
      credentials: "same-origin",
    });

    return response.text();
  }, [url.toString(), body]);

  const parsed = parseBatchExecuteResponse(text);
  if (parsed.cannotCreate) {
    throw new Error(CANNOT_CREATE_ERROR);
  }

  return parsed;
}

function updateSessionFromResponse(session, parsed) {
  return {
    ...session,
    tl: parsed.tl || session.tl,
  };
}

async function navigateToNextStep(page, session, parsed, fallbackPath) {
  const candidate = parsed.nextUrl || parsed.nextPath || fallbackPath;
  if (!candidate) {
    return extractSessionState(page, { ...session, tl: parsed.tl || session.tl });
  }

  const destination = buildNextUrlFromCurrent(page.url(), candidate, parsed.tl || session.tl);
  logStatus(`    → navigate ${destination}`);
  await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 60000 });
  await assertNotCannotCreate(page);
  return extractSessionState(page, { ...session, tl: parsed.tl || session.tl });
}

async function waitForPhoneChallenge(page, username) {
  const phoneSelector =
    '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"]';

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await assertNotCannotCreate(page);

    if (isGoogleSuccessUrl(page.url())) {
      return { phoneRequired: false };
    }

    const phoneVisible = await page.locator(phoneSelector).first().isVisible({ timeout: 1000 }).catch(() => false);
    if (phoneVisible) {
      return { phoneRequired: true };
    }

    const skipVisible = await clickSkipLike(page).catch(() => false);
    if (skipVisible) {
      await delay(3000);
      if (isGoogleSuccessUrl(page.url())) {
        return { phoneRequired: false };
      }
    }

    const clickedAction = await clickByTexts(page, [
      "Send SMS",
      "Get a verification code",
      "Verify your phone number",
      "Try another way",
      "Try Again",
      "Next",
      "Continue",
      "Verify",
      "Kirim SMS",
      "Berikutnya",
      "Lanjutkan",
      "Verifikasi",
    ], 1500);

    if (clickedAction) {
      await delay(3000);
    } else {
      const bodyText = await getBodyText(page);
      if (
        bodyText.includes("Waiting for verification") ||
        bodyText.includes("Verify some info before creating")
      ) {
        await delay(3000);
      } else {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await delay(2000);
      }
    }
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}-phone-wait-timeout.png`), fullPage: true }).catch(() => {});
  throw new Error("Phone challenge did not become interactive within timeout");
}

async function handlePhoneVerification(page, username, smsProvider) {
  const phoneSelector =
    '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"]';
  const codeSelector = '#code, input[name="code"], input[type="tel"][inputmode="numeric"]';
  let activePhoneId = null;
  let totalCost = 0;

  try {
    const phoneGate = await waitForPhoneChallenge(page, username);
    if (!phoneGate.phoneRequired) {
      return { cost: totalCost, activePhoneId: null };
    }

    logStatus(`  → Phone verification required. Region: ${REGION}`);
    logStatus(`  → SMS provider: ${smsProvider.name}`);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      let order = null;

      for (let buyAttempt = 1; buyAttempt <= 3; buyAttempt += 1) {
        try {
          const balance = await smsProvider.getBalance();
          if (balance < 1) {
            throw new Error(`${smsProvider.name} balance too low (${balance.toFixed(4)})`);
          }

          order = await smsProvider.buyNumber();
          if (!order?.id || !order?.phone) {
            throw new Error(`${smsProvider.name} buy returned invalid order payload`);
          }
          break;
        } catch (error) {
          logStatus(`    ⚠ Buy number failed (${buyAttempt}/3): ${error.message.slice(0, 120)}`);
          if (buyAttempt < 3) {
            await delay(1500);
          }
        }
      }

      if (!order) {
        throw new Error("Unable to buy phone number after 3 attempts");
      }

      activePhoneId = order.id;
      totalCost += extractOrderCost(order);
      logStatus(`    📱 Number ${attempt}/5: ${order.phone} (id=${order.id})`);

      const phoneInput = page.locator(phoneSelector).first();
      await phoneInput.waitFor({ state: "visible", timeout: 15000 });
      await phoneInput.fill("");
      await phoneInput.type(order.phone, { delay: randomInt(60, 140) });

      const clickedNext = await clickByTexts(page, [
        "Next",
        "Continue",
        "Verify",
        "Send",
        "Send SMS",
        "Kirim",
        "Kirim SMS",
        "Berikutnya",
        "Lanjutkan",
        "Verifikasi",
      ]);

      if (!clickedNext) {
        throw new Error("Next button not found after entering phone number");
      }

      await delay(7000);
      await assertNotCannotCreate(page);

      const phoneBody = await getBodyText(page);
      const rejected =
        phoneBody.includes("This phone number cannot be used for verification") ||
        phoneBody.includes("cannot be used for verification") ||
        phoneBody.includes("Nomor telepon ini tidak dapat digunakan untuk verifikasi") ||
        phoneBody.includes("tidak dapat digunakan untuk verifikasi");

      if (rejected) {
        logStatus("    ⚠ Phone rejected by Google. Cancelling number and retrying...");
        await smsProvider.cancelNumber(activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(1500);
        continue;
      }

      const codeInput = page.locator(codeSelector).first();
      await codeInput.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});

      let code = "";
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        const smsState = await smsProvider.checkSms(activePhoneId);
        code = smsState?.code || extractSmsCode(smsState);
        if (code) {
          break;
        }
        await delay(5000);
      }

      if (!code) {
        logStatus("    ⚠ SMS timeout reached. Cancelling number and retrying...");
        await smsProvider.cancelNumber(activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      logStatus(`    🔐 Received code: ${code}`);
      await codeInput.fill("");
      await codeInput.type(code, { delay: randomInt(60, 120) });

      const clickedVerify = await clickByTexts(page, [
        "Verify",
        "Next",
        "Continue",
        "Confirm",
        "Verifikasi",
        "Berikutnya",
        "Lanjutkan",
      ]);

      if (!clickedVerify) {
        throw new Error("Verify button not found after SMS code input");
      }

      await delay(5000);
      await assertNotCannotCreate(page);
      await smsProvider.finishNumber(activePhoneId).catch(() => {});
      activePhoneId = null;
      return { cost: totalCost, activePhoneId: null };
    }

    throw new Error("Phone verification failed after 5 different numbers");
  } catch (error) {
    if (activePhoneId) {
      await smsProvider.cancelNumber(activePhoneId).catch(() => {});
    }
    throw error;
  }
}

async function handlePostPhoneScreens(page) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    await assertNotCannotCreate(page);
    if (isGoogleSuccessUrl(page.url())) {
      return;
    }

    const agreeVisible = await page
      .locator('button:has-text("I agree"), button:has-text("Agree"), button:has-text("Saya setuju"), button:has-text("Setuju")')
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);

    if (agreeVisible) {
      for (let scroll = 0; scroll < 5; scroll += 1) {
        await page.keyboard.press("PageDown").catch(() => {});
        await delay(500);
      }

      const agreed = await clickAgreeLike(page);
      if (agreed) {
        await delay(5000);
        continue;
      }
    }

    const clicked = await clickPostVerificationButton(page);
    if (!clicked) {
      break;
    }
    await delay(3000);
  }
}

async function launchBrowser() {
  const { chromium, engine } = await loadChromium();
  logStatus(`    🎭 Browser engine: ${engine}`);

  const isSocksProxy = PROXY_SERVER.startsWith("socks");
  const launchArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-infobars",
    "--no-first-run",
    "--no-default-browser-check",
  ];

  if (PROXY_SERVER) {
    launchArgs.push(`--proxy-server=${PROXY_SERVER}`);
  }

  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: "/usr/bin/google-chrome-stable",
    args: !HEADED ? [...launchArgs, "--headless=new"] : launchArgs,
    ...(PROXY_SERVER && PROXY_USER && !isSocksProxy
      ? {
          proxy: {
            server: PROXY_SERVER,
            username: PROXY_USER,
            password: PROXY_PASS,
          },
        }
      : {}),
  });

  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "Asia/Jakarta",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1024 },
    extraHTTPHeaders: {
      "accept-language": "en-US,en;q=0.9",
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  return { browser, context, page };
}

async function navigateToSignup(page) {
  await page.goto(SIGNUP_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(
    () => typeof window.grecaptcha !== 'undefined' && typeof window.grecaptcha.enterprise !== 'undefined' && typeof window.grecaptcha.enterprise.execute === 'function',
    { timeout: 30000 }
  ).catch(() => { logStatus('    ⚠ reCAPTCHA not detected on signup page, proceeding anyway'); });
}

function buildNamePayload(profile) {
  return [profile.firstName, profile.lastName, null, null];
}

function buildDobPayload(profile, recaptchaToken, session) {
  return [
    profile.birthMonth,
    profile.birthDay,
    profile.birthYear,
    profile.gender,
    null,
    recaptchaToken,
    session.tl || null,
    null,
    null,
  ];
}

function buildUsernameInitPayload() {
  return [1];
}

function buildUsernameSubmitPayload(profile, reqidSeed) {
  return [profile.username, 0, 0, null, [null, null, null, null, 0, reqidSeed], 0, 40];
}

function buildPasswordInitPayload() {
  return [null, null, null, null, null, null, [null, null, "https://accounts.google.com/ManageAccount?nc=1"]];
}

function buildPasswordSubmitPayload(profile, recaptchaToken) {
  return [
    profile.password,
    profile.password,
    null,
    null,
    null,
    null,
    null,
    null,
    recaptchaToken,
  ];
}

async function createAccount(profile, smsProvider) {
  const result = {
    username: profile.username,
    email: profile.email,
    password: profile.password,
    firstName: profile.firstName,
    lastName: profile.lastName,
    cost: 0,
    status: "pending",
    timestamp: new Date().toISOString(),
  };

  let browser;
  let context;
  let page;
  let activePhoneOrderId = null;

  try {
    logStatus(`\n=== ${profile.email} ===`);
    logStatus(`  → Name: ${profile.firstName} ${profile.lastName}`);
    logStatus(`  → DOB: ${profile.birthYear}-${padNum(profile.birthMonth)}-${padNum(profile.birthDay)} gender=${profile.gender}`);

    ({ browser, context, page } = await launchBrowser());

    mkdirSync(SCREENSHOT_DIR, { recursive: true });

    logStatus("  → Loading signup page for session cookies...");
    await navigateToSignup(page);
    let session = await extractSessionState(page);
    const reqidState = { current: 452084 };

    // Step 1: Name submit — stay on initial page (reCAPTCHA loaded here)
    const nameResponse = await batchexecute(
      page,
      session,
      {
        rpcid: "E815hb",
        payload: buildNamePayload(profile),
        sourcePath: "/lifecycle/steps/signup/name",
      },
      reqidState
    );

    // Don't navigate — stay on initial page to keep reCAPTCHA available
    session = updateSessionFromResponse(session, nameResponse);

    // Step 2: DOB/gender — get reCAPTCHA token from initial page
    const dobRecaptchaToken = await getRecaptchaToken(page, RECAPTCHA_KEY, "signup");
    const dobResponse = await batchexecute(
      page,
      session,
      {
        rpcid: "eOY7Bb",
        payload: buildDobPayload(profile, dobRecaptchaToken, session),
        sourcePath: "/lifecycle/steps/signup/birthdaygender",
      },
      reqidState
    );

    session = updateSessionFromResponse(session, dobResponse);

    // Step 3: Username init
    await batchexecute(
      page,
      session,
      {
        rpcid: "xdYwpe",
        payload: buildUsernameInitPayload(),
        sourcePath: "/lifecycle/steps/signup/username",
        requestMode: "1",
      },
      reqidState
    );

    // Step 4: Username submit
    const usernameResponse = await batchexecute(
      page,
      session,
      {
        rpcid: "NHJMOd",
        payload: buildUsernameSubmitPayload(profile, 452084),
        sourcePath: "/lifecycle/steps/signup/username",
      },
      reqidState
    );

    if (usernameResponse.usernameTaken) {
      throw new Error(`Username already taken: ${profile.username}`);
    }

    session = updateSessionFromResponse(session, usernameResponse);

    // Step 5: Password init
    await batchexecute(
      page,
      session,
      {
        rpcid: "dOJftd",
        payload: buildPasswordInitPayload(),
        sourcePath: "/lifecycle/steps/signup/password",
        requestMode: "1",
      },
      reqidState
    );

    // Step 6: Password submit — get fresh reCAPTCHA token
    const passwordRecaptchaToken = await getRecaptchaToken(page, RECAPTCHA_KEY, "signup");
    const passwordResponse = await batchexecute(
      page,
      session,
      {
        rpcid: "ZNd7Td",
        payload: buildPasswordSubmitPayload(profile, passwordRecaptchaToken),
        sourcePath: "/lifecycle/steps/signup/password",
      },
      reqidState
    );

    // NOW navigate to phone verification (the only navigation needed)
    const nextPasswordPath =
      passwordResponse.nextUrl ||
      passwordResponse.nextPath ||
      "/signin/v2/challenge/phone";

    session = await navigateToNextStep(page, session, passwordResponse, nextPasswordPath);
    const phoneResult = await handlePhoneVerification(page, profile.username, smsProvider);
    result.cost += Number(phoneResult?.cost || 0);
    activePhoneOrderId = phoneResult?.activePhoneId || null;

    logStatus("  → Completing ToS and remaining post-phone screens...");
    await handlePostPhoneScreens(page);
    await assertNotCannotCreate(page);

    if (isGoogleSuccessUrl(page.url())) {
      result.status = "success";
      logStatus(`  ✅ Account created: ${profile.email}`);
    } else {
      const screenshotPath = join(SCREENSHOT_DIR, `${profile.username}-final.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      result.status = `manual-check:${page.url()}`;
      logStatus(`  ⚠ Needs manual check: ${profile.email}`);
    }
  } catch (error) {
    if (error.message === CANNOT_CREATE_ERROR) {
      result.status = "cannot-create";
      logStatus(`  ❌ Google cannot create account right now: ${profile.email}`);
    } else {
      result.status = `error:${error.message.slice(0, 100)}`;
      logStatus(`  ❌ Failed: ${profile.email} — ${error.message.slice(0, 120)}`);
    }

    if (page) {
      await page
        .screenshot({ path: join(SCREENSHOT_DIR, `${profile.username}-error.png`), fullPage: true })
        .catch(() => {});
    }
  } finally {
    if (activePhoneOrderId) {
      await smsProvider.cancelNumber(activePhoneOrderId).catch(() => {});
    }

    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return result;
}

function buildDryRunResult(profile) {
  return {
    username: profile.username,
    email: profile.email,
    password: profile.password,
    firstName: profile.firstName,
    lastName: profile.lastName,
    cost: 0,
    status: "dry-run",
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  if (!Number.isInteger(START) || !Number.isInteger(END) || START < 1 || END < START) {
    throw new Error(`Invalid range: start=${START} end=${END}`);
  }

  initCsv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  if (!DRY_RUN && !API_KEY) {
    throw new Error("Missing 5sim API key. Use --api-key or FIVESIM_API_KEY.");
  }

  const completed = getCompletedUsernames();
  const smsProvider = createSmsProvider(API_KEY, REGION);
  const summary = [];

  for (let number = START; number <= END; number += 1) {
    const profile = generateProfile(number);

    if (completed.has(profile.username)) {
      logStatus(`Skipping ${profile.email} (already successful in accounts.csv)`);
      continue;
    }

    if (DRY_RUN) {
      logStatus(`\n=== DRY RUN ${profile.email} ===`);
      logStatus(`  → Would load signup page, extract at/f.sid/bl, and run batchexecute RPCs`);
      logStatus(`  → Would submit name → DOB/gender → username → password via HTTP fetch in page.evaluate()`);
      logStatus(`  → Would switch to DOM fallback for phone verification using 5sim ${REGION}`);
      const dryResult = buildDryRunResult(profile);
      summary.push(dryResult);
      continue;
    }

    const result = await createAccount(profile, smsProvider);
    appendCsv(result);
    summary.push(result);
    await delay(randomInt(2500, 5000));
  }

  console.log(
    JSON.stringify(
      {
        mode: DRY_RUN ? "dry-run" : "live",
        range: { start: START, end: END },
        region: REGION,
        recaptchaKeyConfigured: Boolean(RECAPTCHA_KEY),
        results: summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
