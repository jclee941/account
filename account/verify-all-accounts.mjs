#!/usr/bin/env node
/**
 * Batch Gmail Account Verifier
 * Tests if all created accounts can actually log in
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const delay = (ms) => new Promise(r => setTimeout(r, ms));

const CDP_PORT = 9226;
const USER_DATA_DIR = '/tmp/gmail-batch-verifier-profile';

async function launchChrome() {
  const { exec } = await import('child_process');
  const execAsync = promisify(exec);
  try {
    await execAsync(`rm -rf "${USER_DATA_DIR}"`);
    await execAsync(`mkdir -p "${USER_DATA_DIR}"`);
  } catch (e) {}
  
  const chromeProcess = spawn('/usr/bin/google-chrome', [
    `--remote-debugging-port=${CDP_PORT}`,
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
      return await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    } catch (err) { await delay(200); }
  }
  throw new Error('Failed to connect to Chrome');
}

async function verifyAccount(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('https://mail.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(1500);
    
    if (!page.url().includes('accounts.google.com')) {
      await context.close();
      return { success: false, error: 'Not at login page' };
    }
    
    const emailInput = await page.$('input[type="email"], input[name="identifier"]');
    if (emailInput) {
      await emailInput.fill(email);
      await delay(200);
      const nextBtn = await page.$('button:has-text("Next"), #identifierNext');
      if (nextBtn) await nextBtn.click();
      await delay(2000);
    }
    
    const pwdInput = await page.$('input[type="password"], input[name="Passwd"]');
    if (pwdInput) {
      await pwdInput.fill(password);
      await delay(200);
      const nextBtn = await page.$('button:has-text("Next"), #passwordNext');
      if (nextBtn) await nextBtn.click();
      await delay(4000);
    }
    
    const finalUrl = page.url();
    const success = finalUrl.includes('mail.google.com/mail') || finalUrl.includes('inbox');
    
    await context.close();
    return { success, url: finalUrl };
  } catch (err) {
    await context.close();
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Batch Gmail Account Verifier');
  console.log('═══════════════════════════════════════════════════');
  
  // Read accounts from CSV
  const csvPath = join(__dirname, '..', 'accounts.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  
  // Parse successful accounts
  const accounts = [];
  for (const line of lines) {
    if (line.includes(',success,')) {
      const parts = line.split(',');
      if (parts.length >= 9) {
        accounts.push({
          email: parts[1],
          password: parts[2]
        });
      }
    }
  }
  
  console.log(`\nFound ${accounts.length} successful accounts to verify\n`);
  
  const browser = await launchChrome();
  let passed = 0;
  let failed = 0;
  const results = [];
  
  for (const acc of accounts) {
    process.stdout.write(`Verifying ${acc.email}... `);
    const result = await verifyAccount(browser, acc.email, acc.password);
    
    if (result.success) {
      console.log('✅ WORKING');
      passed++;
      results.push({ email: acc.email, status: 'WORKING' });
    } else {
      console.log(`❌ FAILED: ${result.error || result.url}`);
      failed++;
      results.push({ email: acc.email, status: 'FAILED', error: result.error || result.url });
    }
  }
  
  await browser.close();
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} WORKING, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════');
  
  if (failed > 0) {
    console.log('\nFailed accounts:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  - ${r.email}: ${r.error}`);
    });
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
