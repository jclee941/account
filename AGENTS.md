# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-17
**Commit:** 385c267
**Branch:** main

## OVERVIEW

Gmail automation workspace. Node.js ESM using Playwright/Rebrowser + 5sim for account creation. Scripts organized by purpose: `account/` (Gmail creation), `antigravity/` (Antigravity auth/SMS), `oauth/` (OAuth credential flows). Includes an MCP server (`account/gmail-creator-mcp.mjs`) for tool-based account creation via mcphub.

## STRUCTURE

```text
./
├── account/                       # Gmail account automation
│   ├── create-accounts.mjs        # primary account creation flow (2,650L)
│   ├── family-group.mjs           # invite/accept family flow (496L)
│   ├── gmail-creator-mcp.mjs      # MCP server: 4 tools for account automation (681L)
│   └── verify-age.mjs             # age verification via 5sim SMS (814L)
├── antigravity/                   # Antigravity IDE auth & verification
│   ├── antigravity-auth.mjs       # Antigravity OAuth + SMS verification pipeline (710L)
│   ├── antigravity-pipeline.mjs   # End-to-end account activation orchestrator (448L)
│   ├── inject-vscdb-token.mjs     # VSCDB protobuf token injection (467L)
│   ├── manual-token-acquire.mjs   # Manual-assisted OAuth token acquisition (286L)
│   └── unlock-features.mjs        # 5sim SMS feature unlock for Antigravity (757L)
├── oauth/                         # OAuth credential flows
│   ├── oauth-login.mjs            # OAuth consent/login helper (219L)
│   └── setup-gcp-oauth.mjs        # GCP OAuth credential setup automation (208L)
├── lib/                           # shared utilities
│   ├── oauth-callback-server.mjs  # localhost OAuth callback server (176L)
│   ├── token-exchange.mjs         # OAuth code→token exchange (29L)
│   ├── google-auth-browser.mjs    # Google auth browser automation (129L)
│   ├── browser-launch.mjs         # browser launch helpers (842B)
│   └── cli-args.mjs               # CLI argument parser (949B)
├── bin/
│   └── xdg-open                   # URL interceptor for OAuth callback capture
├── tests/                         # MCP server smoke + manual QA tests
│   ├── gmail-creator-mcp-smoke.mjs  # 29-assertion smoke test suite
│   └── qa-manual.mjs                # 6-test manual QA validation
├── accounts.csv                   # generated account state (input/output)
├── gcp-oauth.keys.json            # local OAuth keys artifact (runtime output)
└── package.json                   # root dependencies
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Create Gmail accounts (current) | `account/create-accounts.mjs` | Requires 5sim key unless `--dry-run` |
| MCP server (tool-based creation) | `account/gmail-creator-mcp.mjs` | 4 tools: create_accounts, get_creation_job, list_accounts, get_account_status |
| MCP server tests | `tests/` | Smoke (29 assertions) + manual QA (6 tests) |
| Family invitation workflow | `account/family-group.mjs` | Reads `accounts.csv`, writes `family-results.csv` |
| OAuth consent run | `oauth/oauth-login.mjs` | `--help`, `--headed` supported |
| Create GCP OAuth credentials | `oauth/setup-gcp-oauth.mjs` | Manual login fallback in headed mode |
| Antigravity OAuth + SMS | `antigravity/antigravity-auth.mjs` | Combined OAuth token acquisition + SMS verification |
| Antigravity feature unlock | `antigravity/unlock-features.mjs` | 5sim SMS verification for Antigravity accounts |
| Antigravity end-to-end pipeline | `antigravity/antigravity-pipeline.mjs` | Token validate → acquire → VSCDB inject → launch → verify |
| VSCDB token injection | `antigravity/inject-vscdb-token.mjs` | Protobuf encode + SQLite write to state.vscdb |
| Manual token acquisition | `antigravity/manual-token-acquire.mjs` | OAuth URL + callback server for VNC manual login |
| OAuth callback server | `lib/oauth-callback-server.mjs` | localhost:51121 callback for manual OAuth |
| URL interceptor | `bin/xdg-open` | Captures OAuth URLs from Antigravity app |
| Age verification via SMS | `account/verify-age.mjs` | 5sim SMS, Korean-first phone verification, batch CLI |

## CODE MAP

| Symbol / Control Point | Type | Location | Role |
|------------------------|------|----------|------|
| `main` | function | `account/create-accounts.mjs` | orchestrates batch creation + retries + cost summary |
| `createAccountWithRetries` | function | `account/create-accounts.mjs` | controls account-level retry/failure policy |
| `GmailCreatorServer` | class | `account/gmail-creator-mcp.mjs` | MCP server: tool registration, CSV parsing, job management |
| `parseAccountsCsv` | method | `account/gmail-creator-mcp.mjs` | multiline-tolerant CSV parser (ISO timestamp boundary detection) |
| `handleCreateAccounts` | method | `account/gmail-creator-mcp.mjs` | spawns background `create-accounts.mjs` process, returns job ID |
| `handleGetCreationJob` | method | `account/gmail-creator-mcp.mjs` | checks job status via PID liveness + log tailing |
| `main` | function | `account/family-group.mjs` | runs invite phase then accept phase |
| `inviteMember` | function | `account/family-group.mjs` | parent-side invite interaction |
| `acceptInvitation` | function | `account/family-group.mjs` | child-side acceptance interaction |
| `main` | function | `oauth/oauth-login.mjs` | OAuth consent/login automation entry |
| `main` | function | `oauth/setup-gcp-oauth.mjs` | cloud console OAuth credential flow |
| `main` | function | `antigravity/antigravity-pipeline.mjs` | end-to-end pipeline: validate → acquire → inject → launch |
| `validateRefreshToken` | function | `antigravity/antigravity-pipeline.mjs` | tests refresh token against Google OAuth2 endpoint |
| `encodeOAuthTokenInfo` | function | `antigravity/inject-vscdb-token.mjs` | manual protobuf encoding of OAuthTokenInfo message |
| `encodeUnifiedStateSyncMap` | function | `antigravity/inject-vscdb-token.mjs` | wraps protobuf in USS map format (key + value wrapper) |
| `runForEmail` | function | `antigravity/manual-token-acquire.mjs` | per-account OAuth URL generation + callback capture |
| `main` | function | `account/verify-age.mjs` | batch age verification with 5sim SMS + cost summary |
| `verifyAge` | function | `account/verify-age.mjs` | per-account login → age page → phone verification flow |
| `handlePhoneVerification` | function | `account/verify-age.mjs` | 5×3 retry phone verification with cancel/finish lifecycle |

## CONVENTIONS

- Scripts are ESM (`.mjs`) organized by purpose in `account/`, `antigravity/`, `oauth/` subdirs.
- CLI style at root: `--dry-run`, `--start/--end`, `--headed`, env fallback where applicable.
- Automation is locale-aware (`ko-KR` + English selectors) and screenshot-first on uncertain states.
- For Linux without display server: use headless defaults or `xvfb-run` for headed flows.
- MCP server uses `@modelcontextprotocol/sdk` StdioServerTransport — all logging via `console.error`, never `console.log` (stdout is the MCP transport channel).

## ANTI-PATTERNS (THIS PROJECT)

- Never assume headed browser works in this environment without X server.
- Never store real secrets in committed config; local artifacts like `gcp-oauth.keys.json` are runtime outputs.
- Never use `console.log` in `account/gmail-creator-mcp.mjs` — stdout is the MCP stdio transport.

## UNIQUE STYLES

- Anti-detection is explicit: human-like delay/mouse/typing and conservative pacing between account runs.
- Verification practice is screenshot-based at key transitions, not assertion-framework-based.
- Test strategy is script-driven (operational QA) rather than formal test-suite-driven.
- MCP server manages background jobs with PID liveness checks and log file tailing.

## COMMANDS

```bash
# Primary account creation
node account/create-accounts.mjs --dry-run --start 1 --end 3
node account/create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# Age verification
node account/verify-age.mjs --dry-run --start 1 --end 5
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# MCP server (normally launched by mcphub, not manually)
node account/gmail-creator-mcp.mjs

