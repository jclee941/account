#!/usr/bin/env node

// Use regular playwright — rebrowser-playwright's CDP patches corrupt fill() on password fields
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

import {
  DEFAULT_PASSWORD, DEFAULT_REGION, STEALTH_ARGS, DESKTOP_DEVICE,
  delay, randomInt, getBodyText, humanType, getArg, normalizeEmail,
  createSaveShot, createLogStep, extractOrderCost,
  hasVerificationChallenge, verificationSucceeded,
  selectSmsOption, openVerificationFlow, handleSmsVerification,
} from '../lib/antigravity-shared.mjs';

const SCREENSHOT_DIR = join(import.meta.dirname, '..', 'screenshots');

const TARGET_URLS = [
  "https://accounts.google.com/speedbump/idvreenable",
  "https://myaccount.google.com/security",
  "https://gds.google.com/web/chip",
  "https://accounts.google.com/signin/v2/challenge/selection",
  "https://myaccount.google.com/",
  "https://myaccount.google.com/signinoptions/rescuephone",
];

const args = process.argv.slice(2);

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
  const fromFlag = getArg(args, "password", "").trim();
  if (fromFlag) return fromFlag;
  return DEFAULT_PASSWORD;
}

const BATCH = getArg(args, "batch", "");
const ACCOUNTS = parseAccounts(BATCH);
const PASSWORD = parsePassword();
const HEADED = args.includes("--headed");
const FIVESIM_API_KEY = getArg(args, "api-key", process.env.FIVESIM_API_KEY || "").trim();
const FIVESIM_REGION = getArg(args, "region", process.env.FIVESIM_REGION || DEFAULT_REGION).trim();

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

const logStep = createLogStep();
const shot = createSaveShot({ dir: SCREENSHOT_DIR });

async function login(page, email, password) {
  logStep(`Logging in: ${email}`);
  await page.goto("https://accounts.google.com/signin", { waitUntil: "domcontentloaded", timeout: 45000 });
  await shot(page, email, "login-page");

  const emailInput = page.locator('input[type="email"], input[name="identifier"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(email);
  await shot(page, email, "email-filled");

  const emailNext = page.locator('#identifierNext button, button:has-text("Next"), button:has-text("다음")').first();
  await emailNext.click();
  await delay(4000);
  await shot(page, email, "after-email-next");

  const pwInput = page.locator('input[type="password"], input[name="Passwd"]').first();
  await pwInput.waitFor({ state: "visible", timeout: 20000 });
  // Use fill() for password - humanType on masked fields can be unreliable
  await pwInput.fill(password);
  await shot(page, email, "password-filled");

  const pwNext = page.locator('#passwordNext button, button:has-text("Next"), button:has-text("다음")').first();
  await pwNext.click();
  await delay(8000);
  await shot(page, email, "after-password-next");

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
    await shot(page, email, `candidate-${idx}-loaded`);

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

    await openVerificationFlow(page, email, shot);
    await selectSmsOption(page, email, shot).catch(() => {});
    await delay(randomInt(1000, 2000));
    await shot(page, email, `candidate-${idx}-post-clicks`);

    const postBody = await getBodyText(page);
    if (hasVerificationChallenge(postBody, page.url())) {
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

    await selectSmsOption(page, email, shot);
    await shot(page, email, "sms-option-selected");

    const result = await handleSmsVerification(page, email, apiKey, region, { shotFn: shot, logFn: (msg) => console.log(msg) });

    const bodyText = await getBodyText(page);
    const successHint = verificationSucceeded(bodyText, page.url());
    if (!successHint) {
      throw new Error("Verification result could not be confirmed from page state");
    }

    await shot(page, email, "feature-unlock-verified-success");
    return { email, success: true, cost: result.cost, error: "" };
  } catch (err) {
    await shot(page, email, "error").catch(() => {});
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
      logStep.reset();
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
