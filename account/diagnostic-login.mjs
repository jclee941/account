#!/usr/bin/env node
/**
 * Diagnostic Gmail Login Test - Shows what Google actually says
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { promisify } from 'util';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const CDP_PORT = 9227;
const USER_DATA_DIR = '/tmp/gmail-diagnostic-profile';

async function launchChrome(headed = false) {
  const { exec } = await import('child_process');
  const execAsync = promisify(exec);
  
  try {
    await execAsync(`rm -rf "${USER_DATA_DIR}"`);
    await execAsync(`mkdir -p "${USER_DATA_DIR}"`);
  } catch (e) {}
  
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,720',
  ];
  
  if (!headed) args.push('--headless=new');
  
  const chromeProcess = spawn('/usr/bin/google-chrome', [...args, 'about:blank'], {
    detached: true,
    stdio: 'ignore'
  });
  
  chromeProcess.unref();
  await delay(3000);
  
  for (let i = 0; i < 50; i++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    } catch (err) { await delay(200); }
  }
  throw new Error('Failed to connect to Chrome');
}

async function diagnosticLogin(email, password) {
  console.log(`\n🔍 Diagnostic Login Test: ${email}`);
  console.log('═'.repeat(50));
  
  const browser = await launchChrome(true); // Headed mode
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Go to Google login
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);
    
    console.log(`\n📍 Initial URL: ${page.url()}`);
    
    // Take screenshot before email
    await page.screenshot({ path: `/home/jclee/dev/gmail/screenshots/diag-01-start.png` });
    
    // Fill email
    const emailInput = await page.$('input[type="email"], input[name="identifier"], input[aria-label*="email" i]');
    if (!emailInput) {
      console.log('❌ Email input not found!');
      await page.screenshot({ path: `/home/jclee/dev/gmail/screenshots/diag-error-no-email-input.png` });
      return { success: false, error: 'Email input not found' };
    }
    
    await emailInput.fill(email);
    await delay(500);
    
    // Click Next
    const nextBtn = await page.$('button:has-text("Next"), #identifierNext, [data-primary-action-label]');
    if (nextBtn) await nextBtn.click();
    await delay(3000);
    
    console.log(`📍 After email URL: ${page.url()}`);
    await page.screenshot({ path: `/home/jclee/dev/gmail/screenshots/diag-02-after-email.png` });
    
    // Check for error messages
    const errorSelectors = [
      '[data-error] span',
      '.Ekjuhf',
      '[role="alert"]',
      '.o6cuMc',
      '.Ly8vkb',
      '[data-error-code]'
    ];
    
    for (const selector of errorSelectors) {
      const errorText = await page.$eval(selector, el => el.textContent).catch(() => null);
      if (errorText) {
        console.log(`⚠️  ERROR MESSAGE: "${errorText}"`);
      }
    }
    
    // Fill password
    const pwdInput = await page.$('input[type="password"], input[name="Passwd"]');
    if (pwdInput) {
      await pwdInput.fill(password);
      await delay(500);
      
      const pwdNextBtn = await page.$('button:has-text("Next"), #passwordNext, [data-primary-action-label]');
      if (pwdNextBtn) await pwdNextBtn.click();
      await delay(5000);
      
      console.log(`📍 After password URL: ${page.url()}`);
      await page.screenshot({ path: `/home/jclee/dev/gmail/screenshots/diag-03-after-password.png` });
      
      // Check for errors again
      for (const selector of errorSelectors) {
        const errorText = await page.$eval(selector, el => el.textContent).catch(() => null);
        if (errorText) {
          console.log(`⚠️  ERROR MESSAGE: "${errorText}"`);
        }
      }
      
      // Check page title and content
      const title = await page.title();
      console.log(`📄 Page Title: ${title}`);
      
      // Check for specific messages
      const pageContent = await page.content();
      
      if (pageContent.includes('couldn\'t find your Google Account')) {
        console.log('❌ ACCOUNT NOT FOUND: Google says account doesn\'t exist');
        return { success: false, error: 'Account not found' };
      }
      
      if (pageContent.includes('Wrong password')) {
        console.log('❌ WRONG PASSWORD');
        return { success: false, error: 'Wrong password' };
      }
      
      if (pageContent.includes('suspended') || pageContent.includes('disabled')) {
        console.log('❌ ACCOUNT SUSPENDED');
        return { success: false, error: 'Account suspended' };
      }
      
      if (page.url().includes('mail.google.com') || page.url().includes('inbox')) {
        console.log('✅ LOGIN SUCCESSFUL');
        return { success: true };
      }
      
      console.log('❓ UNKNOWN RESULT - check screenshots');
      return { success: false, error: 'Unknown result', url: page.url() };
    } else {
      console.log('❌ Password input not found - likely email error');
      return { success: false, error: 'Password input not found' };
    }
    
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    await context.close();
    await browser.close();
  }
}

// Test accounts
const accounts = [
  { email: 'thomas310765@gmail.com', password: 'Bingogo123!', note: 'NEW - just created' },
  { email: 'marmil980069@gmail.com', password: 'Bingogo123!', note: 'OLD - yesterday' },
  { email: 'brownd210562@gmail.com', password: 'Bingogo123!', note: 'OLD - yesterday' },
];

async function main() {
  for (const acc of accounts) {
    console.log(`\n\n${'🔴'.repeat(25)}`);
    console.log(`Testing: ${acc.email} (${acc.note})`);
    console.log(`${'🔴'.repeat(25)}`);
    
    const result = await diagnosticLogin(acc.email, acc.password);
    console.log(`\nResult: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (result.error) console.log(`Error: ${result.error}`);
    
    await delay(2000);
  }
}

main().catch(console.error);
