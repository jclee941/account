# ANTIGRAVITY AREA KNOWLEDGE

## OVERVIEW

Local Antigravity state maintenance scripts: token validation/acquisition wrappers, VSCDB token injection, pipeline orchestration, and feature-state checks.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| End-to-end orchestration | `antigravity-pipeline.mjs` | Coordinates validation, acquisition subprocesses, local state writes, launch, and checks. |
| Token/state encoding | `inject-vscdb-token.mjs` | Manual protobuf and state-map encoding before SQLite write. |
| Manual callback flow | `manual-token-acquire.mjs` | Uses shared callback server and updates local accounts file when requested. |
| Automated auth wrapper | `antigravity-auth.mjs` | Browser/token acquisition helper. |
| Feature-state checks | `unlock-features.mjs` | Browser-driven local account state maintenance. |
| Shared constants/helpers | `../lib/antigravity-shared.mjs` | Token validation and argument helpers. |

## CONVENTIONS

- Scripts use direct `process.argv` parsing and top-level config constants.
- Local state paths point under the user's home directory; never commit generated state files.
- Pipeline subprocesses call sibling scripts by absolute paths built from `import.meta.dirname`.
- Token validation should stay separate from token storage writes.
- JSON result files in this directory are runtime artifacts, not stable fixtures.

## ANTI-PATTERNS

- Do not document account-specific emails, passwords, tokens, callback URLs, or live verification instructions.
- Do not broaden local state writes without reading the exact storage format first.
- Do not replace protobuf/state encoding with guessed JSON; the target storage format is binary-encoded.
- Do not assume GUI launch succeeds in headless environments.

## NOTES

- If editing `inject-vscdb-token.mjs`, inspect both encoder helpers and the SQLite write path before changing field order or wrappers.
