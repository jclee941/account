/**
 * ADB Utility Module for Android Automation
 * Provides reusable ADB commands for Android device interaction
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_DEVICE = 'localhost:5555';
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep helper
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute ADB command with retry logic
 * @param {string} cmd - Command to execute
 * @param {object} [options] - exec options
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function execWithRetry(cmd, options = {}) {
  let lastError;
  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      return await execAsync(cmd, options);
    } catch (error) {
      lastError = error;
      if (i < RETRY_COUNT - 1) {
        await sleep(RETRY_DELAY_MS * (i + 1));
      }
    }
  }
  throw lastError;
}

/**
 * Build ADB command string with optional device target
 * @param {string} subcmd - ADB subcommand
 * @param {string} [deviceId] - Target device ID
 * @returns {string}
 */
function adbCmd(subcmd, deviceId) {
  return deviceId ? `adb -s ${deviceId} ${subcmd}` : `adb ${subcmd}`;
}

// ============================================================================
// Device Connection
// ============================================================================

/**
 * Connect to an Android device via ADB
 * @param {string} [deviceId] - Device ID (default: localhost:5555)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function connectDevice(deviceId = DEFAULT_DEVICE) {
  return execWithRetry(`adb connect ${deviceId}`);
}

/**
 * Disconnect from an Android device
 * @param {string} [deviceId] - Device ID (default: localhost:5555)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function disconnectDevice(deviceId) {
  return execWithRetry(`adb disconnect ${deviceId || DEFAULT_DEVICE}`);
}

/**
 * Get list of currently connected ADB devices
 * @returns {Promise<string[]>} Array of device IDs
 */
export async function getConnectedDevices() {
  const { stdout } = await execWithRetry('adb devices');
  const lines = stdout.trim().split('\n').slice(1); // Skip header
  return lines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.split('\t')[0]);
}

// ============================================================================
// Input Events
// ============================================================================

/**
 * Tap at screen coordinates
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function tap(x, y, deviceId) {
  return execWithRetry(adbCmd(`shell input tap ${x} ${y}`, deviceId));
}

/**
 * Type text via ADB input
 * @param {string} text - Text to type
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function type(text, deviceId) {
  // Escape special characters and wrap in quotes
  const escaped = text.replace(/"/g, '\\"');
  return execWithRetry(adbCmd(`shell input text "${escaped}"`, deviceId));
}

/**
 * Swipe on screen
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {number} [duration=300] - Duration in ms
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function swipe(x1, y1, x2, y2, duration = 300, deviceId) {
  return execWithRetry(adbCmd(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`, deviceId));
}

/**
 * Press a keycode
 * @param {string} keycode - Keycode name (e.g., KEYCODE_ENTER, KEYCODE_BACK)
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function pressKey(keycode, deviceId) {
  return execWithRetry(adbCmd(`shell input keyevent ${keycode}`, deviceId));
}

// ============================================================================
// UI Interaction
// ============================================================================

/**
 * Take screenshot from device and save to local path
 * @param {string} [deviceId] - Target device ID
 * @param {string} localPath - Local path to save screenshot
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function screenshot(deviceId, localPath) {
  const devicePath = '/sdcard/screenshot.png';
  // Take screenshot on device
  await execWithRetry(adbCmd(`shell screencap -p ${devicePath}`, deviceId));
  // Pull to local
  return execWithRetry(adbCmd(`pull ${devicePath} ${localPath}`, deviceId));
}

/**
 * Dump UI hierarchy to XML
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<string>} XML UI hierarchy content
 */
export async function uidump(deviceId) {
  const devicePath = '/sdcard/uidump.xml';
  // Dump UI on device
  await execWithRetry(adbCmd(`shell uiautomator dump ${devicePath}`, deviceId));
  // Pull to temp
  await execWithRetry(adbCmd(`pull ${devicePath} /tmp/uidump.xml`, deviceId));
  // Read the pulled file
  const fs = await import('fs/promises');
  return fs.readFile('/tmp/uidump.xml', 'utf8');
}

/**
 * Launch Chrome browser
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function launchChrome(deviceId) {
  return execWithRetry(adbCmd('shell am start -n com.android.chrome/com.google.android.apps.chrome.Main', deviceId));
}

/**
 * Open URL in Chrome
 * @param {string} url - URL to open
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function openUrl(url, deviceId) {
  return execWithRetry(adbCmd(`shell am start -a android.intent.action.VIEW -d "${url}"`, deviceId));
}

/**
 * Go back (press BACK key)
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function goBack(deviceId) {
  return pressKey('KEYCODE_BACK', deviceId);
}

// ============================================================================
// Device State
// ============================================================================

/**
 * Check if screen is on
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<boolean>}
 */
export async function isScreenOn(deviceId) {
  const { stdout } = await execWithRetry(adbCmd('shell dumpsys power', deviceId));
  // Look for mHoldingDisplaySuspendBlocker=true or similar indicator
  const isOn = stdout.includes('mHoldingDisplaySuspendBlocker=true') ||
                (stdout.includes('Screen On') && !stdout.includes('mScreenOn=false'));
  return isOn;
}

/**
 * Wake the device
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function wakeDevice(deviceId) {
  return execWithRetry(adbCmd('shell input keyevent KEYCODE_WAKEUP', deviceId));
}

/**
 * Unlock device by swiping up
 * @param {string} [deviceId] - Target device ID
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function unlockDevice(deviceId) {
  // First wake
  await wakeDevice(deviceId);
  await sleep(200);
  // Dismiss keyguard
  try {
    await execWithRetry(adbCmd('shell wm dismiss-keyguard', deviceId));
  } catch {
    // Fallback: swipe up from bottom center
    await swipe(540, 1800, 540, 400, 300, deviceId);
  }
  return { stdout: 'unlocked', stderr: '' };
}
