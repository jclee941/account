#!/usr/bin/env node
/**
 * Google Account Creator — ADB Automation (Samsung A35)
 *
 * Automates Android Settings > Add account > Google flow using ADB + uiautomator XML parsing.
 *
 * Usage:
 *   node create-accounts-adb.mjs --dry-run
 *   node create-accounts-adb.mjs --start 1 --end 10
 *   node create-accounts-adb.mjs --device 192.168.50.240:39173 --api-key <key> --region russia
 */

import { execSync } from "child_process";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────
const PASSWORD = "bingogo1";
const PREFIX = "qws943";
const BIRTH_YEAR = "2000";
const BIRTH_MONTH = "1"; // January
const BIRTH_DAY = "15";
const GENDER = "male"; // male | female

const CSV_FILE = join(import.meta.dirname, "accounts.csv");

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
const DEVICE = getArg("device", "192.168.50.240:39173");
const FIVESIM_API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "");
const SMS_PROVIDER = getArg("sms-provider", process.env.SMS_PROVIDER || "5sim");
const SMS_API_KEY = getArg("sms-key", "") || FIVESIM_API_KEY;
const FIVESIM_REGION = getArg("region", process.env.FIVESIM_REGION || "indonesia");
const FORCE_OPERATOR = getArg("operator", "");

// ── Helpers ─────────────────────────────────────────────────────────
function padNum(n) {
  return String(n).padStart(2, '0');
}

function formatCost(cost) {
  const n = Number(cost);
  return Number.isFinite(n) ? n.toFixed(4) : '0.0000';
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

  const sorted = Object.entries(operatorMap).sort(([, a], [, b]) => {
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

// ── ADB Transport Layer ──────────────────────────────────────────────
const ADB_CMD = `adb -s ${DEVICE}`;
const SCREENSHOT_DIR = join(import.meta.dirname, "screenshots-adb");
const UIDUMP_DIR = join(import.meta.dirname, "ui-dumps-adb");

function safeName(name) {
  return String(name || "state")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function timestampTag() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-");
}

function isAdbTransportError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("device offline") ||
    msg.includes("device not found") ||
    msg.includes("no devices") ||
    msg.includes("cannot connect") ||
    msg.includes("closed") ||
    msg.includes("broken pipe") ||
    msg.includes("unauthorized")
  );
}

function exec(command, opts = {}) {
  return execSync(command, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 20000,
    maxBuffer: opts.maxBuffer ?? 20 * 1024 * 1024,
  });
}

