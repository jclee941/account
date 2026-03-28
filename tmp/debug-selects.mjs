import { remote } from 'webdriverio';

const driver = await remote({
  hostname: 'localhost', port: 4723, path: '/',
  capabilities: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    browserName: 'chrome',
    'appium:deviceName': 'emulator',
    'appium:udid': 'localhost:5555',
    'appium:chromedriverAutodownload': true,
    'appium:noReset': true,
  }
});

// Navigate to signup
await driver.url('https://accounts.google.com/signup');
await driver.pause(8000);

// Get month select details
const monthHtml = await driver.execute(() => {
  const el = document.querySelector('#month');
  if (!el) return 'NOT FOUND';
  return {
    tag: el.tagName,
    id: el.id,
    name: el.name,
    value: el.value,
    options: Array.from(el.options || []).map(o => ({ value: o.value, text: o.text })),
    outerHTML: el.outerHTML.slice(0, 800)
  };
});
console.log('Month element:', JSON.stringify(monthHtml, null, 2));

// Get gender select details
const genderHtml = await driver.execute(() => {
  const el = document.querySelector('#gender');
  if (!el) return 'NOT FOUND';
  return {
    tag: el.tagName,
    id: el.id,
    value: el.value,
    options: Array.from(el.options || []).map(o => ({ value: o.value, text: o.text })),
    outerHTML: el.outerHTML.slice(0, 800)
  };
});
console.log('Gender element:', JSON.stringify(genderHtml, null, 2));

// Try clicking month to see native picker behavior
const monthEl = await driver.$('#month');
await monthEl.click();
await driver.pause(2000);
await driver.saveScreenshot('/home/jclee/dev/gmail/screenshots/debug-month-picker.png');

await driver.deleteSession();
console.log('Done');
