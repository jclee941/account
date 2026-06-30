# gmail — Automation Toolkit / 자동화 툴킷

A Node.js (ESM) workspace that automates browser- and Android-driven workflows through Playwright/Puppeteer, the Chrome DevTools Protocol (CDP), Appium, ADB, and Frida. It exposes two Model Context Protocol (MCP) servers for AI-agent integration, ships an OAuth callback server, integrates an SMS provider layer, and routes traffic through pluggable proxy helpers. Scripts are organized by operational domain and grouped behind a shared `lib/` utility layer.

Playwright/Puppeteer, Chrome DevTools Protocol(CDP), Appium, ADB, Frida를 활용해 브라우저 및 Android 기반 워크플로를 자동화하는 Node.js (ESM) 워크스페이스입니다. AI 에이전트 연동을 위한 두 개의 Model Context Protocol(MCP) 서버를 제공하며, OAuth 콜백 서버, SMS 제공자 추상화 계층, 플러거블 프록시 헬퍼를 함께 제공합니다. 스크립트는 운영 도메인별로 정리되어 공유 `lib/` 유틸리티 계층 뒤에서 실행됩니다.

> ⚠️ **Responsible Use / 책임 있는 사용.** This toolkit automates account provisioning, OAuth setup, and verification flows. It is published for legitimate testing, internal tooling, QA, and security research on systems you own or are explicitly authorized to test. The operator is responsible for complying with each platform's Terms of Service and with all applicable laws.
>
> 본 툴킷은 계정 프로비저닝, OAuth 설정, 인증(verification) 플로우를 자동화합니다. 사용자가 정당하게 소유하거나 명시적으로 테스트 권한을 부여받은 시스템에 대한 정당한 테스트, 내부 도구 개발, QA, 보안 연구를 위해 공개되었습니다. 운영자는 각 플랫폼의 이용약관과 모든 관련 법규를 준수할 책임이 있습니다.

---

## Table of Contents / 목차

