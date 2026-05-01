#!/usr/bin/env node
/**
 * OpenAI Account Creator — Playwright Automation
 *
 * Creates OpenAI accounts with email pattern qws943[01-50]@gmail.com
 * Password: bingogo1
 * Names: Random US names
 * 5sim.net: SMS verification integration for OpenAI phone verification
 *
 * Anti-detection:
 *   - rebrowser-playwright (CDP leak patches)
 *   - ghost-cursor (Bezier mouse movements)
 *   - Human-like typing with variable delays
 *   - Fresh browser per account
 *   - Randomized fingerprints (viewport, UA, locale, timezone)
 *   - Extended inter-account delays (60-120s)
 *
 * Usage:
 *   node openai/create-accounts.mjs --dry-run                                  # preview only
 *   xvfb-run node openai/create-accounts.mjs --start 1 --end 5 --api-key <key> # create 5 accounts
 *   xvfb-run node openai/create-accounts.mjs --api-key <key> --region russia   # all 50
 */

// -- Rebrowser anti-CDP-leak patches --------------------------------
process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";
process.env.REBROWSER_PATCHES_UTILITY_WORLD_NAME = "util";
process.env.REBROWSER_PATCHES_SOURCE_URL = "jquery.min.js";

import { chromium } from "rebrowser-playwright";
import { createCursor } from "ghost-cursor-playwright";
import { writeFileSync, existsSync, readFileSync, mkdirSync, appendFileSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";
import { createSmsProvider } from '../lib/sms-provider.mjs';
import { createBehaviorProfile } from '../lib/behavior-profile.mjs';

// ── Config ──────────────────────────────────────────────────────────
const PASSWORD = "bingogo1";
const PREFIX = "qws943";
const EMAIL_DOMAIN = "gmail.com";

const CSV_FILE = join(import.meta.dirname, "..", "openai-accounts.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "..", "screenshots", "openai");
const DEFAULT_5SIM_REGION = "russia";

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

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUSName() {
  return {
    firstName: randomPick(US_FIRST_NAMES),
    lastName: randomPick(US_LAST_NAMES),
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
const CDP_MODE = args.includes("--cdp");
const FIVESIM_API_KEY = getArg("api-key", process.env.FIVESIM_API_KEY || "").trim();
const SMS_PROVIDER = getArg("sms-provider", process.env.SMS_PROVIDER || "5sim").trim().toLowerCase();
const SMS_API_KEY = getArg("sms-key", "").trim() || FIVESIM_API_KEY;
const FIVESIM_REGION = getArg("region", process.env.FIVESIM_REGION || DEFAULT_5SIM_REGION).trim();
const SMS_REGION = getArg("sms-region", "").trim() || FIVESIM_REGION;
const PREFIX_OVERRIDE = getArg("prefix", PREFIX);

// ── Utilities ───────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

function appendCsv(row) {
  const line = `${row.timestamp},${row.email},${row.password},${row.firstName},${row.lastName},${row.phone},${row.status},${row.error || ""}\n`;
  appendFileSync(CSV_FILE, line, "utf8");
}

function initCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, "timestamp,email,password,firstName,lastName,phone,status,error\n", "utf8");
  }
}

// ── Anti-Detection Profile ──────────────────────────────────────────
function generateProfile() {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
  ];
  const viewport = randomPick(viewports);
  const locales = ["en-US", "en-GB", "en-CA", "en-AU"];
  const timezones = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];

  return {
    viewport,
    locale: randomPick(locales),
    timezoneId: randomPick(timezones),
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

// ── Stealth Chrome Args ──────────────────────────────────────────────
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-infobars",
  "--disable-features=IsolateOrigins,site-per-process,WebRtcHideLocalIpsWithMdns",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-web-security",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-component-update",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
];

