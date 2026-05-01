#!/usr/bin/env node
/**
 * YouTube Signup Gmail Creator — CDP Edition
 * 
 * Uses real Chrome via CDP to bypass bot detection.
 * Based on Stack Overflow solution for Google automation.
 */

import { chromium } from 'playwright';
import { exec, spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── Config ──────────────────────────────────────────────────────────
const CDP_PORT = 9223;
const USER_DATA_DIR = '/tmp/gmail-creator-profile';
const PASSWORD = 'Bingogo123!';
const CSV_FILE = join(import.meta.dirname, '..', 'accounts.csv');
const SCREENSHOT_DIR = join(import.meta.dirname, '..', 'screenshots');

const FIRST_NAMES = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];

// ── CLI Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SMS_API_KEY = process.env.FIVESIM_API_KEY || '';
const FIVESIM_REGION = 'indonesia';

// ── Utility ─────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateUsername(firstName, lastName) {
  const timestamp = Date.now().toString().slice(-6);
  const patterns = [
    () => `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(1000, 99999)}`,
    () => `${firstName.toLowerCase()}${randomInt(10000, 999999)}`,
    () => `${lastName.toLowerCase()}${firstName.toLowerCase().slice(0, 1)}${timestamp}`,
    () => `${firstName.toLowerCase().slice(0, 3)}${lastName.toLowerCase().slice(0, 3)}${randomInt(10000, 999999)}`,
  ];
  return patterns[randomInt(0, patterns.length - 1)]();
}

// ── 5sim SMS Provider ───────────────────────────────────────────────
class FiveSimProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://5sim.net/v1';
    this.orderId = null;
    this.phoneNumber = null;
  }

  async getBalance() {
    const resp = await fetch(`${this.baseUrl}/user/profile`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error(`Balance check failed: ${resp.status}`);
    const data = await resp.json();
    return data.balance || 0;
  }

  async buyNumber(country = 'indonesia', operator = 'any') {
    const resp = await fetch(`${this.baseUrl}/user/buy/activation/${country}/${operator}/google`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to buy number: ${resp.status} - ${err}`);
    }
    const data = await resp.json();
    this.orderId = data.id;
    this.phoneNumber = data.phone;
    return { phone: data.phone, orderId: data.id };
  }

  async waitForSms(timeout = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const resp = await fetch(`${this.baseUrl}/user/check/${this.orderId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' }
      });
      if (!resp.ok) throw new Error(`SMS check failed: ${resp.status}`);
      const data = await resp.json();
      if (data.sms && data.sms.length > 0) {
        const code = data.sms[0].code;
        await this.finishOrder();
        return code;
      }
      if (data.status === 'CANCELED' || data.status === 'BANNED') {
        throw new Error(`Order ${data.status}`);
      }
      await delay(5000);
    }
    await this.cancelOrder();
    throw new Error('SMS timeout');
  }

  async finishOrder() {
    if (this.orderId) {
      await fetch(`${this.baseUrl}/user/finish/${this.orderId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
    }
  }

  async cancelOrder() {
    if (this.orderId) {
      await fetch(`${this.baseUrl}/user/cancel/${this.orderId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
    }
  }
}

// ── Chrome Launcher ─────────────────────────────────────────────────
async function launchChromeWithCDP() {
  console.log('  → Launching Chrome with CDP...');
  
  // Clean profile directory
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
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1280,720',
    '--headless=new',
    'about:blank'
  ], {
    detached: true,
    stdio: 'ignore'
  });
  
  chromeProcess.unref();
  const cmd = `"${chromePath}" \
    --remote-debugging-port=${CDP_PORT} \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="${USER_DATA_DIR}" \
    --no-first-run \
    --no-default-browser-check \
    --disable-blink-features=AutomationControlled \
    --disable-features=IsolateOrigins,site-per-process \
    --window-size=1280,720 \
    about:blank`;
  
  exec(cmd, { detached: true });
  
  // Wait for Chrome to start
  await delay(3000);
  
  // Try to connect
  for (let i = 0; i < 50; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      console.log('  → Connected to Chrome via CDP');
      return browser;
    } catch (err) {
      await delay(200);
    }
  }
  throw new Error('Failed to connect to Chrome via CDP');
}