function adb(cmd) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return exec(`${ADB_CMD} ${cmd}`, { timeout: 25000 });
    } catch (err) {
      lastErr = err;
      console.error(`[adb] command failed (attempt ${attempt}/3): ${cmd}`);
      if (isAdbTransportError(err) && attempt < 3) {
        ensureDeviceConnected();
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error(`ADB command failed: ${cmd}`);
}

function adbShell(cmd) {
  return adb(`shell ${cmd}`);
}

function ensureDeviceConnected() {
  exec("adb start-server", { timeout: 15000 });

  const devices = exec("adb devices", { timeout: 15000 });
  const escaped = DEVICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const onlineRegex = new RegExp(`^${escaped}\\s+device$`, "m");
  if (!onlineRegex.test(devices)) {
    console.error(`[adb] connecting to ${DEVICE}...`);
    try {
      exec(`adb connect ${DEVICE}`, { timeout: 15000 });
    } catch (err) {
      console.error(`[adb] connect failed: ${String(err.message || err).slice(0, 200)}`);
    }
  }

  const devices2 = exec("adb devices", { timeout: 15000 });
  if (!onlineRegex.test(devices2)) {
    throw new Error(`ADB device not connected: ${DEVICE}`);
  }

  try {
    const state = adb("get-state").trim();
    if (state !== "device") {
      throw new Error(`Unexpected adb state: ${state}`);
    }
  } catch (err) {
    console.error(`[adb] get-state failed, reconnecting: ${String(err.message || err).slice(0, 160)}`);
    try {
      exec(`adb disconnect ${DEVICE}`, { timeout: 10000 });
    } catch {}
    exec(`adb connect ${DEVICE}`, { timeout: 15000 });
    const state2 = adb("get-state").trim();
    if (state2 !== "device") {
      throw new Error(`ADB reconnect failed, state=${state2}`);
    }
  }
}

function screenshot(name) {
  const tag = `${timestampTag()}-${safeName(name)}.png`;
  const outFile = join(SCREENSHOT_DIR, tag);
  try {
    ensureDeviceConnected();
    const buffer = execSync(`${ADB_CMD} exec-out screencap -p`, {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      maxBuffer: 50 * 1024 * 1024,
    });
    writeFileSync(outFile, buffer);
  } catch (err) {
    console.error(`[adb] screenshot failed (${name}): ${String(err.message || err).slice(0, 200)}`);
  }
  return outFile;
}

function extractXml(rawDump) {
  const raw = String(rawDump || "");
  const start = raw.indexOf("<?xml");
  if (start === -1) return "";
  return raw.slice(start).trim();
}

function getUiDump(name) {
  const tag = `${timestampTag()}-${safeName(name)}.xml`;
  const outFile = join(UIDUMP_DIR, tag);
  let xml = "";
  try {
    ensureDeviceConnected();
    adbShell("uiautomator dump /sdcard/ui_dump.xml");
    const raw = adbShell("cat /sdcard/ui_dump.xml");
    xml = extractXml(raw);
    writeFileSync(outFile, xml || raw || "");
  } catch (err) {
    console.error(`[adb] uiautomator dump failed (${name}): ${String(err.message || err).slice(0, 200)}`);
    writeFileSync(outFile, `<!-- dump-error: ${String(err.message || err)} -->\n`);
  }
  return xml;
}

function tap(x, y) {
  adbShell(`input tap ${Math.round(x)} ${Math.round(y)}`);
}

function tripleTap(x, y) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  tap(rx, ry);
  execSync("sleep 0.1");
  tap(rx, ry);
  execSync("sleep 0.1");
  tap(rx, ry);
}

function swipe(x1, y1, x2, y2, durationMs = 400) {
  adbShell(
    `input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${Math.max(1, Math.round(durationMs))}`
  );
}

function keyevent(code) {
  adbShell(`input keyevent ${code}`);
}

