#!/usr/bin/env node
/**
 * Gmail Account Creator - Puppeteer + IPRoyal Proxy + 5sim
 * Handles Google's multi-step signup flow
 */

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const __dirname = import.meta.dirname;

// Configuration
const PASSWORD = process.env.GMAIL_PASSWORD || '';
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
const REGION = getArg('--region') || process.env.FIVESIM_REGION || 'indonesia';
const OPERATOR = getArg('--operator') || 'virtual4';
const PROXY_SERVER = process.env.PROXY_SERVER || 'http://geo.iproyal.com:12321';
const PROXY_USER = process.env.PROXY_USER || 'NsCswpfbdmaiZXiF';
const PROXY_PASS = process.env.PROXY_PASS || 'EJk03PPgaPpidGFY';
const START = parseInt(getArg('--start') || '1');
const END = parseInt(getArg('--end') || '1');
const HEADLESS = !args.includes('--headed');
const USE_PROXY = !args.includes('--no-proxy');

const CSV_FILE = join(__dirname, '..', 'accounts.csv');

const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots');

// Ensure screenshot dir exists
if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUsername(index) {
  // Use random letters + numbers for better availability
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const nums = '0123456789';
  let username = '';
  
  // Generate random pattern: 3-4 letters + 3-4 numbers (min 6 chars for Google)
  const letterCount = Math.floor(Math.random() * 2) + 3; // 3 or 4 letters
  const numCount = Math.floor(Math.random() * 2) + 3; // 3 or 4 numbers
  
  for (let i = 0; i < letterCount; i++) {
    username += chars[Math.floor(Math.random() * chars.length)];
  }
  for (let i = 0; i < numCount; i++) {
    username += nums[Math.floor(Math.random() * nums.length)];
  }
  
  return username;
}

function generateName() {
  const firstName = randomPick(FIRST_NAMES);
  const lastName = randomPick(LAST_NAMES);
  return { firstName, lastName };
}

async function buyNumber(apiKey, country, operator) {
  console.log(`📱 Buying number from 5sim: ${country}/${operator}...`);
  
  const response = await fetch(
    `https://5sim.net/v1/user/buy/activation/${country}/${operator}/google`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`5sim buy failed: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  console.log(`✅ Number purchased: ${data.phone} (ID: ${data.id})`);
  return data;
}

async function checkSms(apiKey, id) {
  const response = await fetch(
    `https://5sim.net/v1/user/check/${id}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`5sim check failed: ${response.status}`);
  }
  
  return await response.json();
}

async function waitForSms(apiKey, id, timeoutMs = 120000) {
  console.log(`⏳ Waiting for SMS (${Math.round(timeoutMs/1000)} sec timeout)...`);
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await checkSms(apiKey, id);
    
    if (status.sms && status.sms.length > 0) {
      const code = status.sms[0].code;
      console.log(`✅ SMS received: ${code}`);
      return code;
    }
    
    if (status.status === 'CANCELED' || status.status === 'BANNED') {
      throw new Error(`Number ${status.status}`);
    }
    
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 5000));
  }
  
  throw new Error('SMS timeout');
}

async function finishNumber(apiKey, id) {
  try {
    await fetch(`https://5sim.net/v1/user/finish/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
  } catch (e) {
    // Ignore
  }
}

async function cancelNumber(apiKey, id) {
  try {
    await fetch(`https://5sim.net/v1/user/cancel/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
  } catch (e) {
    // Ignore
  }
}

async function takeScreenshot(page, name, email) {
  const filename = `${email.replace(/[@.]/g, '_')}_${name}_${Date.now()}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot: ${filename}`);
  return filepath;
}

