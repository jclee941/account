#!/usr/bin/env node
/**
 * Google Account Creator — Playwright Automation (Stealth Edition)
 *
 * Creates Google accounts with pattern qws943[01-50]
 * Password: bingogo1
 * Names: Random US names
 * 5sim.net: SMS verification integration for Google phone step
 *
 * Anti-detection:
 *   - rebrowser-playwright (CDP leak patches)
 *   - ghost-cursor (Bezier mouse movements)
 *   - Human-like typing with variable delays
 *   - Profile warming before signup
 *   - Fresh browser per account
 *   - Randomized fingerprints (viewport, UA, locale, timezone)
 *   - Extended inter-account delays (60-120s)
 *
 * Usage:
 *   xvfb-run node create-accounts.mjs                                  # all 50
 *   xvfb-run node create-accounts.mjs --start 1 --end 5                # qws94301~05
 *   node create-accounts.mjs --dry-run                                  # preview only
 *   xvfb-run node create-accounts.mjs --api-key <5sim-key> --region russia
 */

// -- Rebrowser anti-CDP-leak patches --------------------------------
process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";
process.env.REBROWSER_PATCHES_UTILITY_WORLD_NAME = "util";
process.env.REBROWSER_PATCHES_SOURCE_URL = "jquery.min.js";

import { chromium } from "rebrowser-playwright";
import { createCursor } from "ghost-cursor-playwright";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────
const PASSWORD = "bingogo1";
const PREFIX = "qws943";
const BIRTH_YEAR = "2000";
const BIRTH_MONTH = "1"; // January
const BIRTH_DAY = "15";
const GENDER = "male"; // male | female

const CSV_FILE = join(import.meta.dirname, "..", "accounts.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "..", "screenshots");
const CANNOT_CREATE_ERROR = "GOOGLE_CANNOT_CREATE";
const DEFAULT_5SIM_REGION = "russia";

// ── Korean Name Generator ───────────────────────────────────────────
const LAST_NAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "안", "송", "류", "전",
  "홍", "고", "문", "양", "손", "배", "백", "허", "유", "남",
  "심", "노", "하", "곽", "성", "차", "주", "우", "구", "민",
];

const FIRST_NAME_SYLLABLES = [
  "준", "민", "서", "지", "현", "수", "영", "진", "우", "혁",
  "도", "윤", "하", "은", "성", "호", "재", "태", "동", "상",
  "경", "승", "용", "석", "원", "찬", "규", "광", "형", "철",
  "기", "정", "연", "환", "범", "건", "덕", "희", "인", "종",
];

const LAST_NAMES_ROMAN = {
  "김": "Kim", "이": "Lee", "박": "Park", "최": "Choi", "정": "Jung",
  "강": "Kang", "조": "Cho", "윤": "Yoon", "장": "Jang", "임": "Lim",
  "한": "Han", "오": "Oh", "서": "Seo", "신": "Shin", "권": "Kwon",
  "황": "Hwang", "안": "Ahn", "송": "Song", "류": "Ryu", "전": "Jeon",
  "홍": "Hong", "고": "Ko", "문": "Moon", "양": "Yang", "손": "Son",
  "배": "Bae", "백": "Baek", "허": "Huh", "유": "Yoo", "남": "Nam",
  "심": "Sim", "노": "Noh", "하": "Ha", "곽": "Kwak", "성": "Sung",
  "차": "Cha", "주": "Joo", "우": "Woo", "구": "Koo", "민": "Min",
};

const FIRST_SYLLABLE_ROMAN = {
  "준": "Jun", "민": "Min", "서": "Seo", "지": "Ji", "현": "Hyun",
  "수": "Su", "영": "Young", "진": "Jin", "우": "Woo", "혁": "Hyuk",
  "도": "Do", "윤": "Yun", "하": "Ha", "은": "Eun", "성": "Sung",
  "호": "Ho", "재": "Jae", "태": "Tae", "동": "Dong", "상": "Sang",
  "경": "Kyung", "승": "Seung", "용": "Yong", "석": "Seok", "원": "Won",
  "찬": "Chan", "규": "Kyu", "광": "Kwang", "형": "Hyung", "철": "Chul",
  "기": "Ki", "정": "Jung", "연": "Yeon", "환": "Hwan", "범": "Beom",
  "건": "Geon", "덕": "Deok", "희": "Hee", "인": "In", "종": "Jong",
};

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateKoreanName() {
  const lastName = randomPick(LAST_NAMES);
  const s1 = randomPick(FIRST_NAME_SYLLABLES);
  const s2 = randomPick(FIRST_NAME_SYLLABLES);

  const lastRoman = LAST_NAMES_ROMAN[lastName] || "Lee";
  const firstRoman =
    (FIRST_SYLLABLE_ROMAN[s1] || "Min") +
    (FIRST_SYLLABLE_ROMAN[s2] || "Jun").toLowerCase();

  return {
    korean: `${lastName}${s1}${s2}`,
    firstName: firstRoman,
    lastName: lastRoman,
  };
}

// Indonesian Name Generator
const INDO_FIRST_NAMES = [
  "Budi", "Agus", "Adi", "Dedi", "Eko", "Fajar", "Hendra", "Irwan",
  "Joko", "Kurniawan", "Lukman", "Muhammad", "Nando", "Putra", "Rizki",
  "Surya", "Teguh", "Wahyu", "Yusuf", "Arif", "Bayu", "Cahyo",
  "Dwi", "Gunawan", "Hari", "Ivan", "Krisna", "Luthfi", "Nugroho", "Pratama",
];

const INDO_LAST_NAMES = [
  "Pratama", "Saputra", "Wijaya", "Hidayat", "Nugraha", "Permana", "Kusuma",
  "Santoso", "Wibowo", "Setiawan", "Ramadhan", "Firmansyah", "Hakim", "Utomo",
  "Suryadi", "Hartono", "Susanto", "Prasetyo", "Gunawan", "Maulana",
];

function generateIndonesianName() {
  return {
    firstName: randomPick(INDO_FIRST_NAMES),
    lastName: randomPick(INDO_LAST_NAMES),
    korean: "", // Not needed but keeps interface compatible
  };
}

// US/English Name Generator
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

function generateUSName() {
  return {
    firstName: randomPick(US_FIRST_NAMES),
    lastName: randomPick(US_LAST_NAMES),
    korean: "",
  };
}

// ── CLI Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const DRY_RUN = args.includes("--dry-run");
const START = parseInt(getArg("start", "1"), 10);
const END = parseInt(getArg("end", "50"), 10);
const HEADED = args.includes("--headed");
const BASELINE = args.includes("--baseline");
const MOBILE = args.includes("--mobile");
const CDP_MODE = args.includes("--cdp");
const FIVESIM_API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "").trim();
const SMS_PROVIDER = getArg("sms-provider", process.env.SMS_PROVIDER || "5sim").trim().toLowerCase();
const SMS_API_KEY = getArg("sms-key", "").trim() || FIVESIM_API_KEY; // --sms-key takes priority, falls back to --api-key / FIVESIM_API_KEY
const FIVESIM_REGION = getArg("region", process.env.FIVESIM_REGION || DEFAULT_5SIM_REGION).trim();
const SMS_REGION = getArg("sms-region", "").trim() || FIVESIM_REGION; // --sms-region overrides region for SMS number purchase only
const PROXY_SERVER = getArg("proxy", process.env.PROXY_SERVER || "").trim();
const PROXY_USER = getArg("proxy-user", process.env.PROXY_USER || "").trim();
const PROXY_PASS = getArg("proxy-pass", process.env.PROXY_PASS || "").trim();
const TEST_URL_NAME = getArg("test-url", "").trim(); // Force specific signup URL by name substring
const FORCE_OPERATOR = getArg("operator", "").trim(); // Force specific 5sim operator (e.g. virtual58, virtual4)
// ── Helpers ─────────────────────────────────────────────────────────
function padNum(n) {
  return String(n).padStart(2, '0');
}

function formatCost(cost) {
  const n = Number(cost);
  return Number.isFinite(n) ? n.toFixed(4) : '0.0000';
}

