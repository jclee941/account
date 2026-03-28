#!/usr/bin/env node
/**
 * Google Account Creator — CDP + ReDroid Edition
 *
 * Creates Google accounts via WebView Shell on ReDroid container.
 * Uses Chrome DevTools Protocol (CDP) for web interaction.
 * 5sim.net for SMS phone verification.
 *
 * Prerequisites:
 *   - ReDroid container running (redroid/redroid:11.0.0-latest)
 *   - ADB connected (adb devices shows localhost:5555)
 *
 * Usage:
 *   node account/create-accounts-cdp.mjs --dry-run --count 3
 *   node account/create-accounts-cdp.mjs --count 5 --api-key <5sim-key> --region russia
 *   node account/create-accounts-cdp.mjs --count 1 --no-restart
 */

import WebSocket from 'ws';
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Config ──────────────────────────────────────────────────────────
const ADB = 'adb -s localhost:5555';
const CDP_PORT = 9333;
const PASSWORD = 'Bingogo1!';
const DOCKER_CONTAINER = 'redroid';
const CSV_FILE = join(import.meta.dirname, '..', 'accounts.csv');
const SCREENSHOT_DIR = join(import.meta.dirname, '..', 'screenshots');

// ── CLI Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback = '') {
  const idx = args.findIndex(a => a === `--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const DRY_RUN = args.includes('--dry-run');
const COUNT = parseInt(getArg('count', '1'), 10);
const SMS_API_KEY = getArg('api-key', getArg('sms-key', process.env.FIVESIM_API_KEY || ''));
const FIVESIM_REGION = getArg('region', process.env.FIVESIM_REGION || 'indonesia');
const SKIP_RESTART = args.includes('--no-restart');

// ── Utility ─────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function formatCost(cost) { const n = Number(cost); return Number.isFinite(n) ? n.toFixed(4) : '0.0000'; }

function adb(cmd) {
  try { return execSync(`${ADB} shell ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim(); }
  catch (e) { return e.stdout?.toString().trim() || ''; }
}

// ── Name Generation ─────────────────────────────────────────────────
const FIRST_NAMES = [
  'James','John','Robert','Michael','David','William','Richard','Joseph',
  'Thomas','Christopher','Charles','Daniel','Matthew','Anthony','Mark',
  'Steven','Andrew','Joshua','Kevin','Brian','Ryan','Timothy','Jason',
  'Jeffrey','Brandon','Justin','Nathan','Adam','Kyle','Eric',
];
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
  'Rodriguez','Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas',
  'Taylor','Moore','Jackson','Martin','Lee','Thompson','White','Harris',
  'Clark','Lewis','Robinson','Walker','Young','Allen','King',
];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function generateRandomUsername(firstName, lastName) {
  const patterns = [
    () => `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(10000, 999999)}`,
    () => `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1000, 99999)}`,
    () => `${firstName.toLowerCase()}${randomInt(10000, 99999)}${lastName.toLowerCase().slice(0, 3)}`,
    () => `${lastName.toLowerCase()}${firstName.toLowerCase().slice(0, 1)}${randomInt(10000, 999999)}`,
  ];
  return patterns[randomInt(0, patterns.length - 1)]();
}

// ── CDP Client ──────────────────────────────────────────────────────
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          clearTimeout(timeout);
          this.ws.removeListener('message', handler);
          resolve(msg);
        }
      };
      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.text + ': ' + (r.result.exceptionDetails?.exception?.description || '').slice(0, 100));
    }
    return r.result?.result?.value;
  }

  async type(text) {
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'char', text: char });
      await sleep(50 + Math.random() * 80);
    }
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(50);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async tab() {
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }

  async enter() {
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  }

  close() { this.ws?.close(); }
}

