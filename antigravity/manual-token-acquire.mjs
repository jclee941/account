#!/usr/bin/env node
/**
 * Manual-assisted OAuth token acquisition for Antigravity accounts.
 *
 * Since Google blocks automated login for qws9430x accounts with qr_code_verification,
 * this script generates the OAuth URL and starts a callback server. The user opens
 * the URL in a real browser (VNC), logs in manually, and the script captures the
 * auth code and exchanges it for tokens automatically.
 *
 * Usage:
 *   node antigravity/manual-token-acquire.mjs --email qws94301@gmail.com
 *   node antigravity/manual-token-acquire.mjs --batch qws94301@gmail.com,qws94302@gmail.com
 *   node antigravity/manual-token-acquire.mjs --batch qws94301@gmail.com,qws94302@gmail.com --update-accounts
 *
 * Options:
 *   --email           Single email address
 *   --batch           Comma-separated email addresses
 *   --port            Callback server port (default: 51121)
 *   --update-accounts Update antigravity-accounts.json with new tokens
 *   --timeout         Callback timeout in seconds (default: 300)
 */

import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCallbackServer } from '../lib/oauth-callback-server.mjs';
import { exchangeAuthCode } from '../lib/token-exchange.mjs';

// ── Antigravity OAuth constants ──────────────────────────────────────────────
const CLIENT_ID = '<REDACTED>';
const CLIENT_SECRET = '<REDACTED>';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

const ACCOUNTS_FILE = join(process.env.HOME || '/home/jclee', '.config/opencode/antigravity-accounts.json');
const RESULTS_FILE = join(import.meta.dirname, 'manual-token-results.json');

// ── CLI parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const SINGLE_EMAIL = getArg('email', '');
const BATCH = getArg('batch', '');
const PORT = Number(getArg('port', '51121'));
const TIMEOUT_SEC = Number(getArg('timeout', '300'));
const UPDATE_ACCOUNTS = args.includes('--update-accounts');

const EMAILS = (SINGLE_EMAIL || BATCH).split(',').map((v) => v.trim()).filter(Boolean);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage:
  node antigravity/manual-token-acquire.mjs --email user@gmail.com
  node antigravity/manual-token-acquire.mjs --batch user1@gmail.com,user2@gmail.com --update-accounts

Options:
  --email            Single email address
  --batch            Comma-separated email addresses
  --port             Callback server port (default: 51121)
  --timeout          Callback timeout in seconds (default: 300)
  --update-accounts  Update antigravity-accounts.json with new tokens