// Launch real Chrome for CDP mode - makes Google see a real Chrome process instead of Playwright
function launchRealChrome(cdpPort) {
  const windowSize = MOBILE ? '--window-size=412,915' : '--window-size=1920,1080';
  const chromeArgs = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/gmail-chrome-profile-${Date.now()}`,
    ...(BASELINE ? [] : STEALTH_ARGS),
    windowSize,
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
  ];

  if (!HEADED) {
    chromeArgs.push('--headless=new');
  }

  if (PROXY_SERVER) {
    chromeArgs.push(`--proxy-server=${PROXY_SERVER}`);
  }

  console.log(`🔌 CDP Mode: Launching real Chrome on port ${cdpPort}...`);

  const chromeProc = spawn('/usr/bin/google-chrome-stable', chromeArgs, {
    stdio: 'ignore',
    detached: true,
  });

  // Wait for Chrome to start
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(chromeProc);
    }, 3000);
  });
}



function appendCsv(row) {
  const line = `${row.username},${row.email},${row.password},${row.firstName},${row.lastName},${row.koreanName},${formatCost(row.cost)},${row.status},${row.timestamp}\n`;
  writeFileSync(CSV_FILE, line, { flag: "a" });
}

function initCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, "username,email,password,firstName,lastName,koreanName,cost,status,timestamp\n");
  }
}

function getCompletedUsernames() {
  if (!existsSync(CSV_FILE)) return new Set();
  const lines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1);
  return new Set(
    lines
      .filter((l) => l.includes(",success,"))
      .map((l) => l.split(",")[0])
      .filter(Boolean)
  );
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// 5sim region name → E.164 country calling code prefix
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

const SMSACTIVATE_COUNTRY_CODES = {
  russia: "0", ukraine: "1", kazakhstan: "2", indonesia: "6",
  india: "22", usa: "12", england: "16", korea: "19",
  china: "3", philippines: "4", malaysia: "7", kenya: "36",
};

const REGION_PROFILES = {
  russia: {
    locales: ["ru-RU", "ru"],
    timezones: ["Europe/Moscow"],
    acceptLanguage: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    languages: ["ru-RU", "ru", "en-US", "en"],
    geolocation: { latitude: 55.7558, longitude: 37.6176 },
    warmingSites: [
      "https://ru.wikipedia.org/wiki/%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F",
      "https://yandex.ru",
      "https://vk.com",
      "https://mail.ru",
      "https://www.ozon.ru",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "создать аккаунт gmail",
      "гугл аккаунт",
      "почта gmail",
      "настройки android",
      "регистрация google",
    ],
  },
  ukraine: {
    locales: ["uk-UA", "uk", "ru-UA"],
    timezones: ["Europe/Kyiv"],
    acceptLanguage: "uk-UA,uk;q=0.9,ru;q=0.8,en-US;q=0.7,en;q=0.6",
    languages: ["uk-UA", "uk", "ru-UA", "en-US", "en"],
    geolocation: { latitude: 50.4501, longitude: 30.5234 },
    warmingSites: [
      "https://uk.wikipedia.org/wiki/%D0%A3%D0%BA%D1%80%D0%B0%D1%97%D0%BD%D0%B0",
      "https://www.ukr.net",
      "https://www.pravda.com.ua",
      "https://www.olx.ua",
      "https://rozetka.com.ua",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "створити акаунт gmail",
      "обліковий запис google",
      "пошта gmail",
      "налаштування android",
      "реєстрація google",
    ],
  },
  kazakhstan: {
    locales: ["kk-KZ", "ru-KZ", "kk", "ru"],
    timezones: ["Asia/Almaty"],
    acceptLanguage: "kk-KZ,kk;q=0.9,ru-KZ;q=0.8,ru;q=0.7,en-US;q=0.6,en;q=0.5",
    languages: ["kk-KZ", "ru-KZ", "kk", "ru", "en-US", "en"],
    geolocation: { latitude: 43.2389, longitude: 76.8897 },
    warmingSites: [
      "https://kk.wikipedia.org/wiki/%D2%9A%D0%B0%D0%B7%D0%B0%D2%9B%D1%81%D1%82%D0%B0%D0%BD",
      "https://www.nur.kz",
      "https://www.olx.kz",
      "https://mail.ru",
      "https://www.kaspi.kz",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "gmail тіркелгісін жасау",
      "google аккаунты",
      "gmail пошта",
      "android баптаулары",
      "google тіркелу",
    ],
  },
  indonesia: {
    locales: ["id-ID", "id"],
    timezones: ["Asia/Jakarta"],
    acceptLanguage: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    languages: ["id-ID", "id", "en-US", "en"],
    geolocation: { latitude: -6.2088, longitude: 106.8456 },
    warmingSites: [
      "https://id.wikipedia.org/wiki/Indonesia",
      "https://www.tokopedia.com",
      "https://www.kompas.com",
      "https://www.detik.com",
      "https://www.bukalapak.com",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "buat akun gmail",
      "akun google",
      "email gmail",
      "pengaturan android",
      "daftar google",
    ],
  },
  india: {
    locales: ["hi-IN", "en-IN", "hi", "en"],
    timezones: ["Asia/Kolkata"],
    acceptLanguage: "hi-IN,hi;q=0.9,en-IN;q=0.8,en-US;q=0.7,en;q=0.6",
    languages: ["hi-IN", "en-IN", "hi", "en-US", "en"],
    geolocation: { latitude: 28.6139, longitude: 77.209 },
    warmingSites: [
      "https://en.wikipedia.org/wiki/India",
      "https://www.flipkart.com",
      "https://www.rediff.com",
      "https://timesofindia.indiatimes.com",
      "https://www.ndtv.com",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "gmail account create",
      "google account",
      "gmail email",
      "android settings",
      "gmail account banana",
    ],
  },
  usa: {
    locales: ["en-US", "en"],
    timezones: ["America/New_York"],
    acceptLanguage: "en-US,en;q=0.9",
    languages: ["en-US", "en"],
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    warmingSites: [
      "https://en.wikipedia.org/wiki/United_States",
      "https://www.reddit.com",
      "https://www.amazon.com",
      "https://www.nytimes.com",
      "https://www.youtube.com",
      "https://www.craigslist.org",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "create gmail account",
      "google account signup",
      "gmail email",
      "android settings",
      "new google account",
    ],
  },
  korea: {
    locales: ["ko-KR", "ko", "ko-KR", "ko-KR", "ko"],
    timezones: ["Asia/Seoul", "Asia/Seoul", "Asia/Seoul", "Asia/Seoul", "Asia/Seoul"],
    acceptLanguage: "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    languages: ["ko-KR", "ko", "en-US", "en"],
    geolocation: { latitude: 37.5665, longitude: 126.978 },
    warmingSites: [
      "https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD",
      "https://www.naver.com",
      "https://www.daum.net",
      "https://www.youtube.com",
      "https://www.coupang.com",
      "https://www.tistory.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "gmail 계정 만들기",
      "구글 계정",
      "gmail",
      "안드로이드 설정",
      "구글 계정 만들기",
    ],
  },
  england: {
    locales: ["en-GB", "en"],
    timezones: ["Europe/London"],
    acceptLanguage: "en-GB,en;q=0.9,en-US;q=0.8",
    languages: ["en-GB", "en", "en-US"],
    geolocation: { latitude: 51.5074, longitude: -0.1278 },
    warmingSites: [
      "https://en.wikipedia.org/wiki/England",
      "https://www.bbc.co.uk",
      "https://www.guardian.co.uk",
      "https://www.reddit.com/r/unitedkingdom",
      "https://www.amazon.co.uk",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "create gmail account uk",
      "google account",
      "gmail sign up",
      "android settings",
      "new google account",
    ],
  },
  _default: {
    locales: ["en-US", "en"],
    timezones: ["America/New_York"],
    acceptLanguage: "en-US,en;q=0.9",
    languages: ["en-US", "en"],
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    warmingSites: [
      "https://en.wikipedia.org/wiki/United_States",
      "https://www.reddit.com",
      "https://www.amazon.com",
      "https://www.youtube.com",
      "https://stackoverflow.com",
    ],
    warmingSearchTerms: [
      "create gmail account",
      "google account",
      "gmail sign up",
      "android settings",
      "new google account",
    ],
  },
};

function normalizePhone(phone, region) {
  let p = String(phone || "").trim();
  const prefix = REGION_COUNTRY_CODE[region];
  if (prefix && p.startsWith(prefix)) {
    p = p.slice(prefix.length);
  } else if (p.startsWith("+")) {
    // Fallback: strip just the "+" sign for unknown regions
    p = p.slice(1);
  }
  return p;
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

async function getBodyText(page) {
  return (await page.textContent("body").catch(() => "")) || "";
}

async function detectCannotCreate(page) {
  const bodyText = await getBodyText(page);
  return (
    bodyText.includes("Sorry, we could not create your Google Account") ||
    bodyText.includes("죄송합니다. Google 계정을 만들 수 없습니다") ||
    bodyText.includes("невозможно создать") ||
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

async function clickSkipLike(page, cursor) {
  return clickByTexts(page, cursor, ["건너뛰기", "Skip", "Пропустить", "Lewati"]);
}

async function clickAgreeLike(page, cursor) {
  return clickByTexts(page, cursor, ["동의합니다", "I agree", "동의", "Agree", "Принимаю", "Согласен", "Saya setuju", "Setuju"]);
}

async function clickPostVerificationButton(page, cursor) {
  return clickByTexts(page, cursor, [
    "건너뛰기",
    "Skip",
    "다음",
    "Next",
    "Continue",
    "Yes, I'm in",
    "Yes, I'm in",
    "I agree",
    "동의합니다",
    "동의",
    "Agree",
    "Далее",
    "Продолжить",
    "Подтвердить",
    "Пропустить",
    "Принимаю",
    "Согласен",
    "Berikutnya",
    "Lanjutkan",
    "Lewati",
    "Saya setuju",
    "Setuju",
    "Ya, saya ikut",
  ]);
}

function isGoogleSuccessUrl(url) {
  return (
    url.includes("myaccount.google.com") ||
    url.includes("gds.google.com") ||
    url.includes("accounts.google.com/b/")
  );
}

// ── 5sim.net API ────────────────────────────────────────────────────
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

// ── sms-activate.org API ────────────────────────────────────────────
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
      console.log(`  [5sim] Using operator: ${operator}${FORCE_OPERATOR ? ' (forced)' : ' (auto-selected)'}`);
      return buyNumber(apiKey, region, operator);
    },
    checkSms: (id) => checkSms(apiKey, id),
    finishNumber: (id) => finishNumber(apiKey, id),
    cancelNumber: (id) => cancelNumber(apiKey, id),
    getBalance: () => getFiveSimBalance(apiKey),
  };
}

// ── Anti-Detection: Desktop Chrome Fingerprint ─────────────────────
const DESKTOP_DEVICE = {
  viewport: { width: 1920, height: 1080 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  deviceScaleFactor: 1.25,
  isMobile: false,
  hasTouch: false,
};

const MOBILE_DEVICE = {
  viewport: { width: 412, height: 915 },
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36",
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
};

const DEVICE = MOBILE ? MOBILE_DEVICE : DESKTOP_DEVICE;

const regionProfile = REGION_PROFILES[FIVESIM_REGION] || REGION_PROFILES._default;
const LOCALES = regionProfile.locales;
const TIMEZONES = regionProfile.timezones;

const WARMING_SEARCH_TERMS = regionProfile.warmingSearchTerms;

// External pre-warming sites (non-Google) to build advertising cookies / trust score
const EXTERNAL_WARMING_SITES = regionProfile.warmingSites;

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

// ── Human-Like Typing ───────────────────────────────────────────────
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

// ── Profile Warming ─────────────────────────────────────────────────
async function warmProfile(page, cursor) {
  try {
    // Phase 1: Visit non-Google sites to build advertising cookies and trust
    const externalSites = [...EXTERNAL_WARMING_SITES].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const site of externalSites) {
      try {
        const domain = new URL(site).hostname;
        console.log(`    🌐 External warming: ${domain}`);
        await page.goto(site, { waitUntil: "domcontentloaded", timeout: 12000 });
        await delay(randomInt(2000, 5000));
        // Scroll a bit to trigger ad/tracking scripts
        for (let i = 0; i < randomInt(1, 3); i++) {
          await page.mouse.wheel(0, randomInt(150, 400));
          await delay(randomInt(600, 1200));
        }
      } catch (err) {
        console.log(`    ⚠️ External warming skip ${site}: ${err.message.slice(0, 40)}`);
      }
    }

    // Phase 2: Google ecosystem warming
    try {
    console.log("    🌐 Warming: google.com");
    await page.goto("https://www.google.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    await delay(randomInt(2000, 4000));

    // Perform a Google search with a random term
    const searchTerm = randomPick(WARMING_SEARCH_TERMS);
    const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await humanType(page, searchInput, searchTerm);
      await page.keyboard.press("Enter");
      await delay(randomInt(3000, 6000));

      // Scroll through search results
      for (let i = 0; i < randomInt(2, 4); i++) {
        await page.mouse.wheel(0, randomInt(200, 500));
        await delay(randomInt(800, 1500));
      }

      // Click a random search result to look more human
      try {
        const results = page.locator('div#search a[href]:not([href*="google"])');
        const count = await results.count();
        if (count > 2) {
          const idx = randomInt(0, Math.min(count - 1, 3));
          console.log(`    🌐 Clicking search result #${idx + 1}`);
          await results.nth(idx).click();
          await delay(randomInt(3000, 6000));
          // Scroll on the result page
          await page.mouse.wheel(0, randomInt(200, 600));
          await delay(randomInt(1500, 3000));
          await page.goBack();
          await delay(randomInt(1500, 2500));
        }
      } catch {}
    }
    } catch (err) {
      console.log(`    ⚠️ Google search warming skip: ${err.message.slice(0, 60)}`);
    }

    // Visit YouTube briefly (builds Google trust across services)
    try {
      console.log("    🌐 Warming: youtube.com");
      await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded", timeout: 12000 });
      await delay(randomInt(2000, 4000));
      await page.mouse.wheel(0, randomInt(200, 500));
      await delay(randomInt(1000, 2000));
    } catch {}

    // Visit accounts.google.com to establish Google session
    console.log("    🌐 Warming: accounts.google.com");
    await page.goto("https://accounts.google.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    await delay(randomInt(2000, 4000));
  } catch (err) {
    console.log(`    ⚠️ Warming skip: ${err.message.slice(0, 60)}`);
  }
}