function encodeAdbInputText(text) {
  return String(text ?? "")
    .replace(/ /g, "%s")
    .replace(/[&|<>;$`\\"'(){}\[\]]/g, (m) => `\\${m}`)
    .replace(/\n/g, "%s");
}

function inputText(text) {
  const encoded = encodeAdbInputText(text);
  adbShell(`input text ${encoded}`); // NO QUOTES around VALUE
}

function pressHome() {
  keyevent(3);
}

function pressBack() {
  keyevent(4);
}

function pressEscape() {
  keyevent(111);
}

function pressEnter() {
  keyevent(66);
}

function captureState(label) {
  screenshot(label);
  return getUiDump(label);
}

// ── XML Parser + Selector Engine ─────────────────────────────────────
function parseBounds(boundsStr) {
  if (!boundsStr) return null;
  const m = String(boundsStr).match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!m) return null;
  const left = parseInt(m[1], 10);
  const top = parseInt(m[2], 10);
  const right = parseInt(m[3], 10);
  const bottom = parseInt(m[4], 10);
  return {
    left,
    top,
    right,
    bottom,
    centerX: Math.round((left + right) / 2),
    centerY: Math.round((top + bottom) / 2),
    width: right - left,
    height: bottom - top,
  };
}

function decodeXmlEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseNodes(xml) {
  const text = String(xml || "");
  const nodes = [];
  const nodeRegex = /<node\b([^>]*?)(?:\/>|>)/g;
  let m = nodeRegex.exec(text);
  while (m !== null) {
    const attrsRaw = m[1] || "";
    const attrs = {};
    const attrRegex = /([\w:-]+)="([^"]*)"/g;
    let a = attrRegex.exec(attrsRaw);
    while (a !== null) {
      attrs[a[1]] = decodeXmlEntities(a[2]);
      a = attrRegex.exec(attrsRaw);
    }

    const bounds = parseBounds(attrs["bounds"]);
    nodes.push({
      index: attrs["index"] ?? "",
      text: attrs["text"] ?? "",
      resourceId: attrs["resource-id"] ?? "",
      className: attrs["class"] ?? "",
      package: attrs["package"] ?? "",
      contentDesc: attrs["content-desc"] ?? "",
      clickable: attrs["clickable"] ?? "",
      checkable: attrs["checkable"] ?? "",
      checked: attrs["checked"] ?? "",
      enabled: attrs["enabled"] ?? "",
      focusable: attrs["focusable"] ?? "",
      focused: attrs["focused"] ?? "",
      scrollable: attrs["scrollable"] ?? "",
      longClickable: attrs["long-clickable"] ?? "",
      password: attrs["password"] ?? "",
      selected: attrs["selected"] ?? "",
      bounds,
      raw: attrs,
    });

    m = nodeRegex.exec(text);
  }
  return nodes;
}

function matchRid(actual, expected) {
  if (!expected) return true;
  if (!actual) return false;
  if (actual === expected) return true;
  if (actual.endsWith(`/${expected}`)) return true;
  return false;
}

function scoreNode(node, selectors = {}) {
  if (!node || !node.bounds) return -1;

  if (selectors.rid && !matchRid(node.resourceId, selectors.rid)) return -1;
  if (selectors.cls && node.className !== selectors.cls) return -1;
  if (selectors.pkg && node.package !== selectors.pkg) return -1;

  let score = 0;

  if (selectors.rid) score += 1000;

  if (selectors.text) {
    if (node.text === selectors.text) {
      score += 500;
    } else if (node.text && node.text.includes(selectors.text)) {
      score += 300;
    } else {
      return -1;
    }
  }

  if (selectors.desc) {
    if (node.contentDesc === selectors.desc) {
      score += 200;
    } else if (node.contentDesc && node.contentDesc.includes(selectors.desc)) {
      score += 120;
    } else {
      return -1;
    }
  }

  if (selectors.cls && selectors.pkg) score += 80;
  if (node.clickable === "true") score += 20;

  return score;
}

function sortByScoreThenVisual(a, b) {
  if (b.__score !== a.__score) return b.__score - a.__score;
  if (a.bounds.top !== b.bounds.top) return a.bounds.top - b.bounds.top;
  return a.bounds.left - b.bounds.left;
}

function findElements(nodes, selectors = {}) {
  const matched = [];
  for (const node of nodes || []) {
    const s = scoreNode(node, selectors);
    if (s >= 0) {
      matched.push({ ...node, __score: s });
    }
  }
  matched.sort(sortByScoreThenVisual);
  return matched;
}

function findElement(nodes, selectors = {}) {
  const matched = findElements(nodes, selectors);
  return matched.length ? matched[0] : null;
}

async function waitForElement(selectors, opts = {}) {
  const timeout = opts.timeout ?? 15000;
  const interval = opts.interval ?? 1500;
  const label = opts.label || safeName(
    selectors.rid || selectors.text || selectors.desc || selectors.cls || "element"
  );

  const start = Date.now();
  let tries = 0;

  while (Date.now() - start < timeout) {
    tries++;
    const xml = getUiDump(`wait-${label}-${tries}`);
    const nodes = parseNodes(xml);
    const el = findElement(nodes, selectors);
    if (el) return el;
    await delay(interval);
  }

  captureState(`wait-timeout-${label}`);
  throw new Error(`Element not found: ${JSON.stringify(selectors)} after ${timeout}ms`);
}

async function tapElement(selectors, opts = {}) {
  const el = await waitForElement(selectors, opts);
  if (!el?.bounds) {
    throw new Error(`Element has no bounds: ${JSON.stringify(selectors)}`);
  }
  tap(el.bounds.centerX, el.bounds.centerY);
  screenshot(opts.screenshotName || `tap-${safeName(selectors.text || selectors.rid || selectors.desc || selectors.cls || "element")}`);
  return el;
}

// ── Google Account Creation Flow ─────────────────────────────────────
async function handleChromeFre() {
  const nodes = parseNodes(getUiDump("chrome-fre-check"));

  // Check for Chrome First Run Experience
  const freBtn = findElement(nodes, { rid: "com.android.chrome:id/signin_fre_dismiss_button" })
    || findElement(nodes, { text: "계정 없이 사용" });
  if (freBtn?.bounds) {
    console.log("  → Chrome FRE detected, dismissing...");
    tap(freBtn.bounds.centerX, freBtn.bounds.centerY);
    await delay(2000);

    // Handle notification prompt that follows FRE
    const nodes2 = parseNodes(getUiDump("chrome-notification-check"));
    const laterBtn = findElement(nodes2, { text: "나중에" });
    if (laterBtn?.bounds) {
      console.log("  → Chrome notification prompt, dismissing...");
      tap(laterBtn.bounds.centerX, laterBtn.bounds.centerY);
      await delay(2000);
    }
  }

  // Check for Chrome "Sync" or sign-in prompt (non-FRE)
  const noThanks = findElement(nodes, { text: "아니요" }) || findElement(nodes, { text: "No thanks" });
  if (noThanks?.bounds) {
    tap(noThanks.bounds.centerX, noThanks.bounds.centerY);
    await delay(2000);
  }
}

async function openAddGoogleAccount() {
  pressHome();
  await delay(1000);

  // Force stop Chrome for a clean start
  adbShell("am force-stop com.android.chrome");
  await delay(500);

  // Clear Chrome tabs/data for clean session (optional: clear only tabs)
  // adbShell("pm clear com.android.chrome");  // Uncomment if FRE needs re-triggering

  // Launch Chrome directly to Google signup URL
  adbShell('am start -a android.intent.action.VIEW -d "https://accounts.google.com/signup" com.android.chrome');
  await delay(4000);

  // Handle Chrome First Run Experience if present
  await handleChromeFre();

  // Wait for signup form to load
  await waitForElement(
    { text: "Google 계정 만들기", rid: "headingText" },
    { timeout: 30000, label: "signup-heading" }
  );
  console.log("  → Google signup form loaded in Chrome");
}

async function fillNameForm(firstName, lastName) {
  await waitForElement({ text: "이름을 입력하세요" }, { timeout: 15000, label: "name-heading" });

  await tapElement({ rid: "lastName" }, { timeout: 15000, label: "last-name-field" });
  await delay(500);
  inputText(lastName);
  pressEscape();
  await delay(500);

  await tapElement({ rid: "firstName" }, { timeout: 15000, label: "first-name-field" });
  await delay(500);
  inputText(firstName);
  pressEscape();
  await delay(500);

  await tapElement({ text: "다음" }, { timeout: 15000, label: "name-next" });
  await delay(3000);
}

async function fillDobGenderForm() {
  await waitForElement({ text: "기본 정보" }, { timeout: 15000, label: "dob-heading" }).catch(async () => {
    return waitForElement({ text: "생일과 성별" }, { timeout: 12000, label: "dob-heading-alt" });
  });

  await tapElement({ rid: "year" }, { timeout: 15000, label: "year-field" });
  await delay(300);
  tripleTap(216, 707);
  await delay(200);
  inputText(BIRTH_YEAR);
  pressEscape();
  await delay(500);

  const nodes = parseNodes(getUiDump("dob-month"));
  const monthSpinner = nodes.find(
    (n) => n.className === "android.widget.Spinner" && n.bounds && n.bounds.left < 700 && n.bounds.left > 350
  );
  if (!monthSpinner) throw new Error("Month spinner not found");
  tap(monthSpinner.bounds.centerX, monthSpinner.bounds.centerY);
  await delay(1000);

  const monthText = `${BIRTH_MONTH}월`;
  await tapElement({ text: monthText }, { timeout: 10000, label: "month-option" });
  await delay(500);

  await tapElement({ rid: "day" }, { timeout: 15000, label: "day-field" });
  await delay(300);
  tripleTap(863, 707);
  await delay(200);
  inputText(BIRTH_DAY);
  pressEscape();
  await delay(500);

  // Find gender spinner by resource-id="gender" parent, not position
  const genderContainer = nodes2.find((n) => n.resourceId === "gender" && n.bounds);
  if (genderContainer) {
    // Tap center of the gender container (contains a Spinner child)
    tap(genderContainer.bounds.centerX, genderContainer.bounds.centerY);
  } else {
    // Fallback: find the Spinner with top > 1000 (below month/day row)
    const genderSpinner = nodes2.find((n) => n.className === "android.widget.Spinner" && n.bounds && n.bounds.top > 1000 && n.bounds.left < 200);
    if (!genderSpinner) throw new Error("Gender spinner not found");
    tap(genderSpinner.bounds.centerX, genderSpinner.bounds.centerY);
  }
  tap(genderSpinner.bounds.centerX, genderSpinner.bounds.centerY);
  await delay(1000);

  const genderMap = { male: "남성", female: "여성" };
  await tapElement({ text: genderMap[GENDER] || "남성" }, { timeout: 10000, label: "gender-option" });
  await tapElement({ text: genderMap[GENDER] || "남자" }, { timeout: 10000, label: "gender-option" });
  await delay(500);

  pressEscape();
  await delay(500);
  await tapElement({ text: "다음" }, { timeout: 15000, label: "dob-next" });
  await delay(3000);
}

async function fillUsernameForm(username) {
  await waitForElement({ text: "Gmail" }, { timeout: 15000, label: "username-heading" });

  // Try finding EditText by resource-id first, then fallback to any EditText in the webview
  const editText = nodes.find((n) => n.className === "android.widget.EditText" && n.resourceId === "username")
    || nodes.find((n) => n.className === "android.widget.EditText" && !n.resourceId && n.bounds && n.bounds.top > 400)
    || nodes.find((n) => n.className === "android.widget.EditText" && n.bounds && n.bounds.top > 400 && n.resourceId !== "com.android.chrome:id/url_bar");
  if (!editText || !editText.bounds) {
    throw new Error("Username input field not found");
  }
  tap(editText.bounds.centerX, editText.bounds.centerY);
  await delay(500);
  inputText(username);
  pressEscape();
  await delay(500);

  await tapElement({ text: "다음" }, { timeout: 15000, label: "username-next" });
  await delay(3000);
}

async function handleSamsungPassPopup() {
  await delay(1500);
  const nodes = parseNodes(getUiDump("samsung-pass-check"));
  const saveTitle = findElement(nodes, { rid: "android:id/autofill_save_title" });
  if (saveTitle) {
    console.log("  → Samsung Pass popup detected, dismissing...");
    await tapElement({ rid: "android:id/autofill_save_no" }, { timeout: 8000, label: "samsung-pass-no" });
    await delay(2000);
  }
}

async function fillPasswordForm(password) {
  await waitForElement({ text: "비밀번호" }, { timeout: 15000, label: "password-heading" });

  const nodes = parseNodes(getUiDump("password"));
  const editTexts = nodes.filter((n) => n.className === "android.widget.EditText" && n.bounds);

  if (editTexts.length === 0) {
    throw new Error("Password field not found");
  }

  // First password field
  tap(editTexts[0].bounds.centerX, editTexts[0].bounds.centerY);
  await delay(500);
  inputText(password);
  pressEscape();
  await delay(500);

  // Second password field (confirm) if present — Chrome web form has two
  if (editTexts.length >= 2) {
    tap(editTexts[1].bounds.centerX, editTexts[1].bounds.centerY);
    await delay(500);
    inputText(password);
    pressEscape();
    await delay(500);
  }

  await tapElement({ text: "다음" }, { timeout: 15000, label: "password-next" });
  await delay(3000);

  // Samsung Pass popup might still appear for password autofill
  await handleSamsungPassPopup();
}

async function handleReviewScreen() {
  await waitForElement({ text: "계정 정보 검토" }, { timeout: 15000, label: "review-heading" });

  const nodes = parseNodes(getUiDump("review"));
  const emailNode = nodes.find((n) => n.text && n.text.includes("@gmail.com"));
  const actualEmail = emailNode ? emailNode.text.trim() : null;
  console.log(`  → Actual email: ${actualEmail || "(not found in review)"}`);

  await tapElement({ text: "다음" }, { timeout: 15000, label: "review-next" });
  await delay(3000);
  return actualEmail;
}

async function handleTermsOfService() {
  for (let i = 0; i < 8; i++) {
    swipe(540, 1700, 540, 400, 400);
    await delay(800);

    const nodes = parseNodes(getUiDump(`tos-scroll-${i}`));
    const createBtn = findElement(nodes, { text: "계정 만들기" });

    if (createBtn && createBtn.bounds && createBtn.bounds.top < 2000) {
      const checkboxes = nodes.filter((n) => n.className === "android.widget.CheckBox" && n.bounds);
      for (const cb of checkboxes) {
        if (cb.checked !== "true") {
          tap(cb.bounds.centerX, cb.bounds.centerY);
          await delay(500);
        }
      }
      tap(createBtn.bounds.centerX, createBtn.bounds.centerY);
      await delay(5000);
      return;
    }
  }
  throw new Error("Could not find ToS submit button after scrolling");
}

async function handlePhoneVerification(smsProvider) {
  const nodes = parseNodes(getUiDump("phone-check"));
  const phoneField = nodes.find((n) => n.className === "android.widget.EditText" && n.bounds);

  if (!phoneField) {
    console.log("  → No phone field found, checking for success...");
    return { cost: 0 };
  }

  if (DRY_RUN) {
    console.log("  → DRY RUN: Phone verification step reached. Stopping.");
    screenshot("dry-run-phone-step");
    return { cost: 0, dryRun: true };
  }

  if (!smsProvider) {
    throw new Error("smsProvider is required for live mode");
  }

  let totalCost = 0;
  let attempts = 0;
  const MAX_PHONE_ATTEMPTS = 5;

  while (attempts < MAX_PHONE_ATTEMPTS) {
    attempts++;
    let order = null;

    try {
      order = await smsProvider.buyNumber();
      totalCost += Number(order.cost || 0);
      console.log(`  → Phone #${attempts}: ${order.phone} (cost: ${order.cost})`);

      tap(phoneField.bounds.centerX, phoneField.bounds.centerY);
      await delay(300);
      tripleTap(phoneField.bounds.centerX, phoneField.bounds.centerY);
      await delay(200);
      for (let i = 0; i < 20; i++) {
        keyevent(67);
      }
      inputText(order.phone);
      pressEscape();
      await delay(500);

      await tapElement({ text: "다음" }, { timeout: 15000, label: `phone-next-${attempts}` });
      await delay(5000);

      let code = null;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 120000) {
        const smsResult = await smsProvider.checkSms(order.id);

        if (smsResult.status === "received" || smsResult.code) {
          code = smsResult.code || extractSmsCode(smsResult);
          break;
        }

        const extracted = extractSmsCode(smsResult);
        if (extracted) {
          code = extracted;
          break;
        }

        await delay(5000);
      }

      if (!code) {
        console.log(`  → No SMS received for phone #${attempts}, cancelling...`);
        await smsProvider.cancelNumber(order.id);
        continue;
      }

      console.log(`  → SMS code received: ${code}`);

      const codeNodes = parseNodes(getUiDump("sms-code"));
      const codeField = codeNodes.find((n) => n.className === "android.widget.EditText" && n.bounds);
      if (codeField) {
        tap(codeField.bounds.centerX, codeField.bounds.centerY);
        await delay(500);
        inputText(code);
        pressEscape();
        await delay(500);
        await tapElement({ text: "다음" }, { timeout: 15000, label: `sms-next-${attempts}` });
        await delay(5000);
      }

      await smsProvider.finishNumber(order.id);
      return { cost: totalCost };
    } catch (err) {
      console.log(`  → Phone attempt #${attempts} failed: ${err.message}`);
      if (order) {
        try {
          await smsProvider.cancelNumber(order.id);
        } catch {}
      }
    }
  }

  throw new Error(`Phone verification failed after ${MAX_PHONE_ATTEMPTS} attempts`);
}

