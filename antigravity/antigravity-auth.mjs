#!/usr/bin/env node
/**
 * Antigravity Initial Authentication
 *
 * Complete flow:
 *   1. Start OAuth callback server
 *   2. Build Antigravity auth URL (Client ID 1071006060591)
 *   3. Launch browser → Google login
 *   4. Detect & handle SMS verification challenge via 5sim
 *   5. Complete OAuth consent
 *   6. Exchange auth code → refresh token
 *   7. Output results (JSON)
 *
 * Usage:
 *   node antigravity-auth.mjs --batch qws94302@gmail.com,qws94303@gmail.com --api-key <5SIM_KEY> [--region indonesia] [--headed] [--password bingogo1]
 */

import crypto from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCallbackServer } from '../lib/oauth-callback-server.mjs';
import { exchangeAuthCode } from '../lib/token-exchange.mjs';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  SCOPES,
  DEFAULT_PASSWORD,
  DEFAULT_REGION,
  STEALTH_ARGS,
  DESKTOP_DEVICE,
  delay,
  randomInt,
  getBodyText,
  humanType,
  getArg,
  normalizeEmail,
  createSaveShot,
  createLogStep,
  hasVerificationChallenge,
  selectSmsOption,
  openVerificationFlow,
  handleSmsVerification,
} from '../lib/antigravity-shared.mjs';

// ── Paths ───────────────────────────────────────────────────────────────────
const SCREENSHOT_DIR = join(import.meta.dirname, '..', 'screenshots');
const RESULTS_FILE = join(import.meta.dirname, 'antigravity-auth-results.json');

// ── CLI parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

const BATCH = getArg(args, 'batch', '');
const ACCOUNTS = String(BATCH || '').split(',').map((v) => v.trim()).filter(Boolean);
const PASSWORD = getArg(args, 'password', DEFAULT_PASSWORD).trim();
const HEADED = args.includes('--headed');
const FIVESIM_API_KEY = getArg(args, 'api-key', process.env.FIVESIM_API_KEY || '').trim();
const FIVESIM_REGION = getArg(args, 'region', process.env.FIVESIM_REGION || DEFAULT_REGION).trim();

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage:');
  console.log('  node antigravity-auth.mjs --batch email1@gmail.com,email2@gmail.com --api-key <5SIM_KEY> [--region indonesia] [--headed] [--password bingogo1]');
  console.log('');
  console.log('Options:');
  console.log('  --batch      Comma-separated email addresses');
  console.log('  --api-key    5sim API key (or FIVESIM_API_KEY env)');
  console.log('  --region     5sim region (default: indonesia)');
  console.log('  --password   Google password (default: bingogo1)');
  console.log('  --headed     Show browser window');
  process.exit(0);
}

if (ACCOUNTS.length === 0) {
  console.error('Missing --batch with at least one email address');
  process.exit(1);
}

if (!FIVESIM_API_KEY) {
  console.error('Missing 5sim API key. Use --api-key <KEY> or set FIVESIM_API_KEY');
  process.exit(1);
}

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// ── OAuth consent handling (post-verification) ───────────────────────────────
async function handleOAuthConsent(page, callbackUrlPattern, maxAttempts = 15) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentUrl = page.url();

    if (currentUrl.includes(callbackUrlPattern)) return true;

    // Advanced / unsafe link
    const advancedLink = page.locator('a:has-text("고급"), a:has-text("Advanced"), button:has-text("Advanced")');
    if (await advancedLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await advancedLink.first().click().catch(() => {});
      await delay(2000);
    }

    const goToLink = page.locator('a#proceed-link, a:has-text("Go to"), a:has-text("(unsafe)"), a:has-text("이동")');
    if (await goToLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await goToLink.first().click().catch(() => {});
      await delay(3000);
      continue;
    }

    // Checkboxes (scope consent)
    const checkboxes = page.locator('input[type="checkbox"]:not(:checked)');
    const checkCount = await checkboxes.count().catch(() => 0);
    if (checkCount > 0) {
      for (let i = 0; i < checkCount; i++) {
        await checkboxes.nth(i).check().catch(() => {});
      }
      await delay(1000);
    }

    // Allow / Continue buttons
    const allowBtn = page.locator([
      'button:has-text("허용")', 'button:has-text("Allow")',
      'button:has-text("계속")', 'button:has-text("Continue")',
      'button:has-text("로그인")', 'button:has-text("Sign in")',
    ].join(', '));
    if (await allowBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await allowBtn.first().click().catch(() => {});
      await delay(5000);
      if (page.url().includes(callbackUrlPattern)) return true;
    }

    await delay(2000);
  }
  return false;
}