// ── Ghost Cursor Helper ─────────────────────────────────────────────
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

// ── Google Account Creation Flow ────────────────────────────────────
async function handlePhoneVerification(page, cursor, smsProvider) {
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

    // Note: consent page is now handled by the caller (createAccount) before
    // calling handlePhoneVerification(), matching gen.js architecture.
    const skipClicked = await clickSkipLike(page, cursor);
    if (skipClicked) {
      console.log("  → Skip button detected. Trying skip before SMS purchase...");
      await delay(randomInt(3000, 5000));
      await assertNotCannotCreate(page);
      const stillNeedsPhone = await phoneInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (!stillNeedsPhone) {
        return { cost: totalCost, activePhoneId: null };
      }
    }

    if (!phoneInputVisible && !phonePromptDetected) {
      return { cost: totalCost, activePhoneId: null };
    }

    console.log(`  → Phone verification required. Region: ${FIVESIM_REGION}`);
    console.log(`  → SMS provider: ${smsProvider.name}`);

    for (let numberAttempt = 1; numberAttempt <= 5; numberAttempt++) {
      let order = null;

      for (let buyAttempt = 1; buyAttempt <= 3; buyAttempt++) {
        try {
          // Check balance before each purchase attempt
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

      // Wait for phone input to be actually visible before filling
      let phoneReady = false;
      for (let waitAttempt = 0; waitAttempt < 12; waitAttempt++) {
        // Re-create locator each attempt in case DOM changed
        const freshPhoneInput = page.locator('#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
        const visible = await freshPhoneInput.isVisible({ timeout: 3000 }).catch(() => false);
        if (visible) {
          phoneReady = true;
          break;
        }
        if (waitAttempt === 0) {
          console.log('    ⏳ Waiting for phone input field to appear...');
        }
        // Take debug screenshot on first wait
        if (waitAttempt === 2) {
          const debugPath = `qws943${String(numberAttempt).padStart(2,'0')}-phone-wait-debug.png`;
          await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
          console.log(`    📸 Debug screenshot: ${debugPath} URL: ${page.url()}`);
        }
        await delay(2000);
      }

      if (!phoneReady) {
        console.log('    ❌ Phone input never appeared after 30s+ wait. Taking screenshot...');
        const errPath = `qws94301-phone-not-found.png`;
        await page.screenshot({ path: errPath, fullPage: true }).catch(() => {});
        console.log(`    📸 ${errPath} URL: ${page.url()}`);
        // Try to dump visible input elements for debugging
        const inputs = await page.$$eval('input', els => els.map(el => ({
          id: el.id, name: el.name, type: el.type, ariaLabel: el.getAttribute('aria-label'),
          autocomplete: el.autocomplete, visible: el.offsetWidth > 0 && el.offsetHeight > 0
        }))).catch(() => []);
        console.log(`    🔍 Visible inputs on page: ${JSON.stringify(inputs.filter(i => i.visible))}`);
        throw new Error('Phone input field not found on page after extended wait');
      }

      // Re-get the locator for fill
      const readyPhoneInput = page.locator('#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
      await readyPhoneInput.fill("");
      await delay(randomInt(400, 800));
      await humanType(page, readyPhoneInput, order.phone);

      const clickedNext = await clickNextLike(page, cursor);
      if (!clickedNext) {
        throw new Error("Next button not found after entering phone number");
      }

      await delay(10000);
      await assertNotCannotCreate(page);

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
        console.log("    ⚠️ Phone rejected by Google. Cancelling number and retrying...");
        await smsProvider.cancelNumber(activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(randomInt(1000, 2500));
        continue;
      }

      console.log("    ⏳ Number accepted. Polling SMS code...");
      const codeInput = page.locator('#code, input[name="code"], input[type="tel"][inputmode="numeric"]').first();
      await codeInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

      let code = "";
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        const smsState = await smsProvider.checkSms(activePhoneId);
        code = smsState?.code || extractSmsCode(smsState);
        if (code) break;
        await delay(5000);
      }

      if (!code) {
        console.log("    ⚠️ SMS timeout reached. Cancelling number and retrying...");
        await smsProvider.cancelNumber(activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      console.log(`    🔐 Received code: ${code}`);
      await codeInput.fill("");
      await delay(randomInt(200, 500));
      await humanType(page, codeInput, code);

      const clickedVerify = await clickByTexts(page, cursor, ["다음", "Next", "Verify", "확인", "확인하기", "Далее", "Подтвердить", "Berikutnya", "Verifikasi", "Konfirmasi"]);
      if (!clickedVerify) {
        throw new Error("Verify/Next button not found after SMS code input");
      }

      await delay(randomInt(4000, 6000));
      await assertNotCannotCreate(page);
      await smsProvider.finishNumber(activePhoneId).catch(() => {});
      activePhoneId = null;

      return { cost: totalCost, activePhoneId: null };
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

async function handlePostSmsScreens(page, cursor) {
  for (let i = 0; i < 7; i++) {
    await assertNotCannotCreate(page);

    if (isGoogleSuccessUrl(page.url())) {
      return;
    }

    const agreeVisible = await page
      .locator('button:has-text("동의합니다"), button:has-text("I agree"), button:has-text("동의"), button:has-text("Agree"), button:has-text("Принимаю"), button:has-text("Согласен")')
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);

    if (agreeVisible) {
      for (let s = 0; s < randomInt(4, 7); s++) {
        await page.keyboard.press("PageDown");
        await delay(randomInt(400, 900));
      }
      const agreed = await clickAgreeLike(page, cursor);
      if (agreed) {
        await delay(randomInt(4000, 7000));
        continue;
      }
    }

    const clicked = await clickPostVerificationButton(page, cursor);
    if (!clicked) {
      break;
    }
    await delay(randomInt(3000, 5000));
  }
}

async function gotoSignupWithFallback(page) {
  // Derive hl= language code from region profile (MUST match browser locale)
  const hlLang = regionProfile.locales[0].split('-')[0]; // e.g. 'ru' from 'ru-RU'
  // Multiple signup entry points with different detection profiles
  const signupUrls = [
    {
      name: "WebLiteSignIn (pnv_flow=1)",
      url: `https://accounts.google.com/signup/v2/createaccount?flowName=WebLiteSignIn&flowEntry=SignUp&hl=${hlLang}&pnv_flow=1`,
    },
    {
      name: "EmbeddedSetupAndroid",
      url: "https://accounts.google.com/EmbeddedSetup/createaccount?flowName=EmbeddedSetupAndroid",
    },
    {
      name: "WebCreateAccount (mail)",
      url: `https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=${hlLang}&service=mail&biz=false&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F`,
    },
    {
      name: "GlifWebSignIn (wise/Drive)",
      url: `https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=${hlLang}&service=wise&biz=false&continue=https%3A%2F%2Fdrive.google.com`,
    },
    {
      name: MOBILE ? "GlifWebSignIn mobile (mail)" : "GlifWebSignIn desktop (mail)",
      url: MOBILE
        ? `https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=${hlLang}&service=mail&biz=false`
        : `https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=${hlLang}&service=mail&biz=false&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F`,
    },
    {
      name: "Classic SignUp (lso)",
      url: `https://accounts.google.com/SignUp?service=lso&continue=https%3A%2F%2Faccounts.google.com%2F&hl=${hlLang}`,
    },
    {
      name: `Support Article Referral (${hlLang})`,
      url: `https://support.google.com/mail/answer/56256?hl=${hlLang}`,
      isReferral: true,
    },
    {
      name: "YouTube Consumer Flow",
      url: "https://www.youtube.com",
      isReferral: true,
    },
    // biz=true removed — always triggers workspace interstitial
  ];

  // If --test-url specified, force that URL; otherwise randomize
  let selected;
  if (TEST_URL_NAME) {
    selected = signupUrls.find(u => u.name.toLowerCase().includes(TEST_URL_NAME.toLowerCase()));
    if (!selected) {
      console.log(`  → WARNING: --test-url "${TEST_URL_NAME}" not found. Available: ${signupUrls.map(u => u.name).join(', ')}`);
      selected = signupUrls[0];
    }
    console.log(`  → FORCED URL via --test-url: ${selected.name}`);
  } else {
    const shuffled = signupUrls.sort(() => Math.random() - 0.5);
    selected = shuffled[0];
  }
  if (selected.isReferral && selected.name.includes("YouTube")) {
    // YouTube flow: watch a video, then navigate to signup via account menu
    console.log(`  → YouTube Consumer Flow: building trust...`);
    await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(randomInt(5000, 10000));
    // Scroll to simulate watching
    for (let i = 0; i < randomInt(2, 4); i++) {
      await page.mouse.wheel(0, randomInt(200, 500));
      await delay(randomInt(1000, 3000));
    }
    // Click Sign In → Create Account
    const signInBtn = page.locator('a[href*="accounts.google.com/ServiceLogin"], a:has-text("로그인"), a:has-text("Sign in"), a:has-text("Войти")').first();
    if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await signInBtn.click();
      await delay(randomInt(2000, 4000));
    }
    // Navigate to create account from login page
    const createLink = page.locator('a:has-text("계정 만들기"), a:has-text("Create account"), a:has-text("Создать аккаунт")').first();
    if (await createLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createLink.click();
      await delay(randomInt(1000, 3000));
      // Select "For my personal use" if prompted
      const personalUse = page.locator('li:has-text("개인용"), li:has-text("For my personal use"), li:has-text("Для себя"), div[data-value="1"]').first();
      if (await personalUse.isVisible({ timeout: 3000 }).catch(() => false)) {
        await personalUse.click();
        await delay(randomInt(1000, 2000));
      }
    } else {
      // Fallback: direct signup URL
      await page.goto(`https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=${hlLang}&service=mail&biz=false`, { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    await delay(randomInt(2000, 4000));
  } else if (selected.isReferral && selected.name.includes("Support")) {
    // Support article flow: visit help page, find create account link
    console.log(`  → Support Article Referral: visiting help page first...`);
    await page.goto(selected.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(randomInt(3000, 6000));
    // Scroll the support page
    for (let i = 0; i < randomInt(1, 3); i++) {
      await page.mouse.wheel(0, randomInt(200, 400));
      await delay(randomInt(1000, 2000));
    }
    // Click "계정 만들기" or "Create an account" link in the article
    const createAccountLink = page.locator('a:has-text("계정 만들기"), a:has-text("Create an account"), a:has-text("Google 계정"), a:has-text("Создать аккаунт"), a:has-text("Аккаунт Google")').first();
    if (await createAccountLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createAccountLink.click();
      await delay(randomInt(2000, 4000));
    } else {
      // Fallback: direct signup
      await page.goto(`https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=${hlLang}&service=mail&biz=false`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await delay(randomInt(2000, 4000));
    }
  } else {
    // Direct URL navigation (existing behavior)
    console.log(`  → Navigating to signup page (${selected.name})...`);
    await page.goto(selected.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(randomInt(2000, 4000));

    // Check if we got "cannot create" on first URL, try next
    const bodyText = await page.textContent("body").then((t) => t?.toLowerCase() || "").catch(() => "");
    if (bodyText.includes("sorry, we could not create your google account") || bodyText.includes("계정을 만들 수 없습니다") || bodyText.includes("невозможно создать") || bodyText.includes("не удалось создать")) {
      const fallback = signupUrls.filter(u => !u.isReferral).sort(() => Math.random() - 0.5)[0];
      if (fallback) {
        console.log(`  → First URL blocked, trying fallback (${fallback.name})...`);
        await delay(randomInt(2000, 4000));
        await page.goto(fallback.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await delay(randomInt(2000, 4000));
      }
    }
  }
}

async function waitForInterstitialOrPhone(page, cursor, username) {
  const startTime = Date.now();
  const maxWaitMs = 90000; // 90 seconds
  let reloadCount = 0;
  const maxReloads = 2;
  let lastActionTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    // Detect QR verification (blocker — cannot proceed with SMS)
    const currentUrl = page.url();
    if (currentUrl.includes('mophoneverification')) {
      console.log(`  ❌ BLOCKER: QR_CODE verification detected. URL: ${currentUrl}`);
      throw new Error('blocked:qr_code_verification');
    }

    // devicephoneverification/initiate is a PHONE NUMBER input page — NOT a blocker!
    // Wait for it to load and look for the phone input field.
    if (currentUrl.includes('devicephoneverification/initiate')) {
      console.log('  → Device phone verification page detected — waiting for phone input field...');
      await delay(3000); // let the page fully render
      const dpvPhoneInput = page.locator('input[type="tel"], input[autocomplete="tel"], #phoneNumberId, input[name="phoneNumber"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
      const dpvPhoneVisible = await dpvPhoneInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (dpvPhoneVisible) {
        console.log('  → Phone input field found on device verification page.');
        return;
      }
      // Also check for a "Get a verification code" / country code dropdown as sign of phone page
      const countryDropdown = page.locator('select, [role="listbox"], .country-code, [data-country]').first();
      const dropdownVisible = await countryDropdown.isVisible({ timeout: 2000 }).catch(() => false);
      if (dropdownVisible) {
        console.log('  → Country code selector found — phone verification page confirmed.');
        return;
      }
      // If still no phone input after waiting, take screenshot and continue loop
      console.log('  ⚠️ Device phone verification page but no phone input yet — continuing...');
      await page.screenshot({ path: `screenshots/${username}-dpv-waiting.png`, fullPage: true }).catch(() => {});
    }

    // Also check body text for QR indicators
    const bodyTextForBlock = await getBodyText(page);
    if (
      bodyTextForBlock.includes("Waiting for verification") ||
      bodyTextForBlock.includes("Verify some info before creating") ||
      bodyTextForBlock.includes("Ожидание подтверждения")
    ) {
      console.log("  ❌ BLOCKER: QR verification page detected (text match)");
      await page.screenshot({ path: `${username}-blocker-qr.png`, fullPage: true }).catch(() => {});
      throw new Error("blocked:qr_verification");
    }

    // Check if phone verification appeared (success — we can proceed)
    const phoneInput = page.locator('#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]').first();
    const phoneVisible = await phoneInput.isVisible({ timeout: 1000 }).catch(() => false);
    if (phoneVisible) {
      console.log("  → Phone verification field detected.");
      return;
    }

    // Check for skip button (some flows skip phone)
    const skipVisible = await page
      .locator('button:has-text("건너뛰기"), button:has-text("Skip"), button:has-text("Пропустить")')
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (skipVisible) {
      console.log("  → Skip button detected after password.");
      return;
    }

    // Check for success URL
    if (isGoogleSuccessUrl(page.url())) {
      console.log("  → Success URL detected during interstitial wait.");
      return;
    }

    // Check for "cannot create" ban
    if (await detectCannotCreate(page)) {
      throw new Error(CANNOT_CREATE_ERROR);
    }

    // If we hit the consent page, RETURN and let the caller handle it
    // (matches gen.js architecture: interstitial handler does NOT touch consent)
    if (currentUrl.includes('devicephoneverification/consent')) {
      console.log('  → Consent page detected. Returning to caller for consent handling.');
      return;
    }

    // Check for agree/consent screens
    const agreeVisible = await page
      .locator('button:has-text("동의합니다"), button:has-text("I agree"), button:has-text("Agree"), button:has-text("Принимаю"), button:has-text("Согласен")')
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (agreeVisible) {
      console.log('  → Agreement screen detected during interstitial.');
      return;
    }

    const bodyText = await getBodyText(page);

    // Check for interstitial text
    const isInterstitial =
      bodyText.includes("This may take a few moments") ||
      bodyText.includes("잠시 기다려 주세요") ||
      bodyText.includes("몇 분 정도 걸릴 수 있습니다") ||
      bodyText.includes("verify your device") ||
      bodyText.includes("기기를 확인") ||
      bodyText.includes("보안을 위해") ||
      bodyText.includes("Подождите") ||
      bodyText.includes("Это может занять несколько минут") ||
      bodyText.includes("подтвердите устройство") ||
      bodyText.includes("В целях безопасности");

    if (isInterstitial) {
      console.log("  → Interstitial detected. Waiting...");

      // Try clicking "Try Again" / "다시 시도"
      const tryAgainClicked = await clickByTexts(page, cursor, ["다시 시도", "Try Again", "Try again", "Retry", "Повторить"], 2000);
      if (tryAgainClicked) {
        console.log("  → Clicked 'Try Again' button.");
        lastActionTime = Date.now();
        await delay(randomInt(3000, 5000));
        continue;
      }

      // Scroll the page
      await page.mouse.wheel(0, randomInt(100, 300));

      // Reload if stuck too long
      if (Date.now() - lastActionTime > 20000 && reloadCount < maxReloads) {
        console.log(`  → Reloading page (attempt ${reloadCount + 1}/${maxReloads})...`);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
        reloadCount++;
        lastActionTime = Date.now();
        await delay(randomInt(3000, 5000));
        continue;
      }
    }

    // Check for username/email step (already past password — might be on next step)
    const usernameStep = bodyText.includes("Choose your username") || bodyText.includes("사용자 이름 선택") || bodyText.includes("Выберите имя пользователя") || bodyText.includes("имя пользователя");
    if (usernameStep) {
      console.log("  → Already past interstitial (username step detected).");
      return;
    }

    await delay(randomInt(2000, 4000));
  }

  console.log("  → Interstitial wait timed out after 90s. Proceeding anyway...");
}

async function createAccount(username, name, smsProvider) {
  const locale = randomPick(LOCALES);
  const timezone = randomPick(TIMEZONES);

  console.log(`    🎭 Fingerprint: ${DEVICE.viewport.width}x${DEVICE.viewport.height} (${MOBILE ? "Mobile Pixel 7" : "Desktop Chrome"}) | ${locale} | ${timezone}`);
  console.log(`    🌍 UA: ...${DEVICE.userAgent.slice(-40)}`);
  console.log(`    🔧 Mode: ${BASELINE ? "BASELINE (stock Chrome)" : "STEALTH"}${MOBILE ? " + MOBILE" : ""}`);
  if (PROXY_SERVER) console.log(`    🔀 Proxy: ${PROXY_SERVER}${PROXY_USER ? " (authenticated)" : ""}`);

  console.log('    ⏳ Launching browser...');

  // Pass SOCKS proxy as Chromium arg (Playwright's proxy option hangs with SOCKS5)
  const isSocksProxy = PROXY_SERVER && PROXY_SERVER.startsWith('socks');
  const proxyArgs = PROXY_SERVER ? [`--proxy-server=${PROXY_SERVER}`] : [];
  const windowSize = MOBILE ? `--window-size=412,915` : `--window-size=1920,1080`;
  const baseArgs = BASELINE ? [windowSize, ...proxyArgs] : [...STEALTH_ARGS, windowSize, ...proxyArgs];

  let browser;
  let chromeProc = null;

  if (CDP_MODE) {
    // CDP Mode: Launch real Chrome and attach via CDP
    const cdpPort = 9222 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts
    chromeProc = await launchRealChrome(cdpPort);
    // Connect to the running Chrome via CDP
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    console.log('    ✅ Browser launched via CDP');
  } else {
    // rebrowser-playwright uses Runtime.addBinding by default, which headless_shell doesn't support.
    // Always use real Chrome with --headless=new to avoid newPage() hanging.
    const useRealChrome = true;
    browser = await chromium.launch({
      headless: useRealChrome && !HEADED ? false : !HEADED,
      executablePath: '/usr/bin/google-chrome-stable',
      args: !HEADED && useRealChrome ? [...baseArgs, '--headless=new'] : baseArgs,
      // For non-SOCKS proxies with auth, use Playwright's proxy option
      ...(PROXY_SERVER && PROXY_USER && !isSocksProxy ? { proxy: { server: PROXY_SERVER, username: PROXY_USER, password: PROXY_PASS } } : {}),
    });
    console.log('    ✅ Browser launched');
  }

  // Cleanup: Kill Chrome process on function exit (success or error)
  const cleanupChrome = async () => {
    if (chromeProc) {
      try {
        chromeProc.kill('SIGTERM');
        // Also try to kill any processes on the CDP port
        spawn('pkill', ['-f', 'gmail-chrome-profile'], { stdio: 'ignore' });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  };

  // Register cleanup handlers
  process.on('exit', cleanupChrome);
  process.on('SIGINT', cleanupChrome);
  process.on('SIGTERM', cleanupChrome);

  console.log('    ⏳ Creating context...');

  const context = await browser.newContext({
    locale,
    timezoneId: timezone,
    userAgent: DEVICE.userAgent,
    viewport: DEVICE.viewport,
    deviceScaleFactor: DEVICE.deviceScaleFactor,
    hasTouch: DEVICE.hasTouch,
    isMobile: DEVICE.isMobile,
    javaScriptEnabled: true,
    bypassCSP: false,
    colorScheme: randomPick(["light", "light", "dark"]),
    extraHTTPHeaders: {
      "accept-language": regionProfile.acceptLanguage,
    },
    geolocation: regionProfile.geolocation,
    permissions: ["geolocation"],
  });

  if (!BASELINE) {
    await context.addInitScript((langs) => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "platform", { get: () => (navigator.userAgent.includes("Android") || navigator.userAgent.includes("Mobile")) ? "Linux armv8l" : "Win32" });
      Object.defineProperty(navigator, "vendor", { get: () => "Google Inc." });

    // WebRTC leak prevention — neuter RTCPeerConnection to prevent IP leak via STUN/ICE
    const rtcNoop = () => {};
    const RTCBlocked = function () {};
    RTCBlocked.prototype = {
      close: rtcNoop,
      createDataChannel: rtcNoop,
      createOffer: () => Promise.resolve({}),
      createAnswer: () => Promise.resolve({}),
      setLocalDescription: () => Promise.resolve(),
      setRemoteDescription: () => Promise.resolve(),
      addIceCandidate: () => Promise.resolve(),
      addEventListener: rtcNoop,
      removeEventListener: rtcNoop,
    };
    window.RTCPeerConnection = RTCBlocked;
    window.webkitRTCPeerConnection = RTCBlocked;
    if (window.mozRTCPeerConnection) window.mozRTCPeerConnection = RTCBlocked;
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });
      Object.defineProperty(navigator, "languages", {
        get: () => langs,
      });
      Object.defineProperty(navigator, "language", {
        get: () => langs[0],
      });

      if (!window.chrome) {
        Object.defineProperty(window, "chrome", {
          value: {},
          writable: true,
          enumerable: true,
          configurable: false,
        });
      }
      if (!window.chrome.runtime) {
        window.chrome.runtime = {};
      }
      if (!window.chrome.app) {
        window.chrome.app = {
        InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
        RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
        get isInstalled() {
          return false;
        },
        getDetails: function getDetails() {
          return null;
        },
        getIsInstalled: function getIsInstalled() {
          return false;
        },
        runningState: function runningState() {
          return "cannot_run";
        },
        };
      }
      if (!window.chrome.csi) {
        window.chrome.csi = function () {
        const timing = window.performance && window.performance.timing;
        if (!timing) return {};
        return {
          onloadT: timing.domContentLoadedEventEnd,
          startE: timing.navigationStart,
          pageT: Date.now() - timing.navigationStart,
          tran: 15,
        };
        };
      }
      if (!window.chrome.loadTimes) {
        window.chrome.loadTimes = function () {
        const timing = window.performance && window.performance.timing;
        if (!timing) return {};
        const ntEntry =
          (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) ||
          { nextHopProtocol: "h2", type: "other" };
        return {
          requestTime: timing.navigationStart / 1000,
          startLoadTime: timing.navigationStart / 1000,
          commitLoadTime: timing.responseStart / 1000,
          finishDocumentLoadTime: timing.domContentLoadedEventEnd / 1000,
          finishLoadTime: timing.loadEventEnd / 1000,
          firstPaintTime: 0,
          firstPaintAfterLoadTime: 0,
          navigationType: ntEntry.type || "other",
          wasFetchedViaSpdy: ["h2", "hq"].includes(ntEntry.nextHopProtocol),
          wasNpnNegotiated: ["h2", "hq"].includes(ntEntry.nextHopProtocol),
          npnNegotiatedProtocol: ["h2", "hq"].includes(ntEntry.nextHopProtocol)
            ? ntEntry.nextHopProtocol
            : "unknown",
          wasAlternateProtocolAvailable: false,
          connectionInfo: ntEntry.nextHopProtocol || "h2",
        };
        };
      }

      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (params) => {
        if (params.name === "notifications") {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(params);
        };
      }

      // WebGL GPU spoofing — Desktop: Intel UHD 630, Mobile: ARM Mali-G710
      const VENDOR = MOBILE ? "ARM" : "Google Inc. (Intel)";
      const RENDERER = MOBILE
        ? "Mali-G710"
        : "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)";
      const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return VENDOR; // UNMASKED_VENDOR_WEBGL
      if (param === 37446) return RENDERER; // UNMASKED_RENDERER_WEBGL
      return getParameterOrig.call(this, param);
      };
      if (typeof WebGL2RenderingContext !== "undefined") {
        const getParameter2Orig = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return VENDOR;
        if (param === 37446) return RENDERER;
        return getParameter2Orig.call(this, param);
        };
      }

      // Canvas fingerprint noise
      const applyCanvasNoise = (canvas) => {
      const context = canvas && canvas.getContext && canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) {
        return;
      }
      try {
        const noiseWidth = Math.min(canvas.width, 16);
        const noiseHeight = Math.min(canvas.height, 16);
        const imageData = context.getImageData(0, 0, noiseWidth, noiseHeight);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = imageData.data[i] ^ ((Math.random() * 2) | 0);
          imageData.data[i + 1] = imageData.data[i + 1] ^ ((Math.random() * 2) | 0);
        }
        context.putImageData(imageData, 0, 0);
      } catch {}
      };

      if (typeof HTMLCanvasElement !== "undefined") {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        applyCanvasNoise(this);
        return origToDataURL.apply(this, arguments);
      };

      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      if (origToBlob) {
        HTMLCanvasElement.prototype.toBlob = function () {
          applyCanvasNoise(this);
          return origToBlob.apply(this, arguments);
        };
      }
      }

      if (typeof CanvasRenderingContext2D !== "undefined") {
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const imageData = origGetImageData.apply(this, arguments);
        if (imageData && imageData.data) {
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ ((Math.random() * 2) | 0);
          }
        }
        return imageData;
      };
      }

      // AudioContext fingerprint noise
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && AudioCtx.prototype && AudioCtx.prototype.createOscillator) {
      const origCreateOscillator = AudioCtx.prototype.createOscillator;
      AudioCtx.prototype.createOscillator = function () {
        const osc = origCreateOscillator.apply(this, arguments);
        osc._isModified = true;
        return osc;
      };
      }
      if (typeof AnalyserNode !== "undefined") {
      const origGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
      if (origGetFloat) {
        AnalyserNode.prototype.getFloatFrequencyData = function (array) {
          origGetFloat.call(this, array);
          for (let i = 0; i < array.length; i++) {
            array[i] = array[i] + Math.random() * 0.0001;
          }
        };
      }
      const origGetFloatTime = AnalyserNode.prototype.getFloatTimeDomainData;
      if (origGetFloatTime) {
        AnalyserNode.prototype.getFloatTimeDomainData = function (array) {
          origGetFloatTime.call(this, array);
          for (let i = 0; i < array.length; i++) {
            array[i] = array[i] + Math.random() * 0.0001;
          }
        };
      }
      }

      // NetworkInformation API
      if (!navigator.connection) {
      Object.defineProperty(navigator, "connection", {
        get: () => ({
          effectiveType: "4g",
          rtt: 50,
          downlink: 10,
          saveData: false,
          type: "cellular",
          addEventListener: function () {},
          removeEventListener: function () {},
          onchange: null,
        }),
      });
      }

      // Battery API
      if (!navigator.getBattery) {
      navigator.getBattery = () =>
        Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 0.87 + Math.random() * 0.1,
          addEventListener: function () {},
          removeEventListener: function () {},
          onchargingchange: null,
          onchargingtimechange: null,
          ondischargingtimechange: null,
          onlevelchange: null,
        });
      }

      const navigatorProto = Object.getPrototypeOf(navigator);
      Object.defineProperty(navigatorProto, "vendor", {
      get: () => "Google Inc.",
    });
      Object.defineProperty(navigatorProto, "hardwareConcurrency", {
      get: () => 8,
    });

      // Media codecs spoofing
      if (typeof HTMLMediaElement !== "undefined") {
      const origCanPlayType = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (type) {
        if (!type) return origCanPlayType.apply(this, arguments);
        const mime = type.trim().split(";")[0];
        if (mime === "video/mp4" && type.includes("avc1.42E01E")) return "probably";
        if (mime === "audio/x-m4a" && !type.includes("codecs")) return "maybe";
        if (mime === "audio/aac" && !type.includes("codecs")) return "probably";
        return origCanPlayType.apply(this, arguments);
      };
      }

      // iframe.contentWindow fix
      const origCreateElement = document.createElement.bind(document);
      document.createElement = function () {
      const el = origCreateElement(...arguments);
      if (arguments[0] && String(arguments[0]).toLowerCase() === "iframe") {
        let srcdocValue = "";
        let hooked = false;
        Object.defineProperty(el, "srcdoc", {
          configurable: true,
          get: () => srcdocValue,
          set: function (val) {
            srcdocValue = val;
            if (!hooked && !el.contentWindow) {
              hooked = true;
              const proxy = new Proxy(window, {
                get(target, key) {
                  if (key === "self") return proxy;
                  if (key === "frameElement") return el;
                  if (key === "0") return undefined;
                  return Reflect.get(target, key);
                },
              });
              Object.defineProperty(el, "contentWindow", {
                get: () => proxy,
                set: (v) => v,
                enumerable: true,
                configurable: false,
              });
            }
          },
        });
      }
      return el;
      };

      // outerWidth/outerHeight fix
      if (!window.outerWidth || !window.outerHeight) {
      window.outerWidth = window.innerWidth;
      window.outerHeight = window.innerHeight + 85;
      }

      // Screen properties for mobile
      Object.defineProperty(screen, "colorDepth", { get: () => 24 });
      Object.defineProperty(screen, "pixelDepth", { get: () => 24 });
    }, regionProfile.languages);
  }

  console.log('    ✅ Context ready');
  console.log('    ⏳ Creating page...');
  const page = await context.newPage();
  console.log('    ✅ Page created');
  let cursor;
  let activePhoneOrderId = null;

  console.log('    ⏳ Initializing ghost cursor...');
  try {
    cursor = await Promise.race([
      createCursor(page),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ghost cursor timeout (10s)')), 10000)),
    ]);
    console.log('    ✅ Ghost cursor ready');
  } catch (err) {
    console.log(`    ⚠️ Ghost cursor init failed, using fallback: ${err.message.slice(0, 80)}`);
    cursor = null;
  }

  const email = `${username}@gmail.com`;
  const result = {
    username,
    email,
    password: PASSWORD,
    firstName: name.firstName,
    lastName: name.lastName,
    koreanName: name.korean,
    cost: 0,
    status: "pending",
    timestamp: new Date().toISOString(),
  };

  try {
    console.log("  → Profile warming...");
    await warmProfile(page, cursor);

    console.log("  → Navigating to signup page...");
    await gotoSignupWithFallback(page);
    await assertNotCannotCreate(page);

    // Handle workspace interstitial ("비즈니스에 가장 적합한 이메일을 선택하세요")
    // Google sometimes shows this even with biz=false
    const workspaceInterstitial = page.locator(
      'button:has-text("Gmail 주소 사용하기"), ' +
      'button:has-text("Use Gmail address"), ' +
      'button:has-text("Использовать адрес Gmail"), ' +
      'a:has-text("Gmail 주소 사용하기"), ' +
      'a:has-text("Use Gmail address"), ' +
      'a:has-text("Использовать адрес Gmail"), ' +
      'button:has-text("개인용"), ' +
      'button:has-text("For my personal use"), ' +
      'button:has-text("Для себя")'
    ).first();
    if (await workspaceInterstitial.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  → Workspace interstitial detected. Clicking personal Gmail option...');
      if (cursor) {
        await cursorClick(cursor, page, workspaceInterstitial);
      } else {
        await workspaceInterstitial.click();
      }
      await delay(randomInt(2000, 4000));
    }

    if (cursor) {
      try {
        await page.mouse.move(randomInt(300, 600), randomInt(200, 400));
        await delay(randomInt(500, 1000));
      } catch {}
    }

    console.log(`  → Filling name: ${name.firstName} ${name.lastName}`);
    const firstNameInput = page.locator('input[name="firstName"]');
    const lastNameInput = page.locator('input[name="lastName"]');

    await humanType(page, firstNameInput, name.firstName);
    await delay(randomInt(500, 1200));
    await humanType(page, lastNameInput, name.lastName);
    await delay(randomInt(800, 1500));

    const nextBtn1 = page.locator('button:has-text("다음"), button:has-text("Next"), button:has-text("Далее"), button:has-text("Berikutnya")').first();
    if (cursor) {
      await cursorClick(cursor, page, nextBtn1);
    } else {
      await nextBtn1.click();
    }
    await delay(randomInt(3000, 5000));
    await assertNotCannotCreate(page);

    console.log("  → Filling birthday & gender...");
    await delay(randomInt(1500, 3000));

    const monthCombo = page.getByRole("combobox", { name: /Month|월|Месяц|месяц/i });
    if (await monthCombo.isVisible({ timeout: 10000 }).catch(() => false)) {
      if (cursor) {
        await cursorClick(cursor, page, monthCombo);
      } else {
        await monthCombo.click();
      }
      await delay(randomInt(600, 1200));
      const monthIdx = parseInt(BIRTH_MONTH, 10) - 1;
      const monthOptions = page.getByRole("option");
      const optionCount = await monthOptions.count();
      if (optionCount > monthIdx) {
        if (cursor) {
          await cursorClick(cursor, page, monthOptions.nth(monthIdx));
        } else {
          await monthOptions.nth(monthIdx).click();
        }
      }
      await delay(randomInt(400, 800));
    }

    const dayInput = page.getByRole("textbox", { name: /Day|일|День|день/i });
    if (await dayInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await humanType(page, dayInput, BIRTH_DAY);
      await delay(randomInt(300, 600));
    }

    const yearInput = page.getByRole("textbox", { name: /Year|연|Год|год/i });
    if (await yearInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await humanType(page, yearInput, BIRTH_YEAR);
      await delay(randomInt(300, 600));
    }

    const genderCombo = page.getByRole("combobox", { name: /Gender|성별|Пол/i });
    if (await genderCombo.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (cursor) {
        await cursorClick(cursor, page, genderCombo);
      } else {
        await genderCombo.click();
      }
      await delay(randomInt(600, 1200));
      const genderName = GENDER === "male" ? /^Male$|^남성$|^Мужской$/ : /^Female$|^여성$|^Женский$/;
      const genderOption = page.getByRole("option", { name: genderName });
      if (await genderOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        if (cursor) {
          await cursorClick(cursor, page, genderOption);
        } else {
          await genderOption.click();
        }
      } else {
        const genderOptions = page.getByRole("option");
        const gIdx = GENDER === "male" ? 1 : 0;
        if (await genderOptions.nth(gIdx).isVisible({ timeout: 2000 }).catch(() => false)) {
          await genderOptions.nth(gIdx).click();
        }
      }
      await delay(randomInt(400, 800));
    }

    await delay(randomInt(500, 1000));
    const nextBtn2 = page.locator('button:has-text("다음"), button:has-text("Next"), button:has-text("Далее"), button:has-text("Berikutnya")').first();
    if (cursor) {
      await cursorClick(cursor, page, nextBtn2);
    } else {
      await nextBtn2.click();
    }
    await delay(randomInt(3000, 5000));
    await assertNotCannotCreate(page);

    console.log(`  → Setting username: ${username}`);

    // Handle "Use your existing email" redirect — click "Get a Gmail address instead"
    const getGmailLink = page.locator('button:has-text("Get a Gmail address instead"), a:has-text("Get a Gmail address instead"), button:has-text("Gmail 주소 만들기"), a:has-text("Gmail 주소 만들기"), button:has-text("Создать адрес Gmail"), a:has-text("Создать адрес Gmail")').first();
    if (await getGmailLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  → Detected "Use your existing email" page. Clicking "Get a Gmail address instead"...');
      if (cursor) {
        await cursorClick(cursor, page, getGmailLink);
      } else {
        await getGmailLink.click();
      }
      await delay(randomInt(2000, 4000));
    }

    const customEmailOption = page.locator('div[data-value="custom"], label:has-text("Gmail 주소 직접 만들기"), label:has-text("Create your own"), label:has-text("Создать свой адрес Gmail"), label:has-text("Создать собственный адрес Gmail")').first();
    if (await customEmailOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (cursor) {
        await cursorClick(cursor, page, customEmailOption);
      } else {
        await customEmailOption.click();
      }
      await delay(randomInt(1000, 2000));
    }

    const usernameInput = page.locator('input[name="Username"], input[type="text"][aria-label*="mail"], input[name="username"]').first();
    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await humanType(page, usernameInput, username);
      await delay(randomInt(500, 1000));
    }

    const nextBtn3 = page.locator('button:has-text("다음"), button:has-text("Next"), button:has-text("Далее"), button:has-text("Berikutnya")').first();
    if (cursor) {
      await cursorClick(cursor, page, nextBtn3);
    } else {
      await nextBtn3.click();
    }
    await delay(randomInt(3000, 5000));
    await assertNotCannotCreate(page);

    console.log("  → Setting password...");
    const passwordInput = page.locator('input[name="Passwd"], input[type="password"]').first();
    const confirmInput = page.locator('input[name="PasswdAgain"], input[name="ConfirmPasswd"], input[type="password"]').nth(1);

    if (await passwordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await humanType(page, passwordInput, PASSWORD);
      await delay(randomInt(500, 1200));
    }
    if (await confirmInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await humanType(page, confirmInput, PASSWORD);
      await delay(randomInt(500, 1000));
    }

    const nextBtn4 = page.locator('button:has-text("다음"), button:has-text("Next"), button:has-text("Далее"), button:has-text("Berikutnya")').first();
    if (cursor) {
      await cursorClick(cursor, page, nextBtn4);
    } else {
      await nextBtn4.click();
    }
    await delay(randomInt(3000, 5000));

    // Wait for interstitial to clear (may return on consent page)
    await waitForInterstitialOrPhone(page, cursor, username);
    await assertNotCannotCreate(page);

    const postInterstitialUrl = page.url();
    // Handle devicephoneverification/initiate page — this is the phone verification entry page.
    // It may show the phone input directly, or require clicking a button first.
    if (postInterstitialUrl.includes('devicephoneverification/initiate')) {
      console.log('  → Device phone verification /initiate page detected.');
      await page.screenshot({ path: `screenshots/${username}-dpv-initiate.png`, fullPage: true }).catch(() => {});
      await delay(randomInt(2000, 4000));

      const phoneSelector = '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]';
      let phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 3000 }).catch(() => false);

      if (!phoneAppeared) {
        // Try clicking action buttons that may reveal the phone input
        console.log('  → No phone input yet. Looking for action buttons...');
        const clicked = await clickByTexts(page, cursor, [
          'Get a verification code', 'Send SMS', 'SMS 보내기', 'Send', '보내기',
          'Verify', '인증', 'Continue', '계속', 'Next', '다음',
          'Получить код подтверждения', 'Отправить SMS', 'Отправить', 'Проверить', 'Продолжить', 'Далее',
          'Dapatkan kode verifikasi', 'Kirim SMS', 'Kirim', 'Verifikasi', 'Lanjutkan', 'Berikutnya'
        ], 5000);
        if (clicked) {
          console.log('  → Clicked action button. Waiting for phone input...');
          await delay(randomInt(3000, 5000));
          for (let i = 0; i < 10; i++) {
            phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 2000 }).catch(() => false);
            if (phoneAppeared) {
              console.log(`  → Phone input appeared after button click + ${(i * 3) + 3}s.`);
              break;
            }
            await delay(randomInt(2000, 3000));
          }
        }
      }

      if (phoneAppeared) {
        console.log('  → Phone input confirmed on /initiate page. Proceeding to SMS verification.');
      } else {
        console.log('  → No phone input on /initiate page after all attempts. Taking screenshot...');
        await page.screenshot({ path: `screenshots/${username}-dpv-no-phone.png`, fullPage: true }).catch(() => {});
      }
    }
    // Handle consent page if present (gen.js L700-723 pattern:
    // consent check happens ONCE after interstitial resolves, not inside the loop)
    // (postInterstitialUrl already declared above)
    if (postInterstitialUrl.includes('devicephoneverification/consent')) {
      console.log('  → Consent page detected. Clicking Send SMS (primary strategy)...');
      await page.screenshot({ path: `screenshots/${username}-consent-page.png`, fullPage: true });
      const consentUrl = page.url();
      console.log('  → Consent URL:', consentUrl);
      const phoneSelector = '#phoneNumberId, input[name="phoneNumber"], input[type="tel"], input[autocomplete="tel"], input[aria-label*="phone"], input[aria-label*="전화"], input[aria-label*="телефон"]';
      let phoneAppeared = false;

      // Strategy 1 (PRIMARY): Click Send SMS button on consent page — this is the natural flow.
      // The consent page shows 'Verify your phone number' with a 'Send SMS' button.
      // IMPORTANT: Wait for the page to ACTUALLY RENDER before clicking anything.
      {
        console.log('  → Strategy 1: Waiting for consent page to fully render...');
        // Wait for page to have meaningful content (not just Google logo + progress bar)
        for (let renderWait = 0; renderWait < 10; renderWait++) {
          await delay(randomInt(1500, 2500));
          const bodyText = await page.textContent('body').then(t => t?.trim()).catch(() => '');
          if (bodyText && bodyText.length > 50) {
            console.log(`  → Consent page rendered (${bodyText.length} chars) after ~${(renderWait + 1) * 2}s`);
            break;
          }
          if (renderWait === 9) {
            console.log('  → Consent page still minimal after 20s. Proceeding anyway...');
          }
        }
        await page.screenshot({ path: `screenshots/${username}-consent-rendered.png`, fullPage: true }).catch(() => {});

        // CHECK: Look for hidden 'Try another way' element before clicking Send SMS
        const hiddenTryAnother = page.locator('[jsname="Z77Yid"], [jsname="QkNstf"], [data-challengetype]');
        const hiddenCount = await hiddenTryAnother.count().catch(() => 0);
        if (hiddenCount > 0) {
          console.log(`  → Found ${hiddenCount} hidden challenge elements. Checking...`);
          for (let hi = 0; hi < hiddenCount; hi++) {
            const el = hiddenTryAnother.nth(hi);
            const jsn = await el.getAttribute('jsname').catch(() => '');
            const txt = await el.textContent().catch(() => '');
            const vis = await el.isVisible().catch(() => false);
            console.log(`  → Hidden[${hi}]: jsname=${jsn} vis=${vis} text="${txt?.trim()?.slice(0, 80)}"`);
            if (!vis) {
              // Try to make hidden elements visible and click
              console.log(`  → Attempting to click hidden element [jsname=${jsn}]...`);
              await el.evaluate(e => { e.style.display = 'block'; e.style.visibility = 'visible'; }).catch(() => {});
              await delay(500);
              await el.click({ force: true }).catch(() => {});
              await delay(randomInt(2000, 3000));
              const postClickUrl = page.url();
              console.log(`  → After hidden click URL: ${postClickUrl.split('?')[0]}`);
              const pVis = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
              if (pVis) {
                console.log('  → Phone input appeared after clicking hidden element!');
                phoneAppeared = true;
              }
            }
          }
          if (phoneAppeared) {
            // Skip Send SMS — we found a bypass
          }
        }

        // Also check for 'Try another way' text links/buttons
        const tryAnotherWay = await clickByTexts(page, cursor, ['Try another way', '다른 방법 시도', 'Use another method', '다른 방법 사용', 'Другой способ', 'Использовать другой способ'], 3000);
        if (tryAnotherWay) {
          console.log('  → Clicked "Try another way" link. Waiting for response...');
          await delay(randomInt(3000, 5000));
          const afterUrl = page.url();
          console.log(`  → After Try another way URL: ${afterUrl.split('?')[0]}`);
          await page.screenshot({ path: `screenshots/${username}-try-another-way.png`, fullPage: true }).catch(() => {});
          const pVis = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
          if (pVis) {
            console.log('  → Phone input appeared after Try another way!');
            phoneAppeared = true;
          }
        }

        if (!phoneAppeared) {
        console.log('  → Strategy 1: Clicking Send SMS on consent page...');
        let sendSmsClicked = await clickByTexts(page, cursor, ['Send SMS', 'SMS 보내기', 'Send', '보내기', '다음', 'Next', 'Отправить SMS', 'Отправить', 'Далее', 'Kirim SMS', 'Kirim', 'Berikutnya'], 5000);

        // Fallback: Use Playwright getByRole/getByText which match regardless of element type
        if (!sendSmsClicked) {
          console.log('  → clickByTexts failed, trying getByRole/getByText fallbacks...');
          const fallbacks = [
            page.getByRole('button', { name: /send sms|отправить sms|kirim sms/i }),
            page.getByRole('button', { name: /send|отправить|kirim/i }),
            page.getByText('Send SMS', { exact: false }),
            page.getByText('Отправить SMS', { exact: false }),
            page.getByText('Kirim SMS', { exact: false }),
            page.locator('[data-idom-class]').filter({ hasText: /send sms|отправить sms|kirim sms/i }),
            page.locator('[jscontroller]').filter({ hasText: /send sms|отправить sms|kirim sms/i }),
          ];
          for (const loc of fallbacks) {
            const vis = await loc.first().isVisible({ timeout: 3000 }).catch(() => false);
            if (vis) {
              console.log('  → Found Send SMS via fallback locator. Clicking...');
              if (cursor) {
                await cursorClick(cursor, page, loc.first());
              } else {
                await loc.first().click();
              }
              sendSmsClicked = true;
              break;
            }
          }
        }

        // Last resort: click any visible blue/primary-style button on the page
        if (!sendSmsClicked) {
          console.log('  → All named locators failed. Trying to click any primary-action element...');
          const allBtns = page.locator('button, [role="button"]');
          const btnCount = await allBtns.count().catch(() => 0);
          console.log(`  → Found ${btnCount} button-like elements on page.`);
          for (let bi = 0; bi < btnCount; bi++) {
            const btn = allBtns.nth(bi);
            const txt = await btn.textContent().catch(() => '');
            const vis = await btn.isVisible().catch(() => false);
            console.log(`  → Button[${bi}]: visible=${vis} text="${txt?.trim()}"`);
            if (vis && txt && /send|sms|verify|next|continue|отправ|подтверд|далее|продолж/i.test(txt)) {
              console.log(`  → Clicking button[${bi}] "${txt.trim()}"`);
              if (cursor) { await cursorClick(cursor, page, btn); } else { await btn.click(); }
              sendSmsClicked = true;
              break;
            }
          }
        }

        if (sendSmsClicked) {
          console.log('  → Clicked Send SMS. Waiting for phone input or page navigation...');
          await delay(randomInt(3000, 5000));

          // Check if page navigated to /verify (loading spinner page)
          const postSmsUrl = page.url();
          if (postSmsUrl.includes('devicephoneverification/verify')) {
            console.log('  → Navigated to /verify page (loading spinner). Clicking Try Again...');
            await page.screenshot({ path: `screenshots/${username}-verify-spinner.png`, fullPage: true }).catch(() => {});

            // Try clicking 'Try Again' / 'Try another way' links on /verify page
            for (let tryAgainAttempt = 0; tryAgainAttempt < 3; tryAgainAttempt++) {
              const tryAgainClicked = await clickByTexts(page, cursor, [
                'Try Again', 'Try again', '다시 시도', 'Try another way', '다른 방법 시도',
                'Back', '뒤로', 'Use another method', '다른 방법 사용',
                'Повторить', 'Другой способ', 'Назад', 'Использовать другой способ'
              ], 5000);
              if (tryAgainClicked) {
                console.log(`  → Clicked Try Again (attempt ${tryAgainAttempt + 1}). Waiting for page response...`);
                await delay(randomInt(3000, 5000));
                const afterTryUrl = page.url();
                console.log(`  → After Try Again URL: ${afterTryUrl.split('?')[0]}`);
                await page.screenshot({ path: `screenshots/${username}-after-try-again-${tryAgainAttempt}.png`, fullPage: true }).catch(() => {});

                // Check if phone input appeared
                const pVis = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
                if (pVis) {
                  console.log('  → Phone input appeared after Try Again!');
                  phoneAppeared = true;
                  break;
                }

                // Check if we got redirected to a different verification type
                if (afterTryUrl.includes('webgradsidvphone') || afterTryUrl.includes('phoneverification') || afterTryUrl.includes('challenge/phone')) {
                  console.log('  → Redirected to phone verification page! Phone input should appear.');
                  await delay(randomInt(2000, 3000));
                  const pVis2 = await page.locator(phoneSelector).first().isVisible({ timeout: 8000 }).catch(() => false);
                  if (pVis2) {
                    console.log('  → Phone input found on redirected page.');
                    phoneAppeared = true;
                    break;
                  }
                }

                // If still on /verify, try again
                if (afterTryUrl.includes('devicephoneverification/verify')) {
                  console.log('  → Still on /verify. Trying again...');
                  await delay(randomInt(2000, 3000));
                  continue;
                }

                // If navigated somewhere new, check for phone input
                console.log('  → On new page. Checking for phone input...');
                const pVis3 = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
                if (pVis3) {
                  console.log('  → Phone input found on new page!');
                  phoneAppeared = true;
                  break;
                }
                break; // Don't loop if we navigated to a non-verify page
              } else {
                console.log(`  → Could not find Try Again link (attempt ${tryAgainAttempt + 1}).`);
                // Log all links on the page for debugging
                const allLinks = page.locator('a');
                const linkCount = await allLinks.count().catch(() => 0);
                for (let li = 0; li < Math.min(linkCount, 10); li++) {
                  const linkText = await allLinks.nth(li).textContent().catch(() => '');
                  const linkHref = await allLinks.nth(li).getAttribute('href').catch(() => '');
                  console.log(`  → Link[${li}]: text="${linkText?.trim()}" href="${linkHref}"`);
                }
                break;
              }
            }
          } else {
            // Still on consent or other page — try waiting for phone input
            for (let i = 0; i < 10; i++) {
              const pVis = await page.locator(phoneSelector).first().isVisible({ timeout: 2000 }).catch(() => false);
              if (pVis) {
                console.log(`  → Phone input appeared ${(i * 3) + 3}s after Send SMS.`);
                phoneAppeared = true;
                break;
              }
              const curUrl = page.url();
              if (!curUrl.includes('consent') && curUrl.includes('devicephoneverification/verify')) {
                console.log('  → Page navigated to /verify. Will handle above on next iteration.');
                break;
              }
              if (!curUrl.includes('devicephoneverification')) {
                console.log(`  → Page navigated away: ${curUrl.split('?')[0]}`);
                break;
              }
              await delay(randomInt(2000, 3000));
            }
          }

          if (!phoneAppeared) {
            console.log('  → Phone input did not appear after Send SMS + verify handling.');
          }
        } else {
          console.log('  → Strategy 1: Could not find any Send SMS / action button.');
          const bodyHtml = await page.locator('body').innerHTML().catch(() => '');
          const buttons = bodyHtml.match(/<button[^>]*>.*?<\/button>/gs) || [];
          const roleButtons = bodyHtml.match(/<[^>]+role="button"[^>]*>.*?<\/[^>]+>/gs) || [];
          console.log(`  → Debug: ${buttons.length} <button> elements, ${roleButtons.length} role=button elements in HTML`);
          if (buttons.length > 0) console.log('  → First button HTML:', buttons[0].slice(0, 200));
          if (roleButtons.length > 0) console.log('  → First role=button HTML:', roleButtons[0].slice(0, 200));
        }
      }
      } // end if (!phoneAppeared) guard around Send SMS

      // Strategy 2 (FALLBACK): Go BACK to consent page and wait for proper render
      // Instead of navigating to different URLs (which breaks session), use browser back.
      if (!phoneAppeared && page.url().includes('devicephoneverification')) {
        console.log('  → Strategy 2: Using browser back to return to consent page...');

        for (let backAttempt = 0; backAttempt < 3; backAttempt++) {
          console.log(`  → GoBack attempt ${backAttempt + 1}/3...`);
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await delay(randomInt(3000, 5000));

          const backUrl = page.url();
          console.log(`  → After goBack: ${backUrl.split('?')[0]}`);
          await page.screenshot({ path: `screenshots/${username}-goback-${backAttempt}.png`, fullPage: true }).catch(() => {});

          // If we landed back on consent, wait for it to fully render
          if (backUrl.includes('devicephoneverification/consent') || backUrl.includes('devicephoneverification/initiate')) {
            console.log('  → Back on consent/initiate page. Waiting for full render...');
            for (let rw = 0; rw < 8; rw++) {
              await delay(randomInt(2000, 3000));
              const bodyText = await page.textContent('body').then(t => t?.trim()).catch(() => '');
              if (bodyText && bodyText.length > 50) {
                console.log(`  → Page rendered (${bodyText.length} chars) after ~${(rw + 1) * 2.5}s`);
                break;
              }
            }
            await page.screenshot({ path: `screenshots/${username}-consent-retry-${backAttempt}.png`, fullPage: true }).catch(() => {});

            // Check for phone input
            phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
            if (phoneAppeared) {
              console.log('  → Strategy 2 SUCCESS: Phone input found after goBack!');
              break;
            }

            // Try clicking Send SMS again on the fully-rendered page
            const retryClicked = await clickByTexts(page, cursor, ['Send SMS', 'SMS 보내기', 'Send', '보내기', '다음', 'Next', 'Get a verification code', '인증 코드 받기', 'Отправить SMS', 'Отправить', 'Далее', 'Получить код подтверждения', 'Kirim SMS', 'Kirim', 'Berikutnya', 'Dapatkan kode verifikasi'], 5000);
            if (retryClicked) {
              console.log('  → Clicked action button on retry. Waiting for phone input...');
              await delay(randomInt(4000, 6000));
              phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 8000 }).catch(() => false);
              if (phoneAppeared) {
                console.log('  → Phone input appeared after retry click!');
                break;
              }
              // Check if went back to /verify
              if (page.url().includes('devicephoneverification/verify')) {
                console.log('  → Back on /verify spinner. Will try goBack again...');
                continue;
              }
            } else {
              console.log('  → No clickable action button found on consent retry.');
              // Try page.reload() as last resort for this attempt
              console.log('  → Reloading page...');
              await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
              await delay(randomInt(5000, 8000));
              phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
              if (phoneAppeared) {
                console.log('  → Phone input appeared after reload!');
                break;
              }
            }
          } else if (backUrl.includes('webgradsidvphone') || backUrl.includes('phoneverification') || backUrl.includes('challenge/phone')) {
            // We went back to an actual phone verification page
            console.log('  → Landed on phone verification page after goBack!');
            await delay(randomInt(3000, 5000));
            phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 8000 }).catch(() => false);
            if (phoneAppeared) {
              console.log('  → Phone input found!');
              break;
            }
          } else if (!backUrl.includes('google.com')) {
            console.log('  → Navigated outside Google. Stopping goBack attempts.');
            break;
          } else {
            // Some other Google page — check for phone input
            phoneAppeared = await page.locator(phoneSelector).first().isVisible({ timeout: 5000 }).catch(() => false);
            if (phoneAppeared) {
              console.log('  → Phone input found on unexpected page!');
              break;
            }
            console.log('  → No phone input on this page. Continuing...');
          }
        }

        if (!phoneAppeared) {
          console.log('  → Strategy 2: No phone input after goBack attempts.');
        }
      }

      if (!phoneAppeared) {
        console.log('  → All consent bypass strategies failed. Taking final screenshot...');
        await page.screenshot({ path: `screenshots/${username}-consent-failed.png`, fullPage: true });
      }
    }
    const phoneResult = await handlePhoneVerification(page, cursor, smsProvider);
    result.cost += Number(phoneResult?.cost || 0);
    activePhoneOrderId = phoneResult?.activePhoneId || null;

    console.log("  → Completing remaining account setup steps...");
    await handlePostSmsScreens(page, cursor);
    await assertNotCannotCreate(page);

    const currentUrl = page.url();
    if (isGoogleSuccessUrl(currentUrl)) {
      result.status = "success";
      console.log(`  ✅ Account created: ${email}`);
    } else {
      const screenshotPath = join(SCREENSHOT_DIR, `${username}-final.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const pageText = await page.textContent("body").then((t) => t?.slice(0, 300)).catch(() => "");
      console.log(`  📄 Page text: ${pageText?.replace(/\n/g, " ").slice(0, 200)}`);

      result.status = `manual-check:${currentUrl}`;
      console.log(`  ⚠️  Needs manual check: ${email} (screenshot saved)`);
    }
  } catch (err) {
    if (err.message === CANNOT_CREATE_ERROR) {
      result.status = "cannot-create";
      console.error(`  ❌ Google cannot create account right now: ${email}`);
    } else {
      result.status = `error:${err.message.slice(0, 100)}`;
      console.error(`  ❌ Failed: ${email} — ${err.message.slice(0, 100)}`);
    }

    try {
      const screenshotPath = join(SCREENSHOT_DIR, `${username}-error.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const pageUrl = page.url();
      console.log(`  📸 Screenshot saved. URL: ${pageUrl}`);
    } catch {}
  } finally {
    if (activePhoneOrderId) {
      await smsProvider.cancelNumber(activePhoneOrderId).catch(() => {});
    }
    await context.close();
    await browser.close();
  }

  return result;
}

