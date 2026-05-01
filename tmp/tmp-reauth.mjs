#!/usr/bin/env node
import crypto from 'node:crypto';
import { createCallbackServer } from './lib/oauth-callback-server.mjs';
import { exchangeAuthCode } from './lib/token-exchange.mjs';

const CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET;
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];
const EMAIL = process.env.GMAIL_EMAIL || '';
const PASSWORD = process.env.GMAIL_PASSWORD || '';

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--password-store=basic',
  '--use-mock-keychain',
];

const delay = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // Use rebrowser-playwright for stealth
  const { chromium } = await import('rebrowser-playwright');

  // 1. Start callback server
  const callback = createCallbackServer({
    port: 0,
    callbackPath: '/oauth-callback',
    timeoutMs: 120_000,
    host: 'localhost',
  });
  await callback.waitUntilListening();
  const port = callback.getPort();
  const redirectUri = `http://localhost:${port}/oauth-callback`;

  // 2. Build auth URL
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    access_type: 'offline',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    login_hint: EMAIL,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // 3. Browser login with stealth
  const browser = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  });
  const page = await context.newPage();

  console.log('Navigating to OAuth URL...');
  await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(3000);

  // Email
  const emailInput = page.locator('input[type="email"], input[name="identifier"]');
  await emailInput.first().waitFor({ timeout: 15000 });
  await emailInput.first().fill(EMAIL);
  await page.locator('#identifierNext button, button:has-text("다음"), button:has-text("Next")').first().click();
  await delay(4000);
  console.log('After email:', page.url().substring(0, 120));

  // Password
  const passInput = page.locator('input[type="password"]');
  await passInput.first().waitFor({ timeout: 15000 });
  await passInput.first().fill(PASSWORD);
  await page.locator('#passwordNext button, button:has-text("다음"), button:has-text("Next")').first().click();
  await delay(5000);
  console.log('After password:', page.url().substring(0, 120));

  // Handle consent/challenge pages
  for (let attempt = 0; attempt < 12; attempt++) {
    const curUrl = page.url();
    if (curUrl.includes('localhost')) {
      console.log('Redirected to callback!');
      break;
    }

    console.log(`  Page ${attempt}: ${curUrl.substring(0, 150)}`);

    // Try consent buttons
    const selectors = [
      'button:has-text("허용")',
      'button:has-text("Allow")',
      'button:has-text("계속")',
      'button:has-text("Continue")',
      '#submit_approve_access',
      'button[data-value="accept"]',
      'button:has-text("동의")',
      'button:has-text("모두 선택")',
      'button:has-text("Select all")',
      'button:has-text("I agree")',
      'button:has-text("확인")',
    ];

    let clicked = false;
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click();
          console.log('  Clicked:', sel);
          clicked = true;
          await delay(3000);
          break;
        }
      } catch {}
    }

    if (!clicked) {
      // Check for checkboxes
      try {
        const checkboxes = page.locator('input[type="checkbox"]:not(:checked)');
        const count = await checkboxes.count();
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            await checkboxes.nth(i).check();
          }
          console.log(`  Checked ${count} checkboxes`);
          await delay(1000);
          continue;
        }
      } catch {}
      await delay(2000);
    }
  }

  console.log('Final URL:', page.url().substring(0, 150));

  // 4. Get auth code
  let code;
  try {
    code = await callback.waitForCode();
    console.log('Got auth code:', code.substring(0, 30) + '...');
  } catch (e) {
    console.error('Failed to get auth code:', e.message);
    console.error('Current URL:', page.url());
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000));
    console.error('Page text:', bodyText);
    await browser.close();
    callback.close();
    process.exit(1);
  }

  // 5. Exchange code for tokens
  const tokens = await exchangeAuthCode({
    code,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri,
  });
  console.log('TOKEN_RESULT:' + JSON.stringify(tokens));

  await browser.close();
  callback.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