async function createAccount(index) {
  const username = generateUsername(index);
  const email = `${username}@gmail.com`;
  const { firstName, lastName } = generateName();
  
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`[${index}] Creating ${email}`);
  console.log(`    Name: ${firstName} ${lastName}`);
  console.log(`═══════════════════════════════════════════════════════`);
  
  let phoneData = null;
  let browser = null;
  let page = null;
  
  try {
    // Launch browser first to check if we can reach Google
    console.log(`🚀 Launching browser ${USE_PROXY ? 'with IPRoyal proxy' : 'without proxy'}...`);
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ];
    if (USE_PROXY) {
      launchArgs.push(`--proxy-server=${PROXY_SERVER}`);
    }
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: launchArgs
    });
    
    page = await browser.newPage();
    
    // Authenticate proxy if using one
    if (USE_PROXY) {
      await page.authenticate({
        username: PROXY_USER,
        password: PROXY_PASS
      });
    }
    // Launch browser first to check if we can reach Google
    console.log('🚀 Launching browser with IPRoyal proxy...');
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--proxy-server=${PROXY_SERVER}`
      ]
    });
    
    page = await browser.newPage();
    
    // Authenticate proxy
    await page.authenticate({
      username: PROXY_USER,
      password: PROXY_PASS
    });
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
    
    // Navigate to signup
    console.log('🌐 Navigating to signup page...');
    await page.goto('https://accounts.google.com/signup', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await takeScreenshot(page, '01_initial', username);
    
    // Check for "Use your existing email" option and click "Create account"
    console.log('📝 Looking for signup form...');
    
    // Try to find and click "Create account" link if present
    try {
      const createAccountLink = await page.$('a[href*="signup"], button[jsname="V67aGc"]');
      if (createAccountLink) {
        await createAccountLink.click();
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      // Might already be on signup form
    }
    
    // Wait for name input fields
    console.log('✏️ Filling name...');
    await page.waitForSelector('input[name="firstName"], input#firstName, input[autocomplete="given-name"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Clear and fill first name using click + type
    const firstNameInput = await page.$('input[name="firstName"], input#firstName, input[autocomplete="given-name"]');
    if (firstNameInput) {
      await firstNameInput.click({ clickCount: 3 });
      await new Promise(r => setTimeout(r, 100));
      await firstNameInput.type(firstName, { delay: 30 });
    }
    await new Promise(r => setTimeout(r, 300));
    
    // Clear and fill last name
    const lastNameInput = await page.$('input[name="lastName"], input#lastName, input[autocomplete="family-name"]');
    if (lastNameInput) {
      await lastNameInput.click({ clickCount: 3 });
      await new Promise(r => setTimeout(r, 100));
      await lastNameInput.type(lastName, { delay: 30 });
    }
    await new Promise(r => setTimeout(r, 500));
    
    await takeScreenshot(page, '02_name_filled', username);
    
    // Click next and wait for navigation
    const nextButton = await page.$('button[type="submit"], button[jsname="V67aGc"], #collectNameNext');
    if (nextButton) {
      console.log('➡️ Clicking Next after name...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
        nextButton.click()
      ]);
    }
    console.log('📅 Filling birthday and gender...');
    await new Promise(r => setTimeout(r, 2000));
    await takeScreenshot(page, '03_after_name_next', username);
    
    // Close any modal popups first
    try {
      const modalClose = await page.$('button[aria-label*="close"], button[aria-label*="Close"], div[role="dialog"] button[jsname="V67aGc"]');
      if (modalClose) {
        console.log('📝 Closing modal popup...');
        await modalClose.click();
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      // No modal or couldn't close
    }
    
    // Try different selectors for birthday
    try {
      // Wait for page to be ready
      await new Promise(r => setTimeout(r, 2000));
      
      // Use browser-side JS to find and fill all birthday/gender fields
      const result = await page.evaluate(() => {
        const results = [];
        
        // Google's custom dropdowns use Material Design components
        // The trigger element typically has classes like VfPpkd-TkwUic or VfPpkd-O1htCb
        
        // Find all dropdown trigger elements
        const dropdownTriggers = document.querySelectorAll('.VfPpkd-TkwUic, .VfPpkd-O1htCb, [role="combobox"]');
        results.push(`Found ${dropdownTriggers.length} dropdown triggers`);
        
        // Look for Month dropdown (usually first)
        let monthSet = false;
        for (const trigger of dropdownTriggers) {
          const text = trigger.textContent?.toLowerCase() || '';
          const ariaLabel = trigger.getAttribute('aria-label')?.toLowerCase() || '';
          
          if (!monthSet && (text.includes('month') || ariaLabel.includes('month'))) {
            // Click to open dropdown
            trigger.click();
            results.push('Clicked Month dropdown');
            
            // Wait for options and select January
            setTimeout(() => {
              const options = document.querySelectorAll('[role="option"], .VfPpkd-StrnGf-rymPhb');
              for (const opt of options) {
                if (opt.textContent?.includes('January') || opt.getAttribute('data-value') === '1') {
                  opt.click();
                  results.push('Selected January');
                  break;
                }
              }
            }, 500);
            
            monthSet = true;
          }
          
          if (text.includes('gender') || ariaLabel.includes('gender')) {
            trigger.click();
            results.push('Clicked Gender dropdown');
            
            setTimeout(() => {
              const options = document.querySelectorAll('[role="option"]');
              for (const opt of options) {
                if (opt.textContent?.toLowerCase().includes('male')) {
                  opt.click();
                  results.push('Selected Male');
                  break;
                }
              }
            }, 500);
          }
        }
        
        // Find and fill day input
        const dayInput = document.querySelector('input#day, input[name="day"], input[aria-label*="Day"]');
        if (dayInput) {
          dayInput.focus();
          dayInput.value = '15';
          dayInput.dispatchEvent(new Event('input', { bubbles: true }));
          dayInput.dispatchEvent(new Event('change', { bubbles: true }));
          dayInput.blur();
          results.push('Day set to: 15');
        } else {
          results.push('Day input not found');
        }
        
        // Find and fill year input  
        const yearInput = document.querySelector('input#year, input[name="year"], input[aria-label*="Year"]');
        if (yearInput) {
          yearInput.focus();
          yearInput.value = '1995';
          yearInput.dispatchEvent(new Event('input', { bubbles: true }));
          yearInput.dispatchEvent(new Event('change', { bubbles: true }));
          yearInput.blur();
          results.push('Year set to: 1995');
        } else {
          results.push('Year input not found');
        }
        
        return results.join('\n');
      });
      
      console.log('Birthday/Gender fill result:\n', result);
      
      // Wait for dropdown selections to complete
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (e) {
      console.log('⚠️ Could not fill birthday/gender:', e.message);
    }
    try {
      // Wait for page to be ready
      await new Promise(r => setTimeout(r, 2000));
      
      // Close any modal first
      try {
        const modalClose = await page.$('button[aria-label*="close" i], button[aria-label*="Close" i], div[role="dialog"] button[jsname="V67aGc"], div[data-is-wiz-dialog] button[jsname="V67aGc"]');
        if (modalClose) {
          console.log('📝 Closing modal popup before birthday...');
          await modalClose.click();
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (e) {}
      
      // Use browser-side JS to find dropdown triggers
      const result = await page.evaluate(() => {
        const results = [];
        const dropdownTriggers = document.querySelectorAll('.VfPpkd-TkwUic, .VfPpkd-O1htCb, [role="combobox"]');
        results.push(`Found ${dropdownTriggers.length} dropdown triggers`);
        
        // Find Month dropdown index
        let monthIndex = -1;
        let genderIndex = -1;
        for (let i = 0; i < dropdownTriggers.length; i++) {
          const trigger = dropdownTriggers[i];
          const text = trigger.textContent?.toLowerCase() || '';
          const ariaLabel = trigger.getAttribute('aria-label')?.toLowerCase() || '';
          if ((text.includes('month') || ariaLabel.includes('month')) && monthIndex === -1) {
            monthIndex = i;
            results.push(`Month dropdown at index ${i}`);
          }
          if ((text.includes('gender') || ariaLabel.includes('gender')) && genderIndex === -1) {
            genderIndex = i;
            results.push(`Gender dropdown at index ${i}`);
          }
        }
        
        // Fill day and year
        const dayInput = document.querySelector('input#day, input[name="day"], input[aria-label*="Day" i]');
        if (dayInput) {
          dayInput.focus();
          dayInput.value = '15';
          dayInput.dispatchEvent(new Event('input', { bubbles: true }));
          dayInput.dispatchEvent(new Event('change', { bubbles: true }));
          dayInput.blur();
          results.push('Day set to: 15');
        }
        
        const yearInput = document.querySelector('input#year, input[name="year"], input[aria-label*="Year" i]');
        if (yearInput) {
          yearInput.focus();
          yearInput.value = '1995';
          yearInput.dispatchEvent(new Event('input', { bubbles: true }));
          yearInput.dispatchEvent(new Event('change', { bubbles: true }));
          yearInput.blur();
          results.push('Year set to: 1995');
        }
        
        return { results, monthIndex, genderIndex };
      });
      
      console.log('Birthday/Gender detection:', result.results.join(', '));
      
      // Now handle dropdowns properly using Puppeteer clicks
      if (result.monthIndex >= 0) {
        const dropdowns = await page.$$('.VfPpkd-TkwUic, .VfPpkd-O1htCb, [role="combobox"]');
        if (dropdowns[result.monthIndex]) {
          console.log('📅 Opening Month dropdown...');
          await dropdowns[result.monthIndex].click();
          await new Promise(r => setTimeout(r, 800));
          
          // Use evaluate to find and click January option
          await page.evaluate(() => {
            const options = document.querySelectorAll('[role="option"]');
            for (const opt of options) {
              const text = opt.textContent?.trim();
              if (text === 'January' || opt.getAttribute('data-value') === '1') {
                opt.click();
                break;
              }
            }
          });
          console.log('✓ Month selected: January');
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      if (result.genderIndex >= 0) {
        const dropdowns = await page.$$('.VfPpkd-TkwUic, .VfPpkd-O1htCb, [role="combobox"]');
        if (dropdowns[result.genderIndex]) {
          console.log('⚧ Opening Gender dropdown...');
          await dropdowns[result.genderIndex].click();
          await new Promise(r => setTimeout(r, 800));
          
          // Use evaluate to find and click Male option
          await page.evaluate(() => {
            const options = document.querySelectorAll('[role="option"]');
            for (const opt of options) {
              const text = opt.textContent?.trim().toLowerCase();
              if (text === 'male') {
                opt.click();
                break;
              }
            }
          });
          console.log('✓ Gender selected: Male');
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
    } catch (e) {
      console.log('⚠️ Could not fill birthday/gender:', e.message);
    }
    
    await takeScreenshot(page, '04_birthday_filled', username);
    
    await takeScreenshot(page, '04_birthday_filled', username);
    
    // Click next - wait for button to be clickable
    await new Promise(r => setTimeout(r, 1000));
    const birthdayNext = await page.$('button[type="submit"]:not([disabled]), button[jsname="V67aGc"]:not([disabled]), #birthdaygenderNext:not([disabled])');
    if (birthdayNext) {
      console.log('➡️ Clicking birthday Next...');
      await birthdayNext.click();
      await new Promise(r => setTimeout(r, 3000));
    }
    
    // Wait for username page
    
    // Wait for username page
    console.log('👤 Waiting for username page...');
    await page.waitForSelector('input[name="Username"], input#username, input[autocomplete="username"], input[type="text"][name*="Username"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
    await takeScreenshot(page, '05_after_birthday_next', username);
    
    const usernameInput = await page.$('input[name="Username"], input#username, input[autocomplete="username"], input[type="text"][name*="Username"]');
    if (usernameInput) {
      // Clear any existing value and type fresh
      await page.evaluate((el, val) => {
        el.value = '';
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, usernameInput, username);
      await new Promise(r => setTimeout(r, 300));
    }
    
    await takeScreenshot(page, '06_username_filled', username);
    
    // Click next
    const usernameNext = await page.$('button[type="submit"], button, #createusernameNext');
    if (usernameNext) {
      await usernameNext.click();
    }
    
    // Wait a moment and check for username taken error
    await new Promise(r => setTimeout(r, 2000));
    
    // Check for username error message
    const usernameError = await page.evaluate(() => {
      // Look for error messages about username being taken
      const errorSelectors = [
        'div[role="alert"]',
        '.VfPpkd-fmcmS-yrriRe-V67aGc',
        '[jsname="B34EJ"]'
      ];
      
      for (const selector of errorSelectors) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent?.toLowerCase() || '';
            if (text.includes('taken') || text.includes('unavailable') || text.includes('already') || text.includes('exists') || text.includes('사용 중')) {
              return text;
            }
          }
        } catch (e) {
          // Skip invalid selectors
        }
      }
      
      // Also check any error div or span
      const allErrors = document.querySelectorAll('div, span');
      for (const el of allErrors) {
        const text = el.textContent?.toLowerCase() || '';
        if ((text.includes('taken') || text.includes('unavailable') || text.includes('already')) && text.length < 200) {
          return text;
        }
      }
      
      return null;
    });
    
    if (usernameError) {
      console.log(`⚠️ Username error detected: ${usernameError}`);
      console.log('🔄 Trying alternative username...');
      
      // Try up to 5 alternative usernames
      const maxRetries = 5;
      let success = false;
      
      for (let retry = 0; retry < maxRetries && !success; retry++) {
        // Generate completely new random username for each retry
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const nums = '0123456789';
        let altUsername = '';
        // 2-3 letters + 4-5 numbers for more variety
        const letterCount = Math.floor(Math.random() * 2) + 2;
        const numCount = Math.floor(Math.random() * 2) + 4;
        for (let i = 0; i < letterCount; i++) {
          altUsername += chars[Math.floor(Math.random() * chars.length)];
        }
        for (let i = 0; i < numCount; i++) {
          altUsername += nums[Math.floor(Math.random() * nums.length)];
        }
        
        console.log(`📝 Retry ${retry + 1}/${maxRetries}: Trying ${altUsername}`);
        
        // Clear and fill new username
        const usernameInputRetry = await page.$('input[name="Username"], input#username, input[autocomplete="username"]');
        if (usernameInputRetry) {
          // Use evaluate to reliably clear and set value
          await page.evaluate((el, val) => {
            el.value = '';
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, usernameInputRetry, altUsername);
          await new Promise(r => setTimeout(r, 500));
          
          await takeScreenshot(page, `06_username_retry_${retry + 1}`, username);
          
          // Click next again
          const usernameNextRetry = await page.$('button[type="submit"], button, #createusernameNext');
          if (usernameNextRetry) {
            await usernameNextRetry.click();
          }
          
          // Wait longer for validation and page transition
          await new Promise(r => setTimeout(r, 4000));
          
          // Check if we successfully moved to password page
          const onPasswordPage = await page.evaluate(() => {
            return !!document.querySelector('input[type="password"], input[name="Passwd"]');
          });
          
          if (onPasswordPage) {
            console.log(`✅ Successfully moved to password page with username: ${altUsername}`);
            success = true;
            // Update username for downstream use
            username = altUsername;
            break;
          }
          
          // Check for error message
          const stillError = await page.evaluate(() => {
            const errorEl = document.querySelector('div[role="alert"], .VfPpkd-fmcmS-yrriRe-V67aGc, [jsname="B34EJ"]');
            if (errorEl) {
              const text = errorEl.textContent?.toLowerCase() || '';
              return text.includes('taken') || text.includes('unavailable') || text.includes('already');
            }
            return false;
          });
          
          if (stillError) {
            console.log(`⚠️ Username ${altUsername} also taken`);
          }
        }
      }
      
      if (!success) {
        throw new Error('Username already taken - all retry attempts failed');
      }
    }
    
    // Wait for page transition after username submission
    await new Promise(r => setTimeout(r, 3000));
    await takeScreenshot(page, '06_after_username_submit', username);
    
    // Wait for password page
    console.log('🔑 Waiting for password page...');
    await page.waitForSelector('input[name="Passwd"], input#passwd, input[type="password"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
    await takeScreenshot(page, '07_after_username_next', username);
    
    const passwordInput = await page.$('input[name="Passwd"], input#passwd, input[type="password"]:first-of-type');
    const confirmInput = await page.$('input[name="PasswdAgain"], input#confirm-passwd, input[type="password"]:nth-of-type(2)');
    
    if (passwordInput) {
      await passwordInput.type(PASSWORD, { delay: 50 });
    }
    if (confirmInput) {
      await confirmInput.type(PASSWORD, { delay: 50 });
    }
    
    await takeScreenshot(page, '08_password_filled', username);
    
    // Click next
    const passwordNext = await page.$('button[type="submit"], button, #createpasswordNext');
    if (passwordNext) {
      await passwordNext.click();
    }
    
    // Wait for phone verification page OR check if we're on a different page
    console.log('📱 Waiting for next step...');
    await new Promise(r => setTimeout(r, 4000));
    await takeScreenshot(page, '09_after_password_next', username);
    
    // Check current URL and page state
    let currentUrl = page.url();
    console.log(`🌐 Current URL: ${currentUrl}`);
    
    // Check if we hit phone verification
    const phoneInput = await page.$('input[type="tel"], input[name="phoneNumber"], input#phoneNumberId, input[autocomplete="tel"]');
    
    if (!phoneInput) {
      // Check for recovery email skip option
      console.log('📍 Not on phone page, checking for skip options...');
      
      // Find skip button by text content
      const skipButtonHandle = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        return buttons.find(b => b.textContent?.toLowerCase().includes('skip'));
      });
      
      const skipButton = skipButtonHandle.asElement();
      if (skipButton) {
        console.log('⏭️ Clicking Skip...');
        await skipButton.click();
        await new Promise(r => setTimeout(r, 3000));
      }
      
      // Check again for phone input after skip
      const phoneInputRetry = await page.$('input[type="tel"], input[name="phoneNumber"], input#phoneNumberId, input[autocomplete="tel"]');
      if (!phoneInputRetry) {
        throw new Error('Phone verification page not found. Current URL: ' + currentUrl);
      }
    }
    
    console.log('📱 Phone verification page detected');
    
    // Now buy phone number and verify
    phoneData = await buyNumber(API_KEY, REGION, OPERATOR);
    
    // Enter phone number
    const phoneField = await page.$('input[type="tel"], input[name="phoneNumber"], input#phoneNumberId');
    if (!phoneField) {
      throw new Error('Phone verification page not found after password step');
    }
    
    console.log(`📞 Entering phone: ${phoneData.phone}`);
    await phoneField.type(phoneData.phone, { delay: 30 });
    await takeScreenshot(page, '10_phone_filled', username);
    
    // Click next to send SMS
    await new Promise(r => setTimeout(r, 1000));
    const phoneNext = await page.$('button[type="submit"]:not([disabled]), button[jsname="V67aGc"]:not([disabled]), #phoneNumberId:not([disabled])');
    if (phoneNext) {
      console.log('📤 Submitting phone number...');
      await phoneNext.click();
    } else {
      // Try pressing Enter
      await phoneField.press('Enter');
    }
    
    // Wait for SMS code input field to appear
    console.log('⏳ Waiting for SMS code input field...');
    await page.waitForSelector('input[name="code"], input#code, input[type="tel"][name*="code"], input[autocomplete="one-time-code"]', { timeout: 10000 }).catch(() => {
      console.log('⚠️ SMS code input not found, taking screenshot...');
    });
    await new Promise(r => setTimeout(r, 3000));
    await takeScreenshot(page, '11_after_phone_submit', username);
    
    // Check for error messages on the page
    const errorText = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('div[role="alert"], .error-message, [aria-live="assertive"]');
      return Array.from(errorElements).map(el => el.textContent).join(' ');
    });
    if (errorText) {
      console.log(`⚠️ Page errors: ${errorText}`);
    }
    
    // Wait for SMS from 5sim with longer timeout
    console.log('⏳ Waiting for SMS from 5sim (3 min timeout)...');
    const smsCode = await waitForSms(API_KEY, phoneData.id, 180000);
    
    // Enter code
    const codeInput = await page.$('input[name="code"], input#code, input[type="tel"][name*="code"], input[autocomplete="one-time-code"]');
    if (!codeInput) {
      throw new Error('SMS code input field not found after waiting');
    }
    await codeInput.type(smsCode, { delay: 100 });
    
    await takeScreenshot(page, '12_code_filled', username);
    
    // Click verify
    const verifyButton = await page.$('button[type="submit"], button[jsname="V67aGc"], #codeNext');
    if (verifyButton) {
      await verifyButton.click();
    }
    // Wait for completion
    await new Promise(r => setTimeout(r, 5000));
    await takeScreenshot(page, '13_final', username);
    
    // Check for success indicators
    currentUrl = page.url();
    console.log(`🌐 Final URL: ${currentUrl}`);
    
    // Finish the 5sim order
    await finishNumber(API_KEY, phoneData.id);
    
    // Save to CSV
    console.log('✅ Account created successfully!');
    const csvLine = `${email},${PASSWORD},${username},${firstName},${lastName},${REGION},${new Date().toISOString()}\n`;
    if (!existsSync(CSV_FILE)) {
      writeFileSync(CSV_FILE, 'email,password,username,firstName,lastName,region,createdAt\n');
    }
    appendFileSync(CSV_FILE, csvLine);
    
    await browser.close();
    return { success: true, email };
    
  } catch (error) {
    console.error(`\n❌ Failed: ${error.message}`);
    
    if (page) {
      try {
        await takeScreenshot(page, 'ERROR', username);
      } catch (e) {
        // Ignore screenshot errors
      }
    }
    
    if (browser) await browser.close();
    if (phoneData) await cancelNumber(API_KEY, phoneData.id);
    
    return { success: false, email, error: error.message };
  }
}

async function main() {
  if (!API_KEY) {
    console.error('❌ Error: FIVESIM_API_KEY not set');
    console.error('Usage: node puppeteer-gmail.mjs --api-key <key> --start 1 --end 1');
    process.exit(1);
  }
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Gmail Account Creator - Puppeteer Edition');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Range: ${START} ~ ${END}`);
  console.log(`Region: ${REGION}/${OPERATOR}`);
  console.log(`Proxy: ${USE_PROXY ? PROXY_SERVER : 'disabled (use --no-proxy to skip)'}`);
  console.log(`Mode: ${HEADLESS ? 'HEADLESS' : 'HEADED'}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = START; i <= END; i++) {
    const result = await createAccount(i);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
    
    if (i < END) {
      console.log('\n⏳ Waiting 30s before next account...');
      await new Promise(r => setTimeout(r, 30000));
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Done! ✅ ${successCount} success | ❌ ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
