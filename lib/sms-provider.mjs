import { randomInt } from './cdp-utils.mjs';

/**
 * Modular SMS Provider Library
 * Supports 5sim.net and sms-activate.org for phone verification
 * 
 * Usage:
 *   import { createSmsProvider } from './lib/sms-provider.mjs';
 *   const provider = createSmsProvider('5sim', apiKey, 'russia');
 *   const order = await provider.buyNumber();
 *   const sms = await provider.waitForSms(order.id);
 */


// ---------------------------------------------------------------------------
// 5sim.net implementation
// ---------------------------------------------------------------------------

const FIVESIM_BASE = "https://5sim.net/v1";

async function fiveSimRequest(path, apiKey) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${FIVESIM_BASE}${path}`, {
    method: "GET",
    headers,
  });

  const rawText = await response.text();
  let body = {};
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { message: rawText };
  }

  if (!response.ok) {
    let message = body?.message || rawText || `5sim HTTP ${response.status}`;
    if (response.status === 401) {
      message = "5sim: Unauthorized — verify your API key has Bearer token auth";
    }
    throw new Error(`${message}`.slice(0, 200));
  }

  return body;
}

function extractOrderCost(order) {
  const raw = order?.price ?? order?.cost ?? order?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fiveSimCreate(provider, apiKey, region, getOperator) {
  return {
    name: "5sim",
    region,

    async buyNumber(service = "google") {
      const operator = getOperator
        ? getOperator()
        : await provider._getBestOperator(apiKey, region, service);
      const body = await fiveSimRequest(
        `/user/buy/activation/${encodeURIComponent(region)}/${encodeURIComponent(operator)}/${encodeURIComponent(service)}`,
        apiKey
      );
      return {
        id: body?.id,
        phone: body?.phone,
        cost: extractOrderCost(body),
        raw: body,
      };
    },

    async checkSms(id) {
      const body = await fiveSimRequest(`/user/check/${encodeURIComponent(id)}`, apiKey);
      // Normalize 5sim response to common interface
      if (!body?.sms?.length) return null;
      const first = body.sms[0];
      const code = String(first?.code || first?.text || "").match(/\d{4,8}/)?.[0] || "";
      return {
        status: code ? "received" : "waiting",
        code,
        raw: body,
      };
    },

    async finishNumber(id) {
      return fiveSimRequest(`/user/finish/${encodeURIComponent(id)}`, apiKey);
    },

    async cancelNumber(id) {
      return fiveSimRequest(`/user/cancel/${encodeURIComponent(id)}`, apiKey);
    },

    async getBalance() {
      const body = await fiveSimRequest("/user/profile", apiKey);
      const balance = Number(body?.balance);
      return Number.isFinite(balance) ? balance : 0;
    },

    // Internal: select best operator by rate
    async _getBestOperator(apiKey, region, service = "google") {
      const body = await fiveSimRequest(
        `/guest/prices?country=${encodeURIComponent(region)}&product=${encodeURIComponent(service)}`,
        apiKey
      );
      const operatorMap = body?.[service]?.[region] || body?.[region]?.[service];
      if (!operatorMap || typeof operatorMap !== "object") {
        throw new Error(`5sim: No operators for region=${region} service=${service}`);
      }
      const sorted = Object.entries(operatorMap)
        .filter(([, info]) => (info?.count || 0) > 0)
        .sort(([, a], [, b]) => Number(b?.rate || 0) - Number(a?.rate || 0));
      if (!sorted.length) throw new Error(`5sim: No operators with stock for ${region}/${service}`);
      return sorted[0][0];
    },
  };
}

// ---------------------------------------------------------------------------
// sms-activate.org implementation
// ---------------------------------------------------------------------------

const SMSACTIVATE_BASE = "https://api.sms-activate.org/stubs/handler_api.php";

const SMSACTIVATE_COUNTRY_CODES = {
  russia: "0",
  ukraine: "1",
  kazakhstan: "2",
  china: "3",
  philippines: "4",
  malaysia: "7",
  indonesia: "6",
  india: "22",
  usa: "12",
  england: "16",
  korea: "19",
  kenya: "36",
};

async function smsActivateRequest(apiKey, action, params = {}) {
  const url = new URL(SMSACTIVATE_BASE);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("action", action);
  url.searchParams.set("json", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const resp = await fetch(url.toString());
  const text = (await resp.text()).trim();

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const statusText = typeof parsed === "string"
    ? parsed
    : parsed?.message || parsed?.error || parsed?.status || text;

  if (String(statusText).startsWith("BAD_KEY")) throw new Error("sms-activate: Invalid API key");
  if (String(statusText).startsWith("NO_NUMBERS")) throw new Error("sms-activate: No numbers available");
  if (String(statusText).startsWith("NO_BALANCE")) throw new Error("sms-activate: Insufficient balance");
  if (String(statusText).startsWith("BAD_ACTION")) throw new Error(`sms-activate: Bad action '${action}'`);
  if (String(statusText).startsWith("BAD_SERVICE")) throw new Error("sms-activate: Bad service code");
  if (String(statusText).startsWith("ERROR_SQL")) throw new Error("sms-activate: Server SQL error");

  return parsed ?? text;
}

function smsActivateCreate(provider, apiKey, region) {
  return {
    name: "sms-activate",
    region,

    async buyNumber(service = "google") {
      // sms-activate uses "go" for Google
      const svc = service === "google" ? "go" : service;
      const countryCode = SMSACTIVATE_COUNTRY_CODES[region] ?? SMSACTIVATE_COUNTRY_CODES.russia;
      const body = await smsActivateRequest(apiKey, "getNumber", { service: svc, country: countryCode });

      let id = "";
      let phone = "";

      if (typeof body === "string") {
        const match = body.match(/^ACCESS_NUMBER:(\d+):(\d+)$/);
        if (match) {
          id = match[1];
          phone = match[2];
        }
      } else if (body && typeof body === "object") {
        id = String(body?.activation || body?.id || "");
        phone = String(body?.phone || body?.number || "").replace(/\D/g, "");
      }

      if (!id || !phone) {
        const preview = typeof body === "string" ? body : JSON.stringify(body || {}).slice(0, 100);
        throw new Error(`sms-activate: Unexpected getNumber response: ${preview}`);
      }

      return { id, phone, cost: 0, raw: body };
    },

    async checkSms(id) {
      const body = await smsActivateRequest(apiKey, "getStatus", { id });

      if (typeof body === "string") {
        if (body === "STATUS_WAIT_CODE") return { status: "waiting", code: null, raw: body };
        const codeMatch = body.match(/^STATUS_OK:(\d+)$/);
        if (codeMatch) return { status: "received", code: codeMatch[1], raw: body };
        if (body === "STATUS_CANCEL") return { status: "cancelled", code: null, raw: body };
        return { status: "unknown", code: null, raw: body };
      }

      const status = String(body?.status || "").toUpperCase();
      if (status === "STATUS_WAIT_CODE" || status === "WAIT_CODE") {
        return { status: "waiting", code: null, raw: body };
      }
      const code = String(body?.code || body?.sms || "").trim();
      if (code) return { status: "received", code, raw: body };
      if (status === "STATUS_CANCEL" || status === "CANCEL") {
        return { status: "cancelled", code: null, raw: body };
      }
      return { status: "unknown", code: null, raw: body };
    },

    async finishNumber(id) {
      return smsActivateRequest(apiKey, "setStatus", { id, status: "6" });
    },

    async cancelNumber(id) {
      return smsActivateRequest(apiKey, "setStatus", { id, status: "8" });
    },

    async getBalance() {
      const body = await smsActivateRequest(apiKey, "getBalance", {});
      if (typeof body === "string") {
        const match = body.match(/^ACCESS_BALANCE:([\d.]+)$/);
        if (!match) throw new Error(`sms-activate: Unexpected balance response: ${body.slice(0, 100)}`);
        return parseFloat(match[1]);
      }
      const value = Number(body?.balance);
      if (!Number.isFinite(value)) {
        throw new Error(`sms-activate: Unexpected balance response: ${JSON.stringify(body || {}).slice(0, 100)}`);
      }
      return value;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared polling helper
// ---------------------------------------------------------------------------

/**
 * Poll checkSms until SMS arrives or timeout (~2 minutes).
 * On timeout, automatically cancels the order and returns null.
 * Polls every 5-10 seconds (randomized).
 *
 * @param {object} provider - Provider instance from createSmsProvider
 * @param {string} orderId - Order ID from buyNumber
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=120000] - Max wait time in ms
 * @param {number} [opts.pollIntervalMs=7000] - Base poll interval
 * @param {Function} [opts.onPoll] - Called each poll cycle with status
 * @returns {Promise<{status, code, raw}|null>} SMS result or null on timeout/cancel
 */
async function waitForSms(provider, orderId, opts = {}) {
  const {
    timeoutMs = 120000,
    pollIntervalMs = 7000,
    onPoll = null,
  } = opts;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Check if already cancelled/timed out
    const result = await provider.checkSms(orderId);

    if (onPoll) onPoll(result);

    if (!result) {
      // No response yet — keep polling
    } else if (result.status === "received" && result.code) {
      return result; // Got the SMS code
    } else if (result.status === "cancelled" || result.status === "timeout") {
      return null; // Order was cancelled externally
    }

    // Wait before next poll (5-10s randomized)
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const jitter = randomInt(-2000, 2000);
    const wait = Math.min(pollIntervalMs + jitter, remaining);
    await new Promise((r) => setTimeout(r, Math.max(wait, 3000)));
  }

  // Timeout reached — auto-cancel and return null
  try {
    await provider.cancelNumber(orderId);
  } catch {
    // Ignore cancel errors
  }

  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an SMS provider instance.
 *
 * @param {string} providerName - '5sim' or 'sms-activate'
 * @param {string} apiKey - Provider API key
 * @param {string} region - Country/region identifier
 * @param {object} [opts]
 * @param {Function} [opts.getOperator] - (5sim only) Custom operator selector
 * @returns {object} Provider interface
 */
function createSmsProvider(providerName, apiKey, region, opts = {}) {
  const normalized = String(providerName || "").toLowerCase().trim();

  // Internal state holder (used for operator caching, etc.)
  const state = {};

  if (normalized === "sms-activate" || normalized === "smsactivate") {
    return smsActivateCreate(state, apiKey, region);
  }

  if (normalized === "5sim" || normalized === "5simnet") {
    const fiveSim = fiveSimCreate(state, apiKey, region, opts.getOperator || null);

    // Wrap buyNumber to support optional operator override
    const originalBuy = fiveSim.buyNumber.bind(fiveSim);
    fiveSim.buyNumber = async (service = "google") => {
      return originalBuy(service);
    };

    // Attach waitForSms as a method on the provider instance
    fiveSim.waitForSms = (orderId, pollOpts) =>
      waitForSms(fiveSim, orderId, pollOpts);

    return fiveSim;
  }

  throw new Error(`createSmsProvider: Unknown provider '${providerName}'. Use '5sim' or 'sms-activate'.`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { createSmsProvider, waitForSms };
export default { createSmsProvider, waitForSms };