// ── Per-account flow ─────────────────────────────────────────────────────────
async function runForAccount(browser, email, password, apiKey, region) {
  const state = crypto.randomUUID();
  const logStep = createLogStep();
  const shot = createSaveShot({ prefix: 'ag-', dir: SCREENSHOT_DIR });

  // 1. Start callback server
  const callback = createCallbackServer({
    port: 0,
    callbackPath: '/oauth-callback',
    timeoutMs: 300_000,
    host: 'localhost',
  });
  await callback.waitUntilListening();
  const port = callback.getPort();
  const redirectUri = `http://localhost:${port}/oauth-callback`;

  // 2. Build auth URL
  const params = new URLSearchParams({
    access_type: 'offline',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // 3. Browser context
  const context = await browser.newContext({
    ...DESKTOP_DEVICE,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  });
  const page = await context.newPage();

  // URL monitoring
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url.includes('verification') || url.includes('idv') || url.includes('speedbump')
        || url.includes('challenge') || url.includes('signin/v2') || url.includes('deniedsigninrejected')) {
        console.log(`  🔔 ${url.substring(0, 150)}`);
      }
    }
  });

  try {
    logStep(`Starting Antigravity auth: ${email}`);

    // 4. Navigate to OAuth URL
    await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await delay(2000);
    await shot(page, email, 'initial');

    // 5. Google login — email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ timeout: 10_000 });
    await emailInput.fill(email);
    await page.locator('#identifierNext button, button:has-text("다음"), button:has-text("Next")').first().click();
    await delay(4000);
    await shot(page, email, 'after-email');

    // 5b. Check for reCAPTCHA or login challenge BEFORE waiting for password
    const postEmailUrl = page.url();
    if (postEmailUrl.includes('challenge/recaptcha') || postEmailUrl.includes('challenge/selection')
        || postEmailUrl.includes('deniedsigninrejected') || postEmailUrl.includes('challenge/dp')) {
      await shot(page, email, 'blocked-challenge');
      throw new Error(`Login blocked by Google challenge: ${postEmailUrl.split('?')[0]}`);
    }

    // 6. Google login — password
    const pwInput = page.locator('input[type="password"]');
    await pwInput.waitFor({ timeout: 10_000 });
    await pwInput.fill(password);
    await page.locator('#passwordNext button, button:has-text("다음"), button:has-text("Next")').first().click();
    await delay(6000);
    await shot(page, email, 'after-password');

    // Check login failure
    const loginBody = await getBodyText(page);
    if (loginBody.includes('잘못된 비밀번호') || loginBody.includes('Wrong password')) {
      throw new Error('Login failed: Wrong password');
    }

    // 7. Check for verification challenge
    const bodyText = await getBodyText(page);
    const currentUrl = page.url();
    const needsVerification = hasVerificationChallenge(bodyText, currentUrl);

    if (needsVerification) {
      logStep(`🛡️ Verification challenge detected for ${email}`);
      await shot(page, email, 'verification-detected');

      // Try to open the verification flow
      await openVerificationFlow(page, email, shot);
      await delay(2000);

      // Select SMS option
      await selectSmsOption(page, email, shot);
      await shot(page, email, 'sms-selected');

      // Handle SMS verification via 5sim
      const result = await handleSmsVerification(page, email, apiKey, region, { shotFn: shot, logFn: logStep });
      logStep(`✅ SMS verification passed for ${email} (cost: ${result.cost.toFixed(4)})`);
      await delay(3000);
    } else {
      logStep(`No verification challenge for ${email}. Proceeding to consent.`);
    }

    // 8. Handle OAuth consent
    const callbackPattern = `localhost:${port}`;
    const callbackPromise = callback.waitForCode();

    // Check if already redirected
    if (!page.url().includes(callbackPattern)) {
      const consentOk = await handleOAuthConsent(page, callbackPattern);
      if (!consentOk) {
        await shot(page, email, 'consent-failed');
        throw new Error('OAuth consent flow did not reach callback');
      }
    }

    // 9. Wait for auth code
    logStep('Waiting for OAuth callback...');
    const callbackResult = await Promise.race([
      callbackPromise,
      delay(30_000).then(() => null),
    ]);

    if (!callbackResult || !callbackResult.code) {
      await shot(page, email, 'no-callback');
      const finalBody = await getBodyText(page);
      throw new Error(`No auth code received. Page: ${page.url()} Content: ${finalBody.substring(0, 500)}`);
    }

    const { code } = callbackResult;
    logStep(`📥 Auth code received: ${code.substring(0, 25)}...`);

    // 10. Exchange for tokens
    const tokens = await exchangeAuthCode({
      code,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri,
    });

    if (tokens.error) {
      throw new Error(`Token exchange error: ${tokens.error} — ${tokens.error_description}`);
    }

    logStep(`🎉 Refresh token obtained for ${email}`);
    console.log(`  Access token: ${tokens.access_token.substring(0, 30)}...`);
    console.log(`  Refresh token: ${tokens.refresh_token || 'NONE'}`);
    console.log(`  Scope: ${tokens.scope}`);

    // 11. Quick Gemini API test
    try {
      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
            'x-goog-user-project': 'anthropic-antigravity',
          },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello in one word' }] }] }),
        },
      );
      console.log(`  Gemini API test: ${geminiRes.status}`);
    } catch (err) {
      console.log(`  Gemini API test failed: ${err.message}`);
    }

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
    await shot(page, email, 'error').catch(() => {});
    return { email, success: false, refreshToken: '', accessToken: '', error: String(err.message || err) };
  } finally {
    await context.close().catch(() => {});
    await callback.close().catch(() => {});
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Antigravity Initial Authentication ===');
  console.log(`Accounts: ${ACCOUNTS.join(', ')}`);
  console.log(`Region: ${FIVESIM_REGION}`);
  console.log(`Headed: ${HEADED}\n`);

  const { chromium } = await import('rebrowser-playwright');
  const browser = await chromium.launch({
    headless: !HEADED,
    args: STEALTH_ARGS,
  });

  const results = [];
  const logStep = createLogStep();

  try {
    for (const email of ACCOUNTS) {
      logStep.reset();
      const result = await runForAccount(browser, email, PASSWORD, FIVESIM_API_KEY, FIVESIM_REGION);
      results.push(result);

      if (result.success) {
        console.log(`\n✅ ${email}: refresh_token=${result.refreshToken?.substring(0, 30)}...\n`);
      } else {
        console.log(`\n❌ ${email}: ${result.error}\n`);
      }

      if (ACCOUNTS.indexOf(email) < ACCOUNTS.length - 1) {
        await delay(randomInt(8000, 15000));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Save results
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${RESULTS_FILE}`);

  // Summary
  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${results.length} | Success: ${ok} | Failed: ${fail}`);

  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});

