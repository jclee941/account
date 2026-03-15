# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-15
**Commit:** N/A (not a git repository)
**Branch:** N/A

## OVERVIEW

Gmail automation workspace. Node.js ESM at root using Playwright/Rebrowser + 5sim for account creation. Includes an MCP server (`gmail-creator-mcp.mjs`) for tool-based account creation via mcphub.

## STRUCTURE

```text
./
├── create-accounts.mjs         # primary account creation flow (2,650L)
├── gmail-creator-mcp.mjs       # MCP server: 4 tools for account automation (681L)
├── family-group.mjs            # invite/accept family flow (496L)
├── oauth-login.mjs             # OAuth consent/login helper (373L)
├── setup-gcp-oauth.mjs         # GCP OAuth credential setup automation (208L)
├── accounts.csv                # generated account state (input/output)
├── gcp-oauth.keys.json         # local OAuth keys artifact (runtime output)
├── package.json                # root dependencies (@anthropic-ai/sdk, @modelcontextprotocol/sdk)
└── tests/                      # MCP server smoke + manual QA tests
    ├── gmail-creator-mcp-smoke.mjs  # 29-assertion smoke test suite
    └── qa-manual.mjs                # 6-test manual QA validation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Create Gmail accounts (current) | `create-accounts.mjs` | Requires 5sim key unless `--dry-run` |
| MCP server (tool-based creation) | `gmail-creator-mcp.mjs` | 4 tools: create_accounts, get_creation_job, list_accounts, get_account_status |
| MCP server tests | `tests/` | Smoke (29 assertions) + manual QA (6 tests) |
| Family invitation workflow | `family-group.mjs` | Reads `accounts.csv`, writes `family-results.csv` |
| OAuth consent run | `oauth-login.mjs` | `--help`, `--headed` supported |
| Create GCP OAuth credentials | `setup-gcp-oauth.mjs` | Manual login fallback in headed mode |

## CODE MAP

| Symbol / Control Point | Type | Location | Role |
|------------------------|------|----------|------|
| `main` | function | `create-accounts.mjs` | orchestrates batch creation + retries + cost summary |
| `createAccountWithRetries` | function | `create-accounts.mjs` | controls account-level retry/failure policy |
| `GmailCreatorServer` | class | `gmail-creator-mcp.mjs` | MCP server: tool registration, CSV parsing, job management |
| `parseAccountsCsv` | method | `gmail-creator-mcp.mjs` | multiline-tolerant CSV parser (ISO timestamp boundary detection) |
| `handleCreateAccounts` | method | `gmail-creator-mcp.mjs` | spawns background `create-accounts.mjs` process, returns job ID |
| `handleGetCreationJob` | method | `gmail-creator-mcp.mjs` | checks job status via PID liveness + log tailing |
| `main` | function | `family-group.mjs` | runs invite phase then accept phase |
| `inviteMember` | function | `family-group.mjs` | parent-side invite interaction |
| `acceptInvitation` | function | `family-group.mjs` | child-side acceptance interaction |
| `main` | function | `oauth-login.mjs` | OAuth consent/login automation entry |
| `main` | function | `setup-gcp-oauth.mjs` | cloud console OAuth credential flow |

## CONVENTIONS

- Root scripts are ESM (`.mjs`) and executed directly with `node`.
- CLI style at root: `--dry-run`, `--start/--end`, `--headed`, env fallback where applicable.
- Automation is locale-aware (`ko-KR` + English selectors) and screenshot-first on uncertain states.
- For Linux without display server: use headless defaults or `xvfb-run` for headed flows.
- MCP server uses `@modelcontextprotocol/sdk` StdioServerTransport — all logging via `console.error`, never `console.log` (stdout is the MCP transport channel).

## ANTI-PATTERNS (THIS PROJECT)

- Never assume headed browser works in this environment without X server.
- Never store real secrets in committed config; local artifacts like `gcp-oauth.keys.json` are runtime outputs.
- Never use `console.log` in `gmail-creator-mcp.mjs` — stdout is the MCP stdio transport.

## UNIQUE STYLES

- Anti-detection is explicit: human-like delay/mouse/typing and conservative pacing between account runs.
- Verification practice is screenshot-based at key transitions, not assertion-framework-based.
- Test strategy is script-driven (operational QA) rather than formal test-suite-driven.
- MCP server manages background jobs with PID liveness checks and log file tailing.

## COMMANDS

```bash
# Primary account creation
node create-accounts.mjs --dry-run --start 1 --end 3
node create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# MCP server (normally launched by mcphub, not manually)
node gmail-creator-mcp.mjs

# MCP server tests
node tests/gmail-creator-mcp-smoke.mjs   # 29 assertions, no external deps
node tests/qa-manual.mjs                 # 6 manual QA checks

# Family & OAuth flows
node family-group.mjs --dry-run --start 1 --end 3
node oauth-login.mjs --help
node setup-gcp-oauth.mjs --headed

```

## ENVIRONMENT VARIABLES

| Variable | Used By | Required | Purpose |
|----------|---------|----------|---------|
| `FIVESIM_API_KEY` | `create-accounts.mjs`, MCP server | Yes (unless `--dry-run`) | 5sim SMS verification API key |
| `SMS_PROVIDER` | MCP server | No (default: `5sim`) | SMS provider selection |
| `FIVESIM_REGION` | MCP server | No (default: `russia`) | 5sim phone number region |
| `PROXY_SERVER` | MCP server | No | HTTP proxy address for browser |
| `PROXY_USER` | MCP server | No | Proxy authentication username |
| `PROXY_PASS` | MCP server | No | Proxy authentication password |
| `SMS_API_KEY` | MCP server | No | Alternative SMS API key |

## MCP SERVER INTEGRATION

The MCP server (`gmail-creator-mcp.mjs`) is registered in mcphub at `192.168.50.112` as a stdio transport on port 8082. Tools are accessed as `mcphub_gmail-creator-*` through the mcphub remote gateway. Do NOT register it as a direct stdio MCP in `opencode.jsonc` — mcphub is the sole gateway.

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `create_accounts` | `start`, `end`, `dry_run`, `api_key`, `region` | Spawns background account creation job |
| `get_creation_job` | `job_id` | Returns job status, progress, log tail |
| `list_accounts` | _(none)_ | Lists all accounts from `accounts.csv` |
| `get_account_status` | `email` | Gets single account details |

## NOTES

- This directory is not a git repo; commit/branch metadata is unavailable.
- `package.json` at root has placeholder test script only.