# MCP server tests
node tests/gmail-creator-mcp-smoke.mjs   # 29 assertions, no external deps
node tests/qa-manual.mjs                 # 6 manual QA checks

# Family & OAuth flows
node account/family-group.mjs --dry-run --start 1 --end 3
node oauth/oauth-login.mjs --help
node oauth/setup-gcp-oauth.mjs --headed

# Antigravity auth
node antigravity/antigravity-auth.mjs --batch qws94301@gmail.com --api-key $FIVESIM_API_KEY
node antigravity/unlock-features.mjs qws94301@gmail.com --api-key $FIVESIM_API_KEY

```

## ENVIRONMENT VARIABLES

| Variable | Used By | Required | Purpose |
|----------|---------|----------|---------|
| `FIVESIM_API_KEY` | `account/create-accounts.mjs`, MCP server | Yes (unless `--dry-run`) | 5sim SMS verification API key |
| `SMS_PROVIDER` | MCP server | No (default: `5sim`) | SMS provider selection |
| `FIVESIM_REGION` | MCP server | No (default: `russia`) | 5sim phone number region |
| `PROXY_SERVER` | MCP server | No | HTTP proxy address for browser |
| `PROXY_USER` | MCP server | No | Proxy authentication username |
| `PROXY_PASS` | MCP server | No | Proxy authentication password |
| `SMS_API_KEY` | MCP server | No | Alternative SMS API key |

## MCP SERVER INTEGRATION

The MCP server (`account/gmail-creator-mcp.mjs`) is registered in mcphub at `192.168.50.112` as a stdio transport on port 8082. Tools are accessed as `mcphub_gmail-creator-*` through the mcphub remote gateway. Do NOT register it as a direct stdio MCP in `opencode.jsonc` — mcphub is the sole gateway.

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `create_accounts` | `start`, `end`, `dry_run`, `api_key`, `region` | Spawns background account creation job |
| `get_creation_job` | `job_id` | Returns job status, progress, log tail |
| `list_accounts` | _(none)_ | Lists all accounts from `accounts.csv` |
| `get_account_status` | `email` | Gets single account details |

## NOTES

- `package.json` at root has placeholder test script only.
- Antigravity = VS Code-based Electron IDE v1.107.0 at `/usr/share/antigravity/`.
- VSCDB token storage uses protobuf encoding (not JSON) at key `antigravityUnifiedStateSync.oauthToken`.
- Google flags qws9430x accounts with `qr_code_verification` — automated OAuth login is blocked; use manual-assisted flow via `lib/oauth-callback-server.mjs`.
