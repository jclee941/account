#!/usr/bin/env node
/**
 * Gmail Automation Infrastructure Diagnostic
 * 
 * Checks all required infrastructure components for Gmail account creation:
 * - Docker/ReDroid container status
 * - ADB connection
 * - WebView Shell availability
 * - Chrome CDP availability
 * - 5sim API connectivity
 * 
 * Usage:
 *   node account/infrastructure-diagnostic.mjs
 *   node account/infrastructure-diagnostic.mjs --verbose
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const verbose = process.argv.includes('--verbose');
const checks = [];

function log(message, type = 'info') {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    header: '🔍'
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function check(name, test, required = true) {
  try {
    const result = test();
    checks.push({ name, status: result ? 'PASS' : (required ? 'FAIL' : 'WARN'), required });
    if (verbose || !result) {
      log(`${name}: ${result ? 'OK' : (required ? 'FAILED' : 'WARNING')}`, result ? 'success' : (required ? 'error' : 'warning'));
    }
    return result;
  } catch (err) {
    checks.push({ name, status: required ? 'FAIL' : 'WARN', required, error: err.message });
    if (verbose) {
      log(`${name}: ERROR - ${err.message}`, 'error');
    }
    return false;
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  Gmail Automation Infrastructure Diagnostic');
console.log('═══════════════════════════════════════════════════════════');
console.log();

// 1. Check Docker
log('Checking Docker...', 'header');
check('Docker daemon running', () => {
  try {
    execSync('docker ps', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
});

check('ReDroid container exists', () => {
  try {
    const output = execSync('docker ps --filter "name=redroid" --format "{{.Names}}"', { encoding: 'utf8' });
    return output.includes('redroid');
  } catch {
    return false;
  }
}, false);

check('ReDroid container healthy', () => {
  try {
    const output = execSync('docker ps --filter "name=redroid" --filter "status=running" --format "{{.Names}}"', { encoding: 'utf8' });
    return output.includes('redroid');
  } catch {
    return false;
  }
}, false);

console.log();

// 2. Check ADB
log('Checking ADB (Android Debug Bridge)...', 'header');
check('ADB installed', () => {
  try {
    execSync('adb version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
});

check('ADB daemon running', () => {
  try {
    execSync('adb devices', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
});

check('Device connected (localhost:5555)', () => {
  try {
    const output = execSync('adb devices', { encoding: 'utf8' });
    return output.includes('localhost:5555');
  } catch {
    return false;
  }
}, false);

check('Device authorized', () => {
  try {
    const output = execSync('adb devices', { encoding: 'utf8' });
    return output.includes('localhost:5555') && !output.includes('unauthorized');
  } catch {
    return false;
  }
}, false);

console.log();

// 3. Check WebView Shell
log('Checking WebView Shell...', 'header');
check('WebView Shell installed', () => {
  try {
    const output = execSync('adb shell pm list packages | grep webview_shell', { encoding: 'utf8', timeout: 5000 });
    return output.includes('org.chromium.webview_shell');
  } catch {
    return false;
  }
}, false);

check('WebView DevTools socket available', () => {
  try {
    const output = execSync('adb shell cat /proc/net/unix | grep webview_devtools', { encoding: 'utf8', timeout: 5000 });
    return output.includes('webview_devtools_remote');
  } catch {
    return false;
  }
}, false);

console.log();

// 4. Check Chrome for CDP mode
log('Checking Chrome for CDP mode...', 'header');
check('Chrome/Chromium installed', () => {
  try {
    execSync('which google-chrome || which chromium-browser || which chromium', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}, false);

check('Chrome CDP port available (9222)', () => {
  try {
    execSync('curl -s http://localhost:9222/json/version', { stdio: 'pipe', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}, false);

console.log();

// 5. Check 5sim API
log('Checking 5sim API...', 'header');
check('5sim API key configured', () => {
  return !!(process.env.FIVESIM_API_KEY || process.env.SMS_API_KEY);
}, false);

check('5sim API reachable', () => {
  try {
    const apiKey = process.env.FIVESIM_API_KEY || process.env.SMS_API_KEY;
    if (!apiKey) return false;
    
    // Quick check - just verify we can resolve the domain
    execSync('curl -sI https://5sim.net --max-time 3', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}, false);

console.log();

// 6. Check Node.js dependencies
log('Checking Node.js dependencies...', 'header');
check('rebrowser-playwright installed', () => {
  try {
    const pkg = JSON.parse(execSync('npm list rebrowser-playwright --json', { encoding: 'utf8', cwd: join(import.meta.dirname, '..') }));
    return !!pkg.dependencies?.['rebrowser-playwright'];
  } catch {
    return false;
  }
});

check('ghost-cursor-playwright installed', () => {
  try {
    const pkg = JSON.parse(execSync('npm list ghost-cursor-playwright --json', { encoding: 'utf8', cwd: join(import.meta.dirname, '..') }));
    return !!pkg.dependencies?.['ghost-cursor-playwright'];
  } catch {
    return false;
  }
});

console.log();

// Summary
console.log('═══════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('═══════════════════════════════════════════════════════════');

const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;
const warnings = checks.filter(c => c.status === 'WARN').length;

console.log();
console.log(`Total checks: ${checks.length}`);
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  ⚠️  Warnings: ${warnings}`);
console.log();

if (failed === 0) {
  console.log('🎉 All required infrastructure is ready!');
  console.log();
  console.log('You can now run:');
  console.log('  node account/create-accounts.mjs --dry-run --start 1 --end 3');
  process.exit(0);
} else {
  console.log('❌ Some required infrastructure is missing.');
  console.log();
  
  const criticalFailures = checks.filter(c => c.status === 'FAIL' && c.required);
  if (criticalFailures.length > 0) {
    console.log('Critical issues:');
    criticalFailures.forEach(c => {
      console.log(`  - ${c.name}`);
    });
    console.log();
  }
  
  // Provide specific guidance
  if (!checks.find(c => c.name === 'Docker daemon running')?.status === 'PASS') {
    console.log('To fix Docker:');
    console.log('  sudo systemctl start docker');
    console.log();
  }
  
  if (checks.find(c => c.name === 'ReDroid container healthy')?.status !== 'PASS') {
    console.log('To start ReDroid for CDP mode:');
    console.log('  docker run -d --name redroid --privileged');
    console.log('    -p 5555:5555');
    console.log('    -v ~/redroid-data:/data');
    console.log('    redroid/redroid:11.0.0-latest');
    console.log('  adb connect localhost:5555');
    console.log();
    console.log('Or use Chrome CDP mode instead (no ReDroid needed):');
    console.log('  google-chrome --remote-debugging-port=9222 --headless &');
    console.log();
  }
  
  if (checks.find(c => c.name === '5sim API key configured')?.status !== 'PASS') {
    console.log('To configure 5sim:');
    console.log('  export FIVESIM_API_KEY="your-api-key"');
    console.log();
  }
  
  process.exit(1);
}
