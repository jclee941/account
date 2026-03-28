#!/usr/bin/env node
/**
 * Debug script: Capture the outgoing SMS intent from Google's device phone verification.
 * 
 * Flow:
 * 1. Restart Docker emulator (fresh identity)
 * 2. Run signup through Appium to reach devicephoneverification/consent
 * 3. Start ADB logcat monitoring for SMS/intent activity
 * 4. Click "Send SMS"
 * 5. Capture the SMS content (code + destination number) via:
 *    - ADB logcat (ActivityManager intent logs)
 *    - SMS content provider (content://sms)
 *    - UIAutomator dump of messaging app
 * 6. Report findings
 */

import { execSync, spawn } from 'child_process';
import { remote } from 'webdriverio';

const ADB = 'adb -s localhost:5555';
const APPIUM_HOST = 'localhost';
const APPIUM_PORT = 4723;

// Random name generation
const FIRST_NAMES = ['James','John','Robert','Michael','David','William','Richard','Joseph','Thomas','Christopher','Daniel','Matthew','Anthony','Mark','Steven','Andrew','Joshua','Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Wilson','Anderson','Taylor','Thomas','Moore','Jackson','Martin','Lee','Thompson','White','Harris','Clark','Lewis','Robinson','Walker'];

function randomEl(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resetEmulator() {
  console.log('🔄 Restarting Docker emulator for fresh identity...');
  try { execSync('docker rm -f android-emulator', { stdio: 'pipe' }); } catch {}
  try { execSync('adb disconnect', { stdio: 'pipe' }); } catch {}
  
  execSync(`docker run -d --name android-emulator \
    --device /dev/kvm \
    -p 6080:6080 -p 5554:5554 -p 5555:5555 \
    -e EMULATOR_DEVICE="Samsung Galaxy S10" \
    -e WEB_VNC=true \
    budtmo/docker-android:emulator_11.0`, { stdio: 'pipe' });
  
  console.log('  ⏳ Waiting for emulator boot...');
  const start = Date.now();
  const timeout = 180000;
  while (Date.now() - start < timeout) {
    try {
      execSync('adb connect localhost:5555', { stdio: 'pipe' });
      const boot = execSync(`${ADB} shell getprop sys.boot_completed`, { stdio: 'pipe' }).toString().trim();
      if (boot === '1') {
        console.log(`  ✅ Emulator booted in ${Math.round((Date.now() - start) / 1000)}s`);
        
        // Randomize Android ID
        const newId = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        execSync(`${ADB} shell settings put secure android_id ${newId}`, { stdio: 'pipe' });
        
        await sleep(8000); // settle time
        return true;
      }
    } catch {}
    await sleep(3000);
  }
  console.log('  ❌ Emulator boot timeout');
  return false;
}

async function main() {
  // Step 0: Reset emulator
  const booted = await resetEmulator();
  if (!booted) { process.exit(1); }
  
  // Step 1: Connect Appium
  console.log('\n📱 Connecting to Appium...');
  const driver = await remote({
    hostname: APPIUM_HOST,
    port: APPIUM_PORT,
    path: '/',
    capabilities: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'emulator',
      'appium:udid': 'localhost:5555',
      'appium:noReset': false,
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--no-first-run', '--disable-fre', '--disable-blink-features=AutomationControlled'],
        w3c: true
      }
    },
    logLevel: 'warn'
  });
  
  const firstName = randomEl(FIRST_NAMES);
  const lastName = randomEl(LAST_NAMES);
  const suffix = randomInt(10000, 99999);
  const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${suffix}`;
  const password = 'Bingogo1!';
  
  console.log(`  👤 ${firstName} ${lastName} → ${username}@gmail.com`);
  
  try {
    // Step 2: Navigate to signup
    console.log('\n📝 Step 1: Navigate to signup...');
    await driver.url('https://accounts.google.com/signup');
    await sleep(5000);
    
    // Fill name
    console.log('📝 Step 2: Fill name...');
    const fnField = await driver.$('#firstName');
    await fnField.setValue(firstName);
    await sleep(500);
    const lnField = await driver.$('#lastName');
    await lnField.setValue(lastName);
    await sleep(500);
    
    // Click Next
    const nextBtns = await driver.$$('button');
    for (const btn of nextBtns) {
      const text = await btn.getText();
      if (text.includes('Next')) { await btn.click(); break; }
    }
    await sleep(4000);
    
    // Step 3: Birthday
    console.log('📝 Step 3: Birthday...');
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const month = randomEl(MONTHS);
    
    // Click month combobox
    try {
      const combos = await driver.$$('div[role="combobox"]');
      if (combos.length > 0) {
        await combos[0].click();
        await sleep(1000);
        try {
          const monthOpt = await driver.$(`//li[@role="option"][contains(text(),"${month}")]`);
          await monthOpt.click();
        } catch {
          const firstOpt = await driver.$('//ul[@aria-label="Month"]//li[1]');
          await firstOpt.click();
        }
        await sleep(500);
      }
    } catch (e) {
      console.log(`  ⚠️ Month: ${e.message.slice(0, 60)}`);
    }
    
    // Day + Year
    try {
      const dayField = await driver.$('#day');
      await dayField.setValue(String(randomInt(1, 28)));
    } catch {}
    await sleep(300);
    try {
      const yearField = await driver.$('#year');
      await yearField.setValue(String(randomInt(1985, 2000)));
    } catch {}
    await sleep(500);
    
    // Gender
    try {
      const combos = await driver.$$('div[role="combobox"]');
      if (combos.length > 1) {
        await combos[1].click();
        await sleep(1000);
        // Try each option
        for (const text of ['Rather not say', 'Male', 'Female']) {
          try {
            const opt = await driver.$(`//li[@role="option"][contains(text(),"${text}")]`);
            await opt.click();
            await sleep(500);
            break;
          } catch {}
        }
      }
    } catch (e) {
      console.log(`  ⚠️ Gender: ${e.message.slice(0, 60)}`);
    }
    
    // Click Next
    await sleep(1000);
    const btns2 = await driver.$$('button');
    for (const btn of btns2) {
      const text = await btn.getText();
      if (text.includes('Next')) { await btn.click(); break; }
    }
    await sleep(4000);
    
    // Step 4: Username
    console.log('📝 Step 4: Username...');
    let url = await driver.getUrl();
    console.log(`  URL: ${url}`);
    
    // Try "Create your own Gmail address" first
    try {
      const createOwn = await driver.$('=Create your own Gmail address');
      await createOwn.click();
      await sleep(2000);
    } catch {
      try {
        const createOwn2 = await driver.$('//*[contains(text(),"Create your own")]');
        await createOwn2.click();
        await sleep(2000);
      } catch {}
    }
    
    // Find username input
    const inputs = await driver.$$('input[type="text"], input[type="email"], input:not([type])');
    for (const inp of inputs) {
      const name = await inp.getAttribute('name');
      const id = await inp.getAttribute('id');
      if (name === 'Username' || name === 'username' || id === 'username') {
        await inp.setValue(username);
        break;
      }
    }
    await sleep(1000);
    
    // Click Next
    const btns3 = await driver.$$('button');
    for (const btn of btns3) {
      const text = await btn.getText();
      if (text.includes('Next')) { await btn.click(); break; }
    }
    await sleep(4000);
    
    // Step 5: Password
    console.log('📝 Step 5: Password...');
    url = await driver.getUrl();
    console.log(`  URL: ${url}`);
    
    if (url.includes('signup/name')) {
      console.log('  ❌ Redirected to signup/name — rejected');
      return;
    }
    
    const pwInputs = await driver.$$('input[type="password"]');
    if (pwInputs.length >= 2) {
      await pwInputs[0].setValue(password);
      await sleep(300);
      await pwInputs[1].setValue(password);
    } else if (pwInputs.length === 1) {
      await pwInputs[0].setValue(password);
    }
    await sleep(1000);
    
    // Click Next (with retry)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const btns4 = await driver.$$('button');
      for (const btn of btns4) {
        try {
          const text = await btn.getText();
          if (text.includes('Next')) { await btn.click(); break; }
        } catch {}
      }
      await sleep(4000);
      url = await driver.getUrl();
      console.log(`  Password attempt ${attempt}: ${url}`);
      if (!url.includes('password') && !url.includes('createpassword')) break;
    }
    
    // Step 6: Check what page we're on
    console.log('\n📝 Step 6: Post-password page...');
    url = await driver.getUrl();
    console.log(`  URL: ${url}`);
    
    if (url.includes('signup/name')) {
      console.log('  ❌ Rejected — signup/name loop');
      return;
    }
    
    // Handle terms if present
    if (url.includes('termsofservice') || url.includes('consent')) {
      console.log('  📋 Terms page — accepting...');
      const agreeBtn = await driver.$$('button');
      for (const btn of agreeBtn) {
        const text = await btn.getText();
        if (text.includes('agree') || text.includes('Agree') || text.includes('Accept')) {
          await btn.click();
          await sleep(3000);
          break;
        }
      }
      url = await driver.getUrl();
      console.log(`  After terms: ${url}`);
    }
    
    // Step 7: Device phone verification — THE KEY PART
    console.log('\n🔍 Step 7: Looking for device phone verification...');
    url = await driver.getUrl();
    console.log(`  URL: ${url}`);
    
    if (!url.includes('devicephoneverification') && !url.includes('phoneverification')) {
      // Navigate through any intermediate pages
      for (let i = 0; i < 5; i++) {
        const pageText = await driver.$('body').getText();
        console.log(`  Page text (first 200): ${pageText.slice(0, 200)}`);
        
        if (url.includes('devicephoneverification')) break;
        
        // Try clicking Next/Continue/Skip buttons
        const btns = await driver.$$('button');
        for (const btn of btns) {
          const text = await btn.getText();
          if (text.match(/next|continue|skip|agree|accept/i)) {
            console.log(`  Clicking: ${text}`);
            await btn.click();
            await sleep(3000);
            break;
          }
        }
        url = await driver.getUrl();
        console.log(`  URL: ${url}`);
        if (url.includes('devicephoneverification')) break;
      }
    }
    
    // Check if we're at device phone verification
    url = await driver.getUrl();
    if (!url.includes('devicephoneverification') && !url.includes('phoneverification')) {
      console.log(`  ❌ Not at phone verification page. Final URL: ${url}`);
      const pageText = await driver.$('body').getText();
      console.log(`  Page text: ${pageText.slice(0, 500)}`);
      return;
    }
    
    console.log('\n🎯 AT DEVICE PHONE VERIFICATION PAGE!');
    console.log('  Starting SMS capture...');
    
    // Clear logcat
    execSync(`${ADB} logcat -c`, { stdio: 'pipe' });
    
    // Start logcat capture in background
    const logcatProc = spawn('adb', ['-s', 'localhost:5555', 'logcat', '-v', 'time', 
      'ActivityManager:I', 'SmsManager:*', 'Telephony:*', 'Mms:*', 'SMS:*', '*:S']);
    
    let logcatOutput = '';
    logcatProc.stdout.on('data', (d) => { logcatOutput += d.toString(); });
    
    // Check SMS database BEFORE
    const smsBefore = execSync(`${ADB} shell content query --uri content://sms 2>/dev/null || echo "empty"`, { encoding: 'utf-8' });
    console.log(`  SMS database before: ${smsBefore.trim()}`);
    
    // Check SMS outbox before
    const outboxBefore = execSync(`${ADB} shell content query --uri content://sms/outbox 2>/dev/null || echo "empty"`, { encoding: 'utf-8' });
    console.log(`  SMS outbox before: ${outboxBefore.trim()}`);
    
    // Click "Send SMS" button
    console.log('\n📤 Clicking "Send SMS"...');
    const sendBtns = await driver.$$('button');
    let clicked = false;
    for (const btn of sendBtns) {
      try {
        const text = await btn.getText();
        if (text.toLowerCase().includes('send')) {
          console.log(`  Found button: "${text}"`);
          await btn.click();
          clicked = true;
          break;
        }
      } catch {}
    }
    
    if (!clicked) {
      console.log('  ❌ No "Send SMS" button found');
      logcatProc.kill();
      return;
    }
    
    console.log('  ⏳ Waiting for SMS intent...');
    await sleep(5000);
    
    // Check what happened
    console.log('\n📊 CAPTURE RESULTS:');
    
    // 1. Logcat
    logcatProc.kill();
    console.log('\n  === LOGCAT (SMS/Activity related) ===');
    console.log(logcatOutput || '  (empty)');
    
    // Also get full logcat dump for SMS
    const fullLogcat = execSync(`${ADB} logcat -d | grep -iE 'sms|smsto|SENDTO|messaging|telephony|intent.*sms|SmsManager' | head -50`, 
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log('\n  === FULL LOGCAT SMS FILTER ===');
    console.log(fullLogcat || '  (empty)');
    
    // 2. SMS database AFTER
    const smsAfter = execSync(`${ADB} shell content query --uri content://sms 2>/dev/null || echo "empty"`, { encoding: 'utf-8' });
    console.log(`\n  === SMS database after ===`);
    console.log(smsAfter.trim());
    
    // SMS outbox
    const outboxAfter = execSync(`${ADB} shell content query --uri content://sms/outbox 2>/dev/null || echo "empty"`, { encoding: 'utf-8' });
    console.log(`\n  === SMS outbox after ===`);
    console.log(outboxAfter.trim());
    
    // SMS drafts
    const drafts = execSync(`${ADB} shell content query --uri content://sms/draft 2>/dev/null || echo "empty"`, { encoding: 'utf-8' });
    console.log(`\n  === SMS drafts ===`);
    console.log(drafts.trim());
    
    // 3. Current foreground activity
    const activity = execSync(`${ADB} shell dumpsys activity activities | grep -A5 'mResumedActivity' 2>/dev/null`, { encoding: 'utf-8' });
    console.log(`\n  === Current foreground activity ===`);
    console.log(activity.trim());
    
    // 4. Check if messaging app opened
    const recentActivities = execSync(`${ADB} shell dumpsys activity recents | head -30 2>/dev/null`, { encoding: 'utf-8' });
    console.log(`\n  === Recent activities ===`);
    console.log(recentActivities.trim());
    
    // 5. Try UIAutomator dump to see messaging app content
    console.log('\n  === UIAutomator dump ===');
    try {
      execSync(`${ADB} shell uiautomator dump /sdcard/ui.xml`, { stdio: 'pipe' });
      const uiDump = execSync(`${ADB} shell cat /sdcard/ui.xml`, { encoding: 'utf-8' });
      
      // Extract text content from UI elements
      const textMatches = uiDump.match(/text="[^"]*"/g) || [];
      const contentMatches = uiDump.match(/content-desc="[^"]*"/g) || [];
      
      console.log('  Text elements:');
      textMatches.filter(t => t !== 'text=""').forEach(t => console.log(`    ${t}`));
      
      console.log('  Content descriptions:');
      contentMatches.filter(c => c !== 'content-desc=""').forEach(c => console.log(`    ${c}`));
      
      // Look for phone number patterns
      const phoneMatch = uiDump.match(/\+?\d[\d\s-]{8,}/g);
      if (phoneMatch) {
        console.log('\n  📞 PHONE NUMBERS FOUND:');
        phoneMatch.forEach(p => console.log(`    ${p}`));
      }
      
      // Look for code patterns
      const codeMatch = uiDump.match(/\b[A-Z0-9]{4,8}\b/g);
      if (codeMatch) {
        console.log('\n  🔑 POSSIBLE CODES:');
        [...new Set(codeMatch)].slice(0, 10).forEach(c => console.log(`    ${c}`));
      }
    } catch (e) {
      console.log(`  UIAutomator error: ${e.message.slice(0, 100)}`);
    }
    
    // 6. Check Chrome URL (might have changed)
    try {
      url = await driver.getUrl();
      console.log(`\n  === Chrome URL after Send SMS ===`);
      console.log(`  ${url}`);
    } catch (e) {
      console.log(`\n  Chrome unreachable: ${e.message.slice(0, 100)}`);
      console.log('  (Expected — messaging app likely took foreground)');
    }
    
    // 7. Try to get intent log from activity manager
    const intentLog = execSync(`${ADB} shell dumpsys activity intents 2>/dev/null | grep -iE 'sms|smsto|SENDTO|messaging' | head -20`, 
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log(`\n  === Intent filter (SMS) ===`);
    console.log(intentLog || '  (empty)');
    
    // 8. Broadcast history for SMS
    const broadcasts = execSync(`${ADB} shell dumpsys activity broadcasts | grep -iE 'sms|SMS_SENT|SMS_DELIVER' | head -20`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log(`\n  === Broadcast history (SMS) ===`);
    console.log(broadcasts || '  (empty)');
    
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    console.error(e.stack);
  } finally {
    try { await driver.deleteSession(); } catch {}
  }
}

main();
