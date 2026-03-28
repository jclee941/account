import { chromium } from 'rebrowser-playwright';
import { execSync } from 'child_process';

const ADB = 'adb -s 192.168.50.240:40633';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = cmd => execSync(`${ADB} ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
const screenshot = name => { try { execSync(`${ADB} exec-out screencap -p > screenshots/${name}.png`); } catch(e) {} };

async function main() {
  console.log('[1] Connecting to CDP...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9334');
  const pages = browser.contexts()[0].pages();
  
  let consentPage = null;
  for (const p of pages) {
    const url = p.url();
    if (url.includes('consent') || url.includes('devicephoneverification')) {
      consentPage = p;
      console.log('[2] Found consent page:', url.substring(0, 80));
      break;
    }
  }
  if (!consentPage) { console.error('No consent page found!'); process.exit(1); }

  console.log('[3] Clicking Send SMS...');
  const t0 = Date.now();
  await consentPage.evaluate(() => {
    for (const b of document.querySelectorAll('button, [role=button]')) {
      if (b.textContent.includes('Send SMS') || b.textContent.includes('SMS 보내기')) {
        b.click();
        return true;
      }
    }
    return false;
  });
  
  console.log('[4] Waiting 3s for Messages app to open...');
  await sleep(3000);
  
  console.log('[5] Tapping Send button at (998, 2123)...');
  adb('shell input tap 998 2123');
  const sendTime = Date.now();
  console.log('[6] Send tapped! Elapsed: ' + (sendTime - t0) + 'ms');
  
  console.log('[7] Waiting 8s for Google to process...');
  await sleep(8000);
  screenshot('a35-verification-result-mar27');
  
  console.log('[8] Switching to browser...');
  adb('shell am start -n com.sec.android.app.sbrowser/.SBrowserMainActivity');
  await sleep(2000);
  screenshot('a35-browser-result-mar27');
  
  console.log('[9] Checking page...');
  try {
    const browser2 = await chromium.connectOverCDP('http://127.0.0.1:9334');
    const pages2 = browser2.contexts()[0].pages();
    for (const p of pages2) {
      const url = p.url();
      if (url.includes('accounts.google.com') && (url.includes('consent') || url.includes('verify') || url.includes('error') || url.includes('signup') || url.includes('ManageAccount'))) {
        const title = await p.title().catch(() => 'N/A');
        const text = await p.evaluate(() => document.body.innerText.substring(0, 400)).catch(() => 'N/A');
        console.log('Title:', title);
        console.log('URL:', url.substring(0, 120));
        console.log('Text:', text.substring(0, 300));
      }
    }
    await browser2.close();
  } catch(e) { console.log('CDP check failed:', e.message); }
  
  await browser.close();
  console.log('[DONE]');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
