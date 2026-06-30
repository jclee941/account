# OPENAI AREA KNOWLEDGE

## OVERVIEW

Separate OpenAI-oriented automation and MCP surface. Keep guidance focused on code structure, stdio rules, and safe maintenance boundaries.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| OpenAI MCP surface | `openai-creator-mcp.mjs` | Tool schemas, background job tracking, CSV reader. |
| Script entry point | `create-accounts.mjs` | Separate from `account/create-accounts.mjs`; do not assume shared behavior. |
| Status/check helper | `check-accounts.mjs` | Reads local state and reports account status. |
| Existing README | `README.md` | Review before reusing content in agent guidance. |

## CONVENTIONS

- MCP stdio server diagnostics must use stderr, not stdout.
- Keep this directory's CSV paths and job tracking separate from `account/`.
- Maintain schema and handler changes together.

## ANTI-PATTERNS

- Do not commit generated account CSVs, credentials, tokens, or logs.
- Do not reuse `account/` assumptions without checking this directory's implementation.

## NOTES

- Fewer files than `account/`, but the MCP contract and data files are distinct.
