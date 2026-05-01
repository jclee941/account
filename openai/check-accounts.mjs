#!/usr/bin/env node
/**
 * OpenAI Account Status Checker
 *
 * Verifies OpenAI account status by attempting login
 * Checks if accounts are active, suspended, or need verification
 *
 * Usage:
 *   node openai/check-accounts.mjs --start 1 --end 10
 *   node openai/check-accounts.mjs --email qws94301@gmail.com
 *   node openai/check-accounts.mjs --csv openai-accounts.csv
 */

process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = "addBinding";
process.env.REBROWSER_PATCHES_UTILITY_WORLD_NAME = "util";
process.env.REBROWSER_PATCHES_SOURCE_URL = "jquery.min.js";

import { chromium } from "rebrowser-playwright";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────
const PREFIX = "qws943";
const EMAIL_DOMAIN = "gmail.com";
const PASSWORD = "bingogo1";
const CSV_FILE = join(import.meta.dirname, "..", "openai-accounts.csv");
const RESULTS_FILE = join(import.meta.dirname, "..", "openai-account-status.csv");

// ── CLI Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const START = parseInt(getArg("start", "1"), 10);
const END = parseInt(getArg("end", "50"), 10);
const SINGLE_EMAIL = getArg("email", "");
const CSV_PATH = getArg("csv", CSV_FILE);
const HEADED = args.includes("--headed");

// ── Utilities ───────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function parseAccountsCsv(path) {
  if (!existsSync(path)) {
    return [];
  }

  const content = readFileSync(path, "utf8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const record = {};
    headers.forEach((h, i) => {
      record[h.trim()] = values[i]?.trim() || "";
    });
    return record;
  });
}

function saveResults(results) {
  const header = "email,status,error,timestamp\n";
  const rows = results.map(r => `${r.email},${r.status},${r.error || ""},${r.timestamp}`).join("\n");
  writeFileSync(RESULTS_FILE, header + rows, "utf8");
  log(`Results saved to ${RESULTS_FILE}`);
}

// ── Browser Launch ───────────────────────────────────────────────────
async function launchBrowser(headed = false) {
  const browser = await chromium.launch({
    headless: !headed,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  return { browser, page };
}

// ── Check Account Status ─────────────────────────────────────────────
async function checkAccountStatus(email, password) {
  const { browser, page } = await launchBrowser(HEADED);

  try {
    log(`Checking: ${email}`);

    // Navigate to OpenAI login
    await page.goto("https://chat.openai.com/auth/login", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await sleep(2000);

    // Click "Log in" button if present
    const loginBtn = await page.locator('button:has-text("Log in"), a:has-text("Log in")').first();
    if (loginBtn) {
      await loginBtn.click();
      await sleep(2000);
    }

    // Fill email
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    if (emailInput) {
      await emailInput.fill(email);
      await sleep(500);
    }

    // Click continue
    const continueBtn = await page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (continueBtn) {
      await continueBtn.click();
      await sleep(3000);
    }

    // Fill password
    const passwordInput = await page.locator('input[type="password"]').first();
    if (passwordInput) {
      await passwordInput.fill(password);
      await sleep(500);

      const submitBtn = await page.locator('button[type="submit"]').first();
      if (submitBtn) {
        await submitBtn.click();
        await sleep(5000);
      }
    }

    // Check final state
    const url = page.url();
    const content = await page.content();
    const lowerContent = content.toLowerCase();

    // Determine status
    let status = "unknown";
    let error = "";

    if (url.includes("chat.openai.com") && !url.includes("auth")) {
      status = "active";
      log(`  ✅ Active: ${email}`);
    } else if (lowerContent.includes("incorrect password") || lowerContent.includes("wrong password")) {
      status = "wrong_password";
      error = "Incorrect password";
      log(`  ❌ Wrong password: ${email}`);
    } else if (lowerContent.includes("account suspended") || lowerContent.includes("banned")) {
      status = "suspended";
      error = "Account suspended";
      log(`  🚫 Suspended: ${email}`);
    } else if (lowerContent.includes("verify") || lowerContent.includes("verification")) {
      status = "needs_verification";
      error = "Needs verification";
      log(`  ⚠️ Needs verification: ${email}`);
    } else if (lowerContent.includes("rate limit") || lowerContent.includes("too many")) {
      status = "rate_limited";
      error = "Rate limited";
      log(`  ⏱️ Rate limited: ${email}`);
    } else if (lowerContent.includes("captcha") || lowerContent.includes("verify you are human")) {
      status = "captcha";
      error = "CAPTCHA required";
      log(`  🤖 CAPTCHA: ${email}`);
    } else {
      status = "unknown";
      error = `URL: ${url}`;
      log(`  ❓ Unknown: ${email} (${url})`);
    }

    return { email, status, error, timestamp: new Date().toISOString() };

  } catch (err) {
    log(`  💥 Error checking ${email}: ${err.message}`);
    return { email, status: "error", error: err.message, timestamp: new Date().toISOString() };
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  log("=".repeat(60));
  log("OpenAI Account Status Checker");
  log("=".repeat(60));

  let accounts = [];

  if (SINGLE_EMAIL) {
    accounts = [{ email: SINGLE_EMAIL, password: PASSWORD }];
  } else if (existsSync(CSV_PATH)) {
    const records = parseAccountsCsv(CSV_PATH);
    accounts = records
      .filter(r => r.status === "success" || !r.status)
      .map(r => ({
        email: r.email,
        password: r.password || PASSWORD,
      }));
    log(`Loaded ${accounts.length} accounts from ${CSV_PATH}`);
  } else {
    // Generate from range
    for (let i = START; i <= END; i++) {
      const num = String(i).padStart(2, "0");
      accounts.push({
        email: `${PREFIX}${num}@${EMAIL_DOMAIN}`,
        password: PASSWORD,
      });
    }
  }

  log(`Checking ${accounts.length} accounts...\n`);

  const results = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    log(`[${i + 1}/${accounts.length}]`);

    const result = await checkAccountStatus(acc.email, acc.password);
    results.push(result);

    // Delay between checks
    if (i < accounts.length - 1) {
      await sleep(3000);
    }
  }

  // Summary
  const active = results.filter(r => r.status === "active").length;
  const suspended = results.filter(r => r.status === "suspended").length;
  const needsVerification = results.filter(r => r.status === "needs_verification").length;
  const failed = results.filter(r => r.status === "error" || r.status === "unknown").length;

  log("\n" + "=".repeat(60));
  log("SUMMARY");
  log("=".repeat(60));
  log(`Total checked: ${results.length}`);
  log(`Active: ${active}`);
  log(`Suspended: ${suspended}`);
  log(`Needs verification: ${needsVerification}`);
  log(`Failed/Unknown: ${failed}`);
  log("=".repeat(60));

  saveResults(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
