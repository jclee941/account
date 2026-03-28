#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const DEFAULT_IMAGE = process.env.ANDROID_EMULATOR_IMAGE || 'budtmo/docker-android:emulator_11.0';
const DEFAULT_CONTAINER = process.env.ANDROID_EMULATOR_CONTAINER || 'gmail-android-emulator';
const DEFAULT_ADB_HOST = process.env.ANDROID_EMULATOR_ADB_HOST || '127.0.0.1';
const DEFAULT_ADB_PORT = Number(process.env.ANDROID_EMULATOR_ADB_PORT || 5555);

class CommandError extends Error {
  constructor(message, result) {
    super(message);
    this.name = 'CommandError';
    this.result = result;
  }
}

function log(message) {
  const ts = new Date().toISOString();
  console.error(`[setup-emulator ${ts}] ${message}`);
}

function mergeOptions(options = {}) {
  return {
    image: options.image || DEFAULT_IMAGE,
    containerName: options.containerName || DEFAULT_CONTAINER,
    adbHost: options.adbHost || DEFAULT_ADB_HOST,
    adbPort: Number(options.adbPort || DEFAULT_ADB_PORT),
    startupTimeoutMs: Number(options.startupTimeoutMs || 6 * 60 * 1000),
    bootTimeoutMs: Number(options.bootTimeoutMs || 5 * 60 * 1000),
  };
}

async function runCommand(command, args = [], options = {}) {
  const {
    cwd,
    env,
    timeoutMs = 60_000,
    retries = 0,
    retryDelayMs = 2_000,
    allowFailure = false,
    shell = false,
    input,
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd,
          env,
          shell,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });

        child.on('close', (code, signal) => {
          clearTimeout(timer);

          const resultPayload = {
            command,
            args,
            code,
            signal,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            timedOut,
          };

          if (timedOut) {
            reject(new CommandError(`Command timed out: ${command} ${args.join(' ')}`, resultPayload));
            return;
          }

          if (code !== 0 && !allowFailure) {
            reject(new CommandError(`Command failed: ${command} ${args.join(' ')}`, resultPayload));
            return;
          }

          resolve(resultPayload);
        });

        if (typeof input === 'string') {
          child.stdin.write(input);
        }
        child.stdin.end();
      });

      return result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        log(`Retry ${attempt + 1}/${retries} for command: ${command} ${args.join(' ')}`);
        await sleep(retryDelayMs);
      }
    }
  }

  if (allowFailure && lastError?.result) {
    return lastError.result;
  }

  throw lastError;
}

function parseAdbDevices(stdout) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('List of devices attached'));

  return lines.map((line) => {
    const [serial, state = 'unknown'] = line.split(/\s+/);
    return { serial, state };
  });
}

function createSerial(host, port) {
  return `${host}:${port}`;
}

async function ensureTools() {
  await runCommand('docker', ['--version'], { retries: 1, timeoutMs: 10_000 });
  await runCommand('adb', ['version'], { retries: 1, timeoutMs: 10_000 });
}

async function containerExists(containerName) {
  const result = await runCommand(
    'docker',
    ['ps', '-a', '--filter', `name=^${containerName}$`, '--format', '{{.Names}}'],
    { allowFailure: true },
  );

  return result.stdout.split('\n').map((s) => s.trim()).includes(containerName);
}

async function isContainerRunning(containerName) {
  const result = await runCommand(
    'docker',
    ['inspect', '-f', '{{.State.Running}}', containerName],
    { allowFailure: true },
  );
  return result.code === 0 && result.stdout.trim() === 'true';
}

async function waitForContainerRunning(containerName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isContainerRunning(containerName)) {
      return true;
    }
    await sleep(2_000);
  }
  return false;
}

function dockerRunArgs(config) {
  const args = [
    'run',
    '-d',
    '--name',
    config.containerName,
    '--privileged',
    '-p',
    '5554:5554',
    '-p',
    '5555:5555',
    '-p',
    '6080:6080',
  ];

  if (config.image.startsWith('budtmo/')) {
    args.push('-e', 'DEVICE=Samsung Galaxy S10');
    args.push('-e', 'WEB_VNC=true');
  }

  args.push(config.image);
  return args;
}

async function getAdbDevices() {
  const result = await runCommand('adb', ['devices'], { allowFailure: true, timeoutMs: 10_000 });
  return parseAdbDevices(result.stdout);
}

