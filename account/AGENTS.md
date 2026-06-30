# ACCOUNT AREA KNOWLEDGE

## OVERVIEW

Browser/device automation entry points, diagnostics, local MCP wrapper, and generated account-state readers. Keep this file focused on where behavior lives and which invariants matter.

## STRUCTURE

```text
account/
├── create-accounts*.mjs       # main variants and device/CDP/Appium entry points
├── verify-*.mjs               # account-state verification scripts
├── *login*.mjs                # login diagnostics and checks
├── gmail-creator-mcp.mjs      # stdio MCP server wrapper
├── infrastructure/            # emulator lifecycle helper
└── *signup*.mjs, *sms*.mjs    # experimental/debug flows
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Main orchestration edits | `create-accounts.mjs` | Very large file; inspect nearby helpers before changing behavior. |
| Device-specific paths | `create-accounts-adb.mjs`, `create-accounts-cdp.mjs`, `create-accounts-appium.mjs` | Variants share concepts but not identical selectors/control flow. |
| MCP contract | `gmail-creator-mcp.mjs` | Tool schemas, CSV parser, background job metadata, log tailing. |
| CSV/status parsing | `gmail-creator-mcp.mjs`, `verify-all-accounts.mjs`, `process-batch-verification.mjs` | Runtime CSV can contain multiline status fields. |
| Emulator lifecycle | `infrastructure/setup-emulator.mjs` | Exports status/start/stop helpers and CLI JSON output. |
| Diagnostic scripts | `diagnostic-login.mjs`, `direct-login-test.mjs`, `cdp-login-test.mjs`, `infrastructure-diagnostic.mjs` | Maintenance aids, not general runbooks. |

## CONVENTIONS

- Treat the files here as executable scripts first; many have top-level constants and `main()` near the bottom.
- Preserve existing CLI flag names and dry-run semantics when editing.
- Keep MCP schema changes synchronized with handler validation and tests.
- In `gmail-creator-mcp.mjs`, all diagnostics must go to stderr; stdout belongs to stdio transport only.
- When touching CSV parsing, preserve multiline tolerance and latest-record behavior.
- Prefer shared utilities from `../lib/` over adding new local copies.

## ANTI-PATTERNS

- Do not paste account emails, passwords, SMS contents, or screenshots into source comments or docs.
- Do not weaken error handling to keep a long-running batch alive; record failure state clearly.
- Do not assume selectors, locale text, or browser state are stable across automation variants.

## NOTES

- Several scripts are experimental diagnostics; verify the target entry point before editing.
- Large files exceed normal maintainability size. Prefer small local fixes unless the user explicitly asks for a refactor.
