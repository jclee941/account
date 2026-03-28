# Alternative SMS Provider Setup Guide

For Gmail Account Creation (when 5sim API key is unavailable)

## Built-in: SMS-Activate (No Code Changes Needed)

The codebase **already supports SMS-Activate** as an alternative to 5sim via the `--sms-provider` flag.

```bash
# Set API key and run
export SMS_ACTIVATE_API_KEY="your-sms-activate-api-key"
./create-gmail.sh --start 1 --end 1

# Or pass inline:
SMS_PROVIDER=sms-activate SMS_ACTIVATE_API_KEY="your-key" \
  xvfb-run node account/create-accounts.mjs --cdp --start 1 --end 1 --region russia
```

### Get an SMS-Activate API Key
1. Register at https://sms-activate.org
2. Deposit funds (~$1 minimum, crypto/cards accepted)
3. Go to profile → API → copy your API key

---

## Alternative: PVAPins (Third-Party, Requires Code Changes)

### Setup
1. Go to https://pvapins.com
2. Register with email
3. Deposit funds ($1-5 minimum, crypto/Binance Pay/Skrill accepted)
4. Copy API key from dashboard

### Usage

PVAPins is **not built into** `create-accounts.mjs` — it requires adding a custom provider.

```bash
export PVAPINS_API_KEY="your-api-key-here"
# Requires code changes to create-accounts.mjs (see Code Extension section below)
```

---

## Alternative: SMSCode.gg (Developer-Friendly)

### Setup
1. Register at https://smscode.gg
2. Deposit funds (crypto/cards accepted)
3. Get API key from dashboard

### API Endpoint
```javascript
// SMSCode.gg API for Gmail
const response = await fetch(
  'https://api.smscode.gg/api/getNumber?service=go&country=ID&apiKey=YOUR_KEY'
);
```

---

## Alternative: HeroSMS (Lowest Cost)

### Setup
1. Register at https://hero-sms.com
2. Prices from $0.01
3. Get API key from dashboard

---

## Code Extension (For Non-Built-In Providers)

The script supports `5sim` and `sms-activate` out of the box. To add PVAPins or other providers, add a provider implementation to `account/create-accounts.mjs`:

```javascript
// PVAPins provider example
async function getPVAPinsNumber(apiKey, country = 'ID') {
  const response = await fetch(
    `https://api.pvapins.com/user/api/order_number.php?app_id=GMAIL&country_id=${country}&api_key=${apiKey}`
  );
  const data = await response.json();
  return {
    id: data.order_id,
    number: data.number,
    country: country
  };
}

async function getPVAPinsSMS(apiKey, orderId) {
  const response = await fetch(
    `https://api.pvapins.com/user/api/get_sms.php?order_id=${orderId}&api_key=${apiKey}`
  );
  const data = await response.json();
  return data.sms;  // Returns SMS code or "WAIT" or "CANCEL"
}
```

---

## Using 5sim Directly (If You Retrieve Key)

```bash
# After signing into 1Password manually
op signin
export FIVESIM_API_KEY=$(op item get "5sim API Key" --vault homelab --fields credential)
node account/create-accounts.mjs --cdp --start 1 --end 1 --region russia
```

---

## Cost Comparison

| Provider | Gmail Verification Cost | Countries | Success Rate | Built-In |
|----------|------------------------|-----------|--------------|----------|
| 5sim | ~$0.05 | 180+ | High | ✅ Yes |
| SMS-Activate | ~$0.05-$0.15 | 180+ | High | ✅ Yes |
| PVAPins | ~$0.10-$0.80 | 200+ | High | ❌ No |
| SMSCode.gg | ~$0.20-$1 | 100+ | High | ❌ No |
| HeroSMS | ~$0.01 | 180+ | Medium-High | ❌ No |

---

## Recommended Path

1. **Fastest** — Use SMS-Activate (built-in, no code changes)
2. **Cheapest** — Retrieve 5sim key from 1Password manually
3. **Last resort** — Add PVAPins provider code
