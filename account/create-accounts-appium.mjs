#!/usr/bin/env node
/**
 * Google Account Creator — Appium + Android Emulator Edition
 *
 * Creates Google accounts via Chrome on Docker Android emulator.
 * Uses Appium/WebdriverIO for reliable element interaction.
 * 5sim.net for SMS verification.
 *
 * Prerequisites:
 *   - Docker Android emulator running (budtmo/docker-android)
 *   - ADB connected (adb devices shows localhost:5555)
 *   - Appium server running (appium on port 4723)
 *
 * Usage:
 *   node account/create-accounts-appium.mjs --dry-run --count 3
 *   node account/create-accounts-appium.mjs --count 5 --api-key <5sim-key> --region russia
 *   node account/create-accounts-appium.mjs --count 1 --api-key <5sim-key>
 */

import { remote } from "webdriverio";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// ── Config ──────────────────────────────────────────────────────────
const PASSWORD = "Bingogo1!";
const BIRTH_YEAR = "2000";
const BIRTH_MONTH = "January";
const BIRTH_DAY = "15";
const BIRTH_MONTH_NUM = "1"; // January = 1 for <select> value

const CSV_FILE = join(import.meta.dirname, "..", "accounts.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "..", "screenshots");

// ── CLI Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback = "") {
  const idx = args.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const DRY_RUN = args.includes("--dry-run");
const COUNT = parseInt(getArg("count", "1"), 10);
const SMS_API_KEY = getArg("api-key", getArg("sms-key", process.env.FIVESIM_API_KEY || ""));
const FIVESIM_REGION = getArg("region", process.env.FIVESIM_REGION || "russia");
const APPIUM_HOST = getArg("appium-host", "localhost");
const APPIUM_PORT = parseInt(getArg("appium-port", "4723"), 10);
const ADB_DEVICE = getArg("device", "localhost:5555");
const PROXY_RELAY = getArg("proxy", ""); // e.g. "172.17.0.1:18080" — local relay accessible from Docker
const SKIP_RESTART = args.includes('--no-restart');

// ── US Name Generator ───────────────────────────────────────────────
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

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function formatCost(cost) {
  const n = Number(cost);
  return Number.isFinite(n) ? n.toFixed(4) : "0.0000";
}

function generateRandomUsername(firstName, lastName) {
  const patterns = [
    () => `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(10000, 999999)}`,
    () => `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1000, 99999)}`,
    () => `${firstName.toLowerCase()}${randomInt(10000, 99999)}${lastName.toLowerCase().slice(0, 3)}`,
    () => `${lastName.toLowerCase()}${firstName.toLowerCase().slice(0, 1)}${randomInt(10000, 999999)}`,
  ];
  return patterns[randomInt(0, patterns.length - 1)]();
}

// ── CSV ─────────────────────────────────────────────────────────────
function initCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, "username,email,password,firstName,lastName,koreanName,cost,status,timestamp\n");
  }
}
function appendCsv(row) {
  const line = `${row.username},${row.email},${row.password},${row.firstName},${row.lastName},,${formatCost(row.cost)},${row.status},${row.timestamp}\n`;
  writeFileSync(CSV_FILE, line, { flag: "a" });
}

// ── 5sim API ────────────────────────────────────────────────────────
const REGION_COUNTRY_CODE = {
  russia: "+7", ukraine: "+380", kazakhstan: "+7", china: "+86",
  philippines: "+63", indonesia: "+62", malaysia: "+60", kenya: "+254",
  india: "+91", usa: "+1", england: "+44", korea: "+82",
  mexico: "+52", colombia: "+57", canada: "+1", australia: "+61",
  germany: "+49", brazil: "+55", argentina: "+54",
};

async function fiveSimGetJson(url, apiKey) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response, rawText;
  try {
    response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    rawText = await response.text();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("5sim API request timed out after 15s");
    throw err;
  }
  clearTimeout(timeoutId);
  let body = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = { message: rawText }; }
  if (!response.ok) {
    let message = body?.message || rawText || `5sim request failed (${response.status})`;
    if (response.status === 401) message = "Unauthorized API key.";
    throw new Error(`5sim HTTP ${response.status}: ${String(message).slice(0, 200)}`);
  }
  return body;
}

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(rawPhone, region) {
  let phone = String(rawPhone || "").replace(/\D/g, "");
  const prefix = (REGION_COUNTRY_CODE[region] || "").replace("+", "");
  if (prefix && phone.startsWith(prefix)) phone = phone.slice(prefix.length);
  return phone;
}

async function getBestOperator(apiKey, region) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/guest/prices?country=${encodeURIComponent(region)}&product=google`, apiKey
  );
  const operatorMap = body?.google?.[region] || body?.[region]?.google;
  if (!operatorMap || typeof operatorMap !== "object") throw new Error(`No operators for region: ${region}`);
  const sorted = Object.entries(operatorMap)
    .filter(([, info]) => (info?.count || 0) > 0)
    .sort(([, a], [, b]) => Number(b?.rate || 0) - Number(a?.rate || 0));
  if (sorted.length === 0) throw new Error(`No operator data for region: ${region}`);
  return sorted[0][0];
}

async function buyNumber(apiKey, region, operator) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/user/buy/activation/${encodeURIComponent(region)}/${encodeURIComponent(operator)}/google`, apiKey
  );
  return { phone: normalizePhone(body?.phone, region), id: body?.id, cost: extractOrderCost(body), raw: body };
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

// ── Docker Emulator Reset ────────────────────────────────────────────
const DOCKER_CONTAINER = 'android-emulator';
const DOCKER_IMAGE = 'budtmo/docker-android:emulator_11.0';

