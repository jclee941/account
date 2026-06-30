# LIB AREA KNOWLEDGE

## OVERVIEW

Shared utilities for browser launch, CLI parsing, OAuth callbacks, device commands, proxy/fingerprint config, token exchange, and state parsing.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Browser launch defaults | `browser-launch.mjs` | Imports Playwright module dynamically and returns browser/context/page. |
| Common CLI parsing | `cli-args.mjs` | Simple positional/flag parser used by account-oriented scripts. |
| OAuth callback server | `oauth-callback-server.mjs` | Handles path filtering, timeout, duplicate callback, and close behavior. |
| Token exchange | `token-exchange.mjs` | Small OAuth code-to-token helper. |
| Antigravity shared logic | `antigravity-shared.mjs` | Shared args/token validation helpers for `antigravity/`. |
| Device helpers | `adb-utils.mjs`, `cdp-utils.mjs` | Thin wrappers around external tools/protocols. |
| Proxy/fingerprint config | `proxy-config.mjs`, `fingerprint-config.mjs`, `free-proxy.mjs` | Normalize configuration and warning metadata. |
| Local forwarding | `proxy-forwarder.mjs`, `proxy-relay.mjs` | Network plumbing helpers. |

## CONVENTIONS

- Keep exports small and explicit; most consumers import named functions.
- Avoid one-off dependencies from a single script unless the helper is genuinely shared.
- Preserve timeout and close semantics in network helpers; callers rely on promises settling cleanly.
- Prefer structured return objects with warning/error fields over throwing for configuration quality checks.
- Keep environment-variable reads at script boundaries where practical; pass normalized options into helpers.

## ANTI-PATTERNS

- Do not hard-code live credentials, account identifiers, provider choices, or host-specific secret paths.
- Do not add console output to low-level helpers unless the existing helper already owns user-facing CLI output.
- Do not make browser defaults more permissive or invasive without a caller-specific reason.

## NOTES

- `oauth-callback-server.mjs` intentionally attaches a catch handler to its internal promise to avoid unhandled rejection during early close.
- `proxy-config.mjs` treats some checks as warnings because network identity cannot be proven from config alone.