`);
  process.exit(0);
}

if (EMAILS.length === 0) {
  console.error('Missing --email or --batch with at least one email address');
  process.exit(1);
}

// ── Token validation ─────────────────────────────────────────────────────────
async function validateRefreshToken(refreshToken) {
  if (!refreshToken) return { valid: false, error: 'no token' };
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const json = await response.json();
    if (json.access_token) {
      return { valid: true, accessToken: json.access_token, expiresIn: json.expires_in };
    }
    return { valid: false, error: `${json.error}: ${json.error_description || ''}` };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ── Per-account flow ─────────────────────────────────────────────────────────
async function acquireTokenForAccount(email) {
  const state = crypto.randomUUID();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Account: ${email}`);
  console.log(`${'═'.repeat(60)}`);

  // 1. Start callback server
  const callback = createCallbackServer({
    port: PORT,
    callbackPath: '/oauth-callback',
    timeoutMs: TIMEOUT_SEC * 1000,
    host: '0.0.0.0',   // bind all interfaces so VNC browser can reach it
  });
  await callback.waitUntilListening();
  const actualPort = callback.getPort();

  // 2. Build auth URL
  const params = new URLSearchParams({
    access_type: 'offline',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `http://localhost:${actualPort}/oauth-callback`,
    login_hint: email,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  console.log(`\n  📋 Open this URL in a browser (VNC) and log in as ${email}:`);
  console.log(`\n  ${authUrl}\n`);
  console.log(`  ⏳ Waiting for OAuth callback on port ${actualPort} (timeout: ${TIMEOUT_SEC}s)...`);
  console.log(`  💡 Password: bingogo1`);
  console.log('');

  try {
    // 3. Wait for auth code
    const callbackResult = await callback.waitForCode();

    if (!callbackResult || !callbackResult.code) {
      throw new Error('No authorization code received from callback');
    }

    const { code } = callbackResult;
    console.log(`  ✅ Auth code received: ${code.substring(0, 25)}...`);

    // 4. Exchange for tokens
    const tokens = await exchangeAuthCode({
      code,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: `http://localhost:${actualPort}/oauth-callback`,
    });

    if (tokens.error) {
      throw new Error(`Token exchange error: ${tokens.error} — ${tokens.error_description}`);
    }

    console.log(`  🎉 Tokens obtained for ${email}`);
    console.log(`     Access token:  ${tokens.access_token.substring(0, 30)}...`);
    console.log(`     Refresh token: ${tokens.refresh_token || 'NONE'}`);
    console.log(`     Scope:         ${tokens.scope}`);
    console.log(`     Expires in:    ${tokens.expires_in}s`);

    // 5. Validate the new refresh token
    const validation = await validateRefreshToken(tokens.refresh_token);
    console.log(`     Validation:    ${validation.valid ? '✅ VALID' : `❌ ${validation.error}`}`);

    return {
      email,
      success: true,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      scope: tokens.scope,
      expiresIn: tokens.expires_in,
      error: '',
    };
  } catch (err) {
    console.error(`  ❌ Failed for ${email}: ${err.message}`);
    return { email, success: false, refreshToken: '', accessToken: '', error: err.message };
  } finally {
    await callback.close().catch(() => {});
  }
}

// ── Update antigravity-accounts.json ─────────────────────────────────────────
function updateAccountsFile(results) {
  if (!existsSync(ACCOUNTS_FILE)) {
    console.log(`\n  ⚠️ Accounts file not found: ${ACCOUNTS_FILE}`);
    return;
  }

  const data = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
  let updated = 0;

  for (const result of results) {
    if (!result.success || !result.refreshToken) continue;

    const idx = data.accounts.findIndex((a) => a.email === result.email);
    if (idx === -1) continue;

    data.accounts[idx].refreshToken = result.refreshToken;
    // Clear any cooldown/error state
    delete data.accounts[idx].cooldownReason;
    delete data.accounts[idx].coolingDownUntil;
    delete data.accounts[idx].lastError;
    delete data.accounts[idx].lastErrorAt;
    data.accounts[idx].status = 'active';
    data.accounts[idx].lastTokenRefresh = new Date().toISOString();
    updated++;
    console.log(`  ✅ Updated ${result.email} in accounts file`);
  }

  if (updated > 0) {
    writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2) + '\n');
    console.log(`\n  📝 Saved ${updated} account(s) to ${ACCOUNTS_FILE}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Manual-Assisted Antigravity Token Acquisition ===');
  console.log(`Accounts: ${EMAILS.join(', ')}`);
  console.log(`Port: ${PORT} | Timeout: ${TIMEOUT_SEC}s`);
  console.log(`Update accounts file: ${UPDATE_ACCOUNTS}`);

  // Pre-check: validate existing tokens
  if (existsSync(ACCOUNTS_FILE)) {
    const data = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
    console.log('\n--- Pre-check: Current token status ---');
    for (const email of EMAILS) {
      const acct = data.accounts.find((a) => a.email === email);
      if (!acct) {
        console.log(`  ${email}: not in accounts file`);
        continue;
      }
      const v = await validateRefreshToken(acct.refreshToken);
      console.log(`  ${email}: ${v.valid ? '✅ VALID (skip?)' : `❌ INVALID (${v.error})`}`);
    }
  }

  const results = [];

  for (const email of EMAILS) {
    const result = await acquireTokenForAccount(email);
    results.push(result);

    // Brief pause between accounts (port reuse)
    if (EMAILS.indexOf(email) < EMAILS.length - 1) {
      console.log('\n  ⏳ Waiting 3s before next account...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // Save results
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${RESULTS_FILE}`);

  // Update accounts file if requested
  if (UPDATE_ACCOUNTS) {
    updateAccountsFile(results);
  }

  // Summary
  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${results.length} | Success: ${ok} | Failed: ${fail}`);

  if (ok > 0 && !UPDATE_ACCOUNTS) {
    console.log('\n💡 Run with --update-accounts to save tokens to antigravity-accounts.json');
  }

  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
