# PROJECT KNOWLEDGE BASE

## OVERVIEW

Node.js ESM workspace for browser automation, OAuth helpers, local MCP servers, and shared automation utilities. Keep repository guidance focused on maintenance and diagnostics, not runnable account-creation, verification, bypass, provider, or proxy playbooks.

## STRUCTURE

```text
./
├── account/        # main script surface and Gmail-oriented MCP server
├── antigravity/    # Antigravity account-state and token maintenance helpers
├── lib/            # shared CLI, browser, callback, proxy, CDP, ADB, and parsing utilities
├── oauth/          # narrow OAuth credential/login helpers
├── openai/         # separate OpenAI-oriented script and MCP surface
├── tests/          # MCP smoke checks
├── docs/           # writeups; review for operational detail before reuse
├── bin/            # shell wrappers and local URL interception helpers
├── data/           # project data inputs
└── package.json    # npm dependencies; `npm test` is currently a placeholder
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Main script maintenance | `account/` | Largest script area; see child instructions first. |
| MCP stdio behavior | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` | stdout is protocol; diagnostics belong on stderr. |
| Shared parsing/browser helpers | `lib/` | Prefer reuse over copying flow-local helpers. |
| Antigravity state/token code | `antigravity/`, `lib/antigravity-shared.mjs` | Handles local state files and subprocess orchestration. |
| OAuth callback handling | `lib/oauth-callback-server.mjs`, `oauth/` | Callback server is reusable; scripts are narrow wrappers. |
| Smoke checks | `tests/gmail-creator-mcp-smoke.mjs` | Script-driven check; root `npm test` does not run it. |
| Existing docs | `docs/`, `openai/README.md`, `README.md` | Do not mirror operational examples into AGENTS files. |

## CODE MAP

| Symbol / Control Point | Type | Location | Role |
|------------------------|------|----------|------|
| `main` | function | `account/create-accounts.mjs` | Main batch orchestration entry point. |
| `createAccountWithRetries` | function | `account/create-accounts.mjs` | Retry/failure policy around one account flow. |
| `Server` setup | top-level | `account/gmail-creator-mcp.mjs` | Tool registration, job management, CSV parsing. |
| `parseAccountsCsv` | function/method | `account/gmail-creator-mcp.mjs`, `antigravity/antigravity-pipeline.mjs` | Multiline-tolerant CSV record parsing. |
| `main` | function | `antigravity/antigravity-pipeline.mjs` | Local account-state orchestration entry point. |
| `encodeOAuthTokenInfo` | function | `antigravity/inject-vscdb-token.mjs` | Manual protobuf encoding for local state writes. |
| `createCallbackServer` | function | `lib/oauth-callback-server.mjs` | Local HTTP callback server with timeout/close semantics. |
| `launchBrowser` | function | `lib/browser-launch.mjs` | Shared Playwright/Rebrowser launch wrapper. |
| `parseCliArgs` | function | `lib/cli-args.mjs` | Shared simple CLI parser for email/password scripts. |
| `createProxyConfig` | function | `lib/proxy-config.mjs` | Proxy option normalization and warning metadata. |
| `Server` setup | top-level | `openai/openai-creator-mcp.mjs` | Separate MCP stdio server surface. |

## CONVENTIONS

- Scripts are ESM (`.mjs`) and grouped by operational domain, not by framework layer.
- Many scripts parse CLI flags directly from `process.argv`; preserve existing flag names when editing.
- Prefer shared helpers in `lib/` for browser launch, CLI parsing, OAuth callback handling, proxy normalization, and local state parsing.
- Browser flows must account for headless Linux. Do not assume headed mode works without an X server.
- MCP servers use stdio transport. In those files, never write diagnostics with `console.log`; stdout is reserved for MCP messages.
- Runtime outputs such as CSVs, JSON token results, downloaded keys, screenshots, and dumps are local artifacts, not documentation sources to paste into guidance.

## ANTI-PATTERNS (THIS PROJECT)

- Do not add runnable instructions for bulk account creation, phone/SMS verification, verification bypass, provider selection, proxy tactics, or anti-detection tuning.
- Do not commit secrets, OAuth tokens, API keys, live account data, screenshots containing credentials, or generated runtime state.
- Do not copy operational command blocks from README/docs into AGENTS.md files.
- Do not use `console.log` in stdio MCP server code.
- Do not broaden a helper in `lib/` around one script's quirks unless at least two call sites benefit.

## UNIQUE STYLES

- Tests are standalone Node scripts rather than a wired npm test suite.
- Some parsers are intentionally tolerant of multiline status fields and partially-written runtime CSV rows.
- Browser-state diagnostics often use screenshots and local dumps; keep those artifacts out of source control and docs.
- Several files are large script-style entry points. Make minimal targeted edits unless you are explicitly refactoring.

## COMMANDS

```bash
npm install
node tests/gmail-creator-mcp-smoke.mjs
```

## NOTES

- Existing root README and docs contain operational account automation examples; use them cautiously and do not amplify those details in agent instructions.
- `package-lock.json` is large but project-owned; `.opencode/node_modules/`, `.venv-mcp/`, `screenshots/`, and `tmp/` are analysis noise for documentation scoring.
- If a future task asks for library/API usage, use Context7 MCP per project instruction before answering.