// ── CDP Helpers ─────────────────────────────────────────────────────
async function getWsUrl() {
  const sockets = adb('cat /proc/net/unix').split('\n').filter(l => l.includes('webview_devtools_remote_'));
  if (!sockets.length) throw new Error('No WebView DevTools socket found');
  const pid = sockets[sockets.length - 1].match(/webview_devtools_remote_(\d+)/)?.[1];
  if (!pid) throw new Error('Cannot parse PID from socket');

  try { execSync(`adb -s localhost:5555 forward --remove tcp:${CDP_PORT}`, { encoding: 'utf8' }); } catch {}
  await sleep(200);
  execSync(`adb -s localhost:5555 forward tcp:${CDP_PORT} localabstract:webview_devtools_remote_${pid}`);
  await sleep(500);

  let page = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const resp = await fetch(`http://localhost:${CDP_PORT}/json`);
      const pages = await resp.json();
      page = pages.find(p => p.url && p.url !== 'about:blank' && p.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(2000);
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('No WebView page found after 30s');
  return page.webSocketDebuggerUrl;
}

async function getPageInfo(cdp) {
  return JSON.parse(await cdp.eval(`(function(){
    return JSON.stringify({
      url: location.href,
      title: document.title,
      inputs: Array.from(document.querySelectorAll('input')).map(function(i){return {id:i.id,name:i.name,type:i.type}}),
      buttons: Array.from(document.querySelectorAll('button,[role="button"]')).map(function(b){return b.textContent.trim().slice(0,30)}),
      bodyText: document.body.innerText.slice(0,500)
    });
  })()`));
}

async function clickButton(cdp, textPattern) {
  const clicked = await cdp.eval(`(function(){
    var bs = Array.from(document.querySelectorAll('button,[role="button"]'));
    var b = bs.find(function(b){return ${textPattern}.test(b.textContent.trim());});
    if(b){b.click(); return true;}
    return false;
  })()`);
  return clicked === true || clicked === 'true';
}

async function clickInput(cdp, selector) {
  // Use JS focus instead of CDP mouse events (WebView doesn't dispatch mouse properly)
  const found = await cdp.eval(`(function(){
    var el = document.querySelector('${selector}');
    if(el){ el.focus(); el.click(); return true; }
    return false;
  })()`);
  return found === true || found === 'true';
}

async function selectAll(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
}

async function clearAndType(cdp, selector, text) {
  // Use JS focus + clear instead of CDP mouse events (WebView doesn't dispatch mouse properly)
  await cdp.eval(`(function(){
    var el = document.querySelector('${selector}');
    if(el){ el.focus(); el.select(); el.value = ''; el.dispatchEvent(new Event('input',{bubbles:true})); }
  })()`);
  await sleep(200);
  await cdp.type(text);
}

// ── Screenshot (ADB) ────────────────────────────────────────────────
function screenshot(label) {
  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${ts}_${label}.png`;
    execSync(`adb -s localhost:5555 exec-out screencap -p > "${join(SCREENSHOT_DIR, filename)}"`, { timeout: 10000 });
    return filename;
  } catch { return null; }
}

// ── CSV ─────────────────────────────────────────────────────────────
function initCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, 'username,email,password,firstName,lastName,koreanName,cost,status,timestamp\n');
  }
}

function appendCsv(row) {
  const line = `${row.username},${row.email},${row.password},${row.firstName},${row.lastName},,${formatCost(row.cost)},${row.status},${row.timestamp}\n`;
  writeFileSync(CSV_FILE, line, { flag: 'a' });
}

// ── 5sim API ────────────────────────────────────────────────────────
const REGION_COUNTRY_CODE = {
  russia: '+7', ukraine: '+380', kazakhstan: '+7', china: '+86',
  philippines: '+63', indonesia: '+62', malaysia: '+60', kenya: '+254',
  india: '+91', usa: '+1', england: '+44', korea: '+82',
  mexico: '+52', colombia: '+57', canada: '+1', australia: '+61',
  germany: '+49', brazil: '+55', argentina: '+54',
};

async function fiveSimGetJson(url, apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response, rawText;
  try {
    response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    rawText = await response.text();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('5sim API timed out after 15s');
    throw err;
  }
  clearTimeout(timeoutId);
  let body = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = { message: rawText }; }
  if (!response.ok) {
    let message = body?.message || rawText || `5sim failed (${response.status})`;
    if (response.status === 401) message = 'Unauthorized API key.';
    throw new Error(`5sim HTTP ${response.status}: ${String(message).slice(0, 200)}`);
  }
  return body;
}

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(rawPhone, region) {
  let phone = String(rawPhone || '').replace(/\D/g, '');
  const prefix = (REGION_COUNTRY_CODE[region] || '').replace('+', '');
  if (prefix && phone.startsWith(prefix)) phone = phone.slice(prefix.length);
  return phone;
}

async function getBestOperator(apiKey, region) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/guest/prices?country=${encodeURIComponent(region)}&product=google`, apiKey
  );
  const operatorMap = body?.google?.[region] || body?.[region]?.google;
  if (!operatorMap || typeof operatorMap !== 'object') throw new Error(`No operators for region: ${region}`);
  const sorted = Object.entries(operatorMap)
    .filter(([, info]) => (info?.count || 0) > 0)
    .sort(([, a], [, b]) => Number(b?.rate || 0) - Number(a?.rate || 0));
  if (sorted.length === 0) throw new Error(`No operator data for region: ${region}`);
  return sorted[0][0];
}