async function handlePostVerification() {
  for (let i = 0; i < 8; i++) {
    await delay(2000);
    const nodes = parseNodes(getUiDump(`post-verify-${i}`));

    const skipBtn = findElement(nodes, { text: "건너뛰기" }) || findElement(nodes, { text: "Skip" });
    if (skipBtn?.bounds) {
      console.log(`  → Post-verify step ${i}: tapping Skip`);
      tap(skipBtn.bounds.centerX, skipBtn.bounds.centerY);
      await delay(1000);
      continue;
    }

    const agreeBtn = findElement(nodes, { text: "동의합니다" }) || findElement(nodes, { text: "I agree" });
    if (agreeBtn?.bounds) {
      console.log(`  → Post-verify step ${i}: tapping Agree`);
      tap(agreeBtn.bounds.centerX, agreeBtn.bounds.centerY);
      await delay(1000);
      continue;
    }

    const nextBtn = findElement(nodes, { text: "다음" }) || findElement(nodes, { text: "Next" });
    if (nextBtn?.bounds) {
      console.log(`  → Post-verify step ${i}: tapping Next`);
      tap(nextBtn.bounds.centerX, nextBtn.bounds.centerY);
      await delay(1000);
      continue;
    }

    const confirmBtn = findElement(nodes, { text: "확인" }) || findElement(nodes, { text: "Confirm" });
    if (confirmBtn?.bounds) {
      console.log(`  → Post-verify step ${i}: tapping Confirm`);
      tap(confirmBtn.bounds.centerX, confirmBtn.bounds.centerY);
      await delay(1000);
      continue;
    }

    // Check if we landed on Settings (native GMS flow return)
    const settingsTitle = findElement(nodes, { pkg: "com.android.settings" });
    if (settingsTitle) {
      console.log("  → Returned to Settings — account creation succeeded");
      return true;
    }

    // Check for Chrome welcome/myaccount page (Chrome flow success)
    const welcomeText = nodes.find((n) => n.text && (
      n.text.includes("myaccount.google.com") ||
      n.text.includes("환영합니다") ||
      n.text.includes("Welcome") ||
      n.text.includes("계정 준비 완료")
    ));
    if (welcomeText) {
      console.log("  → Account creation success page detected");
      return true;
    }

    // No recognizable action found — might be done
    console.log(`  → Post-verify step ${i}: no actionable element found`);
  }
  return false;
}

