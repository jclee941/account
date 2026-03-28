import { execSync } from 'child_process';

/**
 * Retry an operation with exponential backoff
 * 
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 5)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {Function} options.onRetry - Callback(retriesLeft, delay, error) called on each retry
 * @param {string} options.operationName - Name of operation for error messages
 * @returns {Promise<any>} - Result of operation
 */
export async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 5,
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
    operationName = 'operation'
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff: initialDelay * 2^attempt
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      
      if (onRetry) {
        onRetry(maxRetries - attempt, delay, error);
      }
      
      await sleep(delay);
    }
  }
  
  throw new Error(`${operationName} failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


/**
 * Check if ADB is available and device is connected
 * @returns {Object} - { available: boolean, deviceConnected: boolean, error?: string }
 */
export function checkAdbStatus() {
  try {
    execSync('adb version', { stdio: 'pipe' });
  } catch {
    return { 
      available: false, 
      deviceConnected: false, 
      error: 'ADB not installed or not in PATH' 
    };
  }
  
  try {
    const output = execSync('adb devices', { encoding: 'utf8' });
    const lines = output.split('\n').slice(1); // Skip "List of devices attached"
    const devices = lines.filter(line => line.trim() && !line.includes('daemon'));
    
    if (devices.length === 0) {
      return { 
        available: true, 
        deviceConnected: false, 
        error: 'No devices connected. Run: adb connect localhost:5555' 
      };
    }
    
    const localhostDevice = devices.find(d => d.includes('localhost:5555'));
    if (!localhostDevice) {
      return { 
        available: true, 
        deviceConnected: false, 
        error: 'localhost:5555 not connected. Run: adb connect localhost:5555' 
      };
    }
    
    if (localhostDevice.includes('unauthorized')) {
      return { 
        available: true, 
        deviceConnected: false, 
        error: 'Device unauthorized. Check ReDroid container and accept authorization.' 
      };
    }
    
    return { available: true, deviceConnected: true };
  } catch (error) {
    return { 
      available: true, 
      deviceConnected: false, 
      error: `ADB error: ${error.message}` 
    };
  }
}

/**
 * Check if ReDroid container is running
 * @returns {Object} - { running: boolean, error?: string }
 */
export function checkRedroidStatus() {
  try {
    const output = execSync('docker ps --filter "name=redroid" --format "{{.Names}} {{.Status}}"', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    
    if (!output.includes('redroid')) {
      return { 
        running: false, 
        error: 'ReDroid container not running. Start with: docker run -d --name redroid -p 5555:5555 --privileged redroid/redroid:11.0.0-latest' 
      };
    }
    
    if (output.includes('Up')) {
      return { running: true };
    }
    
    return { 
      running: false, 
      error: 'ReDroid container exists but not healthy. Check: docker logs redroid' 
    };
  } catch (error) {
    return { 
      running: false, 
      error: `Docker error: ${error.message}. Is Docker running?` 
    };
  }
}

/**
 * Check if WebView Shell is installed on device
 * @returns {Object} - { installed: boolean, error?: string }
 */
export function checkWebViewShell() {
  const adbStatus = checkAdbStatus();
  if (!adbStatus.deviceConnected) {
    return { installed: false, error: adbStatus.error };
  }
  
  try {
    const output = execSync('adb shell pm list packages | grep webview_shell', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    
    if (output.includes('org.chromium.webview_shell')) {
      return { installed: true };
    }
    
    return { 
      installed: false, 
      error: 'WebView Shell not installed. Install: adb install webview_shell.apk' 
    };
  } catch {
    return { 
      installed: false, 
      error: 'WebView Shell not installed or device not responding' 
    };
  }
}

/**
 * Perform pre-flight checks for CDP mode
 * @returns {Object} - { ok: boolean, errors: string[] }
 */
export function performPreflightChecks() {
  const errors = [];
  
  // Check Docker/ReDroid
  const redroid = checkRedroidStatus();
  if (!redroid.running) {
    errors.push(`ReDroid: ${redroid.error}`);
  }
  
  // Check ADB
  const adb = checkAdbStatus();
  if (!adb.available) {
    errors.push(`ADB: ${adb.error}`);
  } else if (!adb.deviceConnected) {
    errors.push(`Device: ${adb.error}`);
  }
  
  // Check WebView Shell
  const webview = checkWebViewShell();
  if (!webview.installed) {
    errors.push(`WebView: ${webview.error}`);
  }
  
  return {
    ok: errors.length === 0,
    errors
  };
}

/**
 * Enhanced getWsUrl with retry logic and pre-flight checks
 * 
 * @param {Object} options - Options
 * @param {number} options.port - CDP port (default: 9333)
 * @param {number} options.maxRetries - Max retries for connection (default: 10)
 * @param {boolean} options.skipPreflight - Skip pre-flight checks (default: false)
 * @returns {Promise<string>} - WebSocket URL
 */
export async function getWsUrlWithRetry(options = {}) {
  const { port = 9333, maxRetries = 10, skipPreflight = false } = options;
  
  // Run pre-flight checks first
  if (!skipPreflight) {
    const checks = performPreflightChecks();
    if (!checks.ok) {
      throw new Error(
        `Infrastructure check failed:\n${checks.errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
  }
  
  return retryWithBackoff(
    async () => {
      // Get WebView DevTools socket
      const sockets = execSync('adb shell cat /proc/net/unix | grep webview_devtools', { 
        encoding: 'utf8',
        timeout: 5000 
      }).split('\n').filter(l => l.includes('webview_devtools_remote_'));
      
      if (!sockets.length) {
        throw new Error('No WebView DevTools socket found. Is WebView Shell running?');
      }
      
      const pid = sockets[sockets.length - 1].match(/webview_devtools_remote_(\d+)/)?.[1];
      if (!pid) {
        throw new Error('Cannot parse PID from socket');
      }
      
      // Clean up old forward
      try { 
        execSync(`adb -s localhost:5555 forward --remove tcp:${port}`, { encoding: 'utf8' }); 
      } catch {}
      
      await sleep(200);
      
      // Create new forward
      execSync(`adb -s localhost:5555 forward tcp:${port} localabstract:webview_devtools_remote_${pid}`);
      await sleep(500);
      
      // Find page
      const resp = await fetch(`http://localhost:${port}/json`);
      const pages = await resp.json();
      const page = pages.find(p => p.url && p.url !== 'about:blank' && p.webSocketDebuggerUrl);
      
      if (!page?.webSocketDebuggerUrl) {
        throw new Error('No WebView page with debugger URL found');
      }
      
      return page.webSocketDebuggerUrl;
    },
    {
      maxRetries,
      initialDelay: 1000,
      maxDelay: 10000,
      operationName: 'CDP WebSocket connection',
      onRetry: (retriesLeft, delay, error) => {
        console.log(`  ⏳ CDP connection failed: ${error.message}. Retrying in ${delay}ms... (${retriesLeft} retries left)`);
      }
    }
  );
}