async function buyNumber(apiKey, region, operator) {
  const body = await fiveSimGetJson(
    `https://5sim.net/v1/user/buy/activation/${encodeURIComponent(region)}/${encodeURIComponent(operator)}/google`, apiKey
  );
  return { phone: normalizePhone(body?.phone, region), id: body?.id, cost: extractOrderCost(body), raw: body };
}

async function checkSms(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/check/${encodeURIComponent(id)}`, apiKey);
}
async function finishNumber(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/finish/${encodeURIComponent(id)}`, apiKey);
}
async function cancelNumber(apiKey, id) {
  return fiveSimGetJson(`https://5sim.net/v1/user/cancel/${encodeURIComponent(id)}`, apiKey);
}
async function getFiveSimBalance(apiKey) {
  const body = await fiveSimGetJson('https://5sim.net/v1/user/profile', apiKey);
  const balance = Number(body?.balance);
  return Number.isFinite(balance) ? balance : 0;
}

// ── ReDroid Reset ───────────────────────────────────────────────────
async function resetRedroid() {
  console.log('  🔄 Resetting ReDroid device identity...');

  adb('am force-stop org.chromium.webview_shell');

  // Clear stale proxy settings (ReDroid may have leftover proxy config)
  try {
    adb("settings put global http_proxy :0");
    adb('settings put global global_http_proxy_host \"\"');
    adb('settings put global global_http_proxy_port \"\"');
  } catch {}

  // Clear Google services data — fresh fingerprint from Google's perspective
  adb('pm clear com.google.android.gms');
  adb('pm clear com.android.vending');
  adb('pm clear org.chromium.webview_shell');

  // Randomize Android ID
  const newId = Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  adb(`settings put secure android_id ${newId}`);

  // Randomize advertising ID
  const adId = [8, 4, 4, 4, 12].map(n =>
    Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
  ).join('-');
  adb(`settings put secure advertising_id ${adId}`);

  await sleep(3000);
  console.log(`  📱 Android ID: ${newId}`);
}