async function createAccountWithRetries(username, name, smsProvider) {
  const maxRetries = 2;
  let lastResult = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await createAccount(username, name, smsProvider);

    if (lastResult.status !== "cannot-create") {
      return lastResult;
    }

    if (attempt < maxRetries) {
      const cooldownMs = randomInt(60000, 120000);
      console.log(`  ⏳ Temporary create block detected. Cooling down ${Math.round(cooldownMs / 1000)}s before retry...`);
      await delay(cooldownMs);
    }
  }

  return lastResult;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !SMS_API_KEY) {
    throw new Error(`Missing SMS API key for provider '${SMS_PROVIDER}'. Set --api-key, --sms-key, or FIVESIM_API_KEY for non-dry-run execution.`);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Google Account Creator — qws943xx (Stealth Edition)");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Range:    qws943${padNum(START)} ~ qws943${padNum(END)}`);
  console.log(`  Password: ${"*".repeat(PASSWORD.length)}`);
  console.log(`  Names:    Random US/English`);
  console.log(`  Mode:     ${DRY_RUN ? "DRY RUN" : HEADED ? "HEADED" : "HEADLESS (xvfb)"}`);
  console.log("  Stealth:  rebrowser-playwright + ghost-cursor");
  console.log("  Delays:   60-120s between accounts");
  console.log(`  SMS:      provider=${SMS_PROVIDER} region=${SMS_REGION}${SMS_REGION !== FIVESIM_REGION ? ` (browser: ${FIVESIM_REGION})` : ''} apiKey=${SMS_API_KEY ? "set" : "unset"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const smsProvider = !DRY_RUN ? createSmsProvider(SMS_PROVIDER, SMS_API_KEY, SMS_REGION) : null;

  if (!DRY_RUN && smsProvider) {
    try {
      const startBalance = await smsProvider.getBalance();
      console.log(`💰 ${smsProvider.name} balance (start): ${startBalance.toFixed(4)}`);
    } catch (err) {
      if (String(err?.message || "").includes("5sim HTTP 401")) {
        throw new Error(
          "5sim authentication failed (401). Confirm API key value and pass it as --api-key or FIVESIM_API_KEY."
        );
      }
      console.log(`⚠️ Unable to fetch ${smsProvider.name} start balance: ${err.message.slice(0, 120)}`);
    }
  }

  const accounts = [];
  for (let i = START; i <= END; i++) {
    const num = padNum(i);
    const username = `${PREFIX}${num}`;
    const name = generateUSName();
    accounts.push({ username, name });
  }

  if (DRY_RUN) {
    console.log("📋 Preview (dry run):\n");
    console.log("Username       | Email                    | First      | Last");
    console.log("───────────────|──────────────────────────|────────────|────────");
    for (const { username, name } of accounts) {
      console.log(
        `${username.padEnd(15)}| ${(username + "@gmail.com").padEnd(25)}| ${name.firstName.padEnd(11)}| ${name.lastName}`
      );
    }
    console.log(`\n Total: ${accounts.length} accounts`);
    return;
  }

  initCsv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const completed = getCompletedUsernames();
  const remaining = accounts.filter((a) => !completed.has(a.username));
  console.log(`📊 Total: ${accounts.length} | Already done: ${completed.size} | Remaining: ${remaining.length}\n`);

  if (remaining.length === 0) {
    console.log("✅ All accounts already created!");
    if (!DRY_RUN && smsProvider) {
      try {
        const endBalance = await smsProvider.getBalance();
        console.log(`💰 ${smsProvider.name} balance (end): ${endBalance.toFixed(4)}`);
      } catch {}
    }
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let totalSmsCost = 0;

  for (let idx = 0; idx < remaining.length; idx++) {
    const { username, name } = remaining[idx];
    console.log(`
[${idx + 1}/${remaining.length}] Creating ${username}@gmail.com (${name.firstName} ${name.lastName})`);

    const result = await createAccountWithRetries(username, name, smsProvider);
    totalSmsCost += Number(result.cost || 0);
    appendCsv(result);

    if (result.status === "success") {
      successCount++;
    } else {
      failCount++;
    }

    if (idx < remaining.length - 1) {
      const waitSec = randomInt(60, 120);
      console.log(`  ⏳ Waiting ${waitSec}s before next account...`);
      for (let s = waitSec; s > 0; s -= 10) {
        const remainingSec = Math.min(s, 10);
        await delay(remainingSec * 1000);
        if (s > 10) {
          process.stdout.write(`  ⏳ ${s - 10}s remaining...\r`);
        }
      }
      console.log("  ⏳ Ready for next account.");
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Done! ✅ ${successCount} success | ❌ ${failCount} failed`);
  console.log(`  SMS Cost: ${totalSmsCost.toFixed(4)}`);
  console.log(`  Results saved to: ${CSV_FILE}`);
  console.log("═══════════════════════════════════════════════════════");

  if (!DRY_RUN && smsProvider) {
    try {
      const endBalance = await smsProvider.getBalance();
      console.log(`💰 ${smsProvider.name} balance (end): ${endBalance.toFixed(4)}`);
    } catch (err) {
      console.log(`⚠️ Unable to fetch ${smsProvider.name} end balance: ${err.message.slice(0, 120)}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
