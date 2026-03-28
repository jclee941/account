#!/usr/bin/env node
/**
 * Google Account Signup via Redroid WebView + CDP
 * Uses Chrome DevTools Protocol to interact with WebView Shell on Redroid container.
 */
import WebSocket from 'ws';
import { execSync } from 'child_process';

const ADB = 'adb -s localhost:5555';
const CDP_PORT = 9333;

// Random name generation
const FIRST_NAMES = ['James','Robert','Michael','William','David','Richard','Joseph','Thomas','Daniel','Matthew','Anthony','Mark','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','George'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin'];

function randomName() {
  const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return { firstName: fn, lastName: ln };
}

function randomUsername(fn, ln) {
  const num = Math.floor(Math.random() * 900000) + 100000;
  return `${fn.toLowerCase()}${ln.toLowerCase()}${num}`;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// CDP WebSocket wrapper
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
      throw new Error(r.result.exceptionDetails.text + ': ' + r.result.exceptionDetails?.exception?.description?.slice(0, 100));
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function adb(cmd) {
  try { return execSync(`${ADB} shell ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim(); }
  catch (e) { return e.stdout?.toString().trim() || ''; }
}

async function getWsUrl() {
  // Find DevTools socket
  const sockets = adb('cat /proc/net/unix').split('\n').filter(l => l.includes('webview_devtools_remote_'));
  if (!sockets.length) throw new Error('No WebView DevTools socket found');
  const pid = sockets[sockets.length - 1].match(/webview_devtools_remote_(\d+)/)?.[1];
  if (!pid) throw new Error('Cannot parse PID from socket');

  // Forward port
  try { execSync(`adb -s localhost:5555 forward --remove tcp:${CDP_PORT}`, { encoding: 'utf8' }); } catch {}
  await sleep(200);
  execSync(`adb -s localhost:5555 forward tcp:${CDP_PORT} localabstract:webview_devtools_remote_${pid}`);
  await sleep(500);

  // Get page info — retry until page loads
  let page = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const resp = await fetch(`http://localhost:${CDP_PORT}/json`);
      const pages = await resp.json();
      page = pages.find(p => p.url?.includes('accounts.google.com'));
      if (page?.webSocketDebuggerUrl) break;
    } catch {}
    console.log(`  ⏳ Waiting for page to load... (${attempt + 1}/10)`);
    await sleep(2000);
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('No Google account page found after 20s');
  return page.webSocketDebuggerUrl;
}

async function waitForUrl(cdp, pattern, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await cdp.eval('(function(){return location.href;})()');
    if (url.includes(pattern)) return url;
    await sleep(1000);
  }
  return await cdp.eval('(function(){return location.href;})()');
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
  const pos = await cdp.eval(`(function(){
    var bs = Array.from(document.querySelectorAll('button,[role="button"]'));
    var b = bs.find(function(b){return ${textPattern}.test(b.textContent.trim());});
    if(b){var r=b.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}
    return null;
  })()`);
  if (!pos) return false;
  const { x, y } = JSON.parse(pos);
  await cdp.click(x, y);
  return true;
}

async function clickInput(cdp, selector) {
  const pos = await cdp.eval(`(function(){
    var el = document.querySelector('${selector}');
    if(el){var r=el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}
    return null;
  })()`);
  if (!pos) return false;
  const { x, y } = JSON.parse(pos);
  await cdp.click(x, y);
  return true;
}

async function selectAll(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
}

async function clearAndType(cdp, selector, text) {
  await clickInput(cdp, selector);
  await sleep(200);
  await selectAll(cdp);
  await sleep(100);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await sleep(200);
  await cdp.type(text);
}

// ── Main Flow ──

async function main() {
  const { firstName, lastName } = randomName();
  const username = randomUsername(firstName, lastName);
  const password = 'Bingogo1!';
  const month = MONTHS[Math.floor(Math.random() * 12)];
  const day = String(Math.floor(Math.random() * 28) + 1);
  const year = String(Math.floor(Math.random() * 10) + 1990);

  console.log(`\n👤 ${firstName} ${lastName} | ${username}@gmail.com | ${month} ${day}, ${year}`);
  console.log(`📱 Redroid + WebView Shell + CDP\n`);

  // Launch WebView Shell
  adb('am force-stop org.chromium.webview_shell');
  await sleep(1000);
  adb("am start -a android.intent.action.VIEW -d 'https://accounts.google.com/signup' -n org.chromium.webview_shell/.WebViewBrowserActivity");
  await sleep(8000);

  const wsUrl = await getWsUrl();
  console.log('🔗 CDP connected');

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  try {
    // ── Step 1: Name ──
    let page = await getPageInfo(cdp);
    console.log(`📄 Step 1: ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('signup/name')) {
      // Fill first name using CDP click + type (not JS injection)
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
    console.log(`📄 Step 2: ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('birthday')) {
      // Select month via combobox
      await cdp.eval(`(function(){var c=document.querySelectorAll('[role="combobox"]')[0]; if(c)c.click();})()`);
      await sleep(1000);
      await cdp.eval(`(function(){
        var opts=document.querySelectorAll('[role="listbox"][aria-label="Month"] [role="option"]');
        if(!opts.length) opts=document.querySelectorAll('[role="option"]');
        var target=Array.from(opts).find(function(o){return o.textContent.trim()==='${month}';});
        if(target) target.click();
      })()`);
      await sleep(500);

      // Fill Day via click + type
      await clearAndType(cdp, '#day', day);
      await sleep(300);

      // Fill Year via click + type
      await clearAndType(cdp, '#year', year);
      await sleep(500);

      // Select Gender
      await cdp.eval(`(function(){
        var combos=document.querySelectorAll('[role="combobox"]');
        for(var i=0;i<combos.length;i++){
          if(/gender/i.test(combos[i].textContent)){combos[i].click();break;}
        }
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

      // Verify values
      const state = await cdp.eval(`(function(){return JSON.stringify({
        month: document.querySelectorAll('[role="combobox"]')[0]?.textContent?.trim(),
        gender: document.querySelectorAll('[role="combobox"]')[1]?.textContent?.trim(),
        day: document.querySelector('#day')?.value,
        year: document.querySelector('#year')?.value
      });})()`);
      console.log(`  📋 Birthday: ${state}`);

      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Birthday filled, clicked Next`);
      await sleep(5000);
    }

    // ── Step 3: Username ──
    page = await getPageInfo(cdp);
    console.log(`📄 Step 3: ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('username') || page.url.includes('createusername')) {
      // Check for "Create your own Gmail address" option
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

      // Type username
      const usernameInput = page.inputs.find(i => i.name === 'username' || i.id === 'username');
      if (usernameInput) {
        await clearAndType(cdp, `#${usernameInput.id || 'username'}`, username);
      } else {
        // Try first visible text input
        await cdp.eval(`(function(){var inp=document.querySelector('input[type="text"],input[type="email"]');if(inp){inp.focus();inp.value='';}})()`);
        await sleep(100);
        await cdp.type(username);
      }
      await sleep(500);
      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Username: ${username}`);
      await sleep(5000);
    }

    // ── Step 4: Password ──
    page = await getPageInfo(cdp);
    console.log(`📄 Step 4: ${page.url.split('?')[0].split('/').pop()}`);

    if (page.url.includes('password') || page.url.includes('createpassword')) {
      const pwInputs = page.inputs.filter(i => i.type === 'password');
      if (pwInputs.length >= 1) {
        // Fill password
        await clickInput(cdp, 'input[type="password"]');
        await sleep(200);
        await cdp.type(password);
        await sleep(300);

        // Fill confirm password if exists
        if (pwInputs.length >= 2) {
          const pos = await cdp.eval(`(function(){
            var inputs = document.querySelectorAll('input[type="password"]');
            if(inputs[1]){var r=inputs[1].getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}
            return null;
          })()`);
          if (pos) {
            const { x, y } = JSON.parse(pos);
            await cdp.click(x, y);
            await sleep(200);
            await cdp.type(password);
          }
        }
      }
      await sleep(500);
      await clickButton(cdp, /^next$/i);
      console.log(`  ✅ Password set`);
      await sleep(5000);
    }

    // ── Step 5: Check result ──
    page = await getPageInfo(cdp);
    const urlPath = page.url.split('?')[0];
    console.log(`\n📄 Final: ${urlPath}`);
    console.log(`📋 Title: ${page.title}`);
    console.log(`🔘 Buttons: ${page.buttons.join(', ')}`);
    console.log(`📝 Body: ${page.bodyText.slice(0, 300)}`);

    if (page.url.includes('devicephoneverification')) {
      console.log('\n❌ DEVICE PHONE VERIFICATION — same as budtmo emulator');
    } else if (page.url.includes('phoneverification') || page.url.includes('mophoneverification')) {
      console.log('\n⚠️ PHONE/QR VERIFICATION');
    } else if (page.url.includes('birthday')) {
      console.log('\n⚠️ Still on birthday page — form validation failed');
    } else if (page.url.includes('password')) {
      console.log('\n⚠️ Still on password page');
    } else if (page.url.includes('terms') || page.url.includes('consent')) {
      console.log('\n🎉 REACHED TERMS PAGE — account may be creatable!');
    } else {
      console.log('\n❓ Unknown page — check URL above');
    }

  } catch (e) {
    console.error('\n💥 Error:', e.message);
  } finally {
    cdp.close();
  }
}

main().catch(console.error);
