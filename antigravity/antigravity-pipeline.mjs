#!/usr/bin/env node
/**
 * antigravity-pipeline.mjs — End-to-end Antigravity account activation
 *
 * Full pipeline:
 *   1. Validate existing tokens (refresh → access via Google OAuth2)
 *   2. If invalid → acquire new tokens (auto first, then manual fallback)
 *   3. Inject tokens into VSCDB (protobuf → base64 → SQLite)
 *   4. Clear account cooldown states
 *   5. Launch Antigravity app
 *   6. Handle post-login verification (Verified → Challenge → SMS via 5sim)
 *   7. Run feature unlock flow (speedbump/security cleanup)
 *
 * Usage:
 *   node antigravity/antigravity-pipeline.mjs --accounts qws94301@gmail.com,qws94302@gmail.com \
 *     [--api-key <5SIM_KEY>] [--region indonesia] [--from-csv] [--skip-acquire] [--skip-inject] [--skip-launch] [--skip-verify] [--skip-unlock]
 *
 *   # Validate only:
 *   node antigravity/antigravity-pipeline.mjs --accounts qws94301@gmail.com --validate-only
 *
 *   # Inject only (token already acquired):
 *   node antigravity/antigravity-pipeline.mjs --accounts qws94301@gmail.com --skip-acquire --skip-launch
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CLIENT_ID, CLIENT_SECRET, getArg, validateRefreshToken } from '../lib/antigravity-shared.mjs';

// ─── Config ──────────────────────────────────────────────────────────────────

const ACCOUNTS_FILE = path.join(os.homedir(), '.config/opencode/antigravity-accounts.json');
const VSCDB_PATH = path.join(os.homedir(), '.config/Antigravity/User/globalStorage/state.vscdb');
const ROOT_DIR = path.join(import.meta.dirname, '..');
const INJECT_SCRIPT = path.join(import.meta.dirname, 'inject-vscdb-token.mjs');
const ACQUIRE_SCRIPT = path.join(import.meta.dirname, 'manual-token-acquire.mjs');
const AUTO_AUTH_SCRIPT = path.join(import.meta.dirname, 'antigravity-auth.mjs');
const UNLOCK_SCRIPT = path.join(import.meta.dirname, 'unlock-features.mjs');
const ACCOUNTS_CSV = path.join(ROOT_DIR, 'accounts.csv');
const AUTO_AUTH_RESULTS = path.join(import.meta.dirname, 'antigravity-auth-results.json');
const ISO_TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROW_START_RE = /^[a-z0-9._-]+,[a-z0-9._+-]+@[a-z0-9.-]+,/i;

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);


let ACCOUNT_LIST = (getArg(args, 'accounts', '') || getArg(args, 'account', '')).split(',').map(s => s.trim()).filter(Boolean);
const API_KEY = getArg(args, 'api-key', process.env.FIVESIM_API_KEY || '');
const FIVESIM_REGION = getArg(args, 'region', process.env.FIVESIM_REGION || 'indonesia');
const FROM_CSV = args.includes('--from-csv');
const VALIDATE_ONLY = args.includes('--validate-only');
const SKIP_ACQUIRE = args.includes('--skip-acquire');
const SKIP_INJECT = args.includes('--skip-inject');
const SKIP_LAUNCH = args.includes('--skip-launch');
const SKIP_VERIFY = args.includes('--skip-verify');
const SKIP_UNLOCK = args.includes('--skip-unlock');
const DRY_RUN = args.includes('--dry-run');
const HEADED = args.includes('--headed');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node antigravity/antigravity-pipeline.mjs --accounts email1,email2 [options]

Options:
  --accounts      Comma-separated email addresses
  --api-key       5sim API key (or FIVESIM_API_KEY env)
  --region        5sim region (default: indonesia)
  --from-csv      Import successful accounts.csv rows into antigravity-accounts.json
  --validate-only Only validate tokens, don't fix anything
  --skip-acquire  Skip token acquisition step
  --skip-inject   Skip VSCDB injection step
  --skip-launch   Skip Antigravity app launch
  --skip-verify   Skip post-login verification
  --skip-unlock   Skip feature unlock phase
  --dry-run       Show what would be done without executing
  --headed         Run browser in headed mode (enables HITL reCAPTCHA solving)
  --help          Show this help
`);
  process.exit(0);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function log(prefix, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] ${prefix} ${msg}`);
}

function loadAccounts() {
  if (!existsSync(ACCOUNTS_FILE)) return null;
  return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
}

function saveAccounts(data) {
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

function getAccountByEmail(data, email) {
  return data?.accounts?.find(a => a.email === email) || null;
}

function createDefaultAccountsData() {
  return {
    version: 4,
    accounts: [],
    activeIndex: 0,
    activeIndexByFamily: { claude: 0, gemini: 1 },
  };
}

function parseAccountsCsv(csvContent) {
  const rawLines = csvContent.split('\n');
  if (rawLines.length < 2) return [];

  const dataLines = rawLines.slice(1);
  const logicalRows = [];
  let current = '';

  for (const line of dataLines) {
    const trimmed = line.trimEnd();
    if (!trimmed && !current) continue;

    const startsNewUsername = ROW_START_RE.test(trimmed);
    if (startsNewUsername && current && !ISO_TS_RE.test(current)) {
      logicalRows.push(current);
      current = trimmed;
    } else if (current) {
      current += `\n${trimmed}`;
    } else {
      current = trimmed;
    }

    if (ISO_TS_RE.test(trimmed)) {
      logicalRows.push(current);
      current = '';
    }
  }

  if (current) logicalRows.push(current);

  const rows = [];
  for (const row of logicalRows) {
    const lastComma = row.lastIndexOf(',');
    if (lastComma === -1) continue;

    const timestamp = row.slice(lastComma + 1).trim();
    const beforeTimestamp = row.slice(0, lastComma);
    const parts = beforeTimestamp.split(',');
    if (parts.length < 8) continue;

    rows.push({
      username: parts[0] || '',
      email: parts[1] || '',
      password: parts[2] || '',
      firstName: parts[3] || '',
      lastName: parts[4] || '',
      koreanName: parts[5] || '',
      cost: parts[6] || '',
      status: parts.slice(7).join(',').trim(),
      timestamp,
    });
  }

  return rows;
}

function importAccountsFromCsv() {
  if (!existsSync(ACCOUNTS_CSV)) {
    throw new Error(`accounts.csv not found: ${ACCOUNTS_CSV}`);
  }

  const csvContent = readFileSync(ACCOUNTS_CSV, 'utf-8');
  const parsedRows = parseAccountsCsv(csvContent);
  const successRows = parsedRows.filter((row) => /^(success|created(:\w+)?)$/.test(row.status) && row.email);

  const data = loadAccounts() || createDefaultAccountsData();
  data.accounts ||= [];

  const existingEmails = new Set(data.accounts.map((account) => account.email));
  const addedEmails = [];

  for (const row of successRows) {
    if (existingEmails.has(row.email)) continue;

    data.accounts.push({
      email: row.email,
      refreshToken: '',
      addedAt: Date.now(),
      lastUsed: 0,
      enabled: true,
      fingerprint: null,
      cachedQuota: {},
      status: 'pending-token',
    });
    existingEmails.add(row.email);
    addedEmails.push(row.email);
  }

  saveAccounts(data);

  return {
    importedSuccessRows: successRows.length,
    addedEmails,
  };
}

// ─── Step 1: Token Validation ────────────────────────────────────────────────


// ─── Step 2: Token Acquisition ───────────────────────────────────────────────

async function acquireTokensManual(emails) {
  log('🔑', `Starting manual token acquisition for ${emails.length} account(s)`);
  log('📋', `Emails: ${emails.join(', ')}`);

  const acquireArgs = [
    ACQUIRE_SCRIPT,
    '--batch', emails.join(','),
    '--update-accounts',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('node', acquireArgs, {
      stdio: 'inherit',
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':55' },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`Token acquisition exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Token acquisition failed to start: ${err.message}`));
    });
  });
}

async function acquireTokensAuto(emails, apiKey, region, headed = false) {
  log('🤖', `Starting automated token acquisition for ${emails.length} account(s)`);
  log('📋', `Emails: ${emails.join(', ')}`);

  const autoArgs = [
    AUTO_AUTH_SCRIPT,
    '--batch', emails.join(','),
    '--api-key', apiKey,
    '--region', region,
    ...(headed ? ['--headed'] : []),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('node', autoArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':55',
      },
    });

    child.on('close', (code) => {
      if (code === 0) {
        if (existsSync(AUTO_AUTH_RESULTS)) {
          try {
            const results = JSON.parse(readFileSync(AUTO_AUTH_RESULTS, 'utf-8'));
            for (const result of results) {
              if (result.success && result.refreshToken) {
                updateAccountToken(result.email, result.accessToken, result.refreshToken);
              }
            }
          } catch (err) {
            log('⚠️', `Failed to read automated auth results: ${err.message}`);
          }
        } else {
          log('⚠️', `Automated auth results file not found: ${AUTO_AUTH_RESULTS}`);
        }
        resolve({ success: true });
      } else {
        reject(new Error(`Automated token acquisition exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Automated token acquisition failed to start: ${err.message}`));
    });
  });
}

// ─── Step 3: VSCDB Injection ─────────────────────────────────────────────────

function injectToken(email, opts = {}) {
  log('💉', `Injecting token for ${email} into VSCDB`);

  const injectArgs = [
    INJECT_SCRIPT,
    '--from-accounts', email,
    '--vscdb-path', opts.vscdbPath || VSCDB_PATH,
  ];

  if (opts.dryRun) injectArgs.push('--dry-run');

  try {
    const output = execSync(['node', ...injectArgs].join(' '), {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env },
    });
    console.log(output);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Step 4: Launch Antigravity ──────────────────────────────────────────────

function launchAntigravity(opts = {}) {
  const display = process.env.DISPLAY || ':55';
  log('🚀', `Launching Antigravity (DISPLAY=${display})`);

  // Kill any existing Antigravity process
  try {
    execSync('pkill -f "antigravity" 2>/dev/null || true', { timeout: 5000 });
    log('🔄', 'Killed existing Antigravity process');
  } catch { /* ignore */ }

  // Wait a moment for cleanup
  execSync('sleep 2');

  const child = spawn('/usr/bin/antigravity', ['--no-sandbox'], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, DISPLAY: display },
  });

  child.unref();
  log('✅', `Antigravity launched (PID: ${child.pid})`);

  return { pid: child.pid };
}

