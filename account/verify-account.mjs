#!/usr/bin/env node
/**
 * Quick Gmail Account Verifier
 * Tests if created accounts can actually log in
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { promisify } from 'util';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const CDP_PORT = 9224; // Different port to avoid conflict
const USER_DATA_DIR = '/tmp/gmail-verifier-profile';

async function launchChromeWithCDP() {
  const { exec } = await import('child_process');
  const execAsync = promisify(exec);
  
  // Clean profile
  try {
    await execAsync(`rm -rf "${USER_DATA_DIR}"`);
    await execAsync(`mkdir -p "${USER_DATA_DIR}"`);
  } catch (e) {}
  
  const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
  const chromeProcess = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,720',
    '--headless=new',
    'about:blank'
  ], {
    detached: true,
    stdio: 'ignore'
  });
  
  chromeProcess.unref();
  await delay(3000);
  
  for (let i = 0; i < 50; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      return browser;
    } catch (err) {
      await delay(200);
    }
  }
  throw new Error('Failed to connect to Chrome');
}

async function verifyAccount(email, password) {
  console.log(`\nVerifying: ${email}`);
  
  const browser = await launchChromeWithCDP();
  
  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to Gmail
    await page.goto('https://mail.google.com', { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    const url = page.url();
    
    // Check if already signed in or at login page
    if (url.includes('mail.google.com/mail/u/0/') || url.includes('inbox')) {
      console.log('  ⚠️  Already signed in (should not happen with fresh profile)');
      await page.close();
      return { success: false, error: 'Already signed in' };
    }
    
    // Should be at login page
    if (url.includes('accounts.google.com')) {
      console.log('  → At Google login page');
      
      // Fill email
      const emailInput = await page.$('input[type="email"], input[name="identifier"]');
      if (emailInput) {
        await emailInput.fill(email);
        await delay(500);
        
        // Click Next
        const nextBtn = await page.$('button:has-text("Next"), #identifierNext');
        if (nextBtn) await nextBtn.click();
        await delay(3000);
      }
      
      // Fill password
      const pwdInput = await page.$('input[type="password"], input[name="Passwd"]');
      if (pwdInput) {
        await pwdInput.fill(password);
        await delay(500);
        
        // Click Next
        const nextBtn = await page.$('button:has-text("Next"), #passwordNext');
        if (nextBtn) await nextBtn.click();
        await delay(5000);
      }
      
      // Check result
      const finalUrl = page.url();
      
      if (finalUrl.includes('mail.google.com/mail') || finalUrl.includes('inbox')) {
        console.log('  ✅ SUCCESS: Account is functional!');
        await page.close();
        return { success: true, email };
      } else if (finalUrl.includes('challenge') || finalUrl.includes('verify')) {
        console.log('  ⚠️  Additional verification required (phone/recovery)');
        await page.close();
        return { success: false, error: 'Additional verification required', url: finalUrl };
      } else if (finalUrl.includes('signin') || finalUrl.includes('login')) {
        const errorMsg = await page.$eval('[data-error] span, .Ekjuhf', el => el.textContent).catch(() => null);
        console.log(`  ❌ FAILED: ${errorMsg || 'Login failed'}`);
        await page.close();
        return { success: false, error: errorMsg || 'Login failed', url: finalUrl };
      } else {
        console.log(`  ❓ UNKNOWN STATE: ${finalUrl}`);
        await page.close();
        return { success: false, error: 'Unknown state', url: finalUrl };
      }
    }
    
    await page.close();
    return { success: false, error: 'Unexpected state', url };
    
  } catch (err) {
    console.log(`  ❌ ERROR: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

// Test first account
const testEmail = process.env.GMAIL_TEST_EMAIL || '';
const testPassword = process.env.GMAIL_TEST_PASSWORD || '';

console.log('═══════════════════════════════════════════════════');
console.log('  Gmail Account Verifier');
console.log('═══════════════════════════════════════════════════');

verifyAccount(testEmail, testPassword)
  .then(result => {
    console.log('\n--- Verification Result ---');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
