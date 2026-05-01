#!/usr/bin/env node
/**
 * Gmail Account Creator - YouTube Signup Flow (Bypasses QR)
 * Uses YouTube's less strict verification flow
 */

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const __dirname = import.meta.dirname;

// Configuration
const PASSWORD = 'Bingogo123!';
const FIRST_NAMES = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

// Get command line args
const args = process.argv.slice(2);
const getArg = (name, defaultValue = '') => {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const match = args.find(a => a.startsWith(`${name}=`));
  if (match) return match.split('=')[1];
  return defaultValue;
};

const API_KEY = getArg('--api-key') || process.env.FIVESIM_API_KEY;
const REGION = getArg('--region') || process.env.FIVESIM_REGION || 'russia';
const OPERATOR = getArg('--operator') || 'virtual4';
const HEADLESS = !args.includes('--headed');

const CSV_FILE = join(__dirname, '..', 'accounts.csv');
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots');

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Generate username
function generateUsername(firstName, lastName) {
  // More entropy with longer random numbers and timestamp-based suffix
  const timestamp = Date.now().toString().slice(-6);
  const patterns = [
    () => `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(1000, 99999)}`,
    () => `${firstName.toLowerCase()}${randomInt(10000, 999999)}`,
    () => `${lastName.toLowerCase()}${firstName.toLowerCase().slice(0, 1)}${timestamp}`,
    () => `${firstName.toLowerCase().slice(0, 3)}${lastName.toLowerCase().slice(0, 3)}${randomInt(10000, 999999)}`,
    () => `${lastName.toLowerCase()}${randomInt(100000, 9999999)}`,
    () => `${firstName.toLowerCase().slice(0, 2)}${randomInt(100000, 9999999)}`,
  ];
  return patterns[randomInt(0, patterns.length - 1)]();
}

