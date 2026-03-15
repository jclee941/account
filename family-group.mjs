#!/usr/bin/env node
/**
 * Google Family Group Manager — Playwright Automation
 *
 * Adds created Gmail accounts (qws943xx) to a Google Family Group.
 *
 * Prerequisites:
 *   - Parent/manager Google account must be logged in (or credentials provided)
 *   - accounts.csv must exist with created account data
 *
 * Usage:
 *   node family-group.mjs                          # invite all from accounts.csv
 *   node family-group.mjs --start 1 --end 5        # qws94301~05 only
 *   node family-group.mjs --dry-run                 # preview only
 *   node family-group.mjs --parent user@gmail.com   # specify parent account
 */

import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────
const CSV_FILE = join(import.meta.dirname, "accounts.csv");
const RESULTS_FILE = join(import.meta.dirname, "family-results.csv");
const SCREENSHOT_DIR = join(import.meta.dirname, "screenshots");
const PREFIX = "qws943";
const FAMILIES_URL = "https://families.google.com";
const INVITE_URL = "https://families.google.com/families/invite";

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
const PARENT_EMAIL = getArg("parent", "");

function padNum(n) {
  return String(n).padStart(2, "0");
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Load accounts from CSV ──────────────────────────────────────────
function loadAccounts() {
  if (!existsSync(CSV_FILE)) {
    console.error(`❌ accounts.csv not found. Run create-accounts.mjs first.`);
    process.exit(1);
  }

  const lines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1); // skip header
  const accounts = [];

  for (const line of lines) {
    const [username, email, password, firstName, lastName, koreanName, status] =
      line.split(",");
    if (status === "success") {
      accounts.push({ username, email, password, firstName, lastName, koreanName });
    }
  }

  return accounts;
}

// ── Results tracking ────────────────────────────────────────────────
function initResults() {
  if (!existsSync(RESULTS_FILE)) {
    writeFileSync(
      RESULTS_FILE,
      "email,action,status,timestamp,notes\n"
    );
  }
}

function appendResult(row) {
  const line = `${row.email},${row.action},${row.status},${row.timestamp},${row.notes || ""}\n`;
  writeFileSync(RESULTS_FILE, line, { flag: "a" });
}

function getCompletedInvites() {
  if (!existsSync(RESULTS_FILE)) return new Set();
  const lines = readFileSync(RESULTS_FILE, "utf-8").trim().split("\n").slice(1);
  return new Set(
    lines
      .filter((l) => l.includes(",invited,success,") || l.includes(",invite,success,"))
      .map((l) => l.split(",")[0])
  );
}