async function resetDockerEmulator() {
  console.log('  \u{1f504} Restarting Docker emulator for fresh device identity...');

  // Stop and remove old container
  try {
    execSync(`docker rm -f ${DOCKER_CONTAINER} 2>/dev/null`, { timeout: 30000 });
  } catch {}

  // Disconnect stale ADB
  try {
    execSync(`adb disconnect ${ADB_DEVICE} 2>/dev/null`, { timeout: 5000 });
  } catch {}

  await delay(2000);

  // Create fresh container with same config
  execSync([
    `docker run -d --name ${DOCKER_CONTAINER}`,
    `--device /dev/kvm`,
    `-p 5554:5554 -p 5555:5555 -p 6080:6080`,
    `-e EMULATOR_DEVICE="Samsung Galaxy S10"`,
    `-e WEB_VNC=true`,
    DOCKER_IMAGE,
  ].join(' '), { timeout: 60000 });

  console.log('  \u23f3 Waiting for emulator to boot...');

  // Wait for ADB + boot_completed (up to 3 minutes)
  const bootTimeout = Date.now() + 180000;
  let lastStatus = '';
  while (Date.now() < bootTimeout) {
    await delay(5000);
    try {
      execSync(`adb connect ${ADB_DEVICE} 2>/dev/null`, { timeout: 5000 });
      const devices = execSync('adb devices 2>/dev/null', { timeout: 5000 }).toString();
      if (devices.includes(ADB_DEVICE) && !devices.includes('offline')) {
        try {
          const boot = execSync(`adb -s ${ADB_DEVICE} shell getprop sys.boot_completed 2>&1`, { timeout: 5000 }).toString().trim();
          if (boot === '1') {
            console.log('  ✅ Emulator booted and ready');
            // Extra wait for Chrome + Google services to settle
            await delay(8000);

            // Randomize Android ID for fresh device identity
            try {
              const newId = Array.from({length: 16}, () => '0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
              execSync(`adb -s ${ADB_DEVICE} shell settings put secure android_id ${newId}`, { timeout: 5000 });
              console.log(`  🆔 Android ID randomized: ${newId}`);
            } catch (e) {
              console.log(`  ⚠️ Android ID randomize failed: ${e.message.slice(0, 60)}`);
            }

            // Clear Google Services Framework for fresh GSF ID (forces new check-in)
            try {
              execSync(`adb -s ${ADB_DEVICE} shell pm clear com.google.android.gsf 2>/dev/null`, { timeout: 10000 });
              execSync(`adb -s ${ADB_DEVICE} shell pm clear com.google.android.gms 2>/dev/null`, { timeout: 10000 });
              await delay(5000); // Wait for services to reinitialize with new IDs
              console.log('  🔄 GSF/GMS data cleared for fresh device identity');
            } catch (e) {
              console.log(`  ⚠️ GSF clear failed: ${e.message.slice(0, 60)}`);
            }

            // Set proxy via ADB if configured
            if (PROXY_RELAY) {
              try {
                execSync(`adb -s ${ADB_DEVICE} shell settings put global http_proxy ${PROXY_RELAY}`, { timeout: 5000 });
                console.log(`  🌐 Proxy set on emulator: ${PROXY_RELAY}`);
              } catch (e) {
                console.log(`  ⚠️ Proxy set failed: ${e.message.slice(0, 60)}`);
              }
            }
            return;
          }
          if (lastStatus !== 'booting') {
            lastStatus = 'booting';
            console.log('  \u23f3 Device connected, waiting for boot...');
          }
        } catch {}
      }
    } catch {}
  }
  throw new Error('Emulator failed to boot within 3 minutes');
}

// ── Appium Driver Setup ─────────────────────────────────────────────
async function createDriver() {
  const opts = {
    hostname: APPIUM_HOST,
    port: APPIUM_PORT,
    path: "/",
    capabilities: {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "Android",
      "appium:udid": ADB_DEVICE,
      "appium:browserName": "Chrome",
      "appium:noReset": true,
      "appium:newCommandTimeout": 300,
      "appium:chromeOptions": {
        args: [
          "--disable-notifications", "--disable-popup-blocking",
          "--no-first-run", "--disable-fre",
          // Proxy is set at system level via 'adb shell settings put global http_proxy'
          // Do NOT also set --proxy-server here to avoid double-proxy issues
        ],
      },
    },
    logLevel: "warn",
  };
  // Re-connect wireless ADB device before session (Appium's adb start-server drops TCP connections)
  if (ADB_DEVICE.includes(':') && !ADB_DEVICE.startsWith('localhost') && !ADB_DEVICE.startsWith('127.')) {
    try {
      const out = execSync(`adb connect ${ADB_DEVICE}`, { timeout: 5000 }).toString().trim();
      console.log(`  🔗 ADB reconnect: ${out}`);
    } catch (e) {
      console.log(`  ⚠️ ADB reconnect failed: ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`  🔌 Connecting to Appium at ${APPIUM_HOST}:${APPIUM_PORT}...`);
  const driver = await remote(opts);
  console.log(`  ✅ Appium connected. Session: ${driver.sessionId}`);
  return driver;
}

// ── Human-like typing ───────────────────────────────────────────────
async function humanType(element, text) {
  for (const char of text) {
    await element.addValue(char);
    await delay(randomInt(50, 150));
  }
}

async function safeScreenshot(driver, name) {
  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const path = join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`);
    await driver.saveScreenshot(path);
    console.log(`    📸 ${path}`);
    return path;
  } catch (e) {
    console.log(`    ⚠️ Screenshot failed: ${e.message.slice(0, 60)}`);
    return null;
  }
}

// ── Wait helpers ────────────────────────────────────────────────────
async function waitForElement(driver, selector, timeoutMs = 15000) {
  const el = await driver.$(selector);
  await el.waitForExist({ timeout: timeoutMs });
  await el.waitForDisplayed({ timeout: 5000 });
  return el;
}

async function findAndClick(driver, selectors, description = "") {
  for (const sel of selectors) {
    try {
      const el = await driver.$(sel);
      const exists = await el.isExisting();
      if (exists) {
        const displayed = await el.isDisplayed();
        if (displayed) {
          await el.click();
          console.log(`    ✅ Clicked: ${description || sel}`);
          return true;
        }
      }
    } catch {}
  }
  return false;
}

async function getPageText(driver) {
  try {
    const body = await driver.$("body");
    return (await body.getText()) || "";
  } catch {
    return "";
  }
}

// ── Account Creation Flow ───────────────────────────────────────────
async function createAccount(driver, username, firstName, lastName, devicePhoneOrder = null) {
  const email = `${username}@gmail.com`;
  let totalCost = 0;
  let activePhoneId = null;

  try {
    // Step 1: Navigate to signup
    console.log("  📝 Step 1: Navigate to signup page");
    await driver.url("https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp");
    await delay(randomInt(3000, 5000));

    await safeScreenshot(driver, `${username}-01-signup`);

    // Step 2: Fill first & last name
    console.log("  📝 Step 2: Fill name fields");
    const firstNameInput = await waitForElement(driver, '#firstName, input[name="firstName"]');
    await firstNameInput.clearValue();
    await humanType(firstNameInput, firstName);
    await delay(randomInt(300, 600));

    const lastNameInput = await waitForElement(driver, '#lastName, input[name="lastName"]');
    await lastNameInput.clearValue();
    await humanType(lastNameInput, lastName);
    await delay(randomInt(300, 600));

    // Click Next
    const nextClicked = await findAndClick(driver, [
      '//span[contains(text(),"Next")]/..',
      '//span[contains(text(),"다음")]/..',
      '//button[contains(text(),"Next")]',
      '#identifierNext button',
      'button[type="button"]',
    ], "Next (name)");

    if (!nextClicked) {
      // Try pressing Enter as fallback
      await lastNameInput.keys("Enter");
    }

    await delay(randomInt(4000, 6000));
    await safeScreenshot(driver, `${username}-02-after-name`);

    // Step 3: Birthday & Gender
    console.log("  📝 Step 3: Fill birthday & gender");
    let pageText = await getPageText(driver);

    // Check if we hit a QR code or verification block early
    if (pageText.includes("QR") || pageText.includes("verify your identity") || pageText.includes("Verify it")) {
      console.log("    ❌ QR code verification detected! Emulator may be flagged.");
      await safeScreenshot(driver, `${username}-qr-block`);
      return { status: "error:qr_code_verification", cost: totalCost };
    }

    // Month dropdown — custom Material Design combobox (NOT <select>)
    try {
      const monthCombobox = await driver.$('div[role="combobox"]');
      const monthExists = await monthCombobox.isExisting();
      if (monthExists) {
        await monthCombobox.click();
        await delay(randomInt(500, 800));
        // Pick random month from the listbox options
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthChoice = monthNames[randomInt(0, 11)];
        const monthOption = await driver.$(`li[role="option"]=${monthChoice}`);
        if (await monthOption.isExisting()) {
          await monthOption.click();
          console.log(`    ✅ Month selected: ${monthChoice}`);
        } else {
          // Fallback: click first option via XPath
          const firstOption = await driver.$('//ul[@aria-label="Month"]//li[1]');
          if (await firstOption.isExisting()) await firstOption.click();
          console.log('    ✅ Month selected: (first option)');
        }
        // Dismiss dropdown overlay
        await driver.keys('Escape');
        await delay(randomInt(200, 400));
        await delay(randomInt(300, 500));
      } else {
        console.log('    ⚠️ Month combobox not found');
      }
    } catch (e) {
      console.log(`    ⚠️ Month combobox issue: ${e.message.slice(0, 80)}`);
    }

    // Day
    try {
      const dayInput = await driver.$('#day, input[name="day"]');
      const dayExists = await dayInput.isExisting();
      if (dayExists) {
        await dayInput.clearValue();
        await humanType(dayInput, BIRTH_DAY);
        await delay(randomInt(200, 400));
      }
    } catch (e) {
      console.log(`    ⚠️ Day input issue: ${e.message.slice(0, 60)}`);
    }

    // Year
    try {
      const yearInput = await driver.$('#year, input[name="year"]');
      const yearExists = await yearInput.isExisting();
      if (yearExists) {
        await yearInput.clearValue();
        await humanType(yearInput, BIRTH_YEAR);
        await delay(randomInt(200, 400));
      }
    } catch (e) {
      console.log(`    ⚠️ Year input issue: ${e.message.slice(0, 60)}`);
    }

    // Gender dropdown — custom Material Design combobox (NOT <select>)
    try {
      // Gender is the second combobox on the page
      const comboboxes = await driver.$$('div[role="combobox"]');
      const genderCombobox = comboboxes.length >= 2 ? comboboxes[1] : null;
      if (genderCombobox) {
        await genderCombobox.click();
        await delay(randomInt(800, 1200));
        
        // Try each gender option in order of preference
        let genderSelected = false;
        for (const genderText of ['Rather not say', 'Male', 'Female']) {
          try {
            const opt = await driver.$(`//ul[@aria-label="Gender"]//li[contains(text(),"${genderText}")]`);
            if (await opt.isExisting()) {
              await opt.click();
              console.log(`    ✅ Gender selected: ${genderText}`);
              genderSelected = true;
              break;
            }
          } catch (_) { /* try next */ }
        }
        
        if (!genderSelected) {
          // Last resort: click any option in the gender listbox
          try {
            const anyOpt = await driver.$('//ul[@aria-label="Gender"]//li[1]');
            if (await anyOpt.isExisting()) {
              await anyOpt.click();
              console.log('    ✅ Gender selected: (first option)');
              genderSelected = true;
            }
          } catch (_) { }
        }
        
        // Wait for dropdown animation to complete (do NOT press Escape — it cancels selection)
        await delay(randomInt(500, 800));
        
        // Verify selection: check if combobox text changed from 'Gender'
        try {
          const genderText = await genderCombobox.getText();
          if (genderText === 'Gender' || genderText === '') {
            console.log(`    ⚠️ Gender still shows '${genderText}' — trying click-outside dismiss`);
            // Click on page body to dismiss any stuck overlay
            await driver.execute('document.body.click()');
            await delay(500);
            // Retry: click combobox again and pick first option
            await genderCombobox.click();
            await delay(800);
            const retryOpt = await driver.$('//ul[@aria-label="Gender"]//li[2]');
            if (await retryOpt.isExisting()) {
              await retryOpt.click();
              console.log('    ✅ Gender selected (retry): option 2');
            }
            await delay(500);
          } else {
            console.log(`    ✅ Gender verified: ${genderText}`);
          }
        } catch (_) { }
        
        await delay(randomInt(300, 500));
      } else {
        console.log('    ⚠️ Gender combobox not found');
      }
    } catch (e) {
      console.log(`    ⚠️ Gender combobox issue: ${e.message.slice(0, 80)}`);
    }

    // Click Next
    await findAndClick(driver, [
      '//span[contains(text(),"Next")]/..',
      '//span[contains(text(),"다음")]/..',
      '//button[contains(text(),"Next")]',
    ], "Next (birthday)");

    await delay(randomInt(3000, 5000));
    
    // Verify we actually left the birthday page
    pageText = await getPageText(driver);
    if (pageText.includes('Enter your birthday') || pageText.includes('Please select your gender') || pageText.includes('생년월일')) {
      console.log('    ⚠️ Still on birthday page — gender may not have been selected. Retrying...');
      await safeScreenshot(driver, `${username}-03-birthday-retry`);
      // Try JavaScript-based gender selection as last resort
      try {
        await driver.execute(`
          const cbs = document.querySelectorAll('div[role="combobox"]');
          if (cbs.length >= 2) { cbs[1].click(); }
        `);
        await delay(1000);
        await driver.execute(`
          const opts = document.querySelectorAll('ul[aria-label="Gender"] li[role="option"]');
          if (opts.length >= 2) { opts[1].click(); }
        `);
        await delay(1000);
        console.log('    ✅ Gender selected via JS injection');
      } catch (e) {
        console.log(`    ⚠️ JS gender select failed: ${e.message.slice(0, 60)}`);
      }
      // Try clicking Next again
      await findAndClick(driver, [
        '//span[contains(text(),"Next")]/..',
        '//span[contains(text(),"다음")]/..',
        '//button[contains(text(),"Next")]',
      ], 'Next (birthday retry)');
      await delay(randomInt(4000, 6000));
    }
    
    await safeScreenshot(driver, `${username}-03-after-birthday`);

    // Step 4: Choose email / username
    console.log("  \u{1f4dd} Step 4: Choose username");
    pageText = await getPageText(driver);

    // V22: Handle alternate "Use an email address or phone number" page
    // Google sometimes shows this instead of the Gmail username page
    if (pageText.includes('Use an email address or phone number') ||
        pageText.includes('Enter any email address') ||
        pageText.includes('email address or phone number you own')) {
      console.log('    \u{1f504} Alternate signup path detected: "Use an email or phone"');
      // Click "Don\'t have an email address or phone number?" to get Gmail option
      const noEmailClicked = await findAndClick(driver, [
        '//a[contains(text(),"Don\'t have an email")]',
        '//span[contains(text(),"Don\'t have an email")]/..',
        '//a[contains(text(),"don\'t have an email")]',
        '//button[contains(text(),"Don\'t have")]',
        '//a[contains(text(),"email address or phone number")]',
      ], 'Don\'t have email link');
      if (noEmailClicked) {
        console.log('    \u2705 Clicked \"Don\'t have email\" — waiting for Gmail option...');
        await delay(randomInt(3000, 5000));
        pageText = await getPageText(driver);
      } else {
        console.log('    \u26a0\ufe0f Could not find \"Don\'t have email\" link');
        await safeScreenshot(driver, `${username}-04-alt-signup-stuck`);
      }
    }

    // Google may offer "Create your own" option or show username input directly
    const createOwnClicked = await findAndClick(driver, [
      '//div[contains(text(),"Create your own Gmail address")]',
      '//div[contains(text(),"\uc790\uc2e0\ub9cc\uc758 Gmail \uc8fc\uc18c \ub9cc\ub4e4\uae30")]',
      '//div[contains(text(),"Create your own")]',
      'div[data-value="custom"]',
    ], "Create your own");

    if (createOwnClicked) {
      await delay(randomInt(2000, 3000));
    }

    // Try to find username input
    let usernameInput = null;
    const usernameSelectors = [
      '#username', 'input[name="Username"]', 'input[name="username"]',
      'input[type="text"][aria-label*="username" i]',
      'input[type="email"]',
    ];
    for (const sel of usernameSelectors) {
      try {
        const el = await driver.$(sel);
        if (await el.isExisting() && await el.isDisplayed()) {
          usernameInput = el;
          break;
        }
      } catch {}
    }

    if (usernameInput) {
      await usernameInput.clearValue();
      await humanType(usernameInput, username);
      await delay(randomInt(500, 800));
    } else {
      // Google might have auto-suggested; check if we can proceed
      console.log("    ⚠️ No username input found - Google may have auto-suggested");
      await safeScreenshot(driver, `${username}-04-no-username`);
    }

    await findAndClick(driver, [
      '//span[contains(text(),"Next")]/..',
      '//span[contains(text(),"다음")]/..',
      '//button[contains(text(),"Next")]',
    ], "Next (username)");

    await delay(randomInt(4000, 6000));
    await safeScreenshot(driver, `${username}-04-after-username`);

    // Check for "username taken" error
    pageText = await getPageText(driver);
    if (pageText.includes("already taken") || pageText.includes("is taken") ||
        pageText.includes("이미 사용") || pageText.includes("уже занято")) {
      console.log("    ⚠️ Username taken. Trying alternate.");
      const altUsername = generateRandomUsername(firstName, lastName);
      if (usernameInput) {
        await usernameInput.clearValue();
        await humanType(usernameInput, altUsername);
        await findAndClick(driver, [
          '//span[contains(text(),"Next")]/..',
          '//button[contains(text(),"Next")]',
        ], "Next (retry username)");
        await delay(randomInt(4000, 6000));
      }
    }

    // Step 5: Password
    console.log("  📝 Step 5: Set password");
    const passwordSelectors = [
      'input[name="Passwd"]', 'input[name="passwd"]',
      '#passwd', 'input[type="password"]',
    ];
    let passwordInput = null;
    for (const sel of passwordSelectors) {
      try {
        const el = await driver.$(sel);
        if (await el.isExisting() && await el.isDisplayed()) {
          passwordInput = el;
          break;
        }
      } catch {}
    }

    if (passwordInput) {
      await passwordInput.clearValue();
      await humanType(passwordInput, PASSWORD);
      await delay(randomInt(300, 600));
    } else {
      console.log("    ⚠️ Password field not found");
      await safeScreenshot(driver, `${username}-05-no-password`);
      pageText = await getPageText(driver);
      if (pageText.includes("QR") || pageText.includes("verify")) {
        return { status: "error:qr_code_verification", cost: totalCost };
      }
      return { status: "error:no_password_field", cost: totalCost };
    }

    // Confirm password — try multiple selectors including generic type=password
    const confirmSelectors = [
      'input[name="PasswdAgain"]', 'input[name="ConfirmPasswd"]',
      '#confirm-passwd', 'input[name="confirm-passwd"]',
      'input[aria-label="Confirm"]', 'input[aria-label="Confirm password"]',
    ];
    let confirmFilled = false;
    for (const sel of confirmSelectors) {
      try {
        const el = await driver.$(sel);
        if (await el.isExisting() && await el.isDisplayed()) {
          await el.clearValue();
          await humanType(el, PASSWORD);
          confirmFilled = true;
          break;
        }
      } catch {}
    }
    
    // Fallback: find second password-type input
    if (!confirmFilled) {
      try {
        const pwInputs = await driver.$$('input[type="password"]');
        if (pwInputs.length >= 2) {
          await pwInputs[1].clearValue();
          await humanType(pwInputs[1], PASSWORD);
          confirmFilled = true;
          console.log('    ✅ Confirm password filled via second password input');
        }
      } catch {}
    }
    
    // Click Next with retry — check if page advances
    for (let pwRetry = 0; pwRetry < 3; pwRetry++) {
      await findAndClick(driver, [
        '//span[contains(text(),"Next")]/..',
        '//span[contains(text(),"다음")]/..',
        '//button[contains(text(),"Next")]',
      ], 'Next (password)');
      
      await delay(randomInt(4000, 6000));
      
      const pwUrl = await driver.getUrl();
      if (!pwUrl.includes('/signup/password')) {
        // Check if we went BACKWARD to /name (Google rejected signup)
        if (pwUrl.includes('/signup/name') || pwUrl.includes('/signup/v2/createaccount')) {
          console.log(`    \u274c Google rejected signup — redirected back to start: ${pwUrl.split('?')[0]}`);
          await safeScreenshot(driver, `${username}-05-rejected`);
          return { status: 'error:signup_rejected_loop', cost: totalCost };
        }
        console.log(`    \u2705 Password page advanced (attempt ${pwRetry + 1})`);
        break;
      }
      
      // Still on password page — check for errors
      const pwText = await getPageText(driver);
      if (pwText.includes('too short') || pwText.includes('too weak') ||
          pwText.includes('Use 8') || pwText.includes('characters or more') ||
          pwText.includes('passwords match') || pwText.includes('do not match')) {
        console.log(`    ⚠️ Password validation error detected. Page text snippet: ${pwText.slice(0, 200)}`);
        await safeScreenshot(driver, `${username}-05-pw-error-${pwRetry}`);
        break; // can't fix password requirements at this point
      }
      
      if (pwRetry < 2) {
        console.log(`    ⚠️ Still on password page (attempt ${pwRetry + 1}/3). Retrying Next click...`);
        // Try scrolling down and clicking via JS
        try {
          await driver.execute(() => {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
              if (b.textContent.includes('Next')) { b.click(); return; }
            }
          });
        } catch {}
      }
    }
    
    await safeScreenshot(driver, `${username}-06-after-password`);

    // Step 6: Check what comes next — phone verification, review, or skip
    // First verify we actually left the password page
    let postPwUrl = await driver.getUrl();
    console.log(`  \u{1f4dd} Step 6: Post-password URL: ${postPwUrl.split('?')[0]}`);
    
    // Detect backward redirect to signup start
    if (postPwUrl.includes('/signup/name') || postPwUrl.includes('/signup/v2/createaccount')) {
      console.log('    \u274c Google rejected signup \u2014 redirected back to start');
      await safeScreenshot(driver, `${username}-06-rejected`);
      return { status: 'error:signup_rejected_loop', cost: totalCost };
    }
    if (postPwUrl.includes('/signup/password')) {
      console.log('    \u26a0\ufe0f Still on password page after 3 retry attempts');
      await safeScreenshot(driver, `${username}-06-stuck-password`);
      return { status: 'error:stuck_on_password', cost: totalCost };
    }
    console.log('  \u{1f4dd} Step 6: Handle verification / post-password');
    pageText = await getPageText(driver);

    // Check for QR code block (mophoneverification URL always shows QR)
    if (postPwUrl.includes('mophoneverification') ||
        (pageText.includes('QR') && pageText.includes('scan')) ||
        pageText.includes('verify your identity')) {
      console.log('    ❌ QR/identity verification detected after password!');
      await safeScreenshot(driver, `${username}-qr-block`);
      return { status: 'error:qr_code_verification', cost: totalCost };
    }

    // Handle device/mobile phone verification
    if (postPwUrl.includes('devicephoneverification') || postPwUrl.includes('phoneverification')) {
      console.log('    📱 Phone verification page detected');
      await safeScreenshot(driver, `${username}-06-phoneverify`);
      
      // Comprehensive page analysis
      const pvElements = await driver.execute(function() {
        const result = { buttons: [], inputs: [], links: [], texts: [] };
        document.querySelectorAll('button, [role="button"]').forEach(el => {
          result.buttons.push({ text: el.textContent.trim().slice(0, 60), tag: el.tagName });
        });
        document.querySelectorAll('input, [type="tel"]').forEach(el => {
          result.inputs.push({ id: el.id, type: el.type, name: el.name, ph: el.placeholder });
        });
        document.querySelectorAll('a').forEach(el => {
          result.links.push({ text: el.textContent.trim().slice(0, 40), href: (el.href || '').slice(0, 80) });
        });
        // Get all visible text blocks
        document.querySelectorAll('h1, h2, p, span, div').forEach(el => {
          const t = el.textContent.trim();
          if (t.length > 5 && t.length < 200 && el.children.length === 0) result.texts.push(t);
        });
        return result;
      });
      console.log('    🔍 Page elements:', JSON.stringify(pvElements, null, 2));
      
      // Look for phone number input fields
      const hasPhoneInput = pvElements.inputs.some(i => 
        i.type === 'tel' || i.id?.includes('phone') || i.name?.includes('phone') || 
        i.ph?.toLowerCase().includes('phone'));
      
      if (hasPhoneInput) {
        console.log('    📞 Phone number input found! Starting 5sim flow...');
        // Phone input available — use 5sim to enter number and verify
        if (!SMS_API_KEY) {
          return { status: 'error:phone_required_no_api_key', cost: totalCost };
        }
        // Will fall through to regular phone verification handler below
      } else {
        // No phone input — try clicking action buttons (Send SMS, Verify, etc.)
        console.log('    🔄 No phone input — trying action buttons...');
        
        // Try skip first
        const skipClicked = await findAndClick(driver, [
          '//span[contains(text(),"Skip")]/..',
          '//span[contains(text(),"Not now")]/..',
          '//span[contains(text(),"Later")]/..',
          '//button[contains(text(),"Skip")]',
          '//a[contains(text(),"skip")]',
        ], 'Skip verification');
        
        if (skipClicked) {
          console.log('    ✅ Verification skipped!');
          await delay(randomInt(3000, 5000));
        } else {
          // Try Send SMS / Verify buttons
          const actionClicked = await findAndClick(driver, [
            '//span[contains(text(),"Send")]/..',
            '//span[contains(text(),"Verify")]/..',
            '//button[contains(text(),"Send")]',
            '//button[contains(text(),"Verify")]',
            '//span[contains(text(),"Continue")]/..',
          ], 'Send SMS / Verify');
          
          if (actionClicked) {
            // V24: After clicking Send SMS, handle messaging app switch
            console.log('    \u{1f4e1} Waiting for SMS send attempt...');
            await delay(3000);
            
            // Check what app is in foreground
            let fgActivity = '';
            try {
              fgActivity = execSync(`adb -s localhost:5555 shell dumpsys activity activities 2>&1 | grep -i 'mResumedActivity\\|mFocusedActivity' | head -3`, { timeout: 10000, encoding: 'utf-8' });
            } catch(e) { fgActivity = String(e.stdout || e.message); }
            console.log('    \u{1f4cc} Foreground:', fgActivity.trim().slice(0, 200));
            
            // Check if messaging app opened
            const isMsgApp = fgActivity.includes('messaging') || fgActivity.includes('mms') || fgActivity.includes('sms') || fgActivity.includes('Messaging');
            if (isMsgApp) {
              console.log('    \u{1f4f1} Messaging app detected! Trying to read SMS content and click Send...');
              // Dump UI to read the pre-composed SMS
              let uiDump = '';
              try {
                execSync(`adb -s localhost:5555 shell uiautomator dump /sdcard/sms_dump.xml 2>&1`, { timeout: 10000 });
                uiDump = execSync(`adb -s localhost:5555 shell cat /sdcard/sms_dump.xml 2>&1`, { timeout: 10000, encoding: 'utf-8' });
              } catch(e) { uiDump = String(e.stdout || e.message); }
              const uiTexts = [...(String(uiDump).matchAll(/text="([^"]+)"/g) || [])].map(m => m[1]).filter(t => t && t !== '');
              console.log('    \u{1f4cb} Messaging app UI texts:', JSON.stringify(uiTexts.slice(0, 20)));
              
              // Try to find and click Send button in messaging app
              try {
                // Common send button resource IDs
                const sendBtnIds = [
                  'com.google.android.apps.messaging:id/send_message_button_icon',
                  'com.android.mms:id/send_button_sms',
                  'android:id/button1',
                ];
                let sent = false;
                for (const btnId of sendBtnIds) {
                  try {
                    execSync(`adb -s localhost:5555 shell input tap $(adb -s localhost:5555 shell uiautomator dump /dev/tty 2>/dev/null | grep -oP 'resource-id="${btnId}".*?bounds="\\[\\d+,\\d+\\]\\[\\d+,\\d+\\]"' | head -1 | grep -oP '\\d+' | head -2 | awk 'NR==1{x=$1} NR==2{print int((x+$1)/2), int((prev+$1)/2)} {prev=$1}')`, { timeout: 15000, encoding: 'utf-8' });
                    sent = true;
                    break;
                  } catch (_) {}
                }
                if (!sent) {
                  // Fallback: tap common Send button coordinates (bottom-right)
                  console.log('    \u{1f4f2} Trying tap at common Send button position...');
                  execSync(`adb -s localhost:5555 shell input tap 620 1200`, { timeout: 5000 });
                }
                console.log('    \u2705 Attempted to send SMS via messaging app');
                await delay(5000);
              } catch(e) {
                console.log(`    \u26a0\ufe0f Messaging app interaction failed: ${e.message.slice(0, 60)}`);
              }
              
              // Switch back to Chrome
              try {
                execSync(`adb -s localhost:5555 shell am start -n com.android.chrome/com.google.android.apps.chrome.Main`, { timeout: 10000 });
                await delay(3000);
              } catch(_) {}
            } else {
              console.log('    \u{1f310} Still in Chrome (no messaging app switch)');
              // Check SMS content provider anyway
              let smsContent = '';
              try {
                smsContent = execSync(`adb -s localhost:5555 shell content query --uri content://sms 2>&1`, { timeout: 10000, encoding: 'utf-8' });
              } catch(e) { smsContent = String(e.stdout || e.message); }
              if (!smsContent.includes('No result found')) {
                console.log('    \u{1f4f1} SMS found:', smsContent.trim().slice(0, 500));
              }
            }
            
            // V24: Quick 5sim check (30s instead of 2min — device verification rarely sends TO our number)
            if (devicePhoneOrder?.id && SMS_API_KEY) {
              console.log(`    \u{1f4f1} Quick 5sim check for device phone: ${devicePhoneOrder.fullPhone || devicePhoneOrder.phone}...`);
              for (let smsAttempt = 0; smsAttempt < 3; smsAttempt++) {
                await delay(10000);
                try {
                  const smsResult = await checkSms(SMS_API_KEY, devicePhoneOrder.id);
                  if (smsResult?.sms?.length > 0) {
                    const smsEntry = smsResult.sms[smsResult.sms.length - 1];
                    const code = String(smsEntry.code || smsEntry.text || '').trim();
                    console.log(`    \u{1f4e8} 5sim SMS received! Code: ${code}`);
                    // Try entering code if input appeared
                    const codeInputs = await driver.$$('input[type="tel"], input[type="text"], input[type="number"]');
                    for (const inp of codeInputs) {
                      try {
                        if (await inp.isDisplayed()) {
                          await inp.clearValue();
                          await humanType(inp, code);
                          await findAndClick(driver, ['//span[contains(text(),"Next")]/..', '//button[contains(text(),"Verify")]'], 'Verify code');
                          await delay(5000);
                          const postUrl = await driver.getUrl();
                          if (postUrl.includes('mail.google') || postUrl.includes('myaccount')) {
                            try { await finishNumber(SMS_API_KEY, devicePhoneOrder.id); } catch {}
                            return { status: 'created:appium-devicephone', cost: totalCost };
                          }
                          break;
                        }
                      } catch {}
                    }
                    break;
                  }
                } catch (e) {
                  console.log(`    \u26a0\ufe0f 5sim check: ${e.message.slice(0, 60)}`);
                }
              }
              console.log('    \u274c No SMS received via 5sim device phone (30s timeout)');
            }
            
            // Continue with Try Again loop
            await delay(10000);
            await safeScreenshot(driver, `${username}-06-verify-attempt-1`);
            for (let tryAgainAttempt = 2; tryAgainAttempt <= 3; tryAgainAttempt++) {
              console.log(`    \u{1f4e8} Waiting for SMS send to time out (attempt ${tryAgainAttempt}/3)...`);
              await delay(15000);
              await safeScreenshot(driver, `${username}-06-verify-attempt-${tryAgainAttempt}`);
              // Full page analysis after timeout
              const verifyState = await driver.execute(function() {
                const result = { buttons: [], inputs: [], links: [], allText: '' };
                document.querySelectorAll('button, [role="button"]').forEach(el => {
                  result.buttons.push(el.textContent.trim().slice(0, 60));
                });
                document.querySelectorAll('input, [type="tel"]').forEach(el => {
                  result.inputs.push({ id: el.id, type: el.type, name: el.name, ph: el.placeholder });
                });
                document.querySelectorAll('a').forEach(el => {
                  result.links.push(el.textContent.trim().slice(0, 60));
                });
                result.allText = document.body?.innerText?.slice(0, 500) || '';
                return result;
              });
              const verifyUrl = await driver.getUrl();
              console.log(`    📍 URL: ${verifyUrl.split('?')[0]}`);
              console.log(`    🔍 Buttons: ${JSON.stringify(verifyState.buttons)}`);
              console.log(`    🔍 Inputs: ${JSON.stringify(verifyState.inputs)}`);
              console.log(`    🔍 Links: ${JSON.stringify(verifyState.links)}`);
              
              // Check if phone input appeared
              const hasPhone = verifyState.inputs.some(i => 
                i.type === 'tel' || i.id?.includes('phone') || i.name?.includes('phone'));
              if (hasPhone) {
                console.log('    📞 Phone input appeared! Breaking out to use 5sim...');
                break; // Will fall through to regular phone verification
              }
              
              // Check if page changed to something useful
              if (verifyUrl.includes('mail.google') || verifyUrl.includes('myaccount.google') ||
                  verifyState.allText.includes('Inbox') || verifyState.allText.includes('Primary')) {
                console.log('    ✅ Account appears active!');
                return { status: 'created:appium', cost: totalCost };
              }
              
              // Look for "Try Again" link and click it
              const tryAgainClicked = await findAndClick(driver, [
                '//button[contains(text(),"Try Again")]',
                '//button[contains(text(),"Try again")]',
                '//a[contains(text(),"Try Again")]',
                '//a[contains(text(),"Try again")]',
                '//span[contains(text(),"Try Again")]/..',
                '//span[contains(text(),"Try again")]/..',
                '//button[contains(text(),"Resend")]',
                '//a[contains(text(),"Resend")]',
              ], 'Try Again');
              
              if (tryAgainClicked) {
                console.log(`    🔄 Clicked Try Again (attempt ${tryAgainAttempt})`);
                await delay(randomInt(3000, 5000));
                
                // Check if page changed after Try Again
                const afterRetryUrl = await driver.getUrl();
                console.log(`    📍 After retry URL: ${afterRetryUrl.split('?')[0]}`);
                
                // If back to consent page, click Send SMS again
                if (afterRetryUrl.includes('consent')) {
                  console.log('    🔄 Back to consent page — clicking Send SMS again...');
                  await findAndClick(driver, [
                    '//span[contains(text(),"Send")]/..',
                    '//button[contains(text(),"Send")]',
                  ], 'Send SMS again');
                  await delay(2000);
                }
              } else {
                console.log(`    ⚠️ No Try Again button found at attempt ${tryAgainAttempt}`);
              }
            }
            
            // After retry loop, last resort: check Gmail
            console.log('    🔄 Retry loop exhausted. Checking Gmail...');
            await driver.navigateTo('https://mail.google.com');
            await delay(randomInt(5000, 8000));
            const gmailUrl = await driver.getUrl();
            const gmailText = await getPageText(driver);
            await safeScreenshot(driver, `${username}-06-gmail-final`);
            console.log(`    📍 Gmail URL: ${gmailUrl.split('?')[0]}`);
            
            if (gmailUrl.includes('mail.google.com/mail') || 
                gmailText.includes('Primary') || gmailText.includes('Inbox')) {
              return { status: 'created:appium', cost: totalCost };
            }
            return { status: 'error:device_verification_stuck', cost: totalCost };
          } else {
            console.log('    ❌ No actionable buttons found on verification page');
            return { status: 'error:device_verification_no_buttons', cost: totalCost };
          }
        }
      }
    } else {
      // Regular phone verification flow
      // Try skip phone first
      const skipClicked = await findAndClick(driver, [
        '//span[contains(text(),"Skip")]/..',
        '//span[contains(text(),"건너뛰기")]/..',
        '//button[contains(text(),"Skip")]',
        '//a[contains(text(),"Skip")]',
      ], 'Skip phone');

      if (skipClicked) {
        console.log('    ✅ Phone verification skipped!');
        await delay(randomInt(3000, 5000));
      } else if (pageText.includes('phone') || pageText.includes('전화') || pageText.includes('номер')) {
        // Phone verification required
        console.log('    📱 Phone verification required');

        if (!SMS_API_KEY) {
          return { status: 'error:phone_required_no_api_key', cost: totalCost };
        }

        const phoneResult = await handlePhoneVerification(driver, username);
        totalCost += phoneResult.cost;
        if (phoneResult.failed) {
          return { status: phoneResult.status, cost: totalCost };
        }
      }
    }

    // Step 7: Agree to terms
    console.log("  📝 Step 7: Accept terms");
    await delay(randomInt(2000, 4000));
    pageText = await getPageText(driver);

    // Handle consent/terms pages — break early if we leave terms
    for (let termsAttempt = 0; termsAttempt < 3; termsAttempt++) {
      // Only click actual terms/agree buttons, NOT generic 'Next'
      const agreeClicked = await findAndClick(driver, [
        '//span[contains(text(),"I agree")]/..',
        '//span[contains(text(),"동의")]/..',
        '//button[contains(text(),"I agree")]',
        '//button[contains(text(),"Agree")]',
        '//span[contains(text(),"Accept")]/..',
        '//button[contains(text(),"Accept")]',
        '//span[contains(text(),"Confirm")]/..',
      ], "Agree/Accept");
      
      if (agreeClicked) {
        await delay(randomInt(3000, 5000));
        // Check if we left the terms page
        const postUrl = await driver.getUrl();
        pageText = await getPageText(driver);
        const leftTerms = 
          postUrl.includes('myaccount') ||
          postUrl.includes('mail.google') ||
          postUrl.includes('gds.google') ||
          postUrl.includes('devicephoneverification') ||
          postUrl.includes('phoneverification') ||
          postUrl.includes('signin') ||
          postUrl.includes('Welcome') ||
          pageText.includes('Verify your phone');
        if (leftTerms) {
          console.log(`    ✅ Left terms page → ${postUrl.split('?')[0]}`);
          break;
        }
      } else {
        break;
      }
    }

    await safeScreenshot(driver, `${username}-07-final`);

    // Step 8: Check if account was created
    console.log("  \u{1f4dd} Step 8: Verify account creation");
    let currentUrl = await driver.getUrl();
    pageText = await getPageText(driver);
    
    // Handle device phone verification consent page (appears after terms on emulator)
    if (currentUrl.includes('devicephoneverification') || currentUrl.includes('phoneverification')) {
      console.log('    \u{1f4f1} Device phone verification page detected');
      
      // Try scrolling down to find Skip/Not now
      for (const skipText of ['Skip', 'Not now', 'Later', '\uac74\ub108\ub6f0\uae30', '\ub098\uc911\uc5d0']) {
        const skipped = await findAndClick(driver, [
          `//span[contains(text(),"${skipText}")]/..`,
          `//a[contains(text(),"${skipText}")]`,
          `//button[contains(text(),"${skipText}")]`,
          `//div[contains(text(),"${skipText}")]`,
        ], `Skip device verify (${skipText})`);
        if (skipped) {
          await delay(randomInt(3000, 5000));
          break;
        }
      }
      
      // Check URL after skip attempt
      currentUrl = await driver.getUrl();
      pageText = await getPageText(driver);
      
      // If still on verification page, try navigating directly to Gmail
      if (currentUrl.includes('phoneverification') || currentUrl.includes('devicephone')) {
        console.log('    \u{1f310} No skip found. Navigating to Gmail to check if account is active...');
        await driver.url('https://mail.google.com');
        await delay(randomInt(5000, 8000));
        currentUrl = await driver.getUrl();
        pageText = await getPageText(driver);
        await safeScreenshot(driver, `${username}-08-gmail-check`);
        console.log(`    \u{1f310} Gmail check URL: ${currentUrl.split('?')[0]}`);
      }
    }
    
    const success =
      currentUrl.includes('myaccount.google.com') ||
      currentUrl.includes('gds.google.com') ||
      currentUrl.includes('mail.google.com') ||
      currentUrl.includes('inbox') ||
      pageText.includes('Welcome') ||
      pageText.includes('\ud658\uc601\ud569\ub2c8\ub2e4') ||
      pageText.includes('Your new account') ||
      pageText.includes('Get started') ||
      pageText.includes('Primary') ||
      pageText.includes('Inbox') ||
      pageText.includes('Compose');
    
    if (success) {
      console.log(`  \u2705 Account created successfully: ${email}`);
      return { status: 'success', cost: totalCost };
    }
    
    // Check for specific failure states
    if (pageText.includes("Couldn't create") || pageText.includes('cannot create') ||
        pageText.includes('\ub9cc\ub4e4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4')) {
      return { status: 'error:cannot_create', cost: totalCost };
    }
    
    console.log(`    \u2753 Unclear final state. URL: ${currentUrl.split('?')[0]}`);
    await safeScreenshot(driver, `${username}-08-unclear`);
    return { status: `manual-check:${currentUrl.split('?')[0]}`, cost: totalCost };

  } catch (err) {
    console.log(`    ❌ Error: ${err.message.slice(0, 120)}`);
    await safeScreenshot(driver, `${username}-error`);

    // Clean up pending 5sim order
    if (activePhoneId && SMS_API_KEY) {
      try {
        await cancelNumber(SMS_API_KEY, activePhoneId);
        console.log(`    🧹 Cancelled pending phone order: ${activePhoneId}`);
      } catch {}
    }

    // Clean up device phone 5sim order
    if (devicePhoneOrder?.id && SMS_API_KEY) {
      try {
        await cancelNumber(SMS_API_KEY, devicePhoneOrder.id);
        console.log(`    \u{1f9f9} Cancelled device phone order: ${devicePhoneOrder.id}`);
      } catch {}
    }

    return { status: `error:${err.message.slice(0, 80)}`, cost: totalCost };
  }
}

// ── Phone Verification Handler ──────────────────────────────────────
async function handlePhoneVerification(driver, username) {
  let totalCost = 0;
  let activePhoneId = null;

  try {
    const operator = await getBestOperator(SMS_API_KEY, FIVESIM_REGION);
    console.log(`    📱 Using operator: ${operator} (region: ${FIVESIM_REGION})`);

    for (let attempt = 1; attempt <= 5; attempt++) {
      let order;
      try {
        order = await buyNumber(SMS_API_KEY, FIVESIM_REGION, operator);
        if (!order?.id || !order?.phone) throw new Error("Invalid order");
      } catch (err) {
        console.log(`    ⚠️ Buy number failed (${attempt}/5): ${err.message.slice(0, 100)}`);
        if (attempt < 5) { await delay(2000); continue; }
        return { cost: totalCost, failed: true, status: "error:buy_number_failed" };
      }

      activePhoneId = order.id;
      totalCost += extractOrderCost(order);
      const countryCode = REGION_COUNTRY_CODE[FIVESIM_REGION] || "";
      const fullPhone = countryCode ? `${countryCode}${order.phone}` : order.phone;

      console.log(`    📱 Number ${attempt}/5: ${fullPhone} (id=${order.id})`);

      // Find and fill phone input
      const phoneSelectors = [
        '#phoneNumberId', 'input[name="phoneNumber"]', 'input[type="tel"]',
        'input[autocomplete="tel"]',
      ];
      let phoneInput = null;
      for (const sel of phoneSelectors) {
        try {
          const el = await driver.$(sel);
          if (await el.isExisting() && await el.isDisplayed()) {
            phoneInput = el;
            break;
          }
        } catch {}
      }

      if (!phoneInput) {
        console.log("    ❌ Phone input not found");
        await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
        activePhoneId = null;
        return { cost: totalCost, failed: true, status: "error:no_phone_input" };
      }

      await phoneInput.clearValue();
      await humanType(phoneInput, fullPhone);
      await delay(randomInt(500, 800));

      await findAndClick(driver, [
        '//span[contains(text(),"Next")]/..',
        '//button[contains(text(),"Next")]',
        '//span[contains(text(),"다음")]/..',
      ], "Next (phone)");

      await delay(randomInt(8000, 12000));

      // Check if phone was rejected
      const pageText = await getPageText(driver);
      if (pageText.includes("cannot be used") || pageText.includes("사용할 수 없습니다") ||
          pageText.includes("нельзя использовать")) {
        console.log("    ⚠️ Phone rejected. Trying next...");
        await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
        activePhoneId = null;
        await delay(randomInt(1000, 2000));
        continue;
      }

      // Poll for SMS code
      console.log("    ⏳ Polling for SMS code...");
      let code = "";
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        try {
          const smsResult = await checkSms(SMS_API_KEY, order.id);
          if (smsResult?.sms?.length > 0) {
            const smsEntry = smsResult.sms[smsResult.sms.length - 1];
            code = String(smsEntry.code || "").trim();
            if (code) {
              console.log(`    📨 SMS received: ${code}`);
              break;
            }
          }
          if (smsResult.status === "RECEIVED") {
            code = String(smsResult.sms?.[0]?.code || "").trim();
            if (code) {
              console.log(`    📨 SMS received: ${code}`);
              break;
            }
          }
        } catch (e) {
          console.log(`    ⚠️ SMS check error: ${e.message.slice(0, 60)}`);
        }
        await delay(5000);
      }

      if (!code) {
        console.log("    ⏰ SMS timeout. Cancelling and trying next...");
        await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      // Enter code
      const codeSelectors = ['#code', 'input[name="code"]', 'input[type="tel"][inputmode="numeric"]'];
      let codeInput = null;
      for (const sel of codeSelectors) {
        try {
          const el = await driver.$(sel);
          if (await el.isExisting() && await el.isDisplayed()) {
            codeInput = el;
            break;
          }
        } catch {}
      }

      if (codeInput) {
        await codeInput.clearValue();
        await humanType(codeInput, code);
        await delay(randomInt(500, 800));

        await findAndClick(driver, [
          '//span[contains(text(),"Next")]/..',
          '//span[contains(text(),"Verify")]/..',
          '//button[contains(text(),"Next")]',
          '//button[contains(text(),"Verify")]',
        ], "Next/Verify (code)");

        await delay(randomInt(5000, 8000));
      }

      // Finish the 5sim order
      await finishNumber(SMS_API_KEY, activePhoneId).catch(() => {});
      activePhoneId = null;

      return { cost: totalCost, failed: false };
    }

    return { cost: totalCost, failed: true, status: "error:all_phone_attempts_exhausted" };

  } catch (err) {
    if (activePhoneId) {
      await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
    }
    return { cost: totalCost, failed: true, status: `error:phone_${err.message.slice(0, 60)}` };
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !SMS_API_KEY) {
    console.log("⚠️  No SMS API key. Phone verification will fail if Google requires it.");
    console.log("   Use --api-key <key> or set FIVESIM_API_KEY env var.\n");
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Google Account Creator — Appium + Docker Emulator");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Count:    ${COUNT}`);
  console.log(`  Password: ${"*".repeat(PASSWORD.length)}`);
  console.log(`  Mode:     ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  Appium:   ${APPIUM_HOST}:${APPIUM_PORT}`);
  console.log(`  Device:   ${ADB_DEVICE}`);
  console.log(`  SMS:      region=${FIVESIM_REGION} apiKey=${SMS_API_KEY ? "set" : "unset"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Generate random accounts
  const accounts = [];
  for (let i = 0; i < COUNT; i++) {
    const firstName = randomPick(US_FIRST_NAMES);
    const lastName = randomPick(US_LAST_NAMES);
    const username = generateRandomUsername(firstName, lastName);
    accounts.push({ username, firstName, lastName });
  }

  if (DRY_RUN) {
    console.log("📋 Preview (dry run):\n");
    console.log("Username            | Email                         | First      | Last");
    console.log("────────────────────|───────────────────────────────|────────────|────────");
    for (const { username, firstName, lastName } of accounts) {
      console.log(
        `${username.padEnd(20)}| ${(username + "@gmail.com").padEnd(30)}| ${firstName.padEnd(11)}| ${lastName}`
      );
    }
    console.log(`\nTotal: ${accounts.length} accounts`);
    return;
  }

  // Check 5sim balance
  if (SMS_API_KEY) {
    try {
      const balance = await getFiveSimBalance(SMS_API_KEY);
      console.log(`💰 5sim balance (start): ${balance.toFixed(4)}\n`);
    } catch (err) {
      console.log(`⚠️ 5sim balance check failed: ${err.message.slice(0, 100)}\n`);
    }
  }

  initCsv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let successCount = 0;
  let failCount = 0;
  let totalSmsCost = 0;

  for (let idx = 0; idx < accounts.length; idx++) {
    const { username, firstName, lastName } = accounts[idx];
    const email = `${username}@gmail.com`;

    console.log(`\n[${idx + 1}/${accounts.length}] Creating ${email} (${firstName} ${lastName})`);

    // Restart Docker container for fresh device identity
    // Google fingerprints at OS/hardware level — only a full container restart works
    // (V7 first-ever attempt succeeded; V8-V12 with data-clear-only all failed)
    if (SKIP_RESTART) {
      console.log('  ⏭️  Skipping Docker restart (--no-restart)');
    } else {
      try {
        await resetDockerEmulator();
      } catch (e) {
        console.log(`  ❌ Emulator restart failed: ${e.message.slice(0, 80)}`);
        failCount++;
        appendCsv({
          username, email, password: PASSWORD, firstName, lastName,
          cost: 0, status: 'error:emulator_restart_failed', timestamp: new Date().toISOString(),
        });
        continue;
      }
    }

    // V22: Buy 5sim number and set as emulator's device phone number
    // Theory: Google may verify device phone by sending SMS TO the device's number
    let devicePhoneOrder = null;
    if (SMS_API_KEY) {
      try {
        const operator = await getBestOperator(SMS_API_KEY, FIVESIM_REGION);
        const order = await buyNumber(SMS_API_KEY, FIVESIM_REGION, operator);
        const cc = REGION_COUNTRY_CODE[FIVESIM_REGION] || '';
        const fullPhone = `${cc}${order.phone}`.replace(/\+/g, '');
        // Get telnet auth token from inside Docker container
        const authToken = execSync(`docker exec ${DOCKER_CONTAINER} cat /home/androidusr/.emulator_console_auth_token 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 }).trim();
        // Set phone number on emulator via telnet console
        execSync(`{ echo 'auth ${authToken}'; sleep 0.3; echo 'phonenumber ${fullPhone}'; sleep 0.3; echo 'quit'; } | nc -q 2 localhost 5554`, { timeout: 10000 });
        devicePhoneOrder = { ...order, fullPhone: `+${fullPhone}` };
        totalSmsCost += extractOrderCost(order);
        console.log(`  \u{1f4f1} Device phone set to 5sim: +${fullPhone} (order ${order.id}, cost ${extractOrderCost(order).toFixed(4)})`);
      } catch (e) {
        console.log(`  \u26a0\ufe0f Device phone setup failed: ${e.message.slice(0, 80)}`);
      }
    }

    let driver = null;
    try {
      driver = await createDriver();
      const result = await createAccount(driver, username, firstName, lastName, devicePhoneOrder);

      totalSmsCost += Number(result.cost || 0);

      const row = {
        username,
        email,
        password: PASSWORD,
        firstName,
        lastName,
        cost: result.cost || 0,
        status: result.status,
        timestamp: new Date().toISOString(),
      };

      appendCsv(row);

      if (result.status === "success") {
        successCount++;
        console.log(`  ✅ SUCCESS: ${email}`);
      } else {
        failCount++;
        console.log(`  ❌ FAILED: ${email} — ${result.status}`);
      }
    } catch (err) {
      failCount++;
      console.log(`  ❌ FATAL: ${err.message.slice(0, 120)}`);
      appendCsv({
        username, email, password: PASSWORD, firstName, lastName,
        cost: 0, status: `error:${err.message.slice(0, 80)}`, timestamp: new Date().toISOString(),
      });
    } finally {
      if (driver) {
        try { await driver.deleteSession(); } catch {}
      }
      // V22: Cancel unused device phone order
      if (devicePhoneOrder?.id && SMS_API_KEY) {
        try { await cancelNumber(SMS_API_KEY, devicePhoneOrder.id).catch(() => {}); } catch {}
      }
    }

    // Short cooldown between accounts (container restart already takes ~2min)
    if (idx < accounts.length - 1) {
      const waitSec = randomInt(5, 15);
      console.log(`  \u23f3 Cooldown ${waitSec}s before next account...`);
      await delay(waitSec * 1000);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Done! ✅ ${successCount} success | ❌ ${failCount} failed`);
  console.log(`  SMS Cost: ${totalSmsCost.toFixed(4)}`);
  console.log(`  Results saved to: ${CSV_FILE}`);
  console.log("═══════════════════════════════════════════════════════");

  if (SMS_API_KEY) {
    try {
      const endBalance = await getFiveSimBalance(SMS_API_KEY);
      console.log(`💰 5sim balance (end): ${endBalance.toFixed(4)}`);
    } catch {}
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