// 5sim SMS provider
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
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.balance || 0;
  }

  async buyNumber(country = 'russia', operator = 'virtual4') {
    const resp = await fetch(`${this.baseUrl}/user/buy/activation/${country}/any/google`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error(`Buy failed: HTTP ${resp.status}`);
    const data = await resp.json();
    this.orderId = data.id;
    this.phoneNumber = data.phone;
    return { orderId: data.id, phoneNumber: data.phone, country: data.country };
  }

  async waitForSms(timeout = 180000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const resp = await fetch(`${this.baseUrl}/user/check/${this.orderId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' }
      });
      if (!resp.ok) throw new Error(`Check failed: HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.sms && data.sms.length > 0) {
        return data.sms[0].code;
      }
      await delay(5000);
    }
    throw new Error('SMS timeout');
  }

  async cancel() {
    if (!this.orderId) return;
    await fetch(`${this.baseUrl}/user/cancel/${this.orderId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' }
    });
  }
}

async function createAccount(firstName, lastName, username, smsProvider) {
  console.log(`Creating ${username}@gmail.com (${firstName} ${lastName})`);
  
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--lang=en-US,en',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // Step 1: Go directly to YouTube signup flow
    console.log('  → Navigating to YouTube signup...');
    const signupUrl = 'https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=en&service=youtube&biz=false&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Den%26next%3Dhttps%253A%252F%252Fwww.youtube.com%252F';

    await page.goto(signupUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    await delay(3000);
    
    let currentUrl = page.url();
    console.log(`  → URL: ${currentUrl}`);
    
    // Check if we need to click "Create account"
    if (currentUrl.includes('signin/identifier') || currentUrl.includes('ServiceLogin')) {
      console.log('  → On signin page, clicking Create account...');
      await page.evaluate(() => {
        const links = document.querySelectorAll('a, span');
        for (const el of links) {
          if ((el.textContent || '').includes('Create account')) {
            el.click();
            return;
          }
        }
      });
      await delay(3000);
      
      // Click "For my personal use"
      await page.evaluate(() => {
        const elements = document.querySelectorAll('span, div, div[role="button"]');
        for (const el of elements) {
          const text = (el.textContent || '').toLowerCase();
          if (text.includes('for my personal use')) {
            el.click();
            return;
          }
        }
      });
      await delay(3000);
    }

    currentUrl = page.url();
    console.log(`  → URL after navigation: ${currentUrl}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_name_page.png`), fullPage: true });

    // Step 2: Fill name
    if (currentUrl.includes('signup/name') || currentUrl.includes('createaccount')) {
      console.log('  → Filling name...');
      
      const firstNameInput = await page.$('input[name="firstName"], input#firstName, input[type="text"]');
      if (firstNameInput) {
        await firstNameInput.evaluate(el => el.value = '');
        await firstNameInput.type(firstName, { delay: randomInt(50, 150) });
      }
      await delay(500);
      
      const lastNameInput = await page.$('input[name="lastName"], input#lastName');
      if (lastNameInput) {
        await lastNameInput.evaluate(el => el.value = '');
        await lastNameInput.type(lastName, { delay: randomInt(50, 150) });
      }
      await delay(500);
      
      // Click Next
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase();
          if (text.includes('next')) {
            btn.click();
            return;
          }
        }
      });
      await delay(4000);
    }

    currentUrl = page.url();
    console.log(`  → URL after name: ${currentUrl}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_after_name.png`), fullPage: true });

    // Step 3: Birthday and gender
    if (currentUrl.includes('signup/birthday') || currentUrl.includes('birthdaygender')) {
      console.log('  → Filling birthday...');
      
      // Month dropdown - try multiple selectors
      const monthSelectors = [
        '[aria-label*="Month"] button',
        '[aria-labelledby*="month"]',
        '#month',
        'input[name="month"]',
        '[role="combobox"][aria-label*="Month"]',
        'div[data-field-type="month"] div[role="button"]',
        'div[data-default-value="Month"]',
        'span:has-text("Month") + div',
        'div[jsname*="field"] div[role="button"]:first-of-type'
      ];
      
      let monthClicked = false;
      for (const selector of monthSelectors) {
        try {
          const monthBtn = await page.$(selector);
          if (monthBtn) {
            await monthBtn.click();
            await delay(1000);
            monthClicked = true;
            break;
          }
        } catch (e) {}
      }
      
      if (monthClicked) {
        // Try to select January from the dropdown
        const monthOptions = [
          '[role="option"]',
          'li',
          'div[role="option"]'
        ];
        
        let monthSelected = false;
        for (const optionSelector of monthOptions) {
          try {
            const selected = await page.evaluate((sel) => {
              const options = document.querySelectorAll(sel);
              for (const opt of options) {
                const text = opt.textContent || '';
                if (text.includes('January') || text.includes('1')) {
                  opt.click();
                  return true;
                }
              }
              return false;
            }, optionSelector);
            
            if (selected) {
              await delay(500);
              monthSelected = true;
              break;
            }
          } catch (e) {}
        }
        
        if (!monthSelected) {
          // Try pressing Escape and using keyboard
          await page.keyboard.press('Escape');
          await delay(500);
        }
      }
      await delay(500);
      
      // Day - try multiple input selectors
      const daySelectors = [
        'input[name="day"]',
        'input#day',
        'input[aria-label*="Day"]',
        'input[type="text"][placeholder*="Day"]',
        'div[data-field-type="day"] input'
      ];
      
      for (const selector of daySelectors) {
        try {
          const dayInput = await page.$(selector);
          if (dayInput) {
            await dayInput.click();
            await dayInput.evaluate(el => el.value = '');
            await dayInput.type('15', { delay: randomInt(50, 100) });
            break;
          }
        } catch (e) {}
      }
      await delay(300);
      
      // Year
      const yearSelectors = [
        'input[name="year"]',
        'input#year',
        'input[aria-label*="Year"]',
        'input[type="text"][placeholder*="Year"]',
        'div[data-field-type="year"] input'
      ];
      
      for (const selector of yearSelectors) {
        try {
          const yearInput = await page.$(selector);
          if (yearInput) {
            await yearInput.click();
            await yearInput.evaluate(el => el.value = '');
            await yearInput.type('1995', { delay: randomInt(50, 100) });
            break;
          }
        } catch (e) {}
      }
      await delay(300);
      
      // Gender dropdown
      const genderSelectors = [
        '[aria-label*="Gender"] button',
        '[aria-labelledby*="gender"]',
        '#gender',
        '[role="combobox"][aria-label*="Gender"]',
        'div[data-field-type="gender"] div[role="button"]',
        'div[data-default-value="Gender"]',
        'span:has-text("Gender") + div',
        'div[jsname*="field"]:nth-of-type(2) div[role="button"]'
      ];
      
      let genderClicked = false;
      for (const selector of genderSelectors) {
        try {
          const genderBtn = await page.$(selector);
          if (genderBtn) {
            await genderBtn.click();
            await delay(1000);
            genderClicked = true;
            break;
          }
        } catch (e) {}
      }
      
      if (genderClicked) {
        // Select Male
        const genderOptions = [
          '[role="option"]',
          'li',
          'div[role="option"]'
        ];
        
        let genderSelected = false;
        for (const optionSelector of genderOptions) {
          try {
            const selected = await page.evaluate((sel) => {
              const options = document.querySelectorAll(sel);
              for (const opt of options) {
                const text = (opt.textContent || '').toLowerCase();
                if (text.includes('male') || text.includes('man') || text.includes('he')) {
                  opt.click();
                  return true;
                }
              }
              return false;
            }, optionSelector);
            
            if (selected) {
              await delay(500);
              genderSelected = true;
              break;
            }
          } catch (e) {}
        }
        
        if (!genderSelected) {
          await page.keyboard.press('Escape');
          await delay(500);
        }
      }
      await delay(500);
      
      // Click Next with better targeting
      await page.evaluate(() => {
        // Try multiple button finding strategies
        const allButtons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of allButtons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          const hasNextText = text === 'next' || text.includes(' next') || text.startsWith('next');
          const isPrimary = btn.getAttribute('type') === 'submit' || 
                           btn.className.includes('primary') || 
                           btn.style.backgroundColor;
          
          if (hasNextText || (isPrimary && text.length < 10)) {
            btn.click();
            return;
          }
        }
        
        // Fallback: find the rightmost bottom button
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const visibleButtons = buttons.filter(b => {
          const rect = b.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.top > window.innerHeight * 0.5;
        });
        
        if (visibleButtons.length > 0) {
          // Sort by x position and click the rightmost one (typically Next)
          visibleButtons.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectB.left - rectA.left;
          });
          visibleButtons[0].click();
        }
      });
      await delay(5000);
    }

    currentUrl = page.url();
    console.log(`  → URL after birthday: ${currentUrl}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_after_birthday.png`), fullPage: true });

    // Check for emailsignup page ("Use your existing email" flow) and switch to Gmail creation
    if (currentUrl.includes('signup/emailsignup')) {
      console.log('  → On "Use your existing email" page, clicking "Get a Gmail address instead"...');
      
      // Try clicking using XPath selector (Puppeteer-compatible via page.evaluate)
      try {
        // Use page.evaluate with document.evaluate for XPath (Puppeteer compatible)
        const clicked = await page.evaluate(() => {
          const xpathResult = document.evaluate(
            "//*[contains(text(), 'Get a Gmail address instead')]",
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
          );
          const el = xpathResult.singleNodeValue;
          if (el) {
            // Find the clickable parent (usually an anchor tag)
            let clickable = el;
            while (clickable && clickable.tagName !== 'A' && clickable.tagName !== 'BUTTON') {
              clickable = clickable.parentElement;
            }
            if (clickable) {
              clickable.click();
              return 'clicked';
            }
            // If no clickable parent, click the element itself
            el.click();
            return 'clicked-element';
          }
          return 'not-found';
        });
        
        if (clicked === 'clicked' || clicked === 'clicked-element') {
          console.log('    → Clicked using XPath via evaluate');
        } else {
          console.log('    → Link not found via XPath');
        }
      } catch (e) {
        console.log(`    → Click error: ${e.message}`);
      }
      
      await delay(5000);
      
      // Update currentUrl after clicking
      currentUrl = page.url();
      console.log(`  → URL after switching to Gmail signup: ${currentUrl}`);
      await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_after_switch_to_gmail.png`), fullPage: true });
    }

    // Step 4: Username
    if (currentUrl.includes('signup/username') || currentUrl.includes('createusername') || currentUrl.includes('signup/emailsignup')) {
      console.log('  → Filling username: ' + username);
      
      // Try to find username input with multiple selectors
      const usernameSelectors = [
        'input[name="Username"]',
        'input#username',
        'input[name="username"]',
        'input[aria-label*="username" i]',
        'input[placeholder*="username" i]',
        'input[type="text"]'
      ];
      
      let usernameFilled = false;
      for (const selector of usernameSelectors) {
        try {
          const usernameInput = await page.$(selector);
          if (usernameInput) {
            // Check if this input is visible
            const isVisible = await usernameInput.evaluate(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            
            if (isVisible) {
              await usernameInput.evaluate(el => el.value = '');
              await usernameInput.type(username, { delay: randomInt(50, 150) });
              usernameFilled = true;
              console.log(`    → Username filled using selector: ${selector}`);
              break;
            }
          }
        } catch (e) {}
      }
      
      if (!usernameFilled) {
        console.log('    ⚠️ Could not fill username - no visible input found');
      }
      
      await delay(1000);
      
      // Click Next with better targeting
      await page.evaluate(() => {
        const allButtons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of allButtons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          const hasNextText = text === 'next' || text.includes(' next') || text.startsWith('next');
          const isPrimary = btn.getAttribute('type') === 'submit' || 
                           btn.className.includes('primary');
          
          if (hasNextText || (isPrimary && text.length < 10)) {
            btn.click();
            return;
          }
        }
      });
      await delay(4000);
      
      // Check if username is taken and retry if needed
      const usernameError = await page.evaluate(() => {
        const errorTexts = document.querySelectorAll('span, div, p');
        for (const el of errorTexts) {
          const text = el.textContent || '';
          if (text.includes('username is taken') || text.includes('That username') || text.includes('unavailable')) {
            return text;
          }
        }
        return null;
      });
      
      if (usernameError) {
        console.log(`    ⚠️ Username taken: ${usernameError}`);
        // Generate a new username with more randomness
        const newUsername = generateUsername(firstName, lastName) + randomInt(1000, 9999);
        console.log(`    → Retrying with: ${newUsername}`);
        
        // Clear and fill new username
        const usernameInput = await page.$('input[name="Username"], input#username');
        if (usernameInput) {
          await usernameInput.click({ clickCount: 3 });
          await usernameInput.type(newUsername, { delay: randomInt(50, 150) });
          await delay(500);
          
          // Click Next again
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, div[role="button"]');
            for (const btn of buttons) {
              const text = (btn.textContent || '').toLowerCase().trim();
              if (text === 'next' || text.includes(' next')) {
                btn.click();
                return;
              }
            }
          });
          await delay(4000);
        }
      }
    }

    currentUrl = page.url();
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_after_username.png`), fullPage: true });

    // Check for QR code
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Verify some info') || bodyText.includes('QR code') || bodyText.includes('scan')) {
      console.log('  ❌ QR verification detected');
      return { success: false, error: 'QR verification required' };
    }

    // Step 5: Password
    if (currentUrl.includes('signup/password') || currentUrl.includes('createpassword')) {
      console.log('  → Setting password...');
      
      const pwdInput = await page.$('input[name="Passwd"], input[name="Password"], input[type="password"]');
      const confirmInput = await page.$('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
      
      if (pwdInput) {
        await pwdInput.type(PASSWORD, { delay: randomInt(50, 150) });
        await delay(300);
      }
      if (confirmInput) {
        await confirmInput.type(PASSWORD, { delay: randomInt(50, 150) });
        await delay(300);
      }
      
      // Click Next
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase();
          if (text.includes('next')) {
            btn.click();
            return;
          }
        }
      });
      await delay(5000);
    }

    currentUrl = page.url();
    console.log(`  → URL after password: ${currentUrl}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${username}_after_password.png`), fullPage: true });

    // Check for QR again
    const bodyText2 = await page.evaluate(() => document.body.innerText);
    if (bodyText2.includes('Verify some info') || bodyText2.includes('QR code') || bodyText2.includes('scan')) {
      console.log('  ❌ QR verification detected after password');
      return { success: false, error: 'QR verification required' };
    }

    // Step 6: Phone verification
    // Step 6: Phone verification — ACTIVE WAIT LOOP
    // If Google redirects elsewhere (birthday/age), we detect it and wait for phone page to appear.
    // If phone page never appears within 15s, account creation is complete without phone verification.
    let phoneHandled = false;
    for (let phoneWait = 0; phoneWait < 8; phoneWait++) {
      await delay(2000);
      const checkUrl = page.url();
      const checkText = await page.evaluate(() => document.body.innerText).catch(() => '');
      
      if (checkUrl.includes('phone') || checkText.includes('phone number') || checkText.includes('Phone')) {
        console.log('  → Phone verification required');
        
        if (!smsProvider) {
          return { success: false, error: 'Phone verification required but no SMS provider' };
        }
        
        const { phoneNumber } = await smsProvider.buyNumber(REGION, OPERATOR);
        console.log(`  → Phone: ${phoneNumber}`);
        
        const phoneInput = await page.$('input[type="tel"], input[name="phoneNumber"]');
        if (phoneInput) {
          await phoneInput.type(phoneNumber.replace(/^\+/, ''), { delay: randomInt(50, 100) });
          await delay(500);
        }
        
        // Click Next
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, div[role="button"]');
          for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase();
            if (text.includes('next')) {
              btn.click();
              return;
            }
          }
        });
        await delay(3000);
        
        // Wait for SMS
        console.log('  → Waiting for SMS...');
        const code = await smsProvider.waitForSms(180000);
        console.log(`  → Code: ${code}`);
        
        const codeInput = await page.$('input[type="tel"], input[name="code"]');
        if (codeInput) {
          await codeInput.type(code, { delay: randomInt(50, 100) });
          await delay(500);
        }
        
        // Click Verify
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, div[role="button"]');
          for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase();
            if (text.includes('verify') || text.includes('next')) {
              btn.click();
              return;
            }
          }
        });
        await delay(5000);
        phoneHandled = true;
        break;
      }
      
      // Check if we've reached an account completion page
      if (checkUrl.includes('myaccount.google.com') || checkUrl.includes('mail.google.com') || checkText.includes('Welcome') || checkText.includes('YouTube')) {
        console.log('  → Account completed without phone verification');
        break;
      }
      
      console.log(`  ⏳ Waiting for phone page... (${(phoneWait+1)*2}s elapsed)`);
    }
    if (!phoneHandled) {
      console.log('  ⚠️ No phone verification page appeared within 15s — proceeding to success check');
    }

    // Check success
    const finalUrl = page.url();
    const finalText = await page.evaluate(() => document.body.innerText);
    
    if (finalUrl.includes('myaccount.google.com') || finalUrl.includes('mail.google.com') || finalText.includes('Welcome') || finalText.includes('YouTube')) {
      console.log('  ✅ Account created successfully!');
      return { success: true, username, email: `${username}@gmail.com` };
    }

    console.log(`  ⚠️ Unknown final state: ${finalUrl}`);
    return { success: false, error: 'Unknown final state', url: finalUrl };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Error: --api-key or FIVESIM_API_KEY required');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('  YouTube Signup Gmail Creator v2');
  console.log('═══════════════════════════════════════════════════');

  const smsProvider = new FiveSimProvider(API_KEY);
  const balance = await smsProvider.getBalance();
  console.log(`5sim balance: $${balance.toFixed(2)}`);

  if (balance < 1) {
    console.error('Insufficient balance');
    process.exit(1);
  }

  const firstName = randomPick(FIRST_NAMES);
  const lastName = randomPick(LAST_NAMES);
  const username = generateUsername(firstName, lastName);
  
  const result = await createAccount(firstName, lastName, username, smsProvider);
  
  if (result.success) {
    const line = `${username},${username}@gmail.com,${PASSWORD},${firstName},${lastName},,0,success,${new Date().toISOString()}\n`;
    appendFileSync(CSV_FILE, line);
    console.log(`\n✅ SUCCESS: ${username}@gmail.com`);
  } else {
    console.log(`\n❌ FAILED: ${result.error}`);
  }
}

main().catch(console.error);