// ── Phone Verification (CDP + 5sim) ─────────────────────────────────
async function handlePhoneVerification(cdp) {
  if (!SMS_API_KEY) {
    return { cost: 0, failed: true, status: 'error:no_sms_api_key' };
  }

  let totalCost = 0;
  let activePhoneId = null;

  try {
    const operator = await getBestOperator(SMS_API_KEY, FIVESIM_REGION);
    console.log(`    📱 Operator: ${operator} (${FIVESIM_REGION})`);

    for (let attempt = 1; attempt <= 5; attempt++) {
      // Buy number
      let order;
      try {
        order = await buyNumber(SMS_API_KEY, FIVESIM_REGION, operator);
        if (!order?.id || !order?.phone) throw new Error('Invalid order');
      } catch (err) {
        console.log(`    ⚠️ Buy failed (${attempt}/5): ${err.message.slice(0, 100)}`);
        if (attempt < 5) { await sleep(2000); continue; }
        return { cost: totalCost, failed: true, status: 'error:buy_number_failed' };
      }

      activePhoneId = order.id;
      totalCost += extractOrderCost(order);
      const countryCode = REGION_COUNTRY_CODE[FIVESIM_REGION] || '';
      const fullPhone = countryCode ? `${countryCode}${order.phone}` : order.phone;
      console.log(`    📱 Number ${attempt}/5: ${fullPhone} (id=${order.id})`);

      // Find phone input via CDP
      const phonePos = await cdp.eval(`(function(){
        var sels = ['#phoneNumberId','input[name="phoneNumber"]','input[type="tel"]','input[autocomplete="tel"]'];
        for (var i = 0; i < sels.length; i++) {
          var el = document.querySelector(sels[i]);
          if (el && el.offsetParent !== null) {
            var r = el.getBoundingClientRect();
            return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
          }
        }
        return null;
      })()`);

      if (!phonePos) {
        console.log('    ❌ No phone input found');
        await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
        activePhoneId = null;

        // Try "Try another way" / alternative link
        const altClicked = await cdp.eval(`(function(){
          var els = Array.from(document.querySelectorAll('a,button,[role="link"],span'));
          var alt = els.find(function(l){return /another way|phone number|전화번호|다른 방법/i.test(l.textContent);});
          if(alt){alt.click(); return true;}
          return false;
        })()`);
        if (altClicked) {
          console.log('    🔄 Clicked alternative link, retrying...');
          await sleep(5000);
          continue;
        }
        return { cost: totalCost, failed: true, status: 'error:no_phone_input' };
      }

      // Fill phone number via JS (CDP mouse events don't work in WebView)
      await cdp.eval(`(function(){
        var el = document.querySelector('#phoneNumberId') || document.querySelector('input[name="phoneNumber"]') || document.querySelector('input[type="tel"]');
        if(el){ el.focus(); el.select(); el.value = ''; el.dispatchEvent(new Event('input',{bubbles:true})); }
      })()`);
      await sleep(200);
      await cdp.type(fullPhone);
      await sleep(randomInt(500, 800));

      // Click Next
      await clickButton(cdp, /^(next|다음|send)$/i);
      await sleep(randomInt(8000, 12000));

      // Check rejection
      const page = await getPageInfo(cdp);
      if (page.bodyText.includes('cannot be used') || page.bodyText.includes('사용할 수 없') ||
          page.bodyText.includes('This phone number') || page.bodyText.includes('Try another')) {
        console.log('    ⚠️ Phone rejected, trying next...');
        await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
        activePhoneId = null;
        await sleep(randomInt(1000, 2000));
        continue;
      }

      // Poll for SMS code (2 min)
      console.log('    ⏳ Polling SMS...');
      let code = '';
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        try {
          const smsResult = await checkSms(SMS_API_KEY, order.id);
          if (smsResult?.sms?.length > 0) {
            const entry = smsResult.sms[smsResult.sms.length - 1];
            code = String(entry.code || '').trim();
            if (code) { console.log(`    📨 SMS code: ${code}`); break; }
          }
          if (smsResult.status === 'RECEIVED') {
            code = String(smsResult.sms?.[0]?.code || '').trim();
            if (code) { console.log(`    📨 SMS code: ${code}`); break; }
          }
        } catch (e) {
          console.log(`    ⚠️ Poll error: ${e.message.slice(0, 60)}`);
        }
        await sleep(5000);
      }

      if (!code) {
        console.log('    ⏰ SMS timeout, cancelling...');
        await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
        activePhoneId = null;
        continue;
      }

      // Find and fill code input
      const codePos = await cdp.eval(`(function(){
        var sels = ['#code','input[name="code"]','input[type="tel"][inputmode="numeric"]','input[name="smsUserPin"]'];
        for (var i = 0; i < sels.length; i++) {
          var el = document.querySelector(sels[i]);
          if (el && el.offsetParent !== null) {
            var r = el.getBoundingClientRect();
            return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
          }
        }
        return null;
      })()`);

      if (codePos) {
        // Focus code input via JS and type
        await cdp.eval(`(function(){
          var sels=['#code','input[name="code"]','input[name="smsUserPin"]','input[type="tel"]'];
          for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){el.focus();el.select();el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));break;}}
        })()`);
        await sleep(200);
        await cdp.type(code);
        await sleep(randomInt(500, 800));
        const clicked = await clickButton(cdp, /^(next|verify|다음|확인)$/i);
        if (!clicked) await cdp.enter();
        await sleep(randomInt(5000, 8000));
      } else {
        // Fallback: type code and press Enter
        await cdp.type(code);
        await sleep(500);
        await cdp.enter();
        await sleep(5000);
      }

      await finishNumber(SMS_API_KEY, activePhoneId).catch(() => {});
      activePhoneId = null;
      return { cost: totalCost, failed: false };
    }

    return { cost: totalCost, failed: true, status: 'error:all_phone_attempts_exhausted' };
  } catch (err) {
    if (activePhoneId) await cancelNumber(SMS_API_KEY, activePhoneId).catch(() => {});
    return { cost: totalCost, failed: true, status: `error:phone_${err.message.slice(0, 60)}` };
  }
}