async function connectAdb(config) {
  const serial = createSerial(config.adbHost, config.adbPort);
  await runCommand('adb', ['start-server'], { allowFailure: true, retries: 2, timeoutMs: 10_000 });

  const deadline = Date.now() + config.startupTimeoutMs;
  while (Date.now() < deadline) {
    await runCommand('adb', ['connect', serial], {
      allowFailure: true,
      retries: 1,
      timeoutMs: 15_000,
      retryDelayMs: 2_000,
    });

    const devices = await getAdbDevices();
    const matched = devices.find((d) => d.serial === serial && d.state === 'device');
    if (matched) {
      return matched.serial;
    }

    const emulatorFallback = devices.find(
      (d) => d.state === 'device' && (d.serial.startsWith('emulator-') || d.serial.startsWith('localhost:')),
    );
    if (emulatorFallback) {
      return emulatorFallback.serial;
    }

    await sleep(2_000);
  }

  throw new Error(`ADB device did not become available: ${serial}`);
}

async function waitForBootComplete(serial, bootTimeoutMs) {
  await runCommand('adb', ['-s', serial, 'wait-for-device'], { timeoutMs: 30_000 });

  const deadline = Date.now() + bootTimeoutMs;
  while (Date.now() < deadline) {
    const [bootResult, bootAnimResult] = await Promise.all([
      runCommand('adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
        allowFailure: true,
        timeoutMs: 10_000,
      }),
      runCommand('adb', ['-s', serial, 'shell', 'getprop', 'init.svc.bootanim'], {
        allowFailure: true,
        timeoutMs: 10_000,
      }),
    ]);

    const bootCompleted = bootResult.stdout.trim() === '1';
    const bootAnimStopped = ['stopped', ''].includes(bootAnimResult.stdout.trim());

    if (bootCompleted && bootAnimStopped) {
      await runCommand('adb', ['-s', serial, 'shell', 'pm', 'path', 'android'], {
        retries: 2,
        timeoutMs: 15_000,
      });
      return true;
    }

    await sleep(3_000);
  }

  return false;
}

async function verifyChromeInstalled(serial) {
  const result = await runCommand(
    'adb',
    ['-s', serial, 'shell', 'sh', '-c', 'pm list packages | grep -i chrome'],
    {
      allowFailure: true,
      retries: 2,
      timeoutMs: 15_000,
      retryDelayMs: 2_000,
    },
  );

  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  const found = output.includes('com.android.chrome') || output.includes('chromium');

  return {
    installed: found,
    output: result.stdout || result.stderr,
  };
}

async function configureAdbForwarding(serial) {
  await runCommand('adb', ['-s', serial, 'forward', '--remove-all'], {
    allowFailure: true,
    timeoutMs: 10_000,
  });

  const forwards = [
    ['tcp:15554', 'tcp:5554'],
    ['tcp:15555', 'tcp:5555'],
    ['tcp:16080', 'tcp:6080'],
  ];

  for (const [local, remote] of forwards) {
    await runCommand('adb', ['-s', serial, 'forward', local, remote], {
      allowFailure: true,
      timeoutMs: 10_000,
    });
  }

  return forwards;
}

async function verifyDockerPortMappings(containerName) {
  const required = ['5554/tcp', '5555/tcp', '6080/tcp'];
  const mappings = {};

  for (const port of required) {
    const result = await runCommand('docker', ['port', containerName, port], {
      allowFailure: true,
      timeoutMs: 10_000,
    });

    mappings[port] = result.stdout || null;
  }

  const missing = required.filter((port) => !mappings[port]);
  if (missing.length > 0) {
    throw new Error(`Missing Docker port mappings: ${missing.join(', ')}`);
  }

  return mappings;
}

export async function checkEmulatorStatus(options = {}) {
  const config = mergeOptions(options);
  const serial = createSerial(config.adbHost, config.adbPort);

  const exists = await containerExists(config.containerName);
  const running = exists ? await isContainerRunning(config.containerName) : false;
  const devices = await getAdbDevices();
  const adbDevice = devices.find((d) => d.serial === serial || d.serial.startsWith('emulator-'));

  let bootCompleted = false;
  let chrome = { installed: false, output: '' };

  if (adbDevice?.state === 'device') {
    const bootResult = await runCommand('adb', ['-s', adbDevice.serial, 'shell', 'getprop', 'sys.boot_completed'], {
      allowFailure: true,
      timeoutMs: 10_000,
    });
    bootCompleted = bootResult.stdout.trim() === '1';
    chrome = await verifyChromeInstalled(adbDevice.serial);
  }

  return {
    containerName: config.containerName,
    image: config.image,
    containerExists: exists,
    containerRunning: running,
    adbSerial: adbDevice?.serial || null,
    adbState: adbDevice?.state || null,
    bootCompleted,
    chromeInstalled: chrome.installed,
    chromeCheckOutput: chrome.output,
    devices,
  };
}

