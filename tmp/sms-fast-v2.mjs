import { chromium } from 'rebrowser-playwright';
import { execSync } from 'child_process';

const ADB = 'adb -s 192.168.50.240:40633';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = cmd => { try { return execSync(`${ADB} ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim(); } catch(e) { return e.message; } };
const shot = name => { try { execSync(`${ADB} exec-out screencap -p > screenshots/${name}.png`); } catch(e) {} };

async function main() {
  const t = () => new Date().toISOString().substring(11, 23);
  
  console.log(`[${t()}] Connecting CDP...`);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9334');
  const pages = browser.contexts()[0].pages();
  
  // Find the accounts.google.com page (could be error or consent)
  let page = null;
  for (const p of pages) {
    const url = p.url();
    if (url.includes('accounts.google.com') && (url.includes('mophoneverification') || url.includes('devicephoneverification') || url.includes('consent'))) {
      page = p;
      console.log(`[${t()}] Found page: ${url.substring(0, 100)}`);
      break;
    }
  }
  if (!page) { console.error('No verification page!'); process.exit(1); }

  // Step 1: If on error page, click Next to get to consent
  const url = page.url();
  if (url.includes('error')) {
    console.log(`[${t()}] On error page, clicking Next...`);
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button, [role=button]'))
        if (b.textContent.includes('Next') || b.textContent.includes('다음')) { b.click(); return; }
    });
    await sleep(3000);
    console.log(`[${t()}] New URL: ${page.url().substring(0, 100)}`);
  }

  // Step 2: Confirm we're on consent page
  const newUrl = page.url();
  if (!newUrl.includes('consent')) {
    console.log(`[${t()}] Not on consent page: ${newUrl.substring(0, 100)}`);
    shot('a35-not-consent');
    process.exit(1);
  }

  // Step 3: Click "Send SMS" via CDP
  console.log(`[${t()}] *** CLICKING SEND SMS ***`);
  const t0 = Date.now();
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button, [role=button]'))
      if (b.textContent.includes('Send SMS') || b.textContent.includes('SMS 보내기')) { b.click(); return true; }
    return false;
  });

  // Step 4: IMMEDIATELY switch to Messages via ADB (don't wait)
  console.log(`[${t()}] Switching to Messages NOW...`);
  adb('shell am start -n com.samsung.android.messaging/.ui.notification.SmsIntentActivity');
  
  // Step 5: Wait 2s for Messages to be foreground with SMS composed
  await sleep(2000);
  console.log(`[${t()}] Tapping Send at (998, 2123)...`);
  adb('shell input tap 998 2123');
  console.log(`[${t()}] SENT! Elapsed: ${Date.now() - t0}ms`);

  // Step 6: Wait for Google to receive + process
  console.log(`[${t()}] Waiting 10s for Google to process...`);
  await sleep(10000);
  
  // Step 7: Switch to browser and check
  adb('shell am start -n com.sec.android.app.sbrowser/.SBrowserMainActivity');
  await sleep(2000);
  shot('a35-final-result-mar27');
  
  // Step 8: Check result via CDP
  console.log(`[${t()}] Checking result...`);
  try {
    const b2 = await chromium.connectOverCDP('http://127.0.0.1:9334');
    for (const p of b2.contexts()[0].pages()) {
      const u = p.url();
      if (u.includes('accounts.google.com') && !u.includes('signin') && !u.includes('search')) {
        const title = await p.title().catch(() => '?');
        const text = await p.evaluate(() => document.body?.innerText?.substring(0, 300)).catch(() => '?');
        console.log(`Title: ${title}`);
        console.log(`URL: ${u.substring(0, 120)}`);
        console.log(`Text: ${text?.substring(0, 200)}`);
      }
    }
    await b2.close();
  } catch(e) {}
  
  await browser.close();
  console.log(`[${t()}] DONE`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