async function createAccount(accountNum, smsProvider) {
  const username = `${PREFIX}${padNum(accountNum)}`;
  const name = generateUSName();
  const startTime = Date.now();
  let actualEmail = null;
  let totalCost = 0;
  let status = "failed";
  let error = null;

  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Account ${accountNum}: ${username} (${name.firstName} ${name.lastName})`);
    console.log(`${"=".repeat(60)}`);

    ensureDeviceConnected();
    screenshot(`${username}-00-start`);

    await openAddGoogleAccount();
    screenshot(`${username}-01-google-selected`);

    await fillNameForm(name.firstName, name.lastName);
    screenshot(`${username}-02-name-filled`);

    await fillDobGenderForm();
    screenshot(`${username}-03-dob-filled`);

    await fillUsernameForm(username);
    screenshot(`${username}-04-username-filled`);

    await fillPasswordForm(PASSWORD);
    screenshot(`${username}-05-password-filled`);

    actualEmail = await handleReviewScreen();
    screenshot(`${username}-06-review`);

    await handleTermsOfService();
    screenshot(`${username}-07-tos-agreed`);

    const phoneResult = await handlePhoneVerification(smsProvider);
    totalCost = phoneResult.cost;

    if (phoneResult.dryRun) {
      status = "dry-run:phone-step";
      return {
        username,
        email: actualEmail || `${username}@gmail.com`,
        password: PASSWORD,
        firstName: name.firstName,
        lastName: name.lastName,
        koreanName: name.korean || "",
        cost: totalCost,
        status,
        timestamp: new Date().toISOString(),
      };
    }

    screenshot(`${username}-08-phone-done`);

    await handlePostVerification();
    screenshot(`${username}-09-complete`);

    status = "success";
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ Account created: ${actualEmail || username + "@gmail.com"} (${elapsed}s)`);

    return {
      username,
      email: actualEmail || `${username}@gmail.com`,
      password: PASSWORD,
      firstName: name.firstName,
      lastName: name.lastName,
      koreanName: name.korean || "",
      cost: totalCost,
      status,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    error = err;
    status = `failed:${String(err.message || err).slice(0, 50)}`;
    console.error(`  ❌ Failed: ${err.message}`);
    screenshot(`${username}-error`);
    getUiDump(`${username}-error`);

    return {
      username,
      email: actualEmail || `${username}@gmail.com`,
      password: PASSWORD,
      firstName: name.firstName,
      lastName: name.lastName,
      koreanName: name.korean || "",
      cost: totalCost,
      status,
      timestamp: new Date().toISOString(),
      error,
    };
  } finally {
    // Force stop Chrome and go home for clean next run
    try { adbShell("am force-stop com.android.chrome"); } catch {}
    pressHome();
  }
}