// ─── Step 5: Clear Cooldowns ─────────────────────────────────────────────────

function clearCooldowns(emails) {
  const data = loadAccounts();
  if (!data) return;

  let changed = false;
  for (const email of emails) {
    const account = getAccountByEmail(data, email);
    if (!account) continue;

    if (account.coolingDownUntil || account.cooldownReason) {
      delete account.coolingDownUntil;
      delete account.cooldownReason;
      changed = true;
      log('🧹', `Cleared cooldown for ${email}`);
    }

    if (account.status === 'auth-failure') {
      account.status = 'active';
      changed = true;
      log('🔄', `Reset status to active for ${email}`);
    }
  }

  if (changed) {
    saveAccounts(data);
    log('💾', 'Saved updated accounts file');
  }
}

// ─── Step 6: Update Account Tokens ───────────────────────────────────────────

function updateAccountToken(email, accessToken, refreshToken) {
  const data = loadAccounts();
  if (!data) return;

  const account = getAccountByEmail(data, email);
  if (!account) return;

  if (accessToken) account.accessToken = accessToken;
  if (refreshToken) account.refreshToken = refreshToken;
  account.tokenExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
  account.lastTokenRefresh = new Date().toISOString();
  account.status = 'active';
  delete account.coolingDownUntil;
  delete account.cooldownReason;

  saveAccounts(data);
  log('💾', `Updated token for ${email}`);
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Antigravity Pipeline — End-to-End Account Activation');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`VSCDB:    ${VSCDB_PATH}`);
  console.log(`Region:   ${FIVESIM_REGION}`);
  console.log(`Dry run:  ${DRY_RUN}`);
  console.log(`Flags:    ${[
    FROM_CSV && 'from-csv',
    VALIDATE_ONLY && 'validate-only',
    SKIP_ACQUIRE && 'skip-acquire',
    SKIP_INJECT && 'skip-inject',
    SKIP_LAUNCH && 'skip-launch',
    SKIP_VERIFY && 'skip-verify',
    SKIP_UNLOCK && 'skip-unlock',
    HEADED && 'headed',
  ].filter(Boolean).join(', ') || 'none'}`);
  console.log('');

  // ── Phase 0: Import from accounts.csv (optional) ──
  if (FROM_CSV) {
    console.log('── Phase 0: CSV → JSON Bridge ────────────────────────────\n');
    if (DRY_RUN) {
      log('🏁', `DRY RUN: Would import successful accounts from ${ACCOUNTS_CSV}`);
    } else {
      try {
        const importResult = importAccountsFromCsv();
        log('✅', `Imported ${importResult.importedSuccessRows} success row(s) from CSV`);
        log('✅', `Added ${importResult.addedEmails.length} new account(s) to antigravity-accounts.json`);

        if (ACCOUNT_LIST.length === 0 && importResult.addedEmails.length > 0) {
          ACCOUNT_LIST = importResult.addedEmails;
          log('📥', `Using newly added accounts as target list: ${ACCOUNT_LIST.join(', ')}`);
        }
      } catch (err) {
        log('❌', `CSV import failed: ${err.message}`);
      }
    }
    console.log('');
  }

  if (ACCOUNT_LIST.length === 0) {
    console.error('❌ No accounts specified. Use --accounts email1,email2,... (or --from-csv to import new accounts)');
    process.exit(1);
  }

  console.log(`Accounts: ${ACCOUNT_LIST.join(', ')}`);
  console.log('');

  // ── Phase 1: Validate existing tokens ──
  console.log('── Phase 1: Token Validation ──────────────────────────────\n');

  const validationResults = {};
  const needsNewToken = [];

  for (const email of ACCOUNT_LIST) {
    const data = loadAccounts();
    const account = getAccountByEmail(data, email);

    if (!account) {
      log('📝', `${email}: not in accounts file — creating pending entry`);
      const data = loadAccounts() || createDefaultAccountsData();
      data.accounts.push({
        email,
        refreshToken: '',
        addedAt: Date.now(),
        lastUsed: 0,
        enabled: true,
        fingerprint: null,
        cachedQuota: {},
        status: 'pending-token',
      });
      saveAccounts(data);
      validationResults[email] = { valid: false, error: 'new_account' };
      needsNewToken.push(email);
      continue;
    }

    log('🔍', `Validating ${email}...`);
    const result = await validateRefreshToken(account.refreshToken);
    validationResults[email] = result;

    if (result.valid) {
      log('✅', `${email}: token VALID (access_token=${result.accessToken.substring(0, 20)}...)`);
      // Update the access token while we're at it
      updateAccountToken(email, result.accessToken, null);
    } else {
      log('❌', `${email}: token INVALID (${result.error}: ${result.description || ''})`);
      needsNewToken.push(email);
    }
  }

  console.log(`\nValidation summary: ${ACCOUNT_LIST.length - needsNewToken.length} valid, ${needsNewToken.length} invalid\n`);

  if (VALIDATE_ONLY) {
    console.log('── Validate-only mode. Stopping here. ──');
    process.exitCode = needsNewToken.length > 0 ? 1 : 0;
    return;
  }

  // ── Phase 2: Acquire new tokens for invalid accounts ──
  if (needsNewToken.length > 0 && !SKIP_ACQUIRE) {
    console.log('── Phase 2: Token Acquisition ────────────────────────────\n');

    if (DRY_RUN) {
      log('🏁', `DRY RUN: Would acquire tokens for: ${needsNewToken.join(', ')}`);
    } else {
      let pendingEmails = [...needsNewToken];

      if (API_KEY) {
        log('🔄', 'Phase 2a: Trying automated token acquisition first');
        try {
          await acquireTokensAuto(pendingEmails, API_KEY, FIVESIM_REGION, HEADED);
          log('✅', 'Automated token acquisition completed');
        } catch (err) {
          log('⚠️', `Automated acquisition failed: ${err.message}`);
        }

        const stillInvalidAfterAuto = [];
        for (const email of pendingEmails) {
          const data = loadAccounts();
          const account = getAccountByEmail(data, email);
          const recheck = await validateRefreshToken(account?.refreshToken);

          if (recheck.valid) {
            log('✅', `${email}: token validated after auto acquisition`);
            updateAccountToken(email, recheck.accessToken, null);
            validationResults[email] = recheck;
          } else {
            stillInvalidAfterAuto.push(email);
          }
        }

        pendingEmails = stillInvalidAfterAuto;
        if (pendingEmails.length === 0) {
          log('✅', 'All invalid accounts recovered by automated acquisition');
        } else {
          log('⚠️', `${pendingEmails.length} account(s) still need manual token acquisition`);
        }
      } else {
        log('⚠️', 'No 5sim API key — skipping Phase 2a automated acquisition');
      }

      if (pendingEmails.length > 0) {
        log('🔄', 'Phase 2b: Running manual token acquisition fallback');
        try {
          await acquireTokensManual(pendingEmails);
          log('✅', 'Manual token acquisition completed');

          for (const email of pendingEmails) {
            const data = loadAccounts();
            const account = getAccountByEmail(data, email);
            const recheck = await validateRefreshToken(account?.refreshToken);

            if (recheck.valid) {
              log('✅', `${email}: NEW token validated successfully`);
              updateAccountToken(email, recheck.accessToken, null);
              validationResults[email] = recheck;
            } else {
              log('❌', `${email}: NEW token still invalid — manual login may have failed`);
            }
          }
        } catch (err) {
          log('❌', `Manual token acquisition failed: ${err.message}`);
          log('📋', `Run manually: node antigravity/manual-token-acquire.mjs --batch ${pendingEmails.join(',')} --update-accounts`);
        }
      }
    }
    console.log('');
  } else if (needsNewToken.length > 0) {
    log('⏭️', `Skipping acquisition for ${needsNewToken.length} invalid account(s)`);
    console.log('');
  }

  // ── Phase 3: VSCDB Injection ──
  if (!SKIP_INJECT) {
    console.log('── Phase 3: VSCDB Token Injection ────────────────────────\n');

    // Find the "best" account to inject (first valid one in the list)
    const validAccounts = ACCOUNT_LIST.filter(e => validationResults[e]?.valid);
    const targetEmail = validAccounts[0] || ACCOUNT_LIST[0];

    if (validationResults[targetEmail]?.valid) {
      log('💉', `Injecting ${targetEmail} into VSCDB`);
      const injectResult = injectToken(targetEmail, { dryRun: DRY_RUN });

      if (injectResult.success) {
        log('✅', 'VSCDB injection successful');
      } else {
        log('❌', `VSCDB injection failed: ${injectResult.error}`);
      }
    } else {
      log('⚠️', `No valid token available for injection. ${targetEmail} is invalid.`);
      log('📋', 'Acquire tokens first, then re-run without --skip-acquire');
    }
    console.log('');
  }

  // ── Phase 4: Clear cooldowns ──
  console.log('── Phase 4: Clear Cooldowns ──────────────────────────────\n');
  if (!DRY_RUN) {
    clearCooldowns(ACCOUNT_LIST);
  } else {
    log('🏁', 'DRY RUN: Would clear cooldowns');
  }
  console.log('');

  // ── Phase 5: Launch Antigravity ──
  if (!SKIP_LAUNCH) {
    console.log('── Phase 5: Launch Antigravity ───────────────────────────\n');

    if (DRY_RUN) {
      log('🏁', 'DRY RUN: Would launch Antigravity');
    } else {
      const validAccounts = ACCOUNT_LIST.filter(e => validationResults[e]?.valid);
      if (validAccounts.length > 0) {
        launchAntigravity();
        log('⏳', 'Waiting 15s for Antigravity to start...');
        await new Promise(r => setTimeout(r, 15000));
      } else {
        log('⚠️', 'No valid accounts — skipping Antigravity launch');
      }
    }
    console.log('');
  }


  let verifyFailed = false;
  let unlockFailed = false;
  // ── Phase 6: Post-Login Verification (SMS via 5sim) ──
  if (!SKIP_VERIFY) {
    console.log('');
    console.log('── Phase 6: Post-Login Verification ─────────────────────');
    console.log('');

    if (DRY_RUN) {
      log('🏁', 'DRY RUN: Would run post-login verification');
    } else if (!API_KEY) {
      log('⚠️', 'No 5sim API key — skipping post-login verification');
      log('📋', 'Pass --api-key <KEY> or set FIVESIM_API_KEY to enable SMS verification');
    } else {
      const validEmails = ACCOUNT_LIST.filter(e => validationResults[e]?.valid);
      if (validEmails.length > 0) {
        log('🔐', `Running SMS verification for ${validEmails.length} account(s)`);
        const authScript = path.join(import.meta.dirname, 'antigravity-auth.mjs');
        try {
          const authArgs = [
            authScript,
            '--batch', validEmails.join(','),
            '--api-key', API_KEY,
            '--region', FIVESIM_REGION,
          ];
          const result = await new Promise((resolve, reject) => {
            const child = spawn('node', authArgs, {
              stdio: 'inherit',
              env: { ...process.env, DISPLAY: process.env.DISPLAY || ':55' },
            });
            child.on('close', (code) => resolve({ success: code === 0, code }));
            child.on('error', (err) => reject(err));
          });
          if (result.success) {
            log('✅', 'Post-login verification completed');
          } else {
            verifyFailed = true;
            log('⚠️', `Verification exited with code ${result.code} — some accounts may need manual attention`);
          }
        } catch (err) {
          verifyFailed = true;
          log('❌', `Verification failed to start: ${err.message}`);
        }
      } else {
        log('⚠️', 'No valid accounts — skipping verification');
      }
    }
    console.log('');
  } else {
    log('⏭️', 'Skipping post-login verification (--skip-verify)');
    console.log('');
  }

  // ── Phase 7: Feature Unlock ──
  if (!SKIP_UNLOCK) {
    console.log('── Phase 7: Feature Unlock ───────────────────────────────\n');

    if (DRY_RUN) {
      log('🏁', 'DRY RUN: Would run feature unlock');
    } else if (!API_KEY) {
      log('⚠️', 'No 5sim API key — skipping feature unlock');
      log('📋', 'Pass --api-key <KEY> or set FIVESIM_API_KEY to enable feature unlock');
    } else {
      const validEmails = ACCOUNT_LIST.filter(e => validationResults[e]?.valid);
      if (validEmails.length > 0) {
        log('🔓', `Running feature unlock for ${validEmails.length} account(s)`);
        try {
          const unlockArgs = [
            UNLOCK_SCRIPT,
            '--batch', validEmails.join(','),
            '--api-key', API_KEY,
            '--region', FIVESIM_REGION,
          ];

          const unlockResult = await new Promise((resolve, reject) => {
            const child = spawn('node', unlockArgs, {
              stdio: 'inherit',
              env: { ...process.env, DISPLAY: process.env.DISPLAY || ':55' },
            });
            child.on('close', (code) => resolve({ success: code === 0, code }));
            child.on('error', (err) => reject(err));
          });

          if (unlockResult.success) {
            log('✅', 'Feature unlock completed');
          } else {
            unlockFailed = true;
            log('⚠️', `Feature unlock exited with code ${unlockResult.code}`);
          }
        } catch (err) {
          unlockFailed = true;
          log('❌', `Feature unlock failed to start: ${err.message}`);
        }
      } else {
        log('⚠️', 'No valid accounts — skipping feature unlock');
      }
    }
    console.log('');
  } else {
    log('⏭️', 'Skipping feature unlock (--skip-unlock)');
    console.log('');
  }

  // ── Summary ──
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline Summary');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const email of ACCOUNT_LIST) {
    const v = validationResults[email];
    const status = v?.valid ? '✅ VALID' : `❌ INVALID (${v?.error || 'unknown'})`;
    console.log(`  ${email}: ${status}`);
  }

  const allTokensValid = ACCOUNT_LIST.every(e => validationResults[e]?.valid);
  const allValid = allTokensValid && !verifyFailed && !unlockFailed;
  console.log(`\n  Phase 6 (Verification): ${SKIP_VERIFY ? '⏭️ skipped' : verifyFailed ? '⚠️ issues detected' : '✅ ok'}`);
  console.log(`  Phase 7 (Feature Unlock): ${SKIP_UNLOCK ? '⏭️ skipped' : unlockFailed ? '⚠️ issues detected' : '✅ ok'}`);
  console.log(`\n  Overall: ${allValid ? '✅ All accounts ready' : '⚠️ Some accounts need attention'}`);

  if (!allValid) {
    console.log('\n  Next steps for invalid accounts:');
    console.log('  1. Run: node antigravity/manual-token-acquire.mjs --batch <emails> --update-accounts');
    console.log('  2. Log in via VNC at :10 when prompted');
    console.log('  3. Re-run this pipeline: node antigravity/antigravity-pipeline.mjs --accounts <emails>');
  }

  console.log('');
  process.exitCode = allValid ? 0 : 1;
}

main().catch(err => {
  console.error(`\n❌ Pipeline fatal error: ${err.message}`);
  process.exit(1);
});
