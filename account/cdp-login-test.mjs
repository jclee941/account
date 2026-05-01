#!/usr/bin/env node
/**
 * CDP-based Login Test - Bypasses bot detection
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function launchChromeWithCDP(port) {
  const USER_DATA_DIR = `/tmp/gmail-cdp-test-${Date.now()}`;
  
  const chromeProcess = spawn('/usr/bin/google-chrome', [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--headless=new',
    'about:blank'
  ], { detached: true, stdio: 'ignore' });
  
  chromeProcess.unref();
  await delay(3000);
  
  for (let i = 0; i < 50; i++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (err) { await delay(200); }
  }
  throw new Error('Failed to connect to Chrome');
}

async function testLoginWithCDP(email, password, port) {
  console.log(`\n🧪 CDP Test: ${email}`);
  console.log('='.repeat(60));
  
  let browser;
  try {
    browser = await launchChromeWithCDP(port);
  } catch (err) {
    console.log(`❌ Failed to launch Chrome: ${err.message}`);
    return { success: false, error: 'Chrome launch failed' };
  }
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle' });
    await delay(2000);
    
    console.log('📍 Step 1: At login page');
    
    // Enter email
    await page.fill('input[type="email"]', email);
    await delay(500);
    await page.click('button:has-text("Next"), #identifierNext');
    await delay(3000);
    
    console.log(`📍 Step 2: After email`);
    console.log(`    URL: ${page.url()}`);
    
    // Check for account not found
    const bodyText = await page.textContent('body');
    if (bodyText.includes('find your Google Account') || bodyText.includes('couldn\'t find')) {
      console.log('❌ ACCOUNT NOT FOUND');
      await browser.close();
      return { success: false, error: 'Account not found' };
    }
    
    // Enter password
    const pwdInput = await page.$('input[type="password"]');
    if (!pwdInput) {
      console.log('❌ No password field');
      console.log(`    Body: ${bodyText.substring(0, 200)}`);
      await browser.close();
      return { success: false, error: 'No password field' };
    }
    
    await pwdInput.fill(password);
    await delay(500);
    await page.click('button:has-text("Next"), #passwordNext');
    await delay(5000);
    
    console.log(`📍 Step 3: After password`);
    console.log(`    URL: ${page.url()}`);
    
    const finalUrl = page.url();
    
    if (finalUrl.includes('mail.google.com') || finalUrl.includes('myaccount.google.com')) {
      console.log('✅ SUCCESS - Logged in!');
      await browser.close();
      return { success: true };
    }
    
    // Check for errors
    if (bodyText.includes('Wrong password')) {
      console.log('❌ WRONG PASSWORD');
      await browser.close();
      return { success: false, error: 'Wrong password' };
    }
    
    if (bodyText.includes('suspended') || bodyText.includes('disabled')) {
      console.log('❌ ACCOUNT SUSPENDED');
      await browser.close();
      return { success: false, error: 'Account suspended' };
    }
    
    if (finalUrl.includes('challenge')) {
      console.log('⚠️  Additional verification required');
      await browser.close();
      return { success: false, error: 'Additional verification needed' };
    }
    
    console.log('❓ Unknown result');
    const finalBody = await page.textContent('body');
    console.log(`    Body: ${finalBody.substring(0, 300)}`);
    await browser.close();
    return { success: false, error: 'Unknown result', url: finalUrl };
    
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    await browser.close();
    return { success: false, error: err.message };
  }
}

async function main() {
  const accounts = [
    { email: 'thomas310765@gmail.com', password: 'Bingogo123!', note: 'NEW' },
    { email: 'marmil980069@gmail.com', password: 'Bingogo123!', note: 'OLD' },
  ];
  
  let port = 9230;
  for (const acc of accounts) {
    console.log(`\n${'🔴'.repeat(30)}`);
    console.log(`Testing: ${acc.email} (${acc.note})`);
    console.log(`${'🔴'.repeat(30)}`);
    
    const result = await testLoginWithCDP(acc.email, acc.password, port++);
    console.log(`\nResult: ${result.success ? '✅ WORKING' : '❌ FAILED'}`);
    if (result.error) console.log(`Error: ${result.error}`);
    
    await delay(3000);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('CDP tests complete');
}

main().catch(console.error);