1. [Overview / 개요](#overview--개요)
2. [Key Features / 주요 기능](#key-features--주요-기능)
3. [Repository Layout / 저장소 구조](#repository-layout--저장소-구조)
4. [Architecture / 아키텍처](#architecture--아키텍처)
5. [Quick Start / 빠른 시작](#quick-start--빠른-시작)
6. [Configuration / 설정](#configuration--설정)
7. [Commands Reference / 명령어 참조](#commands-reference--명령어-참조)
8. [Local Development / 로컬 개발](#local-development--로컬-개발)
9. [Testing / 테스트](#testing--테스트)
10. [Documentation / 문서](#documentation--문서)
11. [Contributing / 기여](#contributing--기여)
12. [License / 라이선스](#license--라이선스)

---

## Overview / 개요

The package declares `name: "gmail"` in `package.json` at version `1.0.0` (license: ISC). In practice it is a multi-domain automation workspace:

- **`account/`** — Bulk account provisioning, login verification, warm-up, and a Gmail-oriented MCP server (`account/gmail-creator-mcp.mjs`).
- **`openai/`** — A parallel domain with its own batch scripts and an OpenAI-oriented MCP server (`openai/openai-creator-mcp.mjs`).
- **`antigravity/`** — Local state and token maintenance for an Antigravity client (state file writes, manual token acquisition, protobuf token encoding).
- **`oauth/`** — Narrow helpers for GCP OAuth credential setup and OAuth-driven login.
- **`lib/`** — Reusable building blocks: browser launch, CLI parsing, OAuth callback server, proxy config/forwarder/relay, CDP helpers, ADB helpers, SMS provider, fingerprint, and token exchange.
- **`bin/`** — POSIX shell wrappers around credential setup, Frida setup, and a local `xdg-open` shim used for URL interception.
- **`tests/`** — MCP smoke checks; root `npm test` is currently a placeholder script.
- **`docs/`** — Operational writeups (SMS providers, ADB Gmail creation, verification analysis, quickstart).
- **`data/`** — Project data inputs and persistent state (e.g., `warmup-progress.json`).
- **`tmp/`** — Ad-hoc debug artifacts produced during development.

`package.json` 의 `name` 은 `"gmail"` 이며 버전 `1.0.0`, 라이선스는 ISC 입니다. 단, 실제 코드베이스는 다중 도메인 자동화 워크스페이스로 구성됩니다.

---

## Key Features / 주요 기능

| Feature | Description / 설명 |
|---|---|
| Multi-driver browser automation | Playwright/`rebrowser-playwright`, `ghost-cursor-playwright`, Puppeteer, and raw CDP via WebSocket (`ws`). |
| Mobile automation | Appium (`webdriverio`), ADB via `lib/adb-utils.mjs`, Frida (`bin/setup_frida.sh`, `account/frida-sms-hook.js`), and redroid (containerized Android) flows. |
| MCP servers for AI agents | Two stdio MCP servers — `account/gmail-creator-mcp.mjs` and `openai/openai-creator-mcp.mjs` — expose job management, CSV parsing, and pipeline control. |
| OAuth callback handling | Reusable loopback HTTP server in `lib/oauth-callback-server.mjs` with timeout/close semantics, used by `oauth/` scripts. |
| Proxy layer | Pluggable helpers — `lib/proxy-config.mjs` (normalization + warning metadata), `lib/proxy-forwarder.mjs`, `lib/proxy-relay.mjs`. |
| SMS provider abstraction | `lib/sms-provider.mjs` centralizes provider integration; alternatives are described in `docs/ALTERNATIVE-SMS-PROVIDERS.md`. |
| Fingerprint & behavior profile | `lib/fingerprint-config.mjs`, `lib/behavior-profile.mjs` configure browser identity and behavioral cadence. |
| Local state maintenance | Antigravity client state write/read (`antigravity/inject-vscdb-token.mjs`, `lib/antigravity-shared.mjs`). |
| QR / image utilities | `jsqr` and `pngjs` are wired in for QR decoding from PNG screenshots. |
| CSV-driven batch jobs | `complete.csv` and `openai-accounts.csv` are the canonical inventories; scripts consume them via `parseAccountsCsv`. |

---

## Repository Layout / 저장소 구조

```text
.
├── AGENTS.md                       # project knowledge base (maintenance guidance)
├── CONTRIBUTING.md                 # contribution guide
├── LICENSE
├── README.md
├── package.json                    # npm metadata, dependency manifest
├── package-lock.json
├── bin/                            # POSIX shell wrappers + xdg-open shim
│   ├── create-gmail.sh
│   ├── setup-1password-service-account.sh
│   ├── setup-credentials.sh
│   ├── setup_frida.sh
│   └── xdg-open                    # URL interception helper
├── oauth/                          # narrow OAuth credential/login helpers
│   ├── oauth-login.mjs
│   └── setup-gcp-oauth.mjs
├── account/                        # main script surface + Gmail MCP server
│   ├── AGENTS.md
│   ├── gmail-creator-mcp.mjs       # stdio MCP server (job mgmt + CSV)
│   ├── create-accounts.mjs         # batch orchestration
│   ├── create-accounts-{cdp,adb,appium}.mjs
│   ├── puppeteer-gmail.mjs
│   ├── redroid-signup-cdp.mjs      # containerized Android signup
│   ├── youtube-signup{,-cdp}.mjs
│   ├── frida-sms-hook.js
│   ├── verify-{account,age,all-accounts}.mjs
│   ├── warmup-account.mjs
│   ├── check-account-exists.mjs
│   ├── process-batch-verification.mjs
│   ├── cdp-login-test.mjs
│   ├── direct-login-test.mjs
│   ├── diagnostic-login.mjs
│   ├── debug-sms-capture.mjs
│   ├── family-group.mjs
│   ├── test-partner-oauth.mjs
│   └── infrastructure/setup-emulator.mjs
├── openai/                         # OpenAI-oriented script + MCP server
│   ├── AGENTS.md
│   ├── README.md
│   ├── openai-creator-mcp.mjs      # stdio MCP server
│   ├── create-accounts.mjs
│   └── check-accounts.mjs
├── antigravity/                    # Antigravity client state/token maintenance
│   ├── AGENTS.md
│   ├── antigravity-pipeline.mjs    # orchestration entry point
│   ├── antigravity-auth.mjs
│   ├── inject-vscdb-token.mjs      # manual protobuf encode into local state
│   ├── manual-token-acquire.mjs
│   ├── unlock-features.mjs
│   └── antigravity-auth-results.json
├── lib/                            # shared utilities (browser, proxy, CDP, …)
│   ├── AGENTS.md
│   ├── browser-launch.mjs
│   ├── cli-args.mjs
│   ├── oauth-callback-server.mjs
│   ├── google-auth-browser.mjs
│   ├── token-exchange.mjs
│   ├── cdp-utils.mjs
│   ├── adb-utils.mjs
│   ├── proxy-config.mjs
│   ├── proxy-forwarder.mjs
│   ├── proxy-relay.mjs
│   ├── free-proxy.mjs
│   ├── sms-provider.mjs
│   ├── verification-pipeline.mjs
│   ├── fingerprint-config.mjs
│   ├── behavior-profile.mjs
│   └── antigravity-shared.mjs
├── docs/                           # operational writeups
│   ├── QUICKSTART.md
│   ├── ALTERNATIVE-SMS-PROVIDERS.md
│   ├── adb-gmail-creation.md
│   └── verification-bypass-analysis.md
├── data/                           # project data inputs / persistent state
│   └── warmup-progress.json
├── tests/                          # MCP smoke checks
│   ├── gmail-creator-mcp-smoke.mjs
│   └── qa-manual.mjs
├── tmp/                            # ad-hoc debug artifacts
│   ├── debug-selects.mjs
│   ├── sms-fast-v2.mjs
│   ├── sms-verify-fast.mjs
│   ├── tmp-reauth.mjs
│   └── ui.xml
├── complete.csv                    # canonical account inventory
└── openai-accounts.csv             # OpenAI account inventory
```

---

## Architecture / 아키텍처

The workspace is layered: **entry scripts** → **domain module** → **shared `lib/` helpers** → **external systems (browsers, Android devices, OAuth providers, SMS providers, local state files)**.

작스페이스는 계층화되어 있습니다: **진입 스크립트** → **도메인 모듈** → **공유 `lib/` 헬퍼** → **외부 시스템(브라우저, Android 기기, OAuth 제공자, SMS 제공자, 로컬 상태 파일)**.

### Module Map / 모듈 맵

| Layer | Path | Role |
|---|---|---|
| Entry / 배치 스크립트 | `account/create-accounts.mjs`, `openai/create-accounts.mjs`, `antigravity/antigravity-pipeline.mjs` | Batch orchestration; parse flags, iterate CSV records, dispatch into the appropriate flow. |
| MCP servers / MCP 서버 | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` | stdio transport; expose tools, manage jobs, parse CSV. `stdout` is reserved for MCP messages. |
| Domain helpers / 도메인 헬퍼 | `account/*`, `antigravity/*`, `oauth/*` | Flow-specific logic (login, sign-up, verification, warm-up, family group, token encode). |
| Shared library / 공유 라이브러리 | `lib/*` | Browser launch, CLI parsing, OAuth callback server, proxy normalization/forwarding, CDP, ADB, SMS, fingerprinting, behavior profile, token exchange. |
| Shells / 셸 | `bin/*` | Credential provisioning, Frida install, URL interception shim. |

### Runtime Surface / 런타임 표면

| Component | Script | Transport | Notes |
|---|---|---|---|
| Gmail Creator MCP | `account/gmail-creator-mcp.mjs` | stdio | Job management, CSV parsing. Diagnostics must use `stderr`. |
| OpenAI Creator MCP | `openai/openai-creator-mcp.mjs` | stdio | Separate MCP surface; same stdout-vs-stderr rule. |
| OAuth Callback Server | `lib/oauth-callback-server.mjs` | loopback HTTP | Bound to `127.0.0.1` on a placeholder port; timeout/close semantics. |
| Browser launchers | `lib/browser-launch.mjs` | CDP / Playwright | Headless-friendly wrapper around `rebrowser-playwright`. |
| Android bridge | `lib/adb-utils.mjs`, Appium, Frida | USB / network ADB | Concrete device target configured at runtime. |
| SMS provider | `lib/sms-provider.mjs` | HTTPS to provider | Provider pluggable; alternatives listed in `docs/ALTERNATIVE-SMS-PROVIDERS.md`. |

### Standard Request Flow / 표준 요청 흐름

When an entry script performs a single account flow, the typical sequence is:

진입 스크립트가 단일 계정 플로우를 수행할 때의 일반적인 순서는 다음과 같습니다.

1. **Parse CLI / CSV** — `lib/cli-args.mjs` parses flags; `parseAccountsCsv` (used by both the Gmail MCP server and `antigravity-pipeline.mjs`) yields one record per row.
2. **Resolve proxy** — `lib/proxy-config.mjs` normalizes the option; `lib/proxy-forwarder.mjs` and/or `lib/proxy-relay.mjs` route traffic if a proxy is configured.
3. **Launch browser** — `lib/browser-launch.mjs` opens a Playwright/Rebrowser session; `lib/fingerprint-config.mjs` and `lib/behavior-profile.mjs` shape identity and cadence.
4. **Drive UI** — The domain script (e.g., `create-accounts-cdp.mjs`, `puppeteer-gmail.mjs`) drives the sign-up flow; OAuth-driven paths use `google-auth-browser.mjs` with the local callback server from step 5.
5. **Receive OAuth callback** — `lib/oauth-callback-server.mjs` listens on a loopback port, captures the redirect, and the caller exchanges the code via `lib/token-exchange.mjs`.
6. **Handle verification** — `lib/verification-pipeline.mjs` orchestrates SMS/age verification; `lib/sms-provider.mjs` connects to the configured SMS vendor; QR (if any) is decoded from PNG snapshots via `jsqr`/`pngjs`.
7. **Persist state** — The script appends to `complete.csv` (or `openai-accounts.csv`); warm-up progress is appended to `data/warmup-progress.json`; Antigravity flows write to the local SQLite state via `antigravity/inject-vscdb-token.mjs`.

### External Permissions / 외부 권한

| Resource | Accessed via | Notes |
|---|---|---|
| Filesystem | local CSV/JSON state files | `complete.csv`, `openai-accounts.csv`, `data/warmup-progress.json`, `antigravity/antigravity-auth-results.json`. |
| Android device / emulator | `lib/adb-utils.mjs`, Appium, Frida | Operator must supply a target device/emulator identifier. |
| Loopback HTTP | `lib/oauth-callback-server.mjs` | `127.0.0.1:<placeholder-port>` — replace placeholder with a free port at runtime. |
| Network egress | `lib/proxy-config.mjs`, `lib/proxy-forwarder.mjs`, `lib/sms-provider.mjs` | Routed per-script; proxy may be required by some networks. |
| USB / ADB | `bin/setup_frida.sh`, `account/frida-sms-hook.js` | Frida server setup on connected Android targets. |

### Observability / 관측성

| Artifact | Purpose |
|---|---|
| `data/warmup-progress.json` | Durable warm-up progress across runs. |
| `antigravity/antigravity-auth-results.json` | Per-attempt auth results. |
| `complete.csv`, `openai-accounts.csv` | Account inventory (append-only). |
| `tmp/*` | Ad-hoc debug artifacts (UI dumps, fast SMS shims, reauth scratch). |
| MCP `stderr` | Diagnostics channel for both MCP servers. |

---

## Quick Start / 빠른 시작

> Replace any angle-bracket placeholder with your own value. Do not hardcode private/internal IPs in scripts — pass them via environment or CLI flags.

각주: 꺾쇠 괄호 자리표시자는 자신의 값으로 치환하세요. 사설/내부 IP는 스크립트에 직접 하드코딩하지 말고 환경 변수 또는 CLI 플래그로 전달하세요.

```text
# 1. Clone
git clone <repo-url>
cd <repo>

# 2. Install dependencies
npm install

# 3. Install optional tooling referenced by bin/ helpers
./bin/setup_frida.sh                 # installs Frida on a connected target
./bin/setup-credentials.sh           # wires up local credentials store
./bin/setup-1password-service-account.sh   # 1Password service-account setup

# 4. Run a single entry point
node account/gmail-creator-mcp.mjs   # start the Gmail MCP server (stdio)
node openai/openai-creator-mcp.mjs   # start the OpenAI MCP server (stdio)
node account/create-accounts.mjs     # batch orchestrator
node antigravity/antigravity-pipeline.mjs   # local-state orchestrator
```

Prerequisites / 사전 요구사항:

- Node.js (ESM-capable; matching the dependency versions in `package.json`).
- For browser scripts: a Chromium-based browser that Playwright/`rebrowser-playwright` can drive. Headless Linux requires no X server; headed mode does.
- For Android scripts: ADB in `PATH`, an attached device or running emulator (or a redroid container), and optionally Frida.
- For MCP servers: any MCP-compatible client configured for stdio transport.

---

## Configuration / 설정

This section describes configuration *categories* consumed by the scripts. Concrete option names are defined in the individual files; consult source for current values.

이 섹션은 스크립트가 사용하는 설정 **범주**를 설명합니다. 구체적인 옵션 이름은 각 파일에 정의되어 있으며, 최신 값은 소스를 확인하세요.

| Category | Provided by | Operator inputs |
|---|---|---|
| Account inventory / 계정 인벤토리 | `complete.csv`, `openai-accounts.csv` | One record per row; multiline-tolerant `parseAccountsCsv`. |
| Persistent state / 영속 상태 | `data/warmup-progress.json`, `antigravity/antigravity-auth-results.json` | Written by the toolkit; do not edit while a run is active. |
| Browser launch / 브라우저 구동 | `lib/browser-launch.mjs`, `lib/fingerprint-config.mjs`, `lib/behavior-profile.mjs` | Channel, headless flag, fingerprint profile, behavior cadence. |
| Proxy routing / 프록시 | `lib/proxy-config.mjs`, `lib/proxy-forwarder.mjs`, `lib/proxy-relay.mjs`, `lib/free-proxy.mjs` | Address placeholder (e.g., `http://<placeholder-host>:<placeholder-port>`); warning metadata is surfaced by `proxy-config.mjs`. |
| SMS provider / SMS 제공자 | `lib/sms-provider.mjs` (+ `docs/ALTERNATIVE-SMS-PROVIDERS.md`) | Provider selection, credentials, polling cadence. |
| OAuth callback / OAuth 콜백 | `lib/oauth-callback-server.mjs` | Loopback host/port placeholder, timeout. |
| GCP OAuth / GCP OAuth | `oauth/setup-gcp-oauth.mjs`, `bin/setup-credentials.sh` | OAuth client ID/secret (loaded from your local secret store, never committed). |
| Android target / Android 대상 | `lib/adb-utils.mjs`, `account/infrastructure/setup-emulator.mjs` | Device serial, emulator AVD name, or redroid container reference. |
| Frida runtime / Frida 런타임 | `bin/setup_frida.sh`, `account/frida-sms-hook.js` | Target host/port placeholder, server binary path. |

> 🔒 **Secrets / 시크릿.** OAuth client secrets, SMS provider keys, and 1Password service-account tokens never belong in this repository. Use the shell wrappers in `bin/` (or your own secret manager) to load them at runtime.
> OAuth 클라이언트 시크릿, SMS 제공자 키, 1Password 서비스 계정 토큰은 저장소에 커밋되지 않습니다. 런타임에는 `bin/` 의 셸 래퍼(또는 자체 시크릿 매니저)를 사용해 로드하세요.

---

## Commands Reference / 명령어 참조

All scripts are ESM. Run with `node path/to/script.mjs` (or the corresponding `bin/*.sh` wrapper where one exists). CLI flags are parsed directly from `process.argv` in most scripts; prefer reading the script header or calling `lib/cli-args.mjs` consumers for the current flag set.

모든 스크립트는 ESM 입니다. `node path/to/script.mjs` 로 실행하세요(해당 셸 래퍼가 있다면 `bin/*.sh` 사용 가능). 대부분의 스크립트에서 CLI 플래그는 `process.argv` 에서 직접 파싱됩니다. 현재 플래그 집합은 스크립트 헤더나 `lib/cli-args.mjs` 호출부를 확인하세요.

### `account/` — Gmail / browser / Android flows

| Command | Role |
|---|---|
| `node account/gmail-creator-mcp.mjs` | Start the Gmail MCP server (stdio). Job management + CSV parsing. |
| `node account/create-accounts.mjs` | Batch orchestration. Top-level entry point for `account/`. |
| `node account/create-accounts-cdp.mjs` | Sign-up via Chrome DevTools Protocol. |
| `node account/create-accounts-adb.mjs` | Sign-up via ADB-driven Android automation. |
| `node account/create-accounts-appium.mjs` | Sign-up via Appium (`webdriverio`). |
| `node account/puppeteer-gmail.mjs` | Puppeteer-based Gmail interaction. |
| `node account/redroid-signup-cdp.mjs` | Sign-up against a redroid (containerized Android) target over CDP. |
| `node account/youtube-signup.mjs` / `youtube-signup-cdp.mjs` | YouTube-specific sign-up paths. |
| `node account/cdp-login-test.mjs` / `direct-login-test.mjs` / `diagnostic-login.mjs` | Login diagnostics and selectors probes. |
| `node account/check-account-exists.mjs` / `verify-account.mjs` / `verify-age.mjs` / `verify-all-accounts.mjs` / `process-batch-verification.mjs` | Account existence and verification utilities. |
| `node account/warmup-account.mjs` | Runs the warm-up flow; updates `data/warmup-progress.json`. |
| `node account/family-group.mjs` | Family-group operations. |
| `node account/test-partner-oauth.mjs` | Partner OAuth smoke test. |
| `node account/debug-sms-capture.mjs` | SMS capture diagnostics. |
| `node account/frida-sms-hook.js` | Frida SMS hook (used against an attached Android target). |
| `node account/infrastructure/setup-emulator.mjs` | Bring up the Android emulator/redroid infrastructure. |

### `openai/` — OpenAI flows

| Command | Role |
|---|---|
| `node openai/openai-creator-mcp.mjs` | Start the OpenAI MCP server (stdio). |
| `node openai/create-accounts.mjs` | Batch creation entry point. |
| `node openai/check-accounts.mjs` | Account inventory check. |

### `antigravity/` — Antigravity local state

| Command | Role |
|---|---|

]<]minimax[>[<tool_call>
]<]minimax[>[<invoke name="artifacts">]<]minimax[>[<command>create]<]minimax[>[</command>]<]minimax[>[<name>README.md]<]minimax[>[</name>]<]minimax[>[<contents># gmail — Account Automation Toolkit / 계정 자동화 툴킷

A Node.js (ESM) workspace that automates browser- and Android-driven account provisioning, OAuth setup, and verification flows through Playwright/Puppeteer, the Chrome DevTools Protocol (CDP), Appium, ADB, and Frida. It exposes two Model Context Protocol (MCP) servers for AI-agent integration, ships an OAuth callback server, integrates an SMS provider layer, and routes traffic through pluggable proxy helpers. Scripts are organized by operational domain and grouped behind a shared `lib/` utility layer.

Playwright/Puppeteer, Chrome DevTools Protocol(CDP), Appium, ADB, Frida를 활용해 브라우저와 Android 기반의 계정 프로비저닝, OAuth 설정, 인증(verification) 플로우를 자동화하는 Node.js(ESM) 워크스페이스입니다. AI 에이전트 연동을 위한 두 개의 Model Context Protocol(MCP) 서버를 제공하며, OAuth 콜백 서버, SMS 제공자 추상화 계층, 플러거블 프록시 헬퍼를 함께 제공합니다. 스크립트는 운영 도메인별로 정리되어 공유 `lib/` 유틸리티 계층 뒤에서 실행됩니다.

> ⚠️ **Responsible Use / 책임 있는 사용.** This toolkit automates account provisioning, OAuth setup, and verification flows. It is published for legitimate testing, internal tooling, QA, and security research on systems you own or are explicitly authorized to test. The operator is responsible for complying with each platform's Terms of Service and with all applicable laws.
>
> 본 툴킷은 계정 프로비저닝, OAuth 설정, 인증(verification) 플로우를 자동화합니다. 사용자가 정당하게 소유하거나 명시적으로 테스트 권한을 부여받은 시스템에 대한 정당한 테스트, 내부 도구 개발, QA, 보안 연구를 위해 공개되었습니다. 운영자는 각 플랫폼의 이용약관과 모든 관련 법규를 준수할 책임이 있습니다.

---

## Table of Contents / 목차

- [Overview / 개요](#overview--개요)
- [Key Features / 주요 기능](#key-features--주요-기능)
- [Repository Layout / 저장소 구조](#repository-layout--저장소-구조)
- [Architecture / 아키텍처](#architecture--아키텍처)
- [Quick Start / 빠른 시작](#quick-start--빠른-시작)
- [Configuration / 설정](#configuration--설정)
- [Commands Reference / 명령어 참조](#commands-reference--명령어-참조)
- [Local Development / 로컬 개발](#local-development--로컬-개발)
- [Testing / 테스트](#testing--테스트)
- [Documentation / 문서](#documentation--문서)
- [Contributing / 기여](#contributing--기요)
- [License / 라이선스](#license--라이선스)

---

## Overview / 개요

The package declares `name: "gmail"` in `package.json` at version `1.0.0` (license: ISC). In practice it is a multi-domain automation workspace:

- **`account/`** — Bulk account provisioning, login verification, warm-up, OAuth/verification helpers, and a Gmail-oriented MCP server (`account/gmail-creator-mcp.mjs`).
- **`openai/`** — A parallel domain with its own batch scripts and an OpenAI-oriented MCP server (`openai/openai-creator-mcp.mjs`).
- **`antigravity/`** — Local state and token maintenance for an Antigravity client (state file writes, manual token acquisition, protobuf token encoding).
- **`oauth/`** — Narrow helpers for GCP OAuth credential setup and OAuth-driven login (`oauth-login.mjs`, `setup-gcp-oauth.mjs`).
- **`lib/`** — Reusable building blocks: browser launch (`browser-launch.mjs`), CLI parsing (`cli-args.mjs`), OAuth callback server (`oauth-callback-server.mjs`), proxy config / forwarder / relay (`proxy-config.mjs`, `proxy-forwarder.mjs`, `proxy-relay.mjs`, `free-proxy.mjs`), CDP helpers (`cdp-utils.mjs`), ADB helpers (`adb-utils.mjs`), SMS provider (`sms-provider.mjs`), fingerprint (`fingerprint-config.mjs`), behavior profile (`behavior-profile.mjs`), Google auth in-browser (`google-auth-browser.mjs`), token exchange (`token-exchange.mjs`), verification pipeline (`verification-pipeline.mjs`), and shared Antigravity logic (`antigravity-shared.mjs`).
- **`bin/`** — POSIX shell wrappers around credential setup, Frida setup, and a local `xdg-open` shim used for URL interception.
- **`tests/`** — MCP smoke checks; the root `npm test` is currently a placeholder script.
- **`docs/`** — Operational writeups (alternative SMS providers, ADB Gmail creation, verification analysis, quickstart).
- **`data/`** — Project data inputs and persistent state (e.g., `warmup-progress.json`).
- **`tmp/`** — Ad-hoc debug artifacts produced during development.

코드베이스가 직접적으로 하는 일:

- 브라우저 및 Android 환경에서 가입/로그인/인증(verification) 플로우를 자동화합니다(Playwright/Puppeteer, CDP, Appium, ADB, Frida).
- 두 개의 stdio MCP 서버(`gmail-creator-mcp`, `openai-creator-mcp`)를 통해 AI 에이전트에 도구 노출, 작업 관리, CSV 파싱을 제공합니다.
- 로컬 Antigravity 클라이언트의 상태 파일을 읽고 토큰을 인코딩/기록합니다.
- GCP OAuth 설정과 OAuth 콜백 수신을 위한 루프백 HTTP 서버를 제공합니다.
- CSV로 관리되는 계정 인벤토리(`complete.csv`, `openai-accounts.csv`)와 warm-up 진행 상태(`data/warmup-progress.json`)를 영속화합니다.

`package.json` 의 `name` 은 `"gmail"` 이며 버전 `1.0.0`, 라이선스는 ISC 입니다. 단, 실제 코드베이스는 다중 도메인 자동화 워크스페이스로 구성됩니다.

---

## Key Features / 주요 기능

| Feature | Description / 설명 |
|---|---|
| Multi-driver browser automation | Playwright/`rebrowser-playwright`, `ghost-cursor-playwright`, Puppeteer, and raw CDP over WebSocket (`ws`). |
| Mobile / Android automation | Appium (`webdriverio`), ADB via `lib/adb-utils.mjs`, Frida (`bin/setup_frida.sh`, `account/frida-sms-hook.js`), and redroid (containerized Android) flows over CDP. |
| MCP servers for AI agents | Two stdio MCP servers — `account/gmail-creator-mcp.mjs` and `openai/openai-creator-mcp.mjs` — expose tools, manage jobs, and parse CSVs. |
| OAuth callback handling | Reusable loopback HTTP server in `lib/oauth-callback-server.mjs` with timeout/close semantics, used by `oauth/oauth-login.mjs` and Google-auth flows. |
| Proxy layer | Pluggable helpers: `lib/proxy-config.mjs` (normalization + warning metadata), `lib/proxy-forwarder.mjs` (forwarder), `lib/proxy-relay.mjs` (relay), `lib/free-proxy.mjs` (free proxy lookup). |
| SMS provider abstraction | `lib/sms-provider.mjs` centralizes provider integration; alternatives are documented in `docs/ALTERNATIVE-SMS-PROVIDERS.md`. |
| Fingerprint & behavior profile | `lib/fingerprint-config.mjs` and `lib/behavior-profile.mjs` configure browser identity and behavioral cadence. |
| Token exchange & verification pipeline | `lib/token-exchange.mjs` performs code → token exchange; `lib/verification-pipeline.mjs` orchestrates SMS / age verification. |
| Local state maintenance | Antigravity client state read/write and manual protobuf token encoding (`antigravity/inject-vscdb-token.mjs`, `lib/antigravity-shared.mjs`). |
| QR / image utilities | `jsqr` and `pngjs` are wired in for decoding QR payloads from PNG screenshots. |
| CSV-driven batch jobs | `complete.csv` and `openai-accounts.csv` are the canonical inventories; scripts consume them via `parseAccountsCsv`. |

---

## Repository Layout / 저장소 구조

```text
.
├── AGENTS.md                       # project knowledge base (maintenance guidance)
├── CONTRIBUTING.md                 # contribution guide
├── LICENSE
├── README.md
├── package.json                    # npm metadata, dependency manifest
├── package-lock.json
├── bin/                            # POSIX shell wrappers + xdg-open shim
│   ├── create-gmail.sh
│   ├── setup-1password-service-account.sh
│   ├── setup-credentials.sh
│   ├── setup_frida.sh
│   └── xdg-open                    # URL interception helper
├── oauth/                          # narrow OAuth credential/login helpers
│   ├── oauth-login.mjs
│   └── setup-gcp-oauth.mjs
├── account/                        # main script surface + Gmail MCP server
│   ├── AGENTS.md
│   ├── gmail-creator-mcp.mjs       # stdio MCP server (job mgmt + CSV)
│   ├── create-accounts.mjs         # batch orchestration
│   ├── create-accounts-{cdp,adb,appium}.mjs
│   ├── puppeteer-gmail.mjs
│   ├── redroid-signup-cdp.mjs      # containerized Android signup
│   ├── youtube-signup{,-cdp}.mjs
│   ├── frida-sms-hook.js
│   ├── verify-{account,age,all-accounts}.mjs
│   ├── warmup-account.mjs
│   ├── check-account-exists.mjs
│   ├── process-batch-verification.mjs
│   ├── cdp-login-test.mjs
│   ├── direct-login-test.mjs
│   ├── diagnostic-login.mjs
│   ├── debug-sms-capture.mjs
│   ├── family-group.mjs
│   ├── test-partner-oauth.mjs
│   └── infrastructure/setup-emulator.mjs
├── openai/                         # OpenAI-oriented script + MCP server
│   ├── AGENTS.md
│   ├── README.md
│   ├── openai-creator-mcp.mjs      # stdio MCP server
│   ├── create-accounts.mjs
│   └── check-accounts.mjs
├── antigravity/                    # Antigravity client state/token maintenance
│   ├── AGENTS.md
│   ├── antigravity-pipeline.mjs    # orchestration entry point
│   ├── antigravity-auth.mjs
│   ├── inject-vscdb-token.mjs      # manual protobuf encode into local state
│   ├── manual-token-acquire.mjs
│   ├── unlock-features.mjs
│   └── antigravity-auth-results.json
├── lib/                            # shared utilities (browser, proxy, CDP, …)
│   ├── AGENTS.md
│   ├── browser-launch.mjs
│   ├── cli-args.mjs
│   ├── oauth-callback-server.mjs
│   ├── google-auth-browser.mjs
│   ├── token-exchange.mjs
│   ├── cdp-utils.mjs
│   ├── adb-utils.mjs
│   ├── proxy-config.mjs
│   ├── proxy-forwarder.mjs
│   ├── proxy-relay.mjs
│   ├── free-proxy.mjs
│   ├── sms-provider.mjs
│   ├── verification-pipeline.mjs
│   ├── fingerprint-config.mjs
│   ├── behavior-profile.mjs
│   └── antigravity-shared.mjs
├── docs/                           # operational writeups
│   ├── QUICKSTART.md
│   ├── ALTERNATIVE-SMS-PROVIDERS.md
│   ├── adb-gmail-creation.md
│   └── verification-bypass-analysis.md
├── data/                           # project data inputs / persistent state
│   └── warmup-progress.json
├── tests/                          # MCP smoke checks
│   ├── gmail-creator-mcp-smoke.mjs
│   └── qa-manual.mjs
├── tmp/                            # ad-hoc debug artifacts
│   ├── debug-selects.mjs
│   ├── sms-fast-v2.mjs
│   ├── sms-verify-fast.mjs
│   ├── tmp-reauth.mjs
│   └── ui.xml
├── complete.csv                    # canonical account inventory
└── openai-accounts.csv             # OpenAI account inventory
```

---

## Architecture / 아키텍처

The workspace is layered: **entry scripts** → **domain module** → **shared `lib/` helpers** → **external systems (browsers, Android devices, OAuth providers, SMS providers, local state files)**.

작스페이스는 계층화되어 있습니다: **진입 스크립트** → **도메인 모듈** → **공유 `lib/` 헬퍼** → **외부 시스템(브라우저, Android 기기, OAuth 제공자, SMS 제공자, 로컬 상태 파일)**.

### Module Map / 모듈 맵

| Layer | Path | Role |
|---|---|---|
| Entry / 배치 스크립트 | `account/create-accounts.mjs`, `openai/create-accounts.mjs`, `antigravity/antigravity-pipeline.mjs` | Batch orchestration; parse flags, iterate CSV records, dispatch into the appropriate flow. |
| MCP servers / MCP 서버 | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` | stdio transport; expose tools, manage jobs, parse CSV. `stdout` is reserved for MCP messages. |
| Domain helpers / 도메인 헬퍼 | `account/*`, `antigravity/*`, `oauth/*` | Flow-specific logic (login, sign-up, verification, warm-up, family group, token encode). |
| Shared library / 공유 라이브러리 | `lib/*` | Browser launch, CLI parsing, OAuth callback server, proxy normalization/forwarding, CDP, ADB, SMS, fingerprinting, behavior profile, token exchange. |
| Shells / 셸 | `bin/*` | Credential provisioning, Frida install, URL interception shim. |

### Runtime Surface / 런타임 표면

| Component / 컴포넌트 | Script / 스크립트 | Transport / 전송 | Notes / 비고 |
|---|---|---|---|
| Gmail Creator MCP | `account/gmail-creator-mcp.mjs` | stdio | Job management, multiline-tolerant CSV parsing. Diagnostics must use `stderr`. |
| OpenAI Creator MCP | `openai/openai-creator-mcp.mjs` | stdio | Separate MCP surface; same stdout-vs-stderr rule. |
| OAuth Callback Server | `lib/oauth-callback-server.mjs` | loopback HTTP | Bound to `127.0.0.1` on a placeholder port; timeout/close semantics. |
| Browser launchers | `lib/browser-launch.mjs` (used with `rebrowser-playwright`, `ghost-cursor-playwright`) | CDP / Playwright | Headless-friendly wrapper. Headed mode requires an X server. |
| Android bridge | `lib/adb-utils.mjs`, Appium (`webdriverio`), Frida | USB / network ADB, Frida server | Concrete device target configured at runtime. |
| SMS provider | `lib/sms-provider.mjs` | HTTPS to provider | Provider pluggable; alternatives listed in `docs/ALTERNATIVE-SMS-PROVIDERS.md`. |
| Proxy plumbing | `lib/proxy-config.mjs`, `lib/proxy-forwarder.mjs`, `lib/proxy-relay.mjs` | inbound TCP/HTTP | Normalizes the option and emits warning metadata. |
| Antigravity state writer | `antigravity/inject-vscdb-token.mjs` | local SQLite write | Manual protobuf encoding via `encodeOAuthTokenInfo`. |

### Standard Request Flow / 표준 요청 흐름

When an entry script performs a single account flow, the typical sequence is:

진입 스크립트가 단일 계정 플로우를 수행할 때의 일반적인 순서는 다음과 같습니다.

1. **Parse CLI / CSV** — `lib/cli-args.mjs` parses flags; `parseAccountsCsv` (used by both the Gmail MCP server and `antigravity/antigravity-pipeline.mjs`) yields one record per row.
2. **Resolve proxy** — `lib/proxy-config.mjs` normalizes the option; `lib/proxy-forwarder.mjs` and/or `lib/proxy-relay.mjs` route traffic if a proxy is configured.
3. **Launch browser** — `lib/browser-launch.mjs` opens a Playwright/Rebrowser session; `lib/fingerprint-config.mjs` and `lib/behavior-profile.mjs` shape identity and cadence.
4. **Drive UI** — The domain script (e.g., `create-accounts-cdp.mjs`, `puppeteer-gmail.mjs`) drives the sign-up flow; OAuth-driven paths use `google-auth-browser.mjs` with the local callback server from step 5.
5. **Receive OAuth callback** — `lib/oauth-callback-server.mjs` listens on a loopback port, captures the redirect, and the caller exchanges the code via `lib/token-exchange.mjs`.
6. **Handle verification** — `lib/verification-pipeline.mjs` orchestrates SMS/age verification; `lib/sms-provider.mjs` connects to the configured SMS vendor; QR (if any) is decoded from PNG snapshots via `jsqr`/`pngjs`.
7. **Persist state** — The script appends to `complete.csv` (or `openai-accounts.csv`); warm-up progress is appended to `data/warmup-progress.json`; Antigravity flows write to the local SQLite state via `antigravity/inject-vscdb-token.mjs`.

### External Permissions / 외부 권한

| Resource / 자원 | Accessed via / 경로 | Notes / 비고 |
|---|---|---|
| Filesystem | local CSV/JSON state files | `complete.csv`, `openai-accounts.csv`, `data/warmup-progress.json`, `antigravity/antigravity-auth-results.json`. |
| Android device / emulator | `lib/adb-utils.mjs`, Appium, Frida | Operator must supply a target device/emulator identifier at runtime. |
| Loopback HTTP | `lib/oauth-callback-server.mjs` | `127.0.0.1:<placeholder-port>` — replace the placeholder with a free port at runtime. |
| Network egress | `lib/proxy-config.mjs`, `lib/proxy-forwarder.mjs`, `lib/sms-provider.mjs` | Routed per-script; a proxy may be required by some networks. |
| USB / ADB | `bin/setup_frida.sh`, `account/frida-sms-hook.js` | Frida server setup on connected Android targets. |

### Observability / 관측성

| Artifact / 산출물 | Purpose / 용도 |
|---|---|
| `data/warmup-progress.json` | Durable warm-up progress across runs. |
| `antigravity/antigravity-auth-results.json` | Per-attempt auth results. |
| `complete.csv`, `openai-accounts.csv` | Account inventory (append-only). |
| `tmp/*` | Ad-hoc debug artifacts (UI dumps, fast SMS shims, reauth scratch). |
| MCP `stderr` | Diagnostics channel for both MCP servers. |

---

## Quick Start / 빠른 시작

> Replace any angle-bracket placeholder with your own value. Do not hardcode private/internal IPs in scripts — pass them via environment variables or CLI flags.

각주: 꺾쇠 괄호 자리표시자는 자신의 값으로 치환하세요. 사설/내부 IP를 스크립트에 하드코딩하지 말고 환경 변수 또는 CLI 플래그로 전달하세요.

```text
# 1. Clone
git clone <repo-url>
cd <repo>

# 2. Install dependencies
npm install

# 3. Optional: install tooling referenced by bin/ helpers
./bin/setup_frida.sh                       # installs Frida on a connected target
./bin/setup-credentials.sh                 # wires up local credentials store
./bin/setup-1password-service-account.sh   # 1Password service-account setup

# 4. Run a single entry point
node account/gmail-creator-mcp.mjs         # start the Gmail MCP server (stdio)
node openai/openai-creator-mcp.mjs         # start the OpenAI MCP server (stdio)
node account/create-accounts.mjs           # batch orchestrator
node antigravity/antigravity-pipeline.mjs  # local-state orchestrator
```

Prerequisites / 사전 요구사항:

- Node.js (ESM-capable; matching the dependency versions declared in `package.json`).
- For browser scripts: a Chromium-based browser that Playwright/`rebrowser-playwright` can drive. Headless Linux requires no X server; headed mode does.
- For Android scripts: ADB on `PATH`, an attached device or running emulator (or a redroid container), and optionally Frida.
- For MCP servers: any MCP-compatible client configured for stdio transport.

---

## Configuration / 설정

This section describes configuration *categories* consumed by the scripts. Concrete option names are defined in the individual source files; consult source for current values.

이 섹션은 스크립트가 사용하는 설정 **범주**를 설명합니다. 구체적인 옵션 이름은 각 소스 파일에 정의되어 있으며, 최신 값은 소스를 확인하세요.

| Category / 범주 | Provided by / 제공 위치 | Operator inputs / 운영자 입력 |
|---|---|---|
| Account inventory / 계정 인벤토리 | `complete.csv`, `openai-accounts.csv` | One record per row; multiline-tolerant `parseAccountsCsv`. |
| Persistent state / 영속 상태 | `data/warmup-progress.json`, `antigravity/antigravity-auth-results.json` | Written by the toolkit; do not edit while a run is active. |
| Browser launch / 브라우저 구동 | `lib/browser-launch.mjs`, `lib/fingerprint-config.mjs`, `lib/behavior-profile.mjs` | Channel, headless flag, fingerprint profile, behavior cadence. |
| Proxy routing / 프록시 | `lib/proxy-config.mjs`, `lib/proxy-forwarder.mjs`, `lib/proxy-relay.mjs`, `lib/free-proxy.mjs` | Address placeholder (e.g., `http://<placeholder-host>:<placeholder-port>`); warning metadata is surfaced by `proxy-config.mjs`. |
| SMS provider / SMS 제공자 | `lib/sms-provider.mjs` (+ `docs/ALTERNATIVE-SMS-PROVIDERS.md`) | Provider selection, credentials, polling cadence. |
| OAuth callback / OAuth 콜백 | `lib/oauth-callback-server.mjs` | Loopback host/port placeholder, timeout. |
| GCP OAuth / GCP OAuth | `oauth/setup-gcp-oauth.mjs`, `bin/setup-credentials.sh` | OAuth client ID/secret (loaded from your local secret store — never committed). |
| Android target / Android 대상 | `lib/adb-utils.mjs`, `account/infrastructure/setup-emulator.mjs` | Device serial, emulator AVD name, or redroid container reference. |
| Frida runtime / Frida 런타임 | `bin/setup_frida.sh`, `account/frida-sms-hook.js` | Target host/port placeholder, server binary path. |

> 🔒 **Secrets / 시크릿.** OAuth client secrets, SMS provider keys, and 1Password service-account tokens never belong in this repository. Use the shell wrappers in `bin/` (or your own secret manager) to load them at runtime.
> OAuth 클라이언트 시크릿, SMS 제공자 키, 1Password 서비스 계정 토큰은 이 저장소에 커밋되지 않습니다. 런타임에는 `bin/` 의 셸 래퍼(또는 자체 시크릿 매니저)를 사용해 로드하세요.

---

## Commands Reference / 명령어 참조

All scripts are ESM. Run with `node path/to/script.mjs`