export async function startEmulator(options = {}) {
  const config = mergeOptions(options);
  log(`Starting emulator with image: ${config.image}`);

  await ensureTools();

  await runCommand('docker', ['pull', config.image], {
    retries: 3,
    retryDelayMs: 5_000,
    timeoutMs: 10 * 60 * 1000,
  });

  const exists = await containerExists(config.containerName);
  const running = exists ? await isContainerRunning(config.containerName) : false;

  if (exists && !running) {
    await runCommand('docker', ['rm', '-f', config.containerName], {
      allowFailure: true,
      timeoutMs: 30_000,
    });
  }

  if (!running) {
    await runCommand('docker', dockerRunArgs(config), {
      retries: 2,
      retryDelayMs: 3_000,
      timeoutMs: 60_000,
    });
  }

  const runningReady = await waitForContainerRunning(config.containerName, config.startupTimeoutMs);
  if (!runningReady) {
    throw new Error(`Container failed to reach running state: ${config.containerName}`);
  }

  const serial = await connectAdb(config);
  const forwarding = await configureAdbForwarding(serial);
  const dockerPortMappings = await verifyDockerPortMappings(config.containerName);

  const bootReady = await waitForBootComplete(serial, config.bootTimeoutMs);
  if (!bootReady) {
    throw new Error(`Emulator boot timeout for serial ${serial}`);
  }

  const chrome = await verifyChromeInstalled(serial);
  if (!chrome.installed) {
    throw new Error(
      `Chrome package check failed. Expected match from: adb shell pm list packages | grep chrome. Output: ${chrome.output || '(empty)'}`,
    );
  }

  const adbDevicesResult = await runCommand('adb', ['devices'], { timeoutMs: 10_000 });

  return {
    containerName: config.containerName,
    image: config.image,
    serial,
    forwarding,
    dockerPortMappings,
    chromeInstalled: chrome.installed,
    chromeCheckOutput: chrome.output,
    adbDevices: adbDevicesResult.stdout,
  };
}

export async function stopEmulator(options = {}) {
  const config = mergeOptions(options);
  const serial = createSerial(config.adbHost, config.adbPort);

  await runCommand('adb', ['disconnect', serial], {
    allowFailure: true,
    timeoutMs: 10_000,
  });

  const exists = await containerExists(config.containerName);
  if (exists) {
    await runCommand('docker', ['stop', config.containerName], {
      allowFailure: true,
      retries: 1,
      timeoutMs: 30_000,
    });
    await runCommand('docker', ['rm', '-f', config.containerName], {
      allowFailure: true,
      retries: 1,
      timeoutMs: 30_000,
    });
  }

  const adbDevicesResult = await runCommand('adb', ['devices'], { allowFailure: true, timeoutMs: 10_000 });
  return {
    containerName: config.containerName,
    removed: exists,
    adbDevices: adbDevicesResult.stdout,
  };
}

function parseCliArgs(argv) {
  const args = { action: 'start' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--stop') args.action = 'stop';
    if (token === '--status') args.action = 'status';
    if (token === '--start') args.action = 'start';
    if (token === '--image') args.image = argv[i + 1];
    if (token === '--container') args.containerName = argv[i + 1];
    if (token === '--adb-host') args.adbHost = argv[i + 1];
    if (token === '--adb-port') args.adbPort = Number(argv[i + 1]);
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  try {
    if (args.action === 'stop') {
      const result = await stopEmulator(args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (args.action === 'status') {
      const result = await checkEmulatorStatus(args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const result = await startEmulator(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const details = error?.result
      ? {
          message: error.message,
          command: error.result.command,
          args: error.result.args,
          code: error.result.code,
          stdout: error.result.stdout,
          stderr: error.result.stderr,
        }
      : { message: error?.message || String(error) };

    console.error(JSON.stringify({ error: details }, null, 2));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
