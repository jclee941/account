#!/usr/bin/env node
/**
 * Google Account Creator — ADB + Android Chrome Edition
 *
 * Creates Google accounts through an Android emulator/device driven by ADB.
 * The flow uses coordinate-based taps for a 1080x1920 portrait screen and
 * mirrors the known-good manual Android workflow documented in
 * docs/adb-gmail-creation.md.
 *
 * Usage:
 *   node account/create-accounts-adb.mjs --dry-run
 *   node account/create-accounts-adb.mjs --count 3 --api-key <5sim-key>
 *   node account/create-accounts-adb.mjs --count 1 --region indonesia --device localhost:5555
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  connectDevice,
  getConnectedDevices,
  wakeDevice,
  unlockDevice,
  launchChrome,
  openUrl,
  tap,
  type as adbType,
  pressKey,
  swipe,
  screenshot as adbScreenshot,
  uidump,
} from "../lib/adb-utils.mjs";
import { createSmsProvider } from "../lib/sms-provider.mjs";

// ── Config ──────────────────────────────────────────────────────────
const PASSWORD = "bingogo1";
const BIRTH_DAY = "15";
const BIRTH_YEAR = "2000";
const BIRTH_MONTH_LABEL = "January";
const GENDER_LABEL = "male";
const DEFAULT_REGION = "russia";
const DEFAULT_DEVICE = "localhost:5555";
const SIGNUP_URL = "https://accounts.google.com/signup";
const SIGNUP_URL_FALLBACK = "accounts.google.com/signup";
const PHONE_RETRY_LIMIT = 5;
const ACCOUNT_RETRY_LIMIT = 2;

const CSV_FILE = join(import.meta.dirname, "..", "accounts.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "..", "screenshots");

const REQUIRED_CSV_HEADER = [
  "username",
  "email",
  "password",
  "firstName",
  "lastName",
  "cost",
  "status",
  "timestamp",
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

// 1080x1920 portrait baseline. These are intentionally adjustable starting
// points; the script keeps screenshots after each step for fast tuning.
const COORDINATES = {
  chromeIcon: { x: 540, y: 1800 },
  addressBar: { x: 540, y: 150 },
  firstNameField: { x: 300, y: 600 },
  lastNameField: { x: 800, y: 600 },
  nextButton: { x: 540, y: 1200 },
  monthDropdown: { x: 200, y: 800 },
  monthJanuaryOption: { x: 220, y: 980 },
  dayField: { x: 540, y: 800 },
  yearField: { x: 880, y: 800 },
  genderDropdown: { x: 300, y: 950 },
  genderMaleOption: { x: 320, y: 1110 },
  usernameField: { x: 540, y: 700 },
  passwordField: { x: 540, y: 800 },
  confirmPasswordField: { x: 540, y: 950 },
  phoneField: { x: 540, y: 800 },
  smsCodeField: { x: 540, y: 800 },
  agreeButton: { x: 540, y: 1400 },
  scrollStart: { x: 540, y: 1500 },
  scrollEnd: { x: 540, y: 500 },
};

const US_FIRST_NAMES = [
  "James", "John", "Robert", "Michael", "David", "William", "Richard", "Joseph",
  "Thomas", "Christopher", "Charles", "Daniel", "Matthew", "Anthony", "Mark",
  "Steven", "Andrew", "Joshua", "Kevin", "Brian", "Ryan", "Timothy", "Jason",
  "Jeffrey", "Brandon", "Justin", "Nathan", "Adam", "Kyle", "Eric",
];

const US_LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris",
  "Clark", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
];

const QR_MARKERS = [
  "qr code",
  "scan a qr code",
  "qrcode",
  "qr코드",
];

const CANNOT_CREATE_MARKERS = [
  "couldn't create",
  "cannot create",
  "can’t create",
  "만들 수 없습니다",
];

const USERNAME_REJECT_MARKERS = [
  "username is taken",
  "that username is taken",
  "choose a different username",
  "already taken",
  "이미 사용 중",
  "이미 사용중",
  "사용할 수 없는 사용자 이름",
];

const PHONE_PROMPT_MARKERS = [
  "phone number",
  "verify your phone",
  "phone verification",
  "전화번호",
  "전화번호 인증",
  "휴대전화 번호",
  "verification code",
  "인증 코드",
];

const PHONE_REJECT_MARKERS = [
  "cannot be used",
  "can't be used",
  "used too many times",
  "this phone number cannot be used",
  "사용할 수 없습니다",
  "다른 번호를 사용",
  "нельзя использовать",
];

const SUCCESS_MARKERS = [
  "google account",
  "personal info",
  "privacy",
  "gmail",
  "inbox",
  "compose",
  "myaccount",
  "환영합니다",
];

const SIGN_IN_MARKERS = [
  "sign in",
  "signin",
  "use your google account",
  "이메일 또는 전화",
  "로그인",
];

const TERMS_MARKERS = [
  "i agree",
  "agree",
  "accept",
  "confirm",
  "privacy",
  "terms",
  "동의",
  "수락",
  "약관",
];

// ── CLI Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name, fallback = "") {
  const idx = args.findIndex((arg) => arg === `--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const DRY_RUN = args.includes("--dry-run");
const COUNT = parseInt(getArg("count", "1"), 10);
const SMS_API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "").trim();
const REGION = getArg("region", process.env.FIVESIM_REGION || DEFAULT_REGION).trim().toLowerCase();
const DEVICE = getArg("device", DEFAULT_DEVICE).trim();

// ── Helpers ─────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function formatCost(cost) {
  const value = Number(cost);
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function escapeCsv(value) {
  if (value == null) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function timestampToken() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeStep(step) {
  return String(step || "step").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function sanitizeStatus(message) {
  return String(message || "unknown")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, 100) || "unknown";
}

function sanitizeNamePart(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "") || "user";
}

function containsAny(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

function buildEmail(username) {
  return `${username}@gmail.com`;
}

function normalizePhone(rawPhone, region) {
  let phone = String(rawPhone || "").replace(/\D/g, "");
  const prefix = (REGION_COUNTRY_CODE[region] || "").replace("+", "");
  if (prefix && phone.startsWith(prefix)) {
    phone = phone.slice(prefix.length);
  }
  return phone;
}

function getCsvColumns() {
  if (!existsSync(CSV_FILE)) {
    return REQUIRED_CSV_HEADER;
  }

  const [headerLine = ""] = readFileSync(CSV_FILE, "utf8").split(/\r?\n/, 1);
  const columns = headerLine
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  return columns.length > 0 ? columns : REQUIRED_CSV_HEADER;
}

function initCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, `${REQUIRED_CSV_HEADER.join(",")}\n`);
  }
}

function appendCsv(row) {
  const columns = getCsvColumns();
  const valueMap = {
    username: row.username,
    email: row.email,
    password: row.password,
    firstName: row.firstName,
    lastName: row.lastName,
    koreanName: "",
    cost: formatCost(row.cost),
    status: row.status,
    timestamp: row.timestamp,
    verificationConfidence: "",
    verificationSignals: "",
  };

  const line = `${columns.map((column) => escapeCsv(valueMap[column] ?? "")).join(",")}\n`;
  writeFileSync(CSV_FILE, line, { flag: "a" });
}

function getExistingUsernames() {
  if (!existsSync(CSV_FILE)) {
    return new Set();
  }

  const content = readFileSync(CSV_FILE, "utf8");
  const matches = content.match(/^[^,\r\n]+,[^,\r\n]+@gmail\.com,/gm) || [];

  return new Set(
    matches
      .map((line) => line.split(",")[0].trim())
      .filter(Boolean)
  );
}

function generateRandomUsername(firstName, lastName, usedUsernames) {
  const first = sanitizeNamePart(firstName);
  const last = sanitizeNamePart(lastName);
  const patterns = [
    () => `${first}.${last}${randomInt(1000, 9999)}`,
    () => `${first}${randomInt(1000, 9999)}${last}`,
    () => `${first}${last}${randomInt(1000, 9999)}`,
    () => `${last}${first.slice(0, 1)}${randomInt(1000, 99999)}`,
    () => `${first.slice(0, 1)}${last}${randomInt(1000, 9999)}`,
  ];

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = randomPick(patterns)();
    if (!usedUsernames.has(candidate)) {
      usedUsernames.add(candidate);
      return candidate;
    }
  }

  throw new Error("username_generation_failed");
}

function generateAccountSeed() {
  return {
    firstName: randomPick(US_FIRST_NAMES),
    lastName: randomPick(US_LAST_NAMES),
  };
}

function createAccountIdentity(seed, usedUsernames) {
  const username = generateRandomUsername(seed.firstName, seed.lastName, usedUsernames);

  return {
    username,
    email: buildEmail(username),
    password: PASSWORD,
    firstName: seed.firstName,
    lastName: seed.lastName,
  };
}

function isRetryableStatus(status) {
  return status.startsWith("error:") && (
    status.includes("timeout") ||
    status.includes("device") ||
    status.includes("preflight") ||
    status.includes("phone") ||
    status.includes("verify") ||
    status.includes("chrome")
  );
}

async function withRetries(label, fn, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.log(`  ⚠️ ${label} failed (${attempt}/${attempts}): ${error.message.slice(0, 100)} — retrying...`);
      await delay(1000 * attempt);
    }
  }

  throw lastError;
}

async function takeShot(deviceId, step) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filename = `adb-${timestampToken()}-${sanitizeStep(step)}.png`;
  const filePath = join(SCREENSHOT_DIR, filename);

  try {
    await adbScreenshot(deviceId, filePath);
    console.log(`  📸 Screenshot: ${filename}`);
    return filePath;
  } catch (error) {
    console.log(`  ⚠️ Screenshot failed (${step}): ${error.message.slice(0, 100)}`);
    return null;
  }
}

async function getUiText(deviceId) {
  try {
    const xml = await uidump(deviceId);
    return String(xml || "").toLowerCase();
  } catch {
    return "";
  }
}

async function assertNotBlocked(deviceId) {
  const uiText = await getUiText(deviceId);

  if (containsAny(uiText, QR_MARKERS)) {
    throw new Error("blocked:qr_code_verification");
  }

  if (containsAny(uiText, CANNOT_CREATE_MARKERS)) {
    throw new Error("blocked:cannot_create");
  }

  return uiText;
}

async function hideKeyboard(deviceId) {
  await pressKey("KEYCODE_BACK", deviceId).catch(() => {});
  await delay(500);
}

async function tapPoint(deviceId, point, label) {
  console.log(`  👉 ${label} @ (${point.x}, ${point.y})`);
  await tap(point.x, point.y, deviceId);
  await delay(500);
}

async function focusAndType(deviceId, point, value, label) {
  console.log(`  ✍️ ${label}: ${value}`);
  await tapPoint(deviceId, point, label);
  await adbType(String(value).replace(/\s+/g, "%s"), deviceId);
  await delay(900);
}

async function clearField(deviceId, point, maxChars = 32) {
  await tapPoint(deviceId, point, "Clear field");
  await pressKey("KEYCODE_MOVE_END", deviceId).catch(() => {});
  for (let index = 0; index < maxChars; index++) {
    await pressKey("KEYCODE_DEL", deviceId).catch(() => {});
  }
  await delay(400);
}

async function submitCurrentScreen(deviceId, label = "Next") {
  await hideKeyboard(deviceId);
  await tapPoint(deviceId, COORDINATES.nextButton, label);
  await delay(3500);
}

async function scrollDown(deviceId) {
  await swipe(
    COORDINATES.scrollStart.x,
    COORDINATES.scrollStart.y,
    COORDINATES.scrollEnd.x,
    COORDINATES.scrollEnd.y,
    350,
    deviceId,
  );
  await delay(800);
}

async function runAdbPreflight(deviceId, { allowFailure = false } = {}) {
  try {
    console.log(`🔌 Connecting ADB device: ${deviceId}`);
    if (deviceId.includes(":")) {
      const result = await connectDevice(deviceId);
      const output = [result.stdout, result.stderr].filter(Boolean).join(" ").trim();
      if (output) {
        console.log(`  ${output}`);
      }
    }

    const devices = await getConnectedDevices();
    if (!devices.includes(deviceId)) {
      throw new Error(`device_not_connected:${deviceId}`);
    }

    await wakeDevice(deviceId);
    await unlockDevice(deviceId);
    await takeShot(deviceId, "preflight");
    return { ok: true };
  } catch (error) {
    if (allowFailure) {
      console.log(`⚠️ ADB preflight warning: ${error.message}`);
      return { ok: false, error };
    }
    throw error;
  }
}

async function launchChromeForSignup(deviceId) {
  console.log("  🌐 Launching Chrome...");

  try {
    await launchChrome(deviceId);
  } catch (error) {
    console.log(`  ⚠️ Chrome activity launch failed: ${error.message.slice(0, 100)} — using icon tap fallback.`);
    await pressKey("KEYCODE_HOME", deviceId).catch(() => {});
    await delay(1000);
    await tapPoint(deviceId, COORDINATES.chromeIcon, "Chrome icon");
  }

  await delay(3000);

  try {
    await openUrl(SIGNUP_URL, deviceId);
  } catch (error) {
    console.log(`  ⚠️ URL intent failed: ${error.message.slice(0, 100)} — using address bar fallback.`);
    await tapPoint(deviceId, COORDINATES.addressBar, "Address bar");
    await adbType(SIGNUP_URL_FALLBACK, deviceId);
    await delay(500);
    await pressKey("KEYCODE_ENTER", deviceId);
  }

  await delay(5000);
  await takeShot(deviceId, "signup-landing");
}

async function fillNameStep(deviceId, account) {
  console.log("  👤 [1/6] Filling name");
  await focusAndType(deviceId, COORDINATES.firstNameField, account.firstName, "First name");
  await focusAndType(deviceId, COORDINATES.lastNameField, account.lastName, "Last name");
  await takeShot(deviceId, "01-name");
  await submitCurrentScreen(deviceId, "Next (name)");
  await assertNotBlocked(deviceId);
}

async function fillBirthdayStep(deviceId) {
  console.log(`  🎂 [2/6] Filling birthday (${BIRTH_MONTH_LABEL} ${BIRTH_DAY}, ${BIRTH_YEAR}) / ${GENDER_LABEL}`);
  await tapPoint(deviceId, COORDINATES.monthDropdown, "Month dropdown");
  await tapPoint(deviceId, COORDINATES.monthJanuaryOption, "January");
  await focusAndType(deviceId, COORDINATES.dayField, BIRTH_DAY, "Birth day");
  await focusAndType(deviceId, COORDINATES.yearField, BIRTH_YEAR, "Birth year");
  await tapPoint(deviceId, COORDINATES.genderDropdown, "Gender dropdown");
  await tapPoint(deviceId, COORDINATES.genderMaleOption, "Gender: male");
  await takeShot(deviceId, "02-birthday");
  await submitCurrentScreen(deviceId, "Next (birthday)");
  await assertNotBlocked(deviceId);
}

async function fillUsernameStep(deviceId, account, usedUsernames) {
  console.log(`  🪪 [3/6] Filling username (${account.username})`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      account.username = generateRandomUsername(account.firstName, account.lastName, usedUsernames);
      account.email = buildEmail(account.username);
      console.log(`  🔄 Username retry ${attempt}/3 → ${account.username}`);
    }

    if (attempt > 1) {
      await clearField(deviceId, COORDINATES.usernameField, 40);
    }

    await focusAndType(deviceId, COORDINATES.usernameField, account.username, "Username");
    await takeShot(deviceId, `03-username-${attempt}`);
    await submitCurrentScreen(deviceId, "Next (username)");
    const uiText = await assertNotBlocked(deviceId);

    if (!containsAny(uiText, USERNAME_REJECT_MARKERS)) {
      return;
    }
  }

  throw new Error("username_rejected");
}

async function fillPasswordStep(deviceId, account) {
  console.log("  🔐 [4/6] Filling password");
  await focusAndType(deviceId, COORDINATES.passwordField, account.password, "Password");
  await focusAndType(deviceId, COORDINATES.confirmPasswordField, account.password, "Confirm password");
  await takeShot(deviceId, "04-password");
  await submitCurrentScreen(deviceId, "Next (password)");
  await assertNotBlocked(deviceId);
}

async function handlePhoneVerification(deviceId, smsProvider) {
  console.log(`  📱 [5/6] Handling phone verification (${smsProvider.name}/${smsProvider.region})`);

  let totalCost = 0;
  let activeOrderId = null;

  try {
    for (let attempt = 1; attempt <= PHONE_RETRY_LIMIT; attempt++) {
      const order = await smsProvider.buyNumber("google");
      activeOrderId = order.id;
      totalCost += Number(order.cost || 0);

      const phoneNumber = normalizePhone(order.phone, smsProvider.region);
      console.log(`  📞 Number ${attempt}/${PHONE_RETRY_LIMIT}: ${phoneNumber} (order=${order.id})`);

      await focusAndType(deviceId, COORDINATES.phoneField, phoneNumber, "Phone number");
      await takeShot(deviceId, `05-phone-${attempt}`);
      await submitCurrentScreen(deviceId, "Next (phone)");

      const postPhoneText = await assertNotBlocked(deviceId);
      if (containsAny(postPhoneText, PHONE_REJECT_MARKERS)) {
        console.log("  ⚠️ Phone number rejected. Cancelling order and rotating.");
        await smsProvider.cancelNumber(activeOrderId).catch(() => {});
        activeOrderId = null;
        await delay(1500);
        continue;
      }

      console.log("  ⏳ Waiting for SMS code...");
      const smsResult = typeof smsProvider.waitForSms === "function"
        ? await smsProvider.waitForSms(activeOrderId, {
            timeoutMs: 120000,
            pollIntervalMs: 7000,
            onPoll(result) {
              if (!result) {
                console.log("  ⏳ 5sim poll: waiting");
                return;
              }

              console.log(`  ⏳ 5sim poll: ${result.status}${result.code ? ` (${result.code})` : ""}`);
            },
          })
        : null;

      if (!smsResult?.code) {
        console.log("  ⚠️ SMS timeout or cancelled order. Rotating number.");
        activeOrderId = null;
        await delay(1500);
        continue;
      }

      console.log(`  📨 SMS received: ${smsResult.code}`);
      await focusAndType(deviceId, COORDINATES.smsCodeField, smsResult.code, "SMS code");
      await takeShot(deviceId, `05-code-${attempt}`);
      await submitCurrentScreen(deviceId, "Verify code");
      await delay(5000);
      await assertNotBlocked(deviceId);

      await smsProvider.finishNumber(activeOrderId).catch(() => {});
      activeOrderId = null;
      return { cost: totalCost };
    }

    throw new Error("phone_verification_failed");
  } catch (error) {
    if (activeOrderId) {
      await smsProvider.cancelNumber(activeOrderId).catch(() => {});
    }
    throw error;
  }
}

async function completeConsentScreens(deviceId) {
  console.log("  ✅ [6/6] Completing consent/setup screens");

  for (let attempt = 1; attempt <= 8; attempt++) {
    const uiText = await assertNotBlocked(deviceId);

    if (containsAny(uiText, SUCCESS_MARKERS) && !containsAny(uiText, SIGN_IN_MARKERS)) {
      return;
    }

    await takeShot(deviceId, `06-consent-${attempt}`);

    if (containsAny(uiText, TERMS_MARKERS)) {
      await scrollDown(deviceId);
      await tapPoint(deviceId, COORDINATES.agreeButton, "Agree / Accept");
    } else {
      await tapPoint(deviceId, COORDINATES.nextButton, "Continue / Next");
    }

    await delay(4000);
  }
}

async function verifySuccess(deviceId) {
  console.log("  🔎 Verifying signed-in Google state...");

  await openUrl("https://myaccount.google.com", deviceId).catch(() => {});
  await delay(5000);
  await takeShot(deviceId, "07-verify-myaccount");

  let uiText = await getUiText(deviceId);
  if (containsAny(uiText, SUCCESS_MARKERS) && !containsAny(uiText, SIGN_IN_MARKERS)) {
    return true;
  }

  await openUrl("https://mail.google.com", deviceId).catch(() => {});
  await delay(5000);
  await takeShot(deviceId, "07-verify-gmail");

  uiText = await getUiText(deviceId);
  return containsAny(uiText, SUCCESS_MARKERS) && !containsAny(uiText, SIGN_IN_MARKERS);
}

async function createAccount(account, smsProvider, deviceId, usedUsernames) {
  const result = {
    ...account,
    cost: 0,
    status: "error:unknown",
    timestamp: new Date().toISOString(),
  };

  try {
    console.log(`  🚀 Starting signup for ${account.email}`);

    await withRetries("ADB device preflight", async () => {
      await runAdbPreflight(deviceId);
    }, 2);

    await withRetries("Chrome signup launch", async () => {
      await launchChromeForSignup(deviceId);
    }, 2);

    await fillNameStep(deviceId, account);
    await fillBirthdayStep(deviceId);
    await fillUsernameStep(deviceId, account, usedUsernames);
    result.username = account.username;
    result.email = account.email;
    await fillPasswordStep(deviceId, account);

    const postPasswordText = await getUiText(deviceId);
    const shouldHandlePhone =
      !postPasswordText ||
      containsAny(postPasswordText, PHONE_PROMPT_MARKERS) ||
      (!containsAny(postPasswordText, TERMS_MARKERS) && !containsAny(postPasswordText, SUCCESS_MARKERS));

    if (shouldHandlePhone) {
      const phoneResult = await handlePhoneVerification(deviceId, smsProvider);
      result.cost += Number(phoneResult.cost || 0);
    }

    await completeConsentScreens(deviceId);

    const success = await withRetries("final account verification", async () => verifySuccess(deviceId), 2);
    if (!success) {
      throw new Error("verify_failed");
    }

    result.status = "created:adb";
    result.timestamp = new Date().toISOString();
    console.log(`  ✅ Account created: ${result.email}`);
    return result;
  } catch (error) {
    result.status = `error:${sanitizeStatus(error.message)}`;
    result.timestamp = new Date().toISOString();
    console.log(`  ❌ Failed: ${result.email} — ${error.message.slice(0, 120)}`);
    await takeShot(deviceId, `${result.username}-error`);
    return result;
  }
}

async function createAccountWithRetries(seed, smsProvider, deviceId, usedUsernames) {
  let account = createAccountIdentity(seed, usedUsernames);
  let lastResult = null;

  for (let attempt = 1; attempt <= ACCOUNT_RETRY_LIMIT; attempt++) {
    if (attempt > 1) {
      account = createAccountIdentity(seed, usedUsernames);
      console.log(`  🔄 Transient retry ${attempt}/${ACCOUNT_RETRY_LIMIT} with fresh username ${account.username}`);
    }

    lastResult = await createAccount(account, smsProvider, deviceId, usedUsernames);
    if (!isRetryableStatus(lastResult.status)) {
      return lastResult;
    }
  }

  return lastResult;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  if (!Number.isInteger(COUNT) || COUNT < 1) {
    throw new Error("--count must be an integer >= 1");
  }

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Google Account Creator — ADB + Android Chrome");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Count:     ${COUNT}`);
  console.log(`  Password:  ${"*".repeat(PASSWORD.length)}`);
  console.log(`  Device:    ${DEVICE}`);
  console.log(`  Region:    ${REGION}`);
  console.log(`  Mode:      ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  Birthdate: ${BIRTH_MONTH_LABEL} ${BIRTH_DAY}, ${BIRTH_YEAR}`);
  console.log(`  Gender:    ${GENDER_LABEL}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const usedUsernames = getExistingUsernames();
  const seeds = Array.from({ length: COUNT }, () => generateAccountSeed());
  const previewUsernames = new Set(usedUsernames);
  const previewAccounts = seeds.map((seed) => createAccountIdentity(seed, previewUsernames));

  const preflight = await runAdbPreflight(DEVICE, { allowFailure: true });
  if (preflight.ok) {
    console.log("✅ ADB preflight passed\n");
  } else {
    console.log("⚠️ ADB preflight unavailable; dry-run preview still generated\n");
  }

  if (DRY_RUN) {
    console.log("📋 Preview (dry run):\n");
    console.log("Username            | Email                         | First      | Last");
    console.log("────────────────────|───────────────────────────────|────────────|────────");
    for (const account of previewAccounts) {
      console.log(
        `${account.username.padEnd(20)}| ${account.email.padEnd(30)}| ${account.firstName.padEnd(11)}| ${account.lastName}`
      );
    }
    console.log(`\nTotal: ${previewAccounts.length} accounts`);
    return;
  }

  if (!SMS_API_KEY) {
    throw new Error("Missing 5sim API key. Use --api-key or FIVESIM_API_KEY.");
  }

  initCsv();

  const smsProvider = createSmsProvider("5sim", SMS_API_KEY, REGION);
  try {
    const balance = await smsProvider.getBalance();
    console.log(`💰 5sim balance: ${balance.toFixed(4)}\n`);
  } catch (error) {
    console.log(`⚠️ Balance check failed: ${error.message.slice(0, 100)}\n`);
  }

  let successCount = 0;
  let failCount = 0;
  let totalCost = 0;

  for (let index = 0; index < seeds.length; index++) {
    console.log(`\n[${index + 1}/${seeds.length}] Creating account`);
    const result = await createAccountWithRetries(seeds[index], smsProvider, DEVICE, usedUsernames);
    totalCost += Number(result.cost || 0);
    appendCsv(result);

    if (result.status === "created:adb") {
      successCount += 1;
    } else {
      failCount += 1;
    }

    if (index < seeds.length - 1) {
      const cooldownMs = randomInt(5000, 9000);
      console.log(`  ⏳ Cooling down ${(cooldownMs / 1000).toFixed(1)}s before next account...`);
      await delay(cooldownMs);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Done! ✅ ${successCount} success | ❌ ${failCount} failed`);
  console.log(`  SMS Cost: ${formatCost(totalCost)}`);
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