// ── Family Group Invitation Flow ────────────────────────────────────
async function inviteMember(page, email) {
  const result = {
    email,
    action: "invite",
    status: "pending",
    timestamp: new Date().toISOString(),
    notes: "",
  };

  try {
    // Navigate to family page
    console.log(`  → Navigating to families.google.com...`);
    await page.goto(FAMILIES_URL, { waitUntil: "networkidle", timeout: 30000 });
    await delay(2000);

    // Check if we need to create a family first or just invite
    // Look for "Invite member" / "가족 구성원 초대" button
    const inviteButton = page
      .locator(
        'button:has-text("Invite family member"), button:has-text("가족 구성원 초대"), ' +
        'a:has-text("Invite family member"), a:has-text("가족 구성원 초대"), ' +
        '[aria-label*="Invite"], [aria-label*="초대"]'
      )
      .first();

    // Alternative: use the "+" or "Add" button
    const addButton = page
      .locator(
        'button:has-text("Add"), button:has-text("추가"), ' +
        '[data-action="invite"], [aria-label*="member"]'
      )
      .first();

    if (await inviteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteButton.click();
      await delay(2000);
    } else if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();
      await delay(2000);
    } else {
      // Try the direct invite URL
      console.log(`  → Trying direct invite URL...`);
      await page.goto(INVITE_URL, { waitUntil: "networkidle", timeout: 30000 });
      await delay(2000);
    }

    // Fill email field
    console.log(`  → Entering email: ${email}`);
    const emailInput = page
      .locator(
        'input[type="email"], input[aria-label*="email"], input[aria-label*="이메일"], ' +
        'input[placeholder*="email"], input[placeholder*="이메일"], ' +
        'input[name="email"], input[name="identifier"]'
      )
      .first();

    if (await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await emailInput.fill(email);
      await delay(1000);
    } else {
      // Maybe there's a text input that takes the email
      const textInput = page.locator('input[type="text"]').first();
      if (await textInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textInput.fill(email);
        await delay(1000);
      } else {
        throw new Error("Could not find email input field");
      }
    }

    // Click Send / 보내기 button
    console.log(`  → Sending invitation...`);
    const sendButton = page
      .locator(
        'button:has-text("Send"), button:has-text("보내기"), ' +
        'button:has-text("Invite"), button:has-text("초대"), ' +
        'button:has-text("Confirm"), button:has-text("확인")'
      )
      .first();

    if (await sendButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sendButton.click();
      await delay(3000);
    } else {
      throw new Error("Could not find send/invite button");
    }

    // Check for success indicators
    const successIndicator = page
      .locator(
        'text="Invitation sent", text="초대가 전송되었습니다", ' +
        'text="초대를 보냈습니다", text="sent"'
      )
      .first();

    if (await successIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
      result.status = "success";
      console.log(`  ✅ Invitation sent to ${email}`);
    } else {
      // Check current page for any error messages
      const errorText = page.locator('[role="alert"], .error-message, [class*="error"]').first();
      if (await errorText.isVisible({ timeout: 2000 }).catch(() => false)) {
        const errMsg = await errorText.textContent().catch(() => "unknown error");
        result.status = "error";
        result.notes = errMsg.slice(0, 200);
        console.log(`  ⚠️  Possible error for ${email}: ${result.notes}`);
      } else {
        // No error visible — screenshot and mark for manual check
        const screenshotPath = join(SCREENSHOT_DIR, `family-${email.split("@")[0]}-result.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.status = "manual-check";
        result.notes = "No clear success/error indicator — screenshot saved";
        console.log(`  ⚠️  Manual check needed for ${email} (screenshot saved)`);
      }
    }
  } catch (err) {
    result.status = "error";
    result.notes = err.message.slice(0, 200);
    console.error(`  ❌ Failed to invite ${email}: ${err.message.slice(0, 100)}`);

    // Save error screenshot
    try {
      const screenshotPath = join(SCREENSHOT_DIR, `family-${email.split("@")[0]}-error.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {}
  }

  return result;
}

// ── Accept Invitation Flow (from child account) ─────────────────────
async function acceptInvitation(browser, account) {
  const result = {
    email: account.email,
    action: "accept",
    status: "pending",
    timestamp: new Date().toISOString(),
    notes: "",
  };

  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  try {
    // Login to the child account
    console.log(`  → Logging in as ${account.email}...`);
    await page.goto("https://accounts.google.com/signin", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await delay(2000);

    // Enter email
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(account.email);
    await page.locator('button:has-text("다음"), button:has-text("Next")').first().click();
    await delay(3000);

    // Enter password
    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await passwordInput.fill(account.password);
      await page.locator('button:has-text("다음"), button:has-text("Next")').first().click();
      await delay(5000);
    }

    // Navigate to families page to find invitation
    console.log(`  → Checking for family invitation...`);
    await page.goto(FAMILIES_URL, { waitUntil: "networkidle", timeout: 30000 });
    await delay(3000);

    // Look for "Join" / "가입" button
    const joinButton = page
      .locator(
        'button:has-text("Join"), button:has-text("가입"), ' +
        'button:has-text("Accept"), button:has-text("수락"), ' +
        'a:has-text("Join"), a:has-text("가입")'
      )
      .first();

    if (await joinButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await joinButton.click();
      await delay(3000);

      // Confirm join if there's a confirmation dialog
      const confirmButton = page
        .locator(
          'button:has-text("Join"), button:has-text("가입"), ' +
          'button:has-text("Confirm"), button:has-text("확인")'
        )
        .first();

      if (await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmButton.click();
        await delay(3000);
      }

      result.status = "success";
      console.log(`  ✅ ${account.email} joined family group`);
    } else {
      result.status = "no-invitation";
      result.notes = "No pending invitation found";
      console.log(`  ⚠️  No invitation found for ${account.email}`);

      const screenshotPath = join(SCREENSHOT_DIR, `family-accept-${account.username}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  } catch (err) {
    result.status = "error";
    result.notes = err.message.slice(0, 200);
    console.error(`  ❌ Accept failed for ${account.email}: ${err.message.slice(0, 100)}`);

    try {
      const screenshotPath = join(SCREENSHOT_DIR, `family-accept-${account.username}-error.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {}
  } finally {
    await context.close();
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Google Family Group Manager");
  console.log("═══════════════════════════════════════════════════════");

  const allAccounts = loadAccounts();
  const filtered = allAccounts.filter((a) => {
    const num = parseInt(a.username.replace(PREFIX, ""), 10);
    return num >= START && num <= END;
  });

  console.log(`  Total accounts in CSV:  ${allAccounts.length}`);
  console.log(`  Range filter:           ${PREFIX}${padNum(START)} ~ ${PREFIX}${padNum(END)}`);
  console.log(`  Matching accounts:      ${filtered.length}`);
  console.log(`  Mode:                   ${DRY_RUN ? "DRY RUN" : HEADED ? "HEADED" : "HEADLESS"}`);
  if (PARENT_EMAIL) console.log(`  Parent account:         ${PARENT_EMAIL}`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (filtered.length === 0) {
    console.log("❌ No matching accounts found in accounts.csv");
    console.log("   Run create-accounts.mjs first to create the accounts.");
    return;
  }

  if (DRY_RUN) {
    console.log("📋 Preview (dry run):\n");
    console.log("Email                        | Name");
    console.log("─────────────────────────────|──────────────────");
    for (const acc of filtered) {
      console.log(
        `${acc.email.padEnd(29)}| ${acc.firstName} ${acc.lastName} (${acc.koreanName})`
      );
    }
    console.log(`\n Total: ${filtered.length} accounts to invite`);
    return;
  }

  // Init tracking
  initResults();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const completedInvites = getCompletedInvites();
  const remaining = filtered.filter((a) => !completedInvites.has(a.email));

  console.log(
    `📊 Total: ${filtered.length} | Already invited: ${completedInvites.size} | Remaining: ${remaining.length}\n`
  );

  if (remaining.length === 0) {
    console.log("✅ All accounts already invited!");
    return;
  }

  // Launch browser for parent account (invitation sending)
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  // Step 1: Login to parent account if specified
  const parentContext = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const parentPage = await parentContext.newPage();

  if (PARENT_EMAIL) {
    console.log(`🔐 Logging in as parent: ${PARENT_EMAIL}`);
    console.log(
      "   Note: You may need to manually complete login if 2FA is required.\n"
    );
    await parentPage.goto("https://accounts.google.com/signin", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await delay(2000);

    const emailInput = parentPage.locator('input[type="email"]').first();
    await emailInput.fill(PARENT_EMAIL);
    await parentPage
      .locator('button:has-text("다음"), button:has-text("Next")')
      .first()
      .click();
    await delay(5000);

    // Wait for manual 2FA if needed (up to 60s)
    console.log("   Waiting for login to complete (up to 60s for 2FA)...");
    try {
      await parentPage.waitForURL("**/myaccount.google.com/**", { timeout: 60000 });
    } catch {
      console.log("   Login may not have completed — continuing anyway.");
    }
  }

  let inviteSuccess = 0;
  let inviteFail = 0;

  // Step 2: Send invitations from parent account
  console.log("\n── Phase 1: Sending Invitations ──────────────────────\n");
  for (let i = 0; i < remaining.length; i++) {
    const account = remaining[i];
    console.log(
      `\n[${i + 1}/${remaining.length}] Inviting ${account.email} (${account.koreanName})`
    );

    const result = await inviteMember(parentPage, account.email);
    appendResult(result);

    if (result.status === "success") {
      inviteSuccess++;
    } else {
      inviteFail++;
    }

    // Delay between invitations (5-10s)
    if (i < remaining.length - 1) {
      const wait = 5000 + Math.random() * 5000;
      console.log(`  ⏳ Waiting ${(wait / 1000).toFixed(1)}s...`);
      await delay(wait);
    }
  }

  await parentContext.close();

  // Step 3: Accept invitations from each child account
  console.log("\n── Phase 2: Accepting Invitations ────────────────────\n");
  let acceptSuccess = 0;
  let acceptFail = 0;

  for (let i = 0; i < remaining.length; i++) {
    const account = remaining[i];
    console.log(
      `\n[${i + 1}/${remaining.length}] Accepting for ${account.email}`
    );

    const result = await acceptInvitation(browser, account);
    appendResult(result);

    if (result.status === "success") {
      acceptSuccess++;
    } else {
      acceptFail++;
    }

    // Delay between accepts (5-10s)
    if (i < remaining.length - 1) {
      const wait = 5000 + Math.random() * 5000;
      console.log(`  ⏳ Waiting ${(wait / 1000).toFixed(1)}s...`);
      await delay(wait);
    }
  }

  await browser.close();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Done!`);
  console.log(`  Invitations: ✅ ${inviteSuccess} sent | ❌ ${inviteFail} failed`);
  console.log(`  Accepts:     ✅ ${acceptSuccess} joined | ❌ ${acceptFail} failed`);
  console.log(`  Results:     ${RESULTS_FILE}`);
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
