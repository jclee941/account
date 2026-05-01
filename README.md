# Account Automation Workspace

Node.js ESM workspace for automated Gmail account creation, Antigravity IDE authentication, and OAuth credential management. Uses Playwright/Rebrowser for browser automation and 5sim for SMS verification.

## Features

- **Gmail Account Creation** — Batch creation with SMS verification via 5sim
- **ADB/Android Automation** — Android Chrome automation via ADB
- **CDP Mode** — Chrome DevTools Protocol for WebView automation
- **Appium Support** — Docker Android emulator integration
- **Antigravity Auth** — OAuth + SMS verification pipeline for Antigravity IDE
- **MCP Server** — Tool-based account creation via Model Context Protocol
- **Family Group** — Gmail family invitation/acceptance workflow

## Requirements

- Node.js 18+
- npm
- Playwright dependencies (installed via `npm install`)
- Optional: ADB for Android automation
- Optional: Docker for Appium emulator

## Installation

```bash
npm install
npx playwright install
```

## Quick Start

### Gmail Account Creation

```bash
# Dry run (no real accounts created)
node account/create-accounts.mjs --dry-run --start 1 --end 3

# Production run with 5sim API key
node account/create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### ADB/Android Mode

```bash
node account/create-accounts-adb.mjs --dry-run --count 1
node account/create-accounts-adb.mjs --count 1 --api-key "$FIVESIM_API_KEY" --region indonesia
```

### Age Verification

```bash
node account/verify-age.mjs --dry-run --start 1 --end 5
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### MCP Server

```bash
node account/gmail-creator-mcp.mjs
```

## Project Structure

```
./
├── account/                       # Gmail account automation
│   ├── create-accounts.mjs        # Primary account creation flow
│   ├── create-accounts-adb.mjs    # ADB + Android Chrome automation
│   ├── create-accounts-cdp.mjs    # CDP mode via WebView on ReDroid
│   ├── create-accounts-appium.mjs # Appium + Docker Android emulator
│   ├── family-group.mjs           # Family invite/accept flow
│   ├── gmail-creator-mcp.mjs      # MCP server (4 tools)
│   └── verify-age.mjs             # Age verification via 5sim SMS
├── antigravity/                   # Antigravity IDE auth & verification
│   ├── antigravity-auth.mjs       # OAuth + SMS verification pipeline
│   ├── antigravity-pipeline.mjs   # End-to-end activation orchestrator
│   ├── inject-vscdb-token.mjs     # VSCDB protobuf token injection
│   ├── manual-token-acquire.mjs   # Manual-assisted OAuth token acquisition
│   └── unlock-features.mjs        # 5sim SMS feature unlock
├── oauth/                         # OAuth credential flows
│   ├── oauth-login.mjs            # OAuth consent/login helper
│   └── setup-gcp-oauth.mjs        # GCP OAuth credential setup
├── lib/                           # Shared utilities
│   ├── oauth-callback-server.mjs  # localhost OAuth callback server
│   ├── token-exchange.mjs         # OAuth code→token exchange
│   ├── google-auth-browser.mjs    # Google auth browser automation
│   ├── browser-launch.mjs         # Browser launch helpers
│   ├── cli-args.mjs               # CLI argument parser
│   ├── adb-utils.mjs              # ADB command wrappers
│   ├── sms-provider.mjs           # Modular SMS provider (5sim/sms-activate)
│   ├── verification-pipeline.mjs  # 3-stage account verification
│   ├── behavior-profile.mjs       # Human-like typing/mouse simulation
│   └── cdp-utils.mjs              # Chrome DevTools Protocol utilities
├── tests/                         # MCP server smoke + QA tests
│   ├── gmail-creator-mcp-smoke.mjs
│   └── qa-manual.mjs
├── accounts.csv                   # Generated account state
├── gcp-oauth.keys.json            # Local OAuth keys artifact (runtime output)
└── package.json                   # Dependencies
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIVESIM_API_KEY` | Yes (unless `--dry-run`) | — | 5sim SMS verification API key |
| `SMS_PROVIDER` | No | `5sim` | SMS provider selection |
| `FIVESIM_REGION` | No | `russia` | 5sim phone number region |
| `PROXY_SERVER` | No | — | HTTP proxy address for browser |
| `PROXY_USER` | No | — | Proxy authentication username |
| `PROXY_PASS` | No | — | Proxy authentication password |
| `SMS_API_KEY` | No | — | Alternative SMS API key |
| `GMAIL_OAUTH_CLIENT_ID` | No | — | Google OAuth Client ID |
| `GMAIL_OAUTH_CLIENT_SECRET` | No | — | Google OAuth Client Secret |
| `GMAIL_OAUTH_REDIRECT_URI` | No | `http://localhost:3000/oauth2callback` | OAuth redirect URI |

## Commands

```bash
# Primary account creation
node account/create-accounts.mjs --dry-run --start 1 --end 3
node account/create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# ADB/Android account creation
node account/create-accounts-adb.mjs --dry-run --count 1
node account/create-accounts-adb.mjs --count 1 --api-key "$FIVESIM_API_KEY" --region indonesia

# CDP mode
node account/create-accounts.mjs --cdp --start 1 --end 1 --api-key "$FIVESIM_API_KEY"

# Appium
node account/create-accounts-appium.mjs --dry-run --count 3
node account/create-accounts-appium.mjs --count 1 --api-key "$FIVESIM_API_KEY"

# Age verification
node account/verify-age.mjs --dry-run --start 1 --end 5
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# MCP server
node account/gmail-creator-mcp.mjs

# MCP tests
node tests/gmail-creator-mcp-smoke.mjs
node tests/qa-manual.mjs

# Family & OAuth
node account/family-group.mjs --dry-run --start 1 --end 3
node oauth/oauth-login.mjs --help
node oauth/setup-gcp-oauth.mjs --headed

# Antigravity
node antigravity/antigravity-auth.mjs --batch qws94301@gmail.com --api-key "$FIVESIM_API_KEY"
ode antigravity/unlock-features.mjs qws94301@gmail.com --api-key "$FIVESIM_API_KEY"

# Antigravity pipeline
node antigravity/antigravity-pipeline.mjs --dry-run --accounts qws94201@gmail.com
node antigravity/antigravity-pipeline.mjs --from-csv --accounts qws94201@gmail.com --region indonesia
```

## Notes

- Scripts are ESM (`.mjs`).
- Use `--dry-run` to preview operations without creating real accounts.
- Headed browser mode requires an X server; use `xvfb-run` on headless Linux.
- Never commit real secrets; use environment variables or `.env` files (gitignored).
- MCP server uses `@modelcontextprotocol/sdk` with stdio transport. All logging must go to `stderr`, never `stdout`.
- Account pattern: `qws943XX@gmail.com` (XX = 01–50).

## License

Private — internal use only.