// Launch real Chrome for CDP mode — uses xvfb-run for headed mode to bypass Cloudflare Turnstile
function launchRealChrome(cdpPort) {
  const chromeArgs = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/openai-chrome-profile-${Date.now()}`,
    ...STEALTH_ARGS,
    '--window-size=1920,1080',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    'about:blank',
  ];

  log(`CDP Mode: Launching real Chrome on port ${cdpPort} (headed via xvfb-run)...`);

  // Always use xvfb-run for headed mode — Cloudflare Turnstile requires non-headless Chrome
  const chromeProc = spawn('xvfb-run', [
    '--auto-servernum',
    '--server-args=-screen 0 1920x1080x24',
    '/usr/bin/google-chrome-stable',
    ...chromeArgs,
  ], {
    stdio: 'ignore',
    detached: true,
  });

  return new Promise((resolve) => {
    setTimeout(() => resolve(chromeProc), 5000);
  });
}

// ── Browser Launch ───────────────────────────────────────────────────
async function launchBrowser(headed = false) {
  const profile = generateProfile();
  let browser, chromeProc = null;

  if (CDP_MODE) {
    // CDP: Launch real Chrome and attach via DevTools protocol
    const cdpPort = 9222 + Math.floor(Math.random() * 1000);
    chromeProc = await launchRealChrome(cdpPort);
    // Retry CDP connection up to 3 times
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        log(`  CDP connection attempt ${attempt + 1} failed, retrying in 3s...`);
        await sleep(3000);
      }
    }
    log('  Connected to Chrome via CDP');
  } else {
    // Standard: Use real Chrome binary with Playwright (avoids headless_shell issues)
    browser = await chromium.launch({
      headless: !headed,
      executablePath: '/usr/bin/google-chrome-stable',
      args: !headed ? [...STEALTH_ARGS, '--window-size=1920,1080', '--headless=new'] : [...STEALTH_ARGS, '--window-size=1920,1080'],
    });
  }

  const context = CDP_MODE ? browser.contexts()[0] || await browser.newContext({
    viewport: profile.viewport,
    locale: profile.locale,
    timezoneId: profile.timezoneId,
    userAgent: profile.userAgent,
  }) : await browser.newContext({
    viewport: profile.viewport,
    locale: profile.locale,
    timezoneId: profile.timezoneId,
    userAgent: profile.userAgent,
  });

  const page = CDP_MODE ? context.pages()[0] || await context.newPage() : await context.newPage();
  let cursor = null;
  try {
    cursor = await createCursor(page);
  } catch (e) {
    log(`Warning: ghost-cursor init failed: ${e.message}`);
  }

  // Inject anti-detection script
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    window.chrome = { runtime: {} };
  });

  return { browser, context, page, cursor, profile, chromeProc };
}

// ── Human-like Typing ────────────────────────────────────────────────
async function humanType(page, selector, text, cursor) {
  if (cursor) {
    try {
      await cursor.actions.click({ target: selector });
    } catch {
      await page.locator(selector).first().click();
    }
  } else {
    await page.locator(selector).first().click();
  }
  await sleep(randomInt(100, 300));

  for (const char of text) {
    await page.keyboard.type(char, { delay: randomInt(30, 120) });
    if (Math.random() < 0.05) {
      await sleep(randomInt(50, 150));
    }
  }
  await sleep(randomInt(100, 300));
}

// ── SMS Verification ─────────────────────────────────────────────────
async function handlePhoneVerification(page, cursor, smsProvider) {
  log("Starting phone verification...");

  // Buy a number from SMS provider
  const order = await smsProvider.buyNumber("openai");
  log(`Purchased number: ${order.phone} (ID: ${order.id})`);

  // Enter phone number
  const phoneInput = await page.locator('input[type="tel"], input[name="phone"], input[placeholder*="phone" i]').first();
  if (!phoneInput) {
    throw new Error("Phone input not found");
  }

  // Clear and enter phone number
  await phoneInput.click();
  await phoneInput.fill("");
  await sleep(200);
  await humanType(page, 'input[type="tel"], input[name="phone"]', order.phone, cursor);
  await sleep(500);

  // Click send code button
  const sendCodeBtn = await page.locator('button:has-text("Send code"), button:has-text("Verify"), button[type="submit"]').first();
  if (sendCodeBtn) {
    await cursor.actions.click({ target: 'button:has-text("Send code"), button:has-text("Verify"), button[type="submit"]' });
    await sleep(2000);
  }

  // Wait for SMS
  log("Waiting for SMS code...");
  const smsResult = await smsProvider.waitForSms(order.id, {
    timeoutMs: 120000,
    pollIntervalMs: 5000,
    onPoll: (result) => {
      if (result) {
        log(`SMS status: ${result.status}`);
      }
    },
  });

  if (!smsResult || !smsResult.code) {
    await smsProvider.cancelNumber(order.id);
    throw new Error("SMS verification timeout or no code received");
  }

  log(`Received SMS code: ${smsResult.code}`);

  // Enter verification code
  const codeInput = await page.locator('input[type="text"], input[name="code"], input[placeholder*="code" i], input[inputmode="numeric"]').first();
  if (codeInput) {
    await humanType(page, 'input[type="text"], input[name="code"]', smsResult.code, cursor);
    await sleep(500);
  }

  // Click verify button
  const verifyBtn = await page.locator('button:has-text("Verify"), button:has-text("Continue"), button[type="submit"]').first();
  if (verifyBtn) {
    await cursor.actions.click({ target: 'button:has-text("Verify"), button:has-text("Continue"), button[type="submit"]' });
    await sleep(3000);
  }

  // Finish the number
  await smsProvider.finishNumber(order.id);

  return { success: true, phone: order.phone };
}

// ── Account Creation ─────────────────────────────────────────────────
async function createOpenAIAccount(email, password, firstName, lastName, smsProvider, screenshotDir) {
  const { browser, page, cursor, chromeProc } = await launchBrowser(HEADED);

  try {
    log(`Starting account creation for ${email}`);

    // Navigate to ChatGPT signup page
    await page.goto("https://chatgpt.com/", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await sleep(3000);

    // Handle Cloudflare Turnstile if present
    const pageContent = await page.content();
    if (pageContent.includes('Verify you are human') || pageContent.includes('cf-turnstile') || pageContent.includes('challenges.cloudflare.com')) {
      log('Cloudflare Turnstile detected — attempting to solve...');
      await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-00-turnstile.png`) });
      try {
        // Find and click the Turnstile checkbox inside the iframe
        const turnstileFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
        await turnstileFrame.locator('input[type="checkbox"], .mark').click({ timeout: 10000 });
        log('Clicked Turnstile checkbox');
        await sleep(5000);
      } catch (e) {
        log(`Turnstile checkbox click failed: ${e.message}`);
        // Try clicking in the general area of the checkbox via coordinates
        try {
          const iframe = await page.locator('iframe[src*="challenges.cloudflare.com"]').first();
          const box = await iframe.boundingBox();
          if (box) {
            await page.mouse.click(box.x + 30, box.y + box.height / 2);
            log('Clicked Turnstile via coordinates');
            await sleep(8000);
          }
        } catch (e2) {
          log(`Turnstile coordinate click also failed: ${e2.message}`);
        }
      }
      // Wait for page to load after Turnstile
      await sleep(5000);
      await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-00b-after-turnstile.png`) });
    }

    // Dismiss cookie banner if present
    try {
      const acceptCookies = page.locator('button:has-text("Accept all")');
      if (await acceptCookies.count() > 0) {
        await acceptCookies.click();
        await sleep(1000);
      }
    } catch (e) {
      log('No cookie banner found');
    }

    // Take screenshot of initial page
    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-01-initial.png`) });

    // Click "Sign up for free" button
    log("Clicking Sign up...");
    const signupBtn = page.locator('a:has-text("Sign up"), button:has-text("Sign up")').first();
    await signupBtn.click({ timeout: 10000 });
    await sleep(5000);

    // Take screenshot after clicking signup
    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-01b-after-signup-click.png`) });
    // Fill email
    log("Filling email...");
    const emailInput = await page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
    if (emailInput) {
      await humanType(page, 'input[type="email"]', email, cursor);
    }
    await sleep(500);

    // Click the submit Continue button (not social login buttons)
    log("Clicking Continue...");
    await page.locator('button[type="submit"]').click({ timeout: 10000 });
    await sleep(5000);

    // Handle Cloudflare Turnstile on auth page (appears after Continue)
    for (let turnstileAttempt = 0; turnstileAttempt < 3; turnstileAttempt++) {
      const authContent = await page.content();
      if (!authContent.includes('Verify you are human') && !authContent.includes('cf-turnstile') && !authContent.includes('turnstile')) break;
      log(`Turnstile detected on auth page (attempt ${turnstileAttempt + 1})...`);
      await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-02-turnstile-${turnstileAttempt}.png`) });

      // Try multiple iframe selectors
      let clicked = false;
      const iframeSelectors = [
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="turnstile"]',
        'iframe[src*="cloudflare"]',
        'iframe[title*="challenge"]',
        'iframe[title*="Widget"]',
      ];

      for (const sel of iframeSelectors) {
        try {
          const iframe = page.locator(sel).first();
          if (await iframe.count() > 0) {
            const box = await iframe.boundingBox({ timeout: 3000 });
            if (box) {
              // Click the checkbox area (left side of the Turnstile widget)
              await page.mouse.click(box.x + 25, box.y + box.height / 2);
              log(`Clicked Turnstile iframe (${sel}) at (${Math.round(box.x + 25)}, ${Math.round(box.y + box.height / 2)})`);
              clicked = true;
              break;
            }
          }
        } catch {}
      }

      if (!clicked) {
        // Fallback: click at the center of the page where checkbox typically appears
        const viewport = page.viewportSize();
        if (viewport) {
          const x = Math.round(viewport.width * 0.35);
          const y = Math.round(viewport.height * 0.47);
          await page.mouse.click(x, y);
          log(`Clicked at estimated Turnstile position (${x}, ${y})`);
        }
      }
      await sleep(8000);
    }

    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-02-after-email.png`) });
    // Fill password
    log("Filling password...");
    const passwordInput = await page.locator('input[type="password"], input[name="password"]').first();
    if (passwordInput) {
      await humanType(page, 'input[type="password"]', password, cursor);
    }
    await sleep(500);

    // Click submit
    log("Clicking Continue after password...");
    await page.locator('button[type="submit"]').click({ timeout: 10000 });
    await sleep(5000);

    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-03-after-password.png`) });

    // Check for "Verify you are human" (CAPTCHA)
    const captchaContent = await page.content();
    if (captchaContent.includes("Verify you are human") || captchaContent.includes("captcha") || captchaContent.includes("CAPTCHA")) {
      log("⚠️ CAPTCHA detected - manual intervention required");
      await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-04-captcha.png`) });

      if (!HEADED) {
        throw new Error("CAPTCHA detected in headless mode");
      }

      // Wait for manual CAPTCHA solving in headed mode
      log("Please solve the CAPTCHA manually...");
      await sleep(30000); // Give 30 seconds for manual solving
    }

    // Fill name fields if present
    log("Filling name...");
    const firstNameInput = await page.locator('input[name="firstName"], input[placeholder*="First" i], input[autocomplete="given-name"]').first();
    const lastNameInput = await page.locator('input[name="lastName"], input[placeholder*="Last" i], input[autocomplete="family-name"]').first();

    if (firstNameInput) {
      await humanType(page, 'input[name="firstName"], input[placeholder*="First" i]', firstName, cursor);
    }
    if (lastNameInput) {
      await humanType(page, 'input[name="lastName"], input[placeholder*="Last" i]', lastName, cursor);
    }
    await sleep(500);

    // Click continue after name
    if (firstNameInput || lastNameInput) {
      await page.locator('button[type="submit"]').click({ timeout: 10000 });
      await sleep(3000);
    }

    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-04-after-name.png`) });

    // Check for phone verification
    const hasPhoneVerification = await page.locator('input[type="tel"], input[name="phone"]').count() > 0;

    if (hasPhoneVerification && smsProvider) {
      log("Phone verification required");
      const phoneResult = await handlePhoneVerification(page, cursor, smsProvider);
      if (!phoneResult.success) {
        throw new Error("Phone verification failed");
      }
      await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-05-after-phone.png`) });
    }

    // Check for birthdate fields
    const hasBirthdate = await page.locator('input[name="birthday"], input[placeholder*="Birth" i], select[name*="month" i]').count() > 0;
    if (hasBirthdate) {
      log("Filling birthdate...");
      // Try to fill birthdate if fields exist
      const monthSelect = await page.locator('select[name*="month" i]').first();
      const dayInput = await page.locator('input[name*="day" i], select[name*="day" i]').first();
      const yearInput = await page.locator('input[name*="year" i]').first();

      if (monthSelect) {
        await monthSelect.selectOption("1"); // January
      }
      if (dayInput) {
        await dayInput.fill("15");
      }
      if (yearInput) {
        await yearInput.fill("1990");
      }

      await page.locator('button[type="submit"]').click({ timeout: 10000 });
      await sleep(3000);
    }

    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-06-final.png`) });

    // Check for success indicators
    const finalUrl = page.url();
    const finalContent = await page.content();

    const successIndicators = [
      "chat.openai.com",
      "verify your email",
      "check your email",
      "confirmation",
      "welcome",
    ];

    const isSuccess = successIndicators.some(indicator =>
      finalUrl.toLowerCase().includes(indicator) ||
      finalContent.toLowerCase().includes(indicator)
    );

    if (isSuccess) {
      log(`✅ Account created successfully for ${email}`);
      return { success: true, email, phone: null };
    } else {
      log(`⚠️ Account creation may have failed for ${email}. Final URL: ${finalUrl}`);
      return { success: false, email, error: "Unknown final state", url: finalUrl };
    }

  } catch (error) {
    log(`❌ Error creating account for ${email}: ${error.message}`);
    await page.screenshot({ path: join(screenshotDir, `${email.split('@')[0]}-error.png`) });
    return { success: false, email, error: error.message };
  } finally {
    await browser.close();
    if (chromeProc) {
      try { chromeProc.kill('SIGTERM'); } catch {}
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  log("=".repeat(60));
  log("OpenAI Account Creator");
  log("=".repeat(60));

  // Validate inputs
  if (!DRY_RUN && !SMS_API_KEY) {
    console.error("Error: --api-key or FIVESIM_API_KEY required (or use --dry-run)");
    process.exit(1);
  }

  // Initialize
  ensureDir(SCREENSHOT_DIR);
  initCsv();

  // Create SMS provider
  let smsProvider = null;
  if (!DRY_RUN && SMS_API_KEY) {
    smsProvider = createSmsProvider(SMS_PROVIDER, SMS_API_KEY, SMS_REGION);
    log(`SMS Provider: ${SMS_PROVIDER}, Region: ${SMS_REGION}`);

    // Check balance
    try {
      const balance = await smsProvider.getBalance();
      log(`SMS Provider Balance: $${balance.toFixed(2)}`);
      if (balance < 0.5) {
        console.error("Error: Insufficient SMS provider balance");
        process.exit(1);
      }
    } catch (e) {
      log(`Warning: Could not check SMS balance: ${e.message}`);
    }
  }

  // Generate account list
  const accounts = [];
  for (let i = START; i <= END; i++) {
    const num = String(i).padStart(2, "0");
    const email = `${PREFIX_OVERRIDE}${num}@${EMAIL_DOMAIN}`;
    const name = generateUSName();
    accounts.push({
      email,
      password: PASSWORD,
      firstName: name.firstName,
      lastName: name.lastName,
    });
  }

  log(`\nAccounts to create: ${accounts.length}`);
  log(`Range: ${PREFIX_OVERRIDE}${String(START).padStart(2, "0")} → ${PREFIX_OVERRIDE}${String(END).padStart(2, "0")}`);
  log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  log(`Output: ${CSV_FILE}`);
  log(`Screenshots: ${SCREENSHOT_DIR}`);
  log("");

  if (DRY_RUN) {
    log("DRY RUN - Accounts that would be created:");
    for (const acc of accounts) {
      log(`  ${acc.email} | ${acc.firstName} ${acc.lastName}`);
    }
    log("\nDry run complete. Use without --dry-run to create accounts.");
    return;
  }

  // Create accounts
  const results = { success: 0, failed: 0, totalCost: 0 };

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    log(`\n[${i + 1}/${accounts.length}] Creating: ${acc.email}`);

    const result = await createOpenAIAccount(
      acc.email,
      acc.password,
      acc.firstName,
      acc.lastName,
      smsProvider,
      SCREENSHOT_DIR
    );

    // Record result
    appendCsv({
      timestamp: new Date().toISOString(),
      email: acc.email,
      password: acc.password,
      firstName: acc.firstName,
      lastName: acc.lastName,
      phone: result.phone || "",
      status: result.success ? "success" : "failed",
      error: result.error || "",
    });

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }

    // Delay between accounts
    if (i < accounts.length - 1) {
      const delay = randomInt(60000, 120000); // 60-120 seconds
      log(`Waiting ${Math.round(delay / 1000)}s before next account...`);
      await sleep(delay);
    }
  }

  // Summary
  log("\n" + "=".repeat(60));
  log("SUMMARY");
  log("=".repeat(60));
  log(`Total: ${accounts.length}`);
  log(`Success: ${results.success}`);
  log(`Failed: ${results.failed}`);
  log(`Output: ${CSV_FILE}`);
  log("=".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
