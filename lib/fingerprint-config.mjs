import { existsSync, readFileSync } from "fs";

/**
 * Fingerprint config JSON shape (optional):
 * {
 *   "profile": "gmail_safe",
 *   "profiles": {
 *     "custom": {
 *       "canvasNoise": 0.015,
 *       "audioNoise": 0.02,
 *       "webglNoise": 0.015,
 *       "webrtcMode": "replace"
 *     }
 *   },
 *   "overrides": {
 *     "proxyLocale": "en-US",
 *     "proxyTimezone": "America/New_York"
 *   }
 * }
 */

const WEBRTC_MODES = new Set(["replace", "block", "real"]);

const BASE_PROFILES = {
  gmail_safe: {
    name: "gmail_safe",
    canvasNoise: 0.01,
    audioNoise: 0.01,
    webglNoise: 0.01,
    webrtcMode: "replace",
    localeTimezonePolicy: "match_proxy",
  },
  default: {
    name: "default",
    canvasNoiseRange: [0.02, 0.08],
    audioNoiseRange: [0.02, 0.08],
    webglNoiseRange: [0.02, 0.08],
    webrtcMode: "replace",
    localeTimezonePolicy: "match_proxy",
  },
  strict: {
    name: "strict",
    canvasNoise: 0.01,
    audioNoise: 0.01,
    webglNoise: 0.01,
    webrtcMode: "replace",
    localeTimezonePolicy: "match_proxy",
  },
};

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resolveRangeNoise(profile, key, fallback) {
  if (typeof profile[key] === "number") {
    return clamp01(profile[key], fallback);
  }

  const rangeKey = `${key}Range`;
  const range = profile[rangeKey];
  if (Array.isArray(range) && range.length === 2) {
    const low = clamp01(range[0], fallback);
    const high = clamp01(range[1], fallback);
    return clamp01(randomBetween(Math.min(low, high), Math.max(low, high)), fallback);
  }

  return fallback;
}

function parseJsonConfigFile(filePath) {
  if (!filePath) return {};
  if (!existsSync(filePath)) {
    throw new Error(`Fingerprint config file not found: ${filePath}`);
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse fingerprint config file (${filePath}): ${error.message}`);
  }
}

function resolveProfile(profileName, configFileData) {
  const externalProfiles = configFileData?.profiles && typeof configFileData.profiles === "object"
    ? configFileData.profiles
    : {};

  if (externalProfiles[profileName]) {
    return { ...externalProfiles[profileName], name: profileName };
  }

  if (BASE_PROFILES[profileName]) {
    return { ...BASE_PROFILES[profileName] };
  }

  throw new Error(
    `Unknown fingerprint profile: ${profileName}. Available: ${[
      ...Object.keys(BASE_PROFILES),
      ...Object.keys(externalProfiles),
    ].join(", ")}`,
  );
}

function normalizeWebrtcMode(mode, fallback = "replace") {
  const normalized = String(mode || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (!WEBRTC_MODES.has(normalized)) {
    throw new Error(`Invalid WebRTC mode: ${mode}. Allowed: replace, block, real`);
  }
  return normalized;
}

export function validateFingerprintConfig(config) {
  const required = ["name", "canvasNoise", "audioNoise", "webglNoise", "webrtcMode"];
  for (const key of required) {
    if (!(key in config)) {
      throw new Error(`Invalid fingerprint config: missing ${key}`);
    }
  }

  const noiseKeys = ["canvasNoise", "audioNoise", "webglNoise"];
  for (const key of noiseKeys) {
    const value = Number(config[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Invalid fingerprint config: ${key} must be between 0.0 and 1.0`);
    }
  }

  if (!WEBRTC_MODES.has(config.webrtcMode)) {
    throw new Error(`Invalid fingerprint config: webrtcMode must be replace, block, or real`);
  }

  return config;
}

export function loadFingerprintConfig({
  defaultProfile = "gmail_safe",
  env = process.env,
  configFilePath,
} = {}) {
  const filePath = configFilePath || env.FINGERPRINT_CONFIG_FILE || "";
  const fileData = parseJsonConfigFile(filePath);

  const profileName =
    env.FINGERPRINT_PROFILE ||
    fileData.profile ||
    defaultProfile;

  const profile = resolveProfile(profileName, fileData);
  const merged = {
    ...profile,
    ...(fileData.overrides && typeof fileData.overrides === "object" ? fileData.overrides : {}),
  };

  const resolved = {
    name: profileName,
    canvasNoise: resolveRangeNoise(merged, "canvasNoise", 0.01),
    audioNoise: resolveRangeNoise(merged, "audioNoise", 0.01),
    webglNoise: resolveRangeNoise(merged, "webglNoise", 0.01),
    webrtcMode: normalizeWebrtcMode(merged.webrtcMode, "replace"),
    localeTimezonePolicy: merged.localeTimezonePolicy || "match_proxy",
    proxyLocale: merged.proxyLocale || "",
    proxyTimezone: merged.proxyTimezone || "",
  };

  if (env.FINGERPRINT_CANVAS) resolved.canvasNoise = clamp01(env.FINGERPRINT_CANVAS, resolved.canvasNoise);
  if (env.FINGERPRINT_AUDIO) resolved.audioNoise = clamp01(env.FINGERPRINT_AUDIO, resolved.audioNoise);
  if (env.FINGERPRINT_WEBGL) resolved.webglNoise = clamp01(env.FINGERPRINT_WEBGL, resolved.webglNoise);
  if (env.FINGERPRINT_WEBRTC) resolved.webrtcMode = normalizeWebrtcMode(env.FINGERPRINT_WEBRTC, resolved.webrtcMode);
  if (env.PROXY_LOCALE) resolved.proxyLocale = env.PROXY_LOCALE;
  if (env.PROXY_TIMEZONE) resolved.proxyTimezone = env.PROXY_TIMEZONE;

  return validateFingerprintConfig(resolved);
}

export function applyFingerprintToLaunchArgs(existingArgs = [], fingerprintConfig) {
  const args = new Set(existingArgs);
  if (fingerprintConfig.webrtcMode === "replace") {
    args.add("--disable-features=WebRtcHideLocalIpsWithMdns");
    args.add("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
    args.add("--enforce-webrtc-ip-permission-check");
  }
  if (fingerprintConfig.webrtcMode === "block") {
    args.add("--disable-webrtc");
  }

  if (fingerprintConfig.proxyLocale) {
    args.add(`--lang=${fingerprintConfig.proxyLocale}`);
  }

  return [...args];
}

export function resolveFingerprintLocaleTimezone({
  fingerprintConfig,
  locales,
  timezones,
  randomPick,
}) {
  const localePool = Array.isArray(locales) && locales.length > 0 ? locales : ["en-US"];
  const timezonePool = Array.isArray(timezones) && timezones.length > 0 ? timezones : ["America/New_York"];

  if (fingerprintConfig.localeTimezonePolicy === "match_proxy") {
    return {
      locale: fingerprintConfig.proxyLocale || randomPick(localePool),
      timezone: fingerprintConfig.proxyTimezone || randomPick(timezonePool),
    };
  }

  return {
    locale: randomPick(localePool),
    timezone: randomPick(timezonePool),
  };
}

export function toFingerprintRuntimeConfig(fingerprintConfig) {
  return {
    canvasNoise: fingerprintConfig.canvasNoise,
    audioNoise: fingerprintConfig.audioNoise,
    webglNoise: fingerprintConfig.webglNoise,
    webrtcMode: fingerprintConfig.webrtcMode,
  };
}

export const FINGERPRINT_PROFILES = Object.freeze(BASE_PROFILES);
