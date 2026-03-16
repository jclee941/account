#!/usr/bin/env node
/**
 * Automate GCP OAuth credential creation via Playwright
 * 1. Navigate to Google Cloud Console
 * 2. Configure OAuth consent screen  
 * 3. Create Desktop OAuth client
 * 4. Download gcp-oauth.keys.json
 */
import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = process.argv[2] || process.env.GCP_PROJECT_ID || 'gmail-mcp-auto-9804';
const OUTPUT_PATH = resolve(process.env.HOME, '.gmail-mcp', 'gcp-oauth.keys.json');

if (!process.argv[2] && !process.env.GCP_PROJECT_ID) {
  console.log('Usage: node setup-gcp-oauth.mjs <project-id> [--headed]');
  console.log('  Defaulting to:', PROJECT_ID);
}

async function main() {
  const headed = process.argv.includes('--headed');
  
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Go to Google Cloud Console - OAuth consent screen
    console.log('[1/4] Navigating to OAuth consent screen...');
    await page.goto(`https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT_ID}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // May need to login - check if login page
    if (page.url().includes('accounts.google.com')) {
      console.log('⚠️  Google login required. Run with --headed to login manually.');
      console.log('   After login, the script will continue automatically.');
      
      if (!headed) {
        console.log('   Rerun with: node setup-gcp-oauth.mjs --headed');
        await browser.close();
        process.exit(1);
      }
      
      // Wait for user to complete login
      await page.waitForURL('**/console.cloud.google.com/**', { timeout: 300000 });
      console.log('✅ Login successful');
      
      // Navigate again after login
      await page.goto(`https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT_ID}`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
    }
    
    await page.screenshot({ path: 'screenshots/gcp-01-consent.png' });
    
    // Step 2: Configure consent screen if needed
    console.log('[2/4] Configuring OAuth consent screen...');
    
    // Check if "External" user type option exists (first time setup)
    const externalRadio = page.locator('text=External').first();
    if (await externalRadio.isVisible({ timeout: 5000 }).catch(() => false)) {
      await externalRadio.click();
      await page.waitForTimeout(1000);
      
      // Click CREATE button
      const createBtn = page.locator('button:has-text("CREATE"), button:has-text("Create")').first();
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(3000);
      }
    }
    
    // Fill in app name if on the edit form
    const appNameInput = page.locator('input[formcontrolname="displayName"], input[aria-label*="App name"]').first();
    if (await appNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appNameInput.fill('Gmail MCP Automation');
      
      // Fill support email
      const emailInput = page.locator('input[formcontrolname="supportEmail"], input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailInput.fill('qws9412a@gmail.com');
      }
      
      // Save
      const saveBtn = page.locator('button:has-text("SAVE"), button:has-text("Save")').first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
      }
    }
    
    await page.screenshot({ path: 'screenshots/gcp-02-consent-done.png' });
    
    // Step 3: Create OAuth client
    console.log('[3/4] Creating OAuth Desktop client...');
    await page.goto(`https://console.cloud.google.com/apis/credentials/oauthclient?project=${PROJECT_ID}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/gcp-03-create-client.png' });
    
    // Select "Desktop app" from application type dropdown
    const typeDropdown = page.locator('mat-select, [role="listbox"], select').first();
    if (await typeDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await typeDropdown.click();
      await page.waitForTimeout(1000);
      
      const desktopOption = page.locator('mat-option:has-text("Desktop app"), option:has-text("Desktop")').first();
      if (await desktopOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await desktopOption.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Fill name
    const nameInput = page.locator('input[formcontrolname="name"], input[aria-label*="Name"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('Gmail MCP Desktop');
    }
    
    // Click CREATE
    const createClientBtn = page.locator('button:has-text("CREATE"), button:has-text("Create")').first();
    if (await createClientBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createClientBtn.click();
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: 'screenshots/gcp-04-client-created.png' });
    
    // Step 4: Download JSON
    console.log('[4/4] Downloading credentials JSON...');
    
    // Look for "DOWNLOAD JSON" button in the dialog
    const downloadBtn = page.locator('button:has-text("DOWNLOAD JSON"), button:has-text("Download JSON"), a:has-text("DOWNLOAD JSON")').first();
    if (await downloadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Set up download handler
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        downloadBtn.click(),
      ]);
      
      const downloadPath = resolve('gcp-oauth.keys.json');
      await download.saveAs(downloadPath);
      console.log(`✅ Downloaded to ${downloadPath}`);
      
      // Also copy to global location
      const { mkdirSync, copyFileSync } = await import('fs');
      mkdirSync(resolve(process.env.HOME, '.gmail-mcp'), { recursive: true });
      copyFileSync(downloadPath, OUTPUT_PATH);
      console.log(`✅ Copied to ${OUTPUT_PATH}`);
    } else {
      // If no download button, go to credentials page and download from there
      console.log('   Download button not found in dialog, trying credentials page...');
      await page.goto(`https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      
      await page.screenshot({ path: 'screenshots/gcp-05-credentials-page.png' });
      
      // Find the download icon for the OAuth client
      const downloadIcon = page.locator('[aria-label*="Download"], button[mattooltip*="Download"]').first();
      if (await downloadIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10000 }),
          downloadIcon.click(),
        ]);
        
        const downloadPath = resolve('gcp-oauth.keys.json');
        await download.saveAs(downloadPath);
        console.log(`✅ Downloaded to ${downloadPath}`);
        
        const { mkdirSync, copyFileSync } = await import('fs');
        mkdirSync(resolve(process.env.HOME, '.gmail-mcp'), { recursive: true });
        copyFileSync(downloadPath, OUTPUT_PATH);
        console.log(`✅ Copied to ${OUTPUT_PATH}`);
      } else {
        console.log('⚠️  Could not find download button. Manual download needed.');
        console.log(`   Go to: https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`);
      }
    }
    
    console.log('\n🎉 Done! Next step:');
    console.log('   cd /home/jclee/dev/gmail && npx @gongrzhe/server-gmail-autoauth-mcp auth');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'screenshots/gcp-error.png' });
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