// ── Account Creation Flow ───────────────────────────────────────────
async function createAccount(account) {
  const { firstName, lastName } = account;
  let { username } = account;
  const month = randomPick(MONTHS);
  const day = String(randomInt(1, 28));
  const year = String(randomInt(1990, 2000));

  console.log(`  👤 ${firstName} ${lastName} | ${username}@gmail.com | ${month} ${day}, ${year}`);

  // Launch WebView Shell with simple URL (no & chars to avoid shell quoting issues)
  adb('am force-stop org.chromium.webview_shell');
  await sleep(1000);
  adb('am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d https://accounts.google.com/signup');
  await sleep(5000);

  let wsUrl;
  try {
    wsUrl = await getWsUrl();
  } catch (e) {
    return { status: `error:cdp_connect_${e.message.slice(0, 50)}`, cost: 0 };
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();
  let totalCost = 0;

  // Override user agent to Mobile Chrome (not WebView, not desktop).
  // - Android WebView -> devicephoneverification (send SMS from device - ReDroid can't)
  // - Desktop Chrome  -> mophoneverification (QR code scan - can't automate)
  // - Mobile Chrome    -> phoneverification (enter number, receive SMS - 5sim handles this)
  // Also strip X-Requested-With header that WebView injects (reveals WebView to Google).
  const MOBILE_CHROME_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36';
  await cdp.send('Network.setUserAgentOverride', {
    userAgent: MOBILE_CHROME_UA,
    platform: 'Linux armv8l',
    userAgentMetadata: {
      brands: [{ brand: 'Chromium', version: '125' }, { brand: 'Google Chrome', version: '125' }],
      fullVersionList: [{ brand: 'Chromium', version: '125.0.6422.113' }, { brand: 'Google Chrome', version: '125.0.6422.113' }],
      platform: 'Android',
      platformVersion: '11.0.0',
      architecture: '',
      model: 'Pixel 5',
      mobile: true,
    },
  });
  await cdp.send('Network.setExtraHTTPHeaders', {
    headers: { 'X-Requested-With': '' },
  });
  // Inject navigator overrides on every new page to hide WebView fingerprint.
  // Chrome has chrome.app/runtime; WebView does not. Google checks these.
  const WEBVIEW_SPOOF_SCRIPT = [
    'delete window.__webview_exposed;',
    'Object.defineProperty(navigator, "userAgent", { get: () => "' + MOBILE_CHROME_UA + '" });',
    'Object.defineProperty(navigator, "platform", { get: () => "Linux armv8l" });',
    'Object.defineProperty(navigator, "vendor", { get: () => "Google Inc." });',
    'if (!window.chrome) window.chrome = {};',
    'if (!window.chrome.app) window.chrome.app = { isInstalled: false, getDetails: function(){return null}, getIsInstalled: function(){return false}, installState: function(){return "not_installed"} };',
    'if (!window.chrome.runtime) window.chrome.runtime = { id: undefined };',
  ].join('\n');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBVIEW_SPOOF_SCRIPT });

  // Navigate to full signup URL via CDP (avoids shell & escaping issues)
  const SIGNUP_URL = 'https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=en';
  await cdp.send('Page.navigate', { url: SIGNUP_URL });
  await sleep(8000);

  try {
    // ── Step 1: Name ──
    let page = await getPageInfo(cdp);
    console.log(`  📄 [1/7] ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('signup')) {
      await clearAndType(cdp, '#firstName', firstName);
      await sleep(300);
      await clearAndType(cdp, '#lastName', lastName);
      await sleep(500);
      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Name: ${firstName} ${lastName}`);
      await sleep(5000);
    }

    // ── Step 2: Birthday ──
    page = await getPageInfo(cdp);
    console.log(`  📄 [2/7] ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('birthday')) {
      // Month combobox
      await cdp.eval(`(function(){var c=document.querySelectorAll('[role="combobox"]')[0]; if(c)c.click();})()`);
      await sleep(1000);
      await cdp.eval(`(function(){
        var opts=document.querySelectorAll('[role="listbox"][aria-label="Month"] [role="option"]');
        if(!opts.length) opts=document.querySelectorAll('[role="option"]');
        var target=Array.from(opts).find(function(o){return o.textContent.trim()==='${month}';});
        if(target) target.click();
      })()`);
      await sleep(500);

      await clearAndType(cdp, '#day', day);
      await sleep(300);
      await clearAndType(cdp, '#year', year);
      await sleep(500);

      // Gender: "Rather not say"
      await cdp.eval(`(function(){
        var combos=document.querySelectorAll('[role="combobox"]');
        for(var i=0;i<combos.length;i++){if(/gender/i.test(combos[i].textContent)){combos[i].click();break;}}
      })()`);
      await sleep(1000);
      await cdp.eval(`(function(){
        var list=document.querySelector('[role="listbox"][aria-label="Gender"]');
        if(list){
          var opts=list.querySelectorAll('[role="option"]');
          var target=Array.from(opts).find(function(o){return /rather/i.test(o.textContent);}) || opts[1] || opts[0];
          if(target) target.click();
        }
      })()`);
      await sleep(1000);

      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Birthday: ${month} ${day}, ${year}`);
      await sleep(5000);
    }

    // ── Step 3: Username ──
    page = await getPageInfo(cdp);
    console.log(`  📄 [3/7] ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('username') || page.url.includes('createusername')) {
      // Handle "Create your own Gmail address"
      const hasCreate = await cdp.eval(`(function(){
        var els=Array.from(document.querySelectorAll('div,span,label'));
        return els.some(function(e){return /create your own/i.test(e.textContent);});
      })()`);
      if (hasCreate) {
        await cdp.eval(`(function(){
          var els=Array.from(document.querySelectorAll('div,span,label'));
          var el=els.find(function(e){return /create your own/i.test(e.textContent);});
          if(el) el.click();
        })()`);
        await sleep(1000);
      }

      const usernameInput = page.inputs.find(i => i.name === 'username' || i.id === 'username');
      if (usernameInput) {
        await clearAndType(cdp, `#${usernameInput.id || 'username'}`, username);
      } else {
        await cdp.eval(`(function(){var inp=document.querySelector('input[type="text"],input[type="email"]');if(inp){inp.focus();inp.value='';}})()`);
        await sleep(100);
        await cdp.type(username);
      }
      await sleep(500);
      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Username: ${username}`);
      await sleep(5000);

      // Check if username taken
      page = await getPageInfo(cdp);
      if (page.url.includes('username') && (page.bodyText.includes('is taken') || page.bodyText.includes('already'))) {
        username = generateRandomUsername(firstName, lastName);
        account.username = username;
        console.log(`  ⚠️ Taken, retrying: ${username}`);
        const uInput = page.inputs.find(i => i.name === 'username' || i.id === 'username');
        await clearAndType(cdp, `#${uInput?.id || 'username'}`, username);
        await sleep(500);
        await clickButton(cdp, /^next$/i);
        await sleep(5000);
      }
    }

    // ── Step 4: Password ──
    page = await getPageInfo(cdp);
    console.log(`  📄 [4/7] ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('password') || page.url.includes('createpassword')) {
      const pwInputs = page.inputs.filter(i => i.type === 'password');
      if (pwInputs.length >= 1) {
        // Fill first password via JS focus
        await cdp.eval(`(function(){
          var el = document.querySelector('input[type="password"]');
          if(el){ el.focus(); el.select(); el.value = ''; el.dispatchEvent(new Event('input',{bubbles:true})); }
        })()`);
        await sleep(200);
        await cdp.type(PASSWORD);
        await sleep(300);

        if (pwInputs.length >= 2) {
          // Fill confirm password via JS focus
          await cdp.eval(`(function(){
            var inputs = document.querySelectorAll('input[type="password"]');
            if(inputs[1]){ inputs[1].focus(); inputs[1].select(); inputs[1].value = ''; inputs[1].dispatchEvent(new Event('input',{bubbles:true})); }
          })()`);
          await sleep(200);
          await cdp.type(PASSWORD);
        }
      }
      await sleep(500);
      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Password set`);
      await sleep(5000);
    } else if (page.url.includes('signup/name') || page.url.includes('signup/v2')) {
      screenshot(`${username}_rejected`);
      return { status: 'signup_rejected_loop', cost: 0 };
    }

    // ── Step 4.5: Skip recovery email/phone if prompted ──
    page = await getPageInfo(cdp);
    if (page.url.includes('recovery') || page.url.includes('speedbump')) {
      const skipped = await clickButton(cdp, /^(skip|not now|건너뛰기|나중에)$/i);
      if (skipped) {
        console.log('  ⏭️ Skipped recovery page');
        await sleep(5000);
      }
    }

    // ── Step 5: Phone Verification ──
    page = await getPageInfo(cdp);
    console.log(`  📄 [5/7] ${page.url.split('?')[0].split('/').pop()}`);

    // Detect redirect back to signup
    if (page.url.includes('signup/name') || (page.url.includes('signup/v2') && !page.url.includes('password'))) {
      screenshot(`${username}_rejected`);
      return { status: 'signup_rejected_loop', cost: totalCost };
    }

    if (page.url.includes('phoneverification') || page.url.includes('devicephoneverification') ||
        page.url.includes('mophoneverification')) {
      console.log('  📱 Phone verification required');
      screenshot(`${username}_phone`);

      // On device verification page, try alternative method first
      if (page.url.includes('devicephoneverification')) {
        const altClicked = await cdp.eval(`(function(){
          var els = Array.from(document.querySelectorAll('a,[role="link"]'));
          var alt = els.find(function(l){return /another way|다른 방법/i.test(l.textContent) && l.textContent.length < 50;});
          if(alt){alt.click(); return true;}
          return false;
        })()`);
        if (altClicked) {
          console.log('  🔄 Clicked alternative verification');
          await sleep(5000);
        }
      }

      if (SMS_API_KEY) {
        const phoneResult = await handlePhoneVerification(cdp);
        totalCost += phoneResult.cost;
        if (phoneResult.failed) {
          screenshot(`${username}_phone_fail`);
          return { status: phoneResult.status || 'phone_verification_failed', cost: totalCost };
        }
        console.log('  ✅ Phone verified');
      } else {
        return { status: 'phone_verification_no_key', cost: 0 };
      }
    } else if (page.url.includes('qrcode')) {
      screenshot(`${username}_qr`);
      return { status: 'qr_code_verification', cost: 0 };
    }

    // ── Step 6: Terms/Consent ──
    page = await getPageInfo(cdp);
    console.log(`  📄 [6/7] ${page.url.split('?')[0].split('/').pop()}`);

    for (let ta = 0; ta < 3; ta++) {
      if (page.url.includes('terms') || page.url.includes('consent') || page.url.includes('speedbump')) {
        // Scroll down first (terms may need full scroll)
        await cdp.eval('(function(){window.scrollTo(0,document.body.scrollHeight);})()');
        await sleep(1000);
        const clicked = await clickButton(cdp, /^(i agree|agree|accept|confirm|동의|수락|확인)$/i);
        if (clicked) {
          console.log('  ✅ Terms accepted');
          await sleep(5000);
          page = await getPageInfo(cdp);
          if (!page.url.includes('terms') && !page.url.includes('consent')) break;
        } else {
          await sleep(2000);
        }
      } else {
        break;
      }
    }

    // ── Step 7: Account Check ──
    page = await getPageInfo(cdp);
    const finalUrl = page.url;
    console.log(`  📄 [7/7] ${finalUrl.split('?')[0]}`);

    if (finalUrl.includes('myaccount.google.com') || finalUrl.includes('mail.google.com') ||
        finalUrl.includes('/inbox') || finalUrl.includes('gettingstarted') ||
        finalUrl.includes('welcome')) {
      screenshot(`${username}_success`);
      return { status: 'success', cost: totalCost };
    }
    if (finalUrl.includes('terms') || finalUrl.includes('consent')) {
      screenshot(`${username}_terms_stuck`);
      return { status: 'terms_stuck', cost: totalCost };
    }
    if (finalUrl.includes('phoneverification') || finalUrl.includes('devicephoneverification')) {
      return { status: 'device_verification_stuck', cost: totalCost };
    }

    screenshot(`${username}_unknown`);
    return { status: `unknown:${finalUrl.split('?')[0].split('/').pop()}`, cost: totalCost };

  } finally {
    cdp.close();
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !SMS_API_KEY) {
    console.log('⚠️  No SMS API key. Phone verification will fail.');
    console.log('   Use --api-key <key> or set FIVESIM_API_KEY env var.\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Google Account Creator — CDP + ReDroid');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Count:     ${COUNT}`);
  console.log(`  Password:  ${'*'.repeat(PASSWORD.length)}`);
  console.log(`  Mode:      ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Container: ${DOCKER_CONTAINER}`);
  console.log(`  SMS:       region=${FIVESIM_REGION} key=${SMS_API_KEY ? 'set' : 'unset'}`);
  console.log(`  Restart:   ${SKIP_RESTART ? 'skip' : 'reset between accounts'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Generate accounts
  const accounts = [];
  for (let i = 0; i < COUNT; i++) {
    const firstName = randomPick(FIRST_NAMES);
    const lastName = randomPick(LAST_NAMES);
    const username = generateRandomUsername(firstName, lastName);
    accounts.push({ username, firstName, lastName });
  }

  if (DRY_RUN) {
    console.log('📋 Preview (dry run):\n');
    console.log('Username            | Email                         | First      | Last');
    console.log('────────────────────|───────────────────────────────|────────────|────────');
    for (const { username, firstName, lastName } of accounts) {
      console.log(
        `${username.padEnd(20)}| ${(username + '@gmail.com').padEnd(30)}| ${firstName.padEnd(11)}| ${lastName}`
      );
    }
    console.log(`\nTotal: ${accounts.length} accounts`);
    return;
  }

  // Check 5sim balance
  if (SMS_API_KEY) {
    try {
      const balance = await getFiveSimBalance(SMS_API_KEY);
      console.log(`💰 5sim balance: ${balance.toFixed(4)}\n`);
    } catch (err) {
      console.log(`⚠️ Balance check failed: ${err.message.slice(0, 100)}\n`);
    }
  }

  initCsv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let successCount = 0;
  let failCount = 0;
  let totalSmsCost = 0;

  for (let idx = 0; idx < accounts.length; idx++) {
    const account = accounts[idx];
    const email = `${account.username}@gmail.com`;

    console.log(`\n[${idx + 1}/${accounts.length}] Creating ${email}`);

    // Reset device identity
    if (SKIP_RESTART) {
      console.log('  ⏭️  Skipping reset (--no-restart)');
    } else {
      try {
        await resetRedroid();
      } catch (e) {
        console.log(`  ❌ Reset failed: ${e.message.slice(0, 80)}`);
        failCount++;
        appendCsv({
          username: account.username, email, password: PASSWORD,
          firstName: account.firstName, lastName: account.lastName,
          cost: 0, status: 'error:reset_failed', timestamp: new Date().toISOString(),
        });
        continue;
      }
    }

    try {
      const result = await createAccount(account);
      totalSmsCost += Number(result.cost || 0);

      appendCsv({
        username: account.username, email, password: PASSWORD,
        firstName: account.firstName, lastName: account.lastName,
        cost: result.cost || 0, status: result.status,
        timestamp: new Date().toISOString(),
      });

      if (result.status === 'success') {
        successCount++;
        console.log(`  ✅ SUCCESS: ${account.username}@gmail.com`);
      } else {
        failCount++;
        console.log(`  ❌ FAILED: ${account.username}@gmail.com — ${result.status}`);
      }
    } catch (err) {
      failCount++;
      console.log(`  ❌ FATAL: ${err.message.slice(0, 120)}`);
      appendCsv({
        username: account.username, email, password: PASSWORD,
        firstName: account.firstName, lastName: account.lastName,
        cost: 0, status: `error:${err.message.slice(0, 80)}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Cooldown between accounts
    if (idx < accounts.length - 1) {
      const waitSec = randomInt(10, 30);
      console.log(`  ⏳ Cooldown ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Done! ✅ ${successCount} success | ❌ ${failCount} failed`);
  console.log(`  SMS Cost: ${totalSmsCost.toFixed(4)}`);
  console.log(`  CSV: ${CSV_FILE}`);
  console.log('═══════════════════════════════════════════════════════');

  if (SMS_API_KEY) {
    try {
      const endBalance = await getFiveSimBalance(SMS_API_KEY);
      console.log(`💰 5sim balance (end): ${endBalance.toFixed(4)}`);
    } catch {}
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
