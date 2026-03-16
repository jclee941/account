#!/usr/bin/env node
/**
 * antigravity-pipeline.mjs — End-to-end Antigravity account activation
 *
 * Full pipeline:
 *   1. Validate existing tokens (refresh → access via Google OAuth2)
 *   2. If invalid → acquire new tokens (manual-assisted or automated)
 *   3. Inject tokens into VSCDB (protobuf → base64 → SQLite)
 *   4. Launch Antigravity app
 *   5. Handle post-login verification (Verified → Challenge → SMS via 5sim)
 *   6. Update antigravity-accounts.json with results
 *
 * Usage:
 *   node antigravity/antigravity-pipeline.mjs --accounts qws94301@gmail.com,qws94302@gmail.com \
 *     [--api-key <5SIM_KEY>] [--skip-acquire] [--skip-inject] [--skip-launch] [--skip-verify]
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

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);


const ACCOUNT_LIST = (getArg(args, 'accounts', '') || getArg(args, 'account', '')).split(',').map(s => s.trim()).filter(Boolean);
const API_KEY = getArg(args, 'api-key', process.env.FIVESIM_API_KEY || '');
const VALIDATE_ONLY = args.includes('--validate-only');
const SKIP_ACQUIRE = args.includes('--skip-acquire');
const SKIP_INJECT = args.includes('--skip-inject');
const SKIP_LAUNCH = args.includes('--skip-launch');
const SKIP_VERIFY = args.includes('--skip-verify');
const DRY_RUN = args.includes('--dry-run');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node antigravity/antigravity-pipeline.mjs --accounts email1,email2 [options]

Options:
  --accounts      Comma-separated email addresses
  --api-key       5sim API key (or FIVESIM_API_KEY env)
  --validate-only Only validate tokens, don't fix anything
  --skip-acquire  Skip token acquisition step
  --skip-inject   Skip VSCDB injection step
  --skip-launch   Skip Antigravity app launch
  --skip-verify   Skip post-login verification
  --dry-run       Show what would be done without executing
  --help          Show this help
`);
  process.exit(0);
}

if (ACCOUNT_LIST.length === 0) {
  console.error('❌ No accounts specified. Use --accounts email1,email2,...');
  process.exit(1);
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
  console.log(`Accounts: ${ACCOUNT_LIST.join(', ')}`);
  console.log(`VSCDB:    ${VSCDB_PATH}`);
  console.log(`Dry run:  ${DRY_RUN}`);
  console.log(`Flags:    ${[
    VALIDATE_ONLY && 'validate-only',
    SKIP_ACQUIRE && 'skip-acquire',
    SKIP_INJECT && 'skip-inject',
    SKIP_LAUNCH && 'skip-launch',
    SKIP_VERIFY && 'skip-verify',
  ].filter(Boolean).join(', ') || 'none'}`);
  console.log('');

  // ── Phase 1: Validate existing tokens ──
  console.log('── Phase 1: Token Validation ──────────────────────────────\n');

  const validationResults = {};
  const needsNewToken = [];

  for (const email of ACCOUNT_LIST) {
    const data = loadAccounts();
    const account = getAccountByEmail(data, email);

    if (!account) {
      log('❌', `${email}: not found in accounts file`);
      validationResults[email] = { valid: false, error: 'not_found' };
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
      try {
        await acquireTokensManual(needsNewToken);
        log('✅', 'Token acquisition completed');

        // Re-validate after acquisition
        for (const email of needsNewToken) {
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
        log('❌', `Token acquisition failed: ${err.message}`);
        log('📋', 'Run manually: node antigravity/manual-token-acquire.mjs --batch ' + needsNewToken.join(',') + ' --update-accounts');
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
  const allValid = allTokensValid && !verifyFailed;
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
