# Gmail Account Creator — Quick Start

## Status: Ready to Run (Pending API Key)

ReDroid is **blocked** (kernel lacks binder/ashmem modules).  
Using **CDP Mode** with real Chrome instead — better anti-detection, no Docker needed.

---

## What's Been Set Up

✅ **Analyzed codebase** — identified working approach (CDP mode, no ReDroid)  
✅ **Chrome confirmed** — `/usr/bin/google-chrome-stable` installed  
✅ **Scripts created**:
- `setup-credentials.sh` — Interactive credential setup
- `create-gmail.sh` — Quick launcher for account creation
- `setup-1password-service-account.sh` — 1Password automation setup
- `.env.gmail.example` — Template for credentials

---

## What You Need

**Required:** 5sim API Key  
**Optional:** IPRoyal proxy credentials (recommended for better success rate)

---

## How to Get the 5sim API Key

### Option 1: From 1Password (Recommended)

The key is stored at: `op://homelab/5sim API Key/credential`

Since 1Password CLI requires interactive sign-in, you have two paths:

**Path A: Manual retrieval**
1. Open 1Password browser extension or app
2. Go to "homelab" vault
3. Find "5sim API Key" item
4. Copy the credential value

**Path B: Set up Service Account (one-time)**
```bash
# Run this to configure 1Password for automation
./setup-1password-service-account.sh
```

Then use:
```bash
# Load 1Password service account token
source .env.1password

# Method A: Use op run directly (recommended)
op run --env-file=.env.5sim -- xvfb-run node account/create-accounts.mjs --cdp --dry-run --start 1 --end 1 --region russia

# Method B: Create .env.gmail from 1Password values first
op run --env-file=.env.5sim --env-file=.env.gmail -- sh -c 'echo "FIVESIM_API_KEY=$FIVESIM_API_KEY" > .env.gmail'
source .env.gmail
./create-gmail.sh --dry-run
```

### Option 2: Direct from 5sim.net

1. Go to https://5sim.net/settings
2. Copy your API key
3. Continue to "Run the Automation" below

---

## Run the Automation

### Step 1: Set Credentials

**Quick method** (replace with your actual key):
```bash
export FIVESIM_API_KEY="eyJhbGciOiJSUzUxMiIs..."  # Your 5sim API key
```

**Secure method** (creates .env.gmail file):
```bash
./setup-credentials.sh
# Follow prompts to enter API key and optional proxy credentials
```

### Step 2: Test with Dry-Run

```bash
# If using environment variable directly:
xvfb-run node account/create-accounts.mjs --cdp --dry-run --start 1 --end 1 --region russia

# If using .env.gmail file:
source .env.gmail
./create-gmail.sh --dry-run
```

Expected output:
```
═══════════════════════════════════════════════════════
  Google Account Creator — qws943xx (Stealth Edition)
═══════════════════════════════════════════════════════
  Mode:     DRY RUN
  Stealth:  rebrowser-playwright + ghost-cursor
  SMS:      provider=5sim region=russia
═══════════════════════════════════════════════════════

📋 Preview (dry run):
Username       | Email                    | First      | Last
───────────────|──────────────────────────|────────────|────────
qws94301       | qws94301@gmail.com       | Nathan     | Williams

 Total: 1 accounts
```

### Step 3: Create Real Account

```bash
# Single account
./create-gmail.sh --start 1 --end 1

# Multiple accounts (1-5)
./create-gmail.sh --start 1 --end 5

# With IPRoyal proxy
source .env.gmail
./create-gmail.sh --start 1 --end 1
```

---

## Full Command Reference

```bash
# Dry run (no API calls, just preview)
xvfb-run node account/create-accounts.mjs --cdp --dry-run --start 1 --end 1 --region russia

# Create with explicit API key
FIVESIM_API_KEY="your-key" xvfb-run node account/create-accounts.mjs --cdp --start 1 --end 1 --region russia

# Create with proxy
xvfb-run node account/create-accounts.mjs --cdp --start 1 --end 1 \
  --region russia \
  --proxy "http://geo.iproyal.com:12321" \
  --proxy-user "your-user" \
  --proxy-pass "your-pass"

# Available regions: russia, indonesia, usa, england, korea, etc.
```

---

## Troubleshooting

### "Missing SMS API key for provider '5sim'"
**Cause:** `FIVESIM_API_KEY` environment variable not set  
**Fix:** Export the key or run `./setup-credentials.sh`

### "1Password CLI requires interactive sign-in"
**Cause:** 1Password needs TTY for authentication  
**Fix:** 
- Option 1: Retrieve key manually from 1Password app/browser
- Option 2: Set up service account with `./setup-1password-service-account.sh`

### "Chrome not found"
**Cause:** Chrome executable not at expected path  
**Fix:** `which google-chrome-stable` and update path in scripts if needed

### "Display not found" (headless issues)
**Fix:** Always use `xvfb-run` prefix for headless operation:
```bash
xvfb-run node account/create-accounts.mjs ...
```

---

## Files Created

| File | Purpose |
|------|---------|
| `setup-credentials.sh` | Interactive credential setup wizard |
| `create-gmail.sh` | Quick launcher script with preset configs |
| `setup-1password-service-account.sh` | 1Password automation setup |
| `.env.gmail.example` | Credential template |
| `.env.gmail` | Your actual credentials (created by setup, gitignored) |
| `.env.1password` | 1Password service account token (created by setup) |

---

## Next Steps

1. **Get your 5sim API key** (from 1Password or 5sim.net)
2. **Run dry-run test** to validate setup
3. **Create your first account** with `--start 1 --end 1`
4. **Scale up** to batch creation with proxy for better success rates

---

## Technical Details

- **Mode:** CDP (Chrome DevTools Protocol) — uses real Chrome process
- **Anti-detection:** rebrowser-playwright + ghost-cursor + human-like delays
- **Proxy support:** IPRoyal residential with sticky sessions
- **SMS verification:** 5sim.net API
- **No Docker/ReDroid required** — runs directly on host

Account pattern: `qws943XX@gmail.com` (XX = 01-50)  
Password: `bingogo1` (configurable in scripts)