// ── Main Account Creation ───────────────────────────────────────────
async function createAccount(browser, smsProvider) {
  const firstName = randomPick(FIRST_NAMES);
  const lastName = randomPick(LAST_NAMES);
  const username = generateUsername(firstName, lastName);
  const email = `${username}@gmail.com`;
  
  console.log(`\nCreating ${email} (${firstName} ${lastName})`);
  
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Step 1: Navigate to YouTube signup
    const signupUrl = 'https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=en&service=youtube&biz=false&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Den%26next%3Dhttps%253A%252F%252Fwww.youtube.com%252F';
    
    await page.goto(signupUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    // Step 2: Fill name
    console.log('  → Filling name...');
    const firstNameInput = await page.$('input[name="firstName"]');
    const lastNameInput = await page.$('input[name="lastName"]');
    
    if (firstNameInput) {
      await firstNameInput.fill(firstName, { delay: randomInt(50, 150) });
      await delay(randomInt(300, 600));
    }
    if (lastNameInput) {
      await lastNameInput.fill(lastName, { delay: randomInt(50, 150) });
      await delay(randomInt(300, 600));
    }
    
    // Click Next
    const nextBtn = await page.$('button[type="submit"], div[role="button"]:has-text("Next")');
    if (nextBtn) await nextBtn.click();
    await delay(3000);
    
    // Step 3: Birthday and gender
    console.log('  → Filling birthday...');
    
    // Month
    const monthDropdown = await page.$('[aria-label*="Month"] button, [aria-labelledby*="month"], #month');
    if (monthDropdown) {
      await monthDropdown.click();
      await delay(1000);
      const january = await page.$('[role="option"]:has-text("January"), li:has-text("January")');
      if (january) await january.click();
      await delay(500);
    }
    
    // Day
    const dayInput = await page.$('input[name="day"]');
    if (dayInput) await dayInput.fill(String(randomInt(1, 28)));
    
    // Year
    const yearInput = await page.$('input[name="year"]');
    if (yearInput) await yearInput.fill(String(randomInt(1985, 2000)));
    
    // Gender
    const genderDropdown = await page.$('[aria-label*="Gender"] button, #gender');
    if (genderDropdown) {
      await genderDropdown.click();
      await delay(1000);
      const male = await page.$('[role="option"]:has-text("Male"), li:has-text("Male")');
      if (male) await male.click();
      await delay(500);
    }
    
    // Click Next
    const birthdayNext = await page.$('button[type="submit"], div[role="button"]:has-text("Next")');
    if (birthdayNext) await birthdayNext.click();
    await delay(3000);
    
    // Step 4: Check for "Use your existing email" page and switch to Gmail
    const currentUrl = page.url();
    if (currentUrl.includes('emailsignup')) {
      console.log('  → Switching to Gmail signup...');
      const gmailLink = await page.$('a:has-text("Get a Gmail address instead")');
      if (gmailLink) {
        await gmailLink.click();
        await delay(3000);
      }
    }
    
    // Step 5: Username
    console.log(`  → Filling username: ${username}`);
    const usernameInput = await page.$('input[name="Username"]');
    if (usernameInput) {
      await usernameInput.fill(username, { delay: randomInt(50, 150) });
      await delay(500);
    }
    
    // Click Next
    const usernameNext = await page.$('button[type="submit"], div[role="button"]:has-text("Next")');
    if (usernameNext) await usernameNext.click();
    await delay(3000);
    
    // Check for username taken error
    const errorText = await page.$eval('body', el => el.innerText);
    if (errorText.includes('username is taken') || errorText.includes('unavailable')) {
      console.log('  ⚠️ Username taken, trying alternative...');
      const altUsername = username + randomInt(1000, 9999);
      const usernameInput2 = await page.$('input[name="Username"]');
      if (usernameInput2) {
        await usernameInput2.fill(altUsername, { delay: randomInt(50, 150) });
        await delay(500);
        await usernameNext.click();
        await delay(3000);
      }
    }
    
    // Step 6: Password
    console.log('  → Setting password...');
    const pwdInput = await page.$('input[name="Passwd"]');
    const confirmInput = await page.$('input[name="PasswdAgain"]');
    
    if (pwdInput) {
      await pwdInput.fill(PASSWORD, { delay: randomInt(50, 150) });
      await delay(300);
    }
    if (confirmInput) {
      await confirmInput.fill(PASSWORD, { delay: randomInt(50, 150) });
      await delay(300);
    }
    
    // Click Next
    const pwdNext = await page.$('button[type="submit"], div[role="button"]:has-text("Next")');
    if (pwdNext) await pwdNext.click();
    await delay(4000);
    
    // Step 7: Phone verification (if needed)
    const afterPwdUrl = page.url();
    if (afterPwdUrl.includes('phone') || afterPwdUrl.includes('recovery')) {
      if (DRY_RUN) {
        console.log('  [DRY-RUN] Would request phone verification');
        await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_phone_step.png`), fullPage: true });
        return { success: false, error: 'DRY-RUN: Phone verification needed' };
      }
      
      console.log('  → Phone verification required');
      const phoneInput = await page.$('input[name="phoneNumberId"], input[type="tel"]');
      if (phoneInput && smsProvider) {
        console.log('  → Buying phone number...');
        const { phone } = await smsProvider.buyNumber(FIVESIM_REGION);
        console.log(`  → Phone: ${phone}`);
        
        await phoneInput.fill(phone);
        await delay(500);
        
        const verifyBtn = await page.$('button:has-text("Next"), button:has-text("Verify")');
        if (verifyBtn) await verifyBtn.click();
        
        console.log('  → Waiting for SMS...');
        const code = await smsProvider.waitForSms();
        console.log(`  → Code: ${code}`);
        
        const codeInput = await page.$('input[name="code"], input[type="tel"]');
        if (codeInput) {
          await codeInput.fill(code);
          await delay(500);
          const confirmBtn = await page.$('button:has-text("Verify"), button:has-text("Next")');
          if (confirmBtn) await confirmBtn.click();
        }
      }
    }
    
    // Check final state
    await delay(3000);
    const finalUrl = page.url();
    
    if (finalUrl.includes('youtube.com') || finalUrl.includes('myaccount.google.com')) {
      console.log('  ✅ Account created successfully!');
      
      // Save to CSV
      const line = `${username},${email},${PASSWORD},${firstName},${lastName},,0,success,${new Date().toISOString()}\n`;
      writeFileSync(CSV_FILE, line, { flag: 'a' });
      
      return { success: true, email, username };
    }
    
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_final.png`), fullPage: true });
    console.log(`  ❌ Unknown state: ${finalUrl}`);
    return { success: false, error: `Unknown state: ${finalUrl}` };
    
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_error.png`), fullPage: true });
    return { success: false, error: err.message };
  } finally {
    await page.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  YouTube Signup Gmail Creator — CDP Edition');
  console.log('═══════════════════════════════════════════════════');
  
  if (DRY_RUN) {
    console.log('[DRY-RUN MODE] No real account will be created\n');
  }
  
  // Check 5sim balance
  let smsProvider = null;
  if (!DRY_RUN && SMS_API_KEY) {
    smsProvider = new FiveSimProvider(SMS_API_KEY);
    const balance = await smsProvider.getBalance();
    console.log(`5sim balance: $${balance}`);
    if (balance < 1) {
      console.log('⚠️ Low balance!');
    }
  }
  
  // Launch Chrome with CDP
  const browser = await launchChromeWithCDP();
  
  try {
    // Create account
    const result = await createAccount(browser, smsProvider);
    
    if (result.success) {
      console.log(`\n✅ SUCCESS: ${result.email}`);
    } else {
      console.log(`\n❌ FAILED: ${result.error}`);
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
