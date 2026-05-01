#!/usr/bin/env node
/**
 * Direct Login Test - Check what Google says
 */

import { chromium } from 'playwright';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function testLogin(email, password) {
  console.log(`\n🧪 Testing: ${email}`);
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Go directly to Google login
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle' });
    await delay(2000);
    
    console.log('📍 Step 1: At login page');
    
    // Enter email
    await page.fill('input[type="email"]', email);
    await delay(500);
    await page.click('button:has-text("Next"), #identifierNext');
    await delay(3000);
    
    console.log(`📍 Step 2: After entering email`);
    
    // Check for immediate errors
    const errorText = await page.$eval('[data-error] span, .Ekjuhf, .o6cuMc', el => el?.textContent).catch(() => null);
    if (errorText) {
      console.log(`❌ EMAIL ERROR: "${errorText}"`);
      await browser.close();
      return { success: false, error: errorText };
    }
    
    // Check URL for account not found
    const url = page.url();
    if (url.includes('identifier') && !url.includes('challenge') && !url.includes('password')) {
      console.log('❌ Still on email page - account likely not found');
      const bodyText = await page.textContent('body');
      if (bodyText.includes('find your Google Account')) {
        console.log('   ➤ Google says: Could not find your Google Account');
        return { success: false, error: 'Account not found' };
      }
    }
    
    // Enter password
    const pwdInput = await page.$('input[type="password"]');
    if (!pwdInput) {
      console.log('❌ No password field - checking what page shows...');
      const bodyText = await page.textContent('body');
      console.log(`   Page content snippet: ${bodyText.substring(0, 200)}...`);
      return { success: false, error: 'No password field' };
    }
    
    await pwdInput.fill(password);
    await delay(500);
    await page.click('button:has-text("Next"), #passwordNext');
    await delay(5000);
    
    console.log(`📍 Step 3: After entering password`);
    console.log(`    URL: ${page.url()}`);
    
    // Check results
    const finalUrl = page.url();
    
    if (finalUrl.includes('mail.google.com') || finalUrl.includes('myaccount.google.com')) {
      console.log('✅ SUCCESS - Logged in!');
      return { success: true };
    }
    
    // Check for errors
    const pwdError = await page.$eval('[data-error] span, .Ekjuhf', el => el?.textContent).catch(() => null);
    if (pwdError) {
      console.log(`❌ PASSWORD ERROR: "${pwdError}"`);
      return { success: false, error: pwdError };
    }
    
    if (finalUrl.includes('challenge')) {
      console.log('⚠️  Additional verification required');
      return { success: false, error: 'Additional verification needed' };
    }
    
    const bodyText = await page.textContent('body');
    if (bodyText.includes('suspended') || bodyText.includes('disabled')) {
      console.log('❌ ACCOUNT SUSPENDED');
      return { success: false, error: 'Account suspended' };
    }
    
    console.log('❓ Unknown result');
    console.log(`   Body snippet: ${bodyText.substring(0, 300)}...`);
    return { success: false, error: 'Unknown', url: finalUrl };
    
  } catch (err) {
    console.log(`❌ SCRIPT ERROR: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

async function main() {
  const accounts = [
    { email: 'thomas310765@gmail.com', password: 'Bingogo123!' },
    { email: 'marmil980069@gmail.com', password: 'Bingogo123!' },
    { email: 'brownd210562@gmail.com', password: 'Bingogo123!' },
  ];
  
  for (const acc of accounts) {
    const result = await testLogin(acc.email, acc.password);
    console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
    console.log('\n' + '─'.repeat(60));
    await delay(2000);
  }
}

main().catch(console.error);
