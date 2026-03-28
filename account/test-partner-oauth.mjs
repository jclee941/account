#!/usr/bin/env node
/**
 * Test: Partner OAuth Context for Gmail Account Creation
 * Hypothesis: Signing up through a high-value OAuth partner (StackOverflow, Zoom)
 * lowers Google's risk scoring, potentially bypassing QR verification.
 */
import { chromium } from "rebrowser-playwright";
import { execSync } from "child_process";
import fs from "fs";

const PROXY_RELAY = process.env.PROXY_RELAY || "127.0.0.1:18080";
const SCREENSHOT_DIR = "screenshots";
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-infobars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-component-update",
  "--disable-dev-shm-usage",
  "--disable-hang-monitor",
  "--metrics-recording-only",
  "--no-sandbox",
  `--proxy-server=http://${PROXY_RELAY}`,
];

// Partners to test — high-value Google OAuth integrations
const PARTNERS = [
  {
    name: "StackOverflow",
    url: "https://stackoverflow.com/users/signup",
    googleBtnSelector: 'button[data-provider="google"]',
    googleBtnText: "Google",
  },
  {
    name: "Zoom",
    url: "https://zoom.us/signup",
    googleBtnSelector: 'a[href*="google"], button:has-text("Google")',
    googleBtnText: "Google",
  },
  {
    name: "Medium",
    url: "https://medium.com/m/signin",
    googleBtnSelector: 'button:has-text("Sign up with Google")',
    googleBtnText: "Google",
  },
];