async function createAccountWithRetries(accountNum, smsProvider, maxRetries = 2) {
  let result = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const cooldown = randomInt(30000, 60000);
      console.log(`  ⏳ Retry ${attempt}/${maxRetries} after ${(cooldown / 1000).toFixed(0)}s cooldown...`);
      await delay(cooldown);
    }

    result = await createAccount(accountNum, smsProvider);
    if (result.status === "success" || result.status.startsWith("dry-run:")) {
      appendCsv(result);
      return result;
    }

    console.error(`  ❌ Attempt ${attempt + 1} failed: ${result.status}`);
    if (attempt === maxRetries) {
      console.error(`  💀 All retries exhausted for account ${accountNum}`);
      appendCsv(result);
      return result;
    }

    ensureDeviceConnected();
    pressHome();
    await delay(3000);
  }
  return result;
}

function validateCli() {
  if (!Number.isInteger(START) || !Number.isInteger(END) || START <= 0 || END < START) {
    throw new Error(`Invalid range: start=${START}, end=${END}`);
  }
  if (!DRY_RUN && !SMS_API_KEY) {
    throw new Error("API key required for live mode (--api-key or FIVESIM_API_KEY)");
  }
}

async function main() {
  validateCli();

  console.log("🤖 ADB Google Account Creator");
  console.log(`  Device: ${DEVICE}`);
  console.log(`  Range: ${PREFIX}${padNum(START)} → ${PREFIX}${padNum(END)}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  SMS: ${SMS_PROVIDER} (region: ${FIVESIM_REGION})`);

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  mkdirSync(UIDUMP_DIR, { recursive: true });
  initCsv();

  ensureDeviceConnected();
  const deviceInfo = adbShell("getprop ro.product.model").trim();
  const serial = adbShell("getprop ro.serialno").trim();
  console.log(`  Device model: ${deviceInfo}`);
  console.log(`  Device serial: ${serial || "(unknown)"}`);

  // Disable Samsung biometric auth to prevent fingerprint dialog during account creation
  try {
    adbShell("pm disable-user --user 0 com.samsung.android.biometrics.app.setting");
    console.log("  Biometric auth: disabled for automation");
  } catch (e) {
    console.error(`  ⚠️ Could not disable biometric auth: ${e.message}`);
  }

  adbShell("settings put system screen_off_timeout 600000");
  adbShell("svc power stayon true");

  try {
    const completed = getCompletedUsernames();
    const smsProvider = DRY_RUN ? null : createSmsProvider(SMS_PROVIDER, SMS_API_KEY, FIVESIM_REGION);

    if (!DRY_RUN && smsProvider) {
      try {
        const balance = await smsProvider.getBalance();
        console.log(`  SMS balance: ${balance}`);
      } catch (err) {
        console.log(`  ⚠️ Could not check SMS balance: ${err.message}`);
      }
    }

    for (let i = START; i <= END; i++) {
      const username = `${PREFIX}${padNum(i)}`;
      if (completed.has(username)) {
        console.log(`  ⏩ Skip ${username} (already completed)`);
        continue;
      }

      await createAccountWithRetries(i, smsProvider);

      if (i < END) {
        const cooldown = randomInt(60000, 120000);
        console.log(`  ⏳ Inter-account cooldown: ${(cooldown / 1000).toFixed(0)}s`);
        await delay(cooldown);
      }
    }

    console.log("\n🏁 Done!");
  } finally {
    // Re-enable Samsung biometric auth
    try {
      adbShell("pm enable com.samsung.android.biometrics.app.setting");
      console.log("  Biometric auth: re-enabled");
    } catch (e) {
      console.error(`  ⚠️ Could not re-enable biometric auth: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
