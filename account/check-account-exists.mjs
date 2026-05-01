#!/usr/bin/env node
/**
 * Check if Gmail account exists via password recovery
 */

import { chromium } from 'playwright';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function checkAccountExists(email) {
  console.log(`\n🔍 Checking if account exists: ${email}`);
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Go to forgot password page
    await page.goto('https://accounts.google.com/signin/recovery', { waitUntil: 'networkidle' });
    await delay(2000);
    
    console.log('📍 At recovery page');
    
    // Enter email
    const emailInput = await page.$('input[type="email"], input[name="identifier"]');
    if (!emailInput) {
      console.log('❌ Email input not found');
      await browser.close();
      return { exists: false, error: 'Input not found' };
    }
    
    await emailInput.fill(email);
    await delay(500);
    await page.click('button:has-text("Next"), #identifierNext');
    await delay(3000);
    
    console.log(`📍 After submitting email`);
    console.log(`    URL: ${page.url()}`);
    
    const bodyText = await page.textContent('body');
    
    // Check for account not found
    if (bodyText.includes('couldn\'t find') || bodyText.includes('find your Google Account')) {
      console.log('❌ ACCOUNT DOES NOT EXIST');
      await browser.close();
      return { exists: false, reason: 'Account not found' };
    }
    
    // Check for bot detection
    if (bodyText.includes('not be secure')) {
      console.log('⚠️  Bot detection triggered - cannot verify');
      await browser.close();
      return { exists: 'unknown', reason: 'Bot detection' };
    }
    
    // If we see recovery options, account exists
    if (bodyText.includes('recovery') || bodyText.includes('Get a verification code')) {
      console.log('✅ ACCOUNT EXISTS (recovery options shown)');
      await browser.close();
      return { exists: true };
    }
    
    // Check for other indicators
    if (bodyText.includes('phone') || bodyText.includes('email')) {
      console.log('✅ ACCOUNT EXISTS (contact options shown)');
      await browser.close();
      return { exists: true };
    }
    
    console.log('❓ Unknown result');
    console.log(`    Body: ${bodyText.substring(0, 400)}`);
    await browser.close();
    return { exists: 'unknown', body: bodyText.substring(0, 200) };
    
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    await browser.close();
    return { exists: 'unknown', error: err.message };
  }
}

async function main() {
  const accounts = [
    'thomas310765@gmail.com',
    'marmil980069@gmail.com',
    'brownd210562@gmail.com',
    'nonexistent12345xyz@gmail.com', // Control - definitely doesn't exist
  ];
  
  for (const email of accounts) {
    const result = await checkAccountExists(email);
    console.log(`\n📊 RESULT for ${email}:`);
    console.log(`   Exists: ${result.exists}`);
    if (result.reason) console.log(`   Reason: ${result.reason}`);
    console.log('\n' + '─'.repeat(60));
    await delay(2000);
  }
}

main().catch(console.error);