async function screenshot(page, name) {
  const path = `${SCREENSHOT_DIR}/partner-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  const size = fs.statSync(path).size;
  console.log(`  📸 ${path} (${(size/1024).toFixed(0)}KB)`);
}

async function testPartner(partner) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔗 Testing Partner: ${partner.name}`);
  console.log(`${"=".repeat(60)}`);
  
  let browser, context;
  try {
    browser = await chromium.launch({
      headless: false,
      args: [...STEALTH_ARGS, "--headless=new"],
    });
    
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });
    
    const page = await context.newPage();
    
    // Step 1: Go to partner signup
    console.log(`  → Navigating to ${partner.url}...`);
    try {
      await page.goto(partner.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      console.log(`  ⚠️ Navigation timeout, checking page state...`);
    }
    await page.waitForTimeout(3000);
    await screenshot(page, `${partner.name}-01-signup`);
    console.log(`  📍 URL: ${page.url()}`);
    
    // Step 2: Find and click Google sign-up/sign-in button
    console.log(`  → Looking for Google button...`);
    let googleBtn = null;
    
    // Try multiple selectors
    const selectors = [
      partner.googleBtnSelector,
      'button:has-text("Google")',
      'a:has-text("Google")',
      'button:has-text("Continue with Google")',
      'a:has-text("Continue with Google")',
      'button:has-text("Sign up with Google")',
      'a:has-text("Sign up with Google")',
      '[data-provider="google"]',
      '.google-login',
      '#google-signup',
    ];
    
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          googleBtn = btn;
          console.log(`  ✅ Found Google button: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!googleBtn) {
      console.log(`  ❌ No Google button found on ${partner.name}`);
      await screenshot(page, `${partner.name}-02-no-google-btn`);
      return { partner: partner.name, result: "no_google_button" };
    }
    
    // Click Google button — may open popup or redirect
    console.log(`  → Clicking Google button...`);
    const popupPromise = page.waitForEvent("popup", { timeout: 10000 }).catch(() => null);
    await googleBtn.click();
    await page.waitForTimeout(3000);
    
    // Check for popup (OAuth window) or redirect
    const popup = await popupPromise;
    const googlePage = popup || page;
    
    await screenshot(googlePage, `${partner.name}-03-google-oauth`);
    const oauthUrl = googlePage.url();
    console.log(`  📍 Google OAuth URL: ${oauthUrl.substring(0, 120)}`);
    
    // Step 3: On Google's page, look for "Create account" link
    console.log(`  → Looking for 'Create account' option...`);
    await googlePage.waitForTimeout(3000);
    
    const createAccountSelectors = [
      'a:has-text("Create account")',
      'button:has-text("Create account")',
      'span:has-text("Create account")',
      'a[href*="signup"]',
      'a[href*="createaccount"]',
    ];
    
    let createBtn = null;
    for (const sel of createAccountSelectors) {
      try {
        const btn = googlePage.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          createBtn = btn;
          console.log(`  ✅ Found 'Create account': ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!createBtn) {
      console.log(`  ❌ No 'Create account' link found on Google OAuth page`);
      // Dump page text for debugging
      const text = await googlePage.evaluate(() => document.body?.innerText?.substring(0, 500));
      console.log(`  📝 Page text: ${text?.replace(/\n/g, " | ")?.substring(0, 300)}`);
      await screenshot(googlePage, `${partner.name}-04-no-create`);
      return { partner: partner.name, result: "no_create_account_link", url: oauthUrl };
    }
    
    // Click "Create account"
    console.log(`  → Clicking 'Create account'...`);
    await createBtn.click();
    await googlePage.waitForTimeout(3000);
    await screenshot(googlePage, `${partner.name}-05-after-create`);
    
    const afterCreateUrl = googlePage.url();
    console.log(`  📍 After Create URL: ${afterCreateUrl.substring(0, 120)}`);
    
    // Check if "For my personal use" option appears
    const personalUse = googlePage.locator('div:has-text("For my personal use"), li:has-text("For my personal use")').first();
    try {
      if (await personalUse.isVisible({ timeout: 3000 })) {
        console.log(`  ✅ 'For my personal use' option visible — clicking...`);
        await personalUse.click();
        await googlePage.waitForTimeout(3000);
      }
    } catch (e) {}
    
    await screenshot(googlePage, `${partner.name}-06-signup-form`);
    const signupUrl = googlePage.url();
    console.log(`  📍 Signup form URL: ${signupUrl.substring(0, 120)}`);
    
    // Check what kind of page we're on
    const pageText = await googlePage.evaluate(() => document.body?.innerText?.substring(0, 1000));
    const hasNameFields = pageText?.includes("First name") || pageText?.includes("Last name");
    const hasQR = pageText?.includes("QR") || pageText?.includes("qr_code");
    const hasPhone = pageText?.includes("phone number") || pageText?.includes("Verify");
    
    console.log(`  📝 Has name fields: ${hasNameFields}`);
    console.log(`  📝 Has QR mention: ${hasQR}`);
    console.log(`  📝 Has phone mention: ${hasPhone}`);
    
    // If we see the name fields, try filling in and proceeding
    if (hasNameFields) {
      console.log(`\n  🎯 SIGNUP FORM DETECTED — Attempting to fill...`);
      
      const firstName = "Michael";
      const lastName = "Thompson";
      
      try {
        await googlePage.fill('input[name="firstName"]', firstName);
        await googlePage.fill('input[name="lastName"]', lastName);
        await screenshot(googlePage, `${partner.name}-07-name-filled`);
        
        // Click Next
        const nextBtn = googlePage.locator('button:has-text("Next"), button[type="submit"]').first();
        await nextBtn.click();
        await googlePage.waitForTimeout(5000);
        await screenshot(googlePage, `${partner.name}-08-after-name`);
        
        const afterNameUrl = googlePage.url();
        console.log(`  📍 After name URL: ${afterNameUrl.substring(0, 120)}`);
        
        // Check if we hit birthday or QR
        const afterNameText = await googlePage.evaluate(() => document.body?.innerText?.substring(0, 500));
        const hitQR = afterNameText?.includes("QR") || afterNameUrl.includes("mophoneverification");
        const hitBirthday = afterNameText?.includes("birthday") || afterNameText?.includes("Birthday") || afterNameText?.includes("Month");
        
        if (hitQR) {
          console.log(`  ❌ QR VERIFICATION HIT — Partner OAuth did NOT bypass QR`);
          return { partner: partner.name, result: "qr_verification", url: afterNameUrl };
        } else if (hitBirthday) {
          console.log(`  ✅ BIRTHDAY PAGE — Partner OAuth BYPASSED QR! Continuing...`);
          return { partner: partner.name, result: "BIRTHDAY_REACHED_SUCCESS", url: afterNameUrl };
        } else {
          console.log(`  🔍 Unknown page after name: ${afterNameText?.substring(0, 200)}`);
          return { partner: partner.name, result: "unknown_after_name", url: afterNameUrl };
        }
      } catch (e) {
        console.log(`  ⚠️ Form fill error: ${e.message.substring(0, 100)}`);
        return { partner: partner.name, result: "form_error", error: e.message };
      }
    }
    
    return { partner: partner.name, result: "completed", url: signupUrl };
    
  } catch (e) {
    console.log(`  ❌ Error: ${e.message.substring(0, 200)}`);
    return { partner: partner.name, result: "error", error: e.message };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

async function main() {
  console.log("🧪 Partner OAuth Context Test");
  console.log(`   Proxy: ${PROXY_RELAY}`);
  console.log(`   Hypothesis: Partner OAuth context lowers Google's QR risk threshold`);
  
  const results = [];
  
  // Test StackOverflow first (highest-value Google partner)
  const soResult = await testPartner(PARTNERS[0]);
  results.push(soResult);
  console.log(`\n📊 ${PARTNERS[0].name} Result: ${soResult.result}`);
  
  // If SO worked, we're done. If not, try next partner.
  if (soResult.result === "BIRTHDAY_REACHED_SUCCESS") {
    console.log("\n🎉 SUCCESS! Partner OAuth bypassed QR verification!");
  } else {
    // Try Medium as backup
    const medResult = await testPartner(PARTNERS[2]);
    results.push(medResult);
    console.log(`\n📊 ${PARTNERS[2].name} Result: ${medResult.result}`);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY:");
  for (const r of results) {
    console.log(`  ${r.partner}: ${r.result}`);
  }
}

main().catch(console.error);
