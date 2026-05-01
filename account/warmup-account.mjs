#!/usr/bin/env node

/**
 * Gmail Warm-up Protocol (14-day + maintenance)
 *
 * Requirements implemented:
 * - Load account from accounts.csv
 * - 14-day schedule + maintenance
 * - Activities: newsletter subscriptions, IMAP inbox checks, sent mail simulation
 * - Randomized human-like delays
 * - Progress tracking + resume capability on interruption
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { spawn } from "child_process";

const ACCOUNTS_CSV = join(import.meta.dirname, "..", "accounts.csv");
const DEFAULT_PROGRESS_FILE = join(import.meta.dirname, "..", "data", "warmup-progress.json");

const DEFAULT_NEWSLETTER_SOURCES = [
  { name: "Morning Brew", email: "newsletter@morningbrew.com" },
  { name: "The Hustle", email: "trends@thehustle.co" },
  { name: "TLDR", email: "hello@tldr.tech" },
  { name: "Ben's Bites", email: "hi@bensbites.com" },
  { name: "Platformer", email: "tips@platformer.news" },
  { name: "Lenny's Newsletter", email: "hello@lennysnewsletter.com" },
];

const DEFAULT_TRUSTED_CONTACTS = [
  "warmup-trusted-1@example.com",
  "warmup-trusted-2@example.com",
  "warmup-trusted-3@example.com",
  "warmup-trusted-4@example.com",
  "warmup-trusted-5@example.com",
];

const args = process.argv.slice(2);

function getArg(name, fallback = "") {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffled(array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function daysSince(startIsoDate, nowDate = new Date()) {
  const start = new Date(`${startIsoDate}T00:00:00.000Z`).getTime();
  const now = new Date(toDateKey(nowDate) + "T00:00:00.000Z").getTime();
  const diff = Math.max(0, now - start);
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function parseAccountsCsv(csvContent) {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length < 2) return [];

  const logicalRows = [];
  const rowEndPattern = /,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*$/;
  let current = "";

  for (const line of lines.slice(1)) {
    if (!line.trim() && !current) continue;
    current = current ? `${current}\n${line}` : line;
    if (rowEndPattern.test(line.trimEnd())) {
      logicalRows.push(current);
      current = "";
    }
  }

  if (current.trim()) logicalRows.push(current);

  const accounts = [];
  for (const row of logicalRows) {
    const lastComma = row.lastIndexOf(",");
    if (lastComma === -1) continue;
    const timestamp = row.slice(lastComma + 1).trim();
    const beforeTimestamp = row.slice(0, lastComma);
    const parts = beforeTimestamp.split(",");
    if (parts.length < 8) continue;

    accounts.push({
      username: (parts[0] || "").trim(),
      email: (parts[1] || "").trim(),
      password: (parts[2] || "").trim(),
      firstName: (parts[3] || "").trim(),
      lastName: (parts[4] || "").trim(),
      koreanName: (parts[5] || "").trim(),
      cost: (parts[6] || "").trim(),
      status: parts.slice(7).join(",").trim(),
      timestamp,
    });
  }

  return accounts;
}

function loadAccounts(csvPath) {
  if (!existsSync(csvPath)) {
    throw new Error(`accounts.csv not found: ${csvPath}`);
  }
  const content = readFileSync(csvPath, "utf-8");
  return parseAccountsCsv(content);
}

function pickAccount(accounts, { email, username, accountIndex }) {
  const candidates = accounts.filter((a) => a.email && a.password && !String(a.status || "").toLowerCase().startsWith("error:"));

  if (email) {
    const found = candidates.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error(`Account not found for --email ${email}`);
    return found;
  }

  if (username) {
    const found = candidates.find((a) => a.username === username);
    if (!found) throw new Error(`Account not found for --username ${username}`);
    return found;
  }

  if (accountIndex > 0) {
    const found = candidates[accountIndex - 1];
    if (!found) throw new Error(`No candidate account at --account-index ${accountIndex}`);
    return found;
  }

  throw new Error("One selector is required: --email or --username or --account-index");
}

function ensureParentDir(filePath) {
  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function loadProgress(filePath) {
  if (!existsSync(filePath)) {
    return { version: 1, accounts: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object") return { version: 1, accounts: {} };
    if (!parsed.accounts || typeof parsed.accounts !== "object") parsed.accounts = {};
    if (!parsed.version) parsed.version = 1;
    return parsed;
  } catch {
    return { version: 1, accounts: {} };
  }
}

function saveProgress(filePath, progress) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(progress, null, 2)}\n`, "utf-8");
}

function getDailyTarget(dayNumber) {
  if (dayNumber <= 3) return 5;
  if (dayNumber <= 7) return 10;
  if (dayNumber <= 14) return 15;
  return randomInt(30, 50);
}

function getExpectedScheduleLabel(dayNumber) {
  if (dayNumber <= 3) return "days_1_3";
  if (dayNumber <= 7) return "days_4_7";
  if (dayNumber <= 14) return "days_8_14";
  return "maintenance_day_15_plus";
}

function buildDayPlan({ dayNumber, targetEmails, trustedContacts, newsletterSources }) {
  const newsletterCount = Math.min(targetEmails, randomInt(3, 5));
  const regularSentCount = Math.max(0, targetEmails - newsletterCount);
  const inboxChecks = dayNumber >= 15 ? randomInt(3, 6) : randomInt(2, 4);

  const selectedNewsletter = shuffled(newsletterSources).slice(0, newsletterCount);
  const selectedTrusted = [];
  if (trustedContacts.length > 0) {
    for (let i = 0; i < regularSentCount; i += 1) {
      selectedTrusted.push(trustedContacts[i % trustedContacts.length]);
    }
  }

  const plan = [];

  for (const src of selectedNewsletter) {
    plan.push({ type: "newsletter_subscribe", payload: { sourceName: src.name, to: src.email } });
  }

  for (const to of selectedTrusted) {
    plan.push({ type: "send_trusted", payload: { to } });
  }

  for (let i = 0; i < inboxChecks; i += 1) {
    plan.push({ type: "imap_inbox_check", payload: { checkIndex: i + 1 } });
  }

  const mixed = shuffled(plan);
  if (mixed.length > 0 && mixed[0].type !== "imap_inbox_check") {
    const idx = mixed.findIndex((x) => x.type === "imap_inbox_check");
    if (idx > 0) {
      [mixed[0], mixed[idx]] = [mixed[idx], mixed[0]];
    }
  }

  return {
    scheduleLabel: getExpectedScheduleLabel(dayNumber),
    targetEmails,
    newsletterCount,
    regularSentCount,
    inboxChecks,
    actions: mixed,
  };
}

function pythonExec(code, { timeoutMs = 45000, input = null } = {}) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", ["-c", code], {
      timeout: timeoutMs,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    py.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    py.on("error", (err) => reject(new Error(`python3 spawn error: ${err.message}`)));
    py.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error((stderr || stdout || `python exited ${exitCode}`).trim()));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });

    if (input != null) {
      py.stdin.write(typeof input === "string" ? input : JSON.stringify(input));
    }
    py.stdin.end();
  });
}

async function imapInboxCheck({ email, password }) {
  const script = String.raw`
import sys
import json
import imaplib

payload = json.load(sys.stdin)
email = payload["email"]
password = payload["password"]

mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
mail.login(email, password)
mail.select("INBOX")
status_all, all_ids = mail.search(None, "ALL")
status_unseen, unseen_ids = mail.search(None, "UNSEEN")

all_count = len(all_ids[0].split()) if all_ids and all_ids[0] else 0
unseen_count = len(unseen_ids[0].split()) if unseen_ids and unseen_ids[0] else 0

mail.logout()
print(json.dumps({"all_count": all_count, "unseen_count": unseen_count}))
`;

  const { stdout } = await pythonExec(script, {
    timeoutMs: 45000,
    input: { email, password },
  });

  return JSON.parse(stdout);
}

async function smtpSendMail({ email, password, to, subject, body }) {
  const script = String.raw`
import sys
import json
import smtplib
from email.message import EmailMessage

payload = json.load(sys.stdin)
msg = EmailMessage()
msg["From"] = payload["email"]
msg["To"] = payload["to"]
msg["Subject"] = payload["subject"]
msg.set_content(payload["body"])

with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
    smtp.login(payload["email"], payload["password"])
    smtp.send_message(msg)

print(json.dumps({"sent": True, "to": payload["to"]}))
`;

  const { stdout } = await pythonExec(script, {
    timeoutMs: 45000,
    input: { email, password, to, subject, body },
  });

  return JSON.parse(stdout);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomHumanDelay({ minSec, maxSec, scale }) {
  const raw = randomInt(minSec, maxSec);
  const ms = Math.max(250, Math.floor(raw * 1000 * scale));
  console.log(`  ⏱️ delay ${raw}s (scaled=${(ms / 1000).toFixed(2)}s)`);
  await delay(ms);
}

function makeNewsletterMessage(sourceName) {
  const variants = [
    `Hello ${sourceName} team, please subscribe this address to your newsletter updates.`,
    `Hi, I want to receive ${sourceName} weekly digest and product updates.`,
    `Please add me to ${sourceName} newsletter list. Thanks!`,
    `I'd like to opt in to ${sourceName} newsletter and announcements.`,
  ];
  return variants[randomInt(0, variants.length - 1)];
}

function makeTrustedMessage() {
  const variants = [
    "Quick check-in. Keeping this mailbox active with normal conversation flow.",
    "Sending a short note as part of regular mailbox activity.",
    "Warm-up email: routine communication and inbox engagement.",
    "Small hello message to keep daily email pattern realistic.",
  ];
  return variants[randomInt(0, variants.length - 1)];
}

function nowIso() {
  return new Date().toISOString();
}

function getAccountProgress(progress, accountEmail) {
  if (!progress.accounts[accountEmail]) {
    progress.accounts[accountEmail] = {
      email: accountEmail,
      warmupStartDate: toDateKey(new Date()),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      totals: {
        sentAttempts: 0,
        sentSuccess: 0,
        inboxChecks: 0,
        inboxSuccess: 0,
      },
      days: {},
      completedDays: [],
      interruptedAt: null,
      lastError: null,
    };
  }
  return progress.accounts[accountEmail];
}

function getOrCreateDayState(accountProgress, dayNumber, planFactory) {
  const key = String(dayNumber);
  if (!accountProgress.days[key]) {
    const plan = planFactory();
    accountProgress.days[key] = {
      dayNumber,
      date: toDateKey(new Date()),
      scheduleLabel: plan.scheduleLabel,
      targetEmails: plan.targetEmails,
      newsletterCount: plan.newsletterCount,
      regularSentCount: plan.regularSentCount,
      inboxChecks: plan.inboxChecks,
      actions: plan.actions,
      actionCursor: 0,
      actionResults: [],
      status: "in_progress",
      startedAt: nowIso(),
      completedAt: null,
    };
  }
  return accountProgress.days[key];
}

async function executeAction({ account, action, dayNumber }) {
  if (action.type === "imap_inbox_check") {
    const result = await imapInboxCheck({ email: account.email, password: account.password });
    return {
      ok: true,
      type: action.type,
      detail: result,
      note: `INBOX total=${result.all_count}, unseen=${result.unseen_count}`,
    };
  }

  if (action.type === "newsletter_subscribe") {
    const subject = `Subscribe request - ${action.payload.sourceName}`;
    const body = makeNewsletterMessage(action.payload.sourceName);
    const result = await smtpSendMail({
      email: account.email,
      password: account.password,
      to: action.payload.to,
      subject,
      body,
    });
    return {
      ok: true,
      type: action.type,
      detail: result,
      note: `Newsletter subscription intent sent to ${action.payload.sourceName} (${action.payload.to})`,
    };
  }

  if (action.type === "send_trusted") {
    const subject = `Daily check-in D${dayNumber}`;
    const body = makeTrustedMessage();
    const result = await smtpSendMail({
      email: account.email,
      password: account.password,
      to: action.payload.to,
      subject,
      body,
    });
    return {
      ok: true,
      type: action.type,
      detail: result,
      note: `Trusted-contact mail sent to ${action.payload.to}`,
    };
  }

  throw new Error(`Unsupported action type: ${action.type}`);
}

function parseListArg(input, fallback) {
  if (!input || !input.trim()) return fallback;
  return input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function main() {
  const email = getArg("email", "").trim();
  const username = getArg("username", "").trim();
  const accountIndex = Number(getArg("account-index", "0")) || 0;
  const csvPath = getArg("accounts-csv", ACCOUNTS_CSV).trim() || ACCOUNTS_CSV;
  const progressFile = getArg("progress-file", DEFAULT_PROGRESS_FILE).trim() || DEFAULT_PROGRESS_FILE;
  const dayOverride = Number(getArg("day", "0")) || 0;
  const delayScale = Number(getArg("delay-scale", process.env.WARMUP_DELAY_SCALE || "1")) || 1;
  const maxActions = Number(getArg("max-actions", "0")) || 0;
  const resetProgress = hasFlag("reset-progress");
  const dryRun = hasFlag("dry-run");

  const trustedContacts = parseListArg(
    getArg("trusted-contacts", process.env.WARMUP_TRUSTED_CONTACTS || ""),
    DEFAULT_TRUSTED_CONTACTS
  );

  const newsletterSources = DEFAULT_NEWSLETTER_SOURCES;

  const accounts = loadAccounts(csvPath);
  const account = pickAccount(accounts, { email, username, accountIndex });

  const progress = loadProgress(progressFile);

  if (resetProgress) {
    progress.accounts[account.email] = {
      email: account.email,
      warmupStartDate: toDateKey(new Date()),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      totals: {
        sentAttempts: 0,
        sentSuccess: 0,
        inboxChecks: 0,
        inboxSuccess: 0,
      },
      days: {},
      completedDays: [],
      interruptedAt: null,
      lastError: null,
    };
    saveProgress(progressFile, progress);
    console.log(`♻️ Progress reset for ${account.email}`);
  }

  const accountProgress = getAccountProgress(progress, account.email);
  if (!accountProgress.warmupStartDate) {
    accountProgress.warmupStartDate = toDateKey(new Date());
  }

  const inferredDay = daysSince(accountProgress.warmupStartDate) + 1;
  const dayNumber = dayOverride > 0 ? dayOverride : inferredDay;
  const dailyTarget = getDailyTarget(dayNumber);

  const dayState = getOrCreateDayState(accountProgress, dayNumber, () =>
    buildDayPlan({
      dayNumber,
      targetEmails: dailyTarget,
      trustedContacts,
      newsletterSources,
    })
  );

  const remaining = Math.max(0, dayState.actions.length - dayState.actionCursor);

  console.log("\n🚀 Gmail Warm-up Runner");
  console.log(`   Account: ${account.email}`);
  console.log(`   Day: ${dayNumber} (${dayState.scheduleLabel})`);
  console.log(`   Daily target emails: ${dayState.targetEmails}`);
  console.log(`   Actions total: ${dayState.actions.length}`);
  console.log(`   Cursor: ${dayState.actionCursor}/${dayState.actions.length}`);
  console.log(`   Remaining: ${remaining}`);
  console.log(`   Phase: ${dayNumber > 14 ? "maintenance" : "mandatory-14-day"}`);
  if (dryRun) console.log("   Dry-run mode: enabled");

  if (dayState.status === "completed") {
    console.log(`✅ Day ${dayNumber} already completed`);
    accountProgress.updatedAt = nowIso();
    saveProgress(progressFile, progress);
    return;
  }

  const executeLimit = maxActions > 0 ? maxActions : Number.MAX_SAFE_INTEGER;
  let executedCount = 0;

  try {
    for (let i = dayState.actionCursor; i < dayState.actions.length; i += 1) {
      if (executedCount >= executeLimit) {
        console.log(`⏹️ max-actions reached (${executeLimit}), checkpoint saved`);
        break;
      }

      const action = dayState.actions[i];
      const actionNo = i + 1;
      console.log(`\n[${actionNo}/${dayState.actions.length}] ${action.type}`);

      await randomHumanDelay({ minSec: 45, maxSec: 180, scale: delayScale });

      const startedAt = nowIso();
      let result;

      if (dryRun) {
        result = {
          ok: true,
          type: action.type,
          detail: { dryRun: true },
          note: "dry-run simulated",
        };
      } else {
        result = await executeAction({ account, action, dayNumber });
      }

      dayState.actionResults.push({
        index: i,
        action,
        startedAt,
        finishedAt: nowIso(),
        ok: result.ok,
        note: result.note,
        detail: result.detail,
      });

      if (action.type === "imap_inbox_check") {
        accountProgress.totals.inboxChecks += 1;
        if (result.ok) accountProgress.totals.inboxSuccess += 1;
      } else {
        accountProgress.totals.sentAttempts += 1;
        if (result.ok) accountProgress.totals.sentSuccess += 1;
      }

      dayState.actionCursor = i + 1;
      accountProgress.interruptedAt = null;
      accountProgress.lastError = null;
      accountProgress.updatedAt = nowIso();
      saveProgress(progressFile, progress);

      console.log(`   ✅ ${result.note}`);
      executedCount += 1;
    }

    if (dayState.actionCursor >= dayState.actions.length) {
      dayState.status = "completed";
      dayState.completedAt = nowIso();
      if (!accountProgress.completedDays.includes(dayNumber)) {
        accountProgress.completedDays.push(dayNumber);
        accountProgress.completedDays.sort((a, b) => a - b);
      }
      console.log(`\n🎯 Day ${dayNumber} completed`);
    } else {
      dayState.status = "in_progress";
      console.log(`\n💾 Resume checkpoint: ${dayState.actionCursor}/${dayState.actions.length}`);
    }

    accountProgress.updatedAt = nowIso();
    saveProgress(progressFile, progress);

    console.log("\n📊 Progress Summary");
    console.log(`   Sent: ${accountProgress.totals.sentSuccess}/${accountProgress.totals.sentAttempts}`);
    console.log(`   IMAP checks: ${accountProgress.totals.inboxSuccess}/${accountProgress.totals.inboxChecks}`);
    console.log(`   Completed days: ${accountProgress.completedDays.length} (${accountProgress.completedDays.join(", ") || "none"})`);
  } catch (err) {
    accountProgress.interruptedAt = nowIso();
    accountProgress.lastError = String(err?.message || err);
    accountProgress.updatedAt = nowIso();
    dayState.status = "in_progress";
    saveProgress(progressFile, progress);

    console.error("\n❌ Warm-up interrupted");
    console.error(`   Account: ${account.email}`);
    console.error(`   Day: ${dayNumber}`);
    console.error(`   Cursor: ${dayState.actionCursor}/${dayState.actions.length}`);
    console.error(`   Error: ${accountProgress.lastError}`);
    console.error("   Resume by rerunning same command");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
