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

The package declares `name: "gmail"` (version `1.0.0`) and uses ESM (`"type"` implied via `.mjs`). It bundles browser-automation, Android-automation, OAuth helpers, SMS-abstracted verification, and two stdio MCP servers under one workspace. Scripts are grouped by *operational domain* (account, antigravity, openai, oauth) rather than by framework layer; all reusable logic lives in `lib/`.

이 패키지(`name: "gmail"`, version `1.0.0`)는 ESM 모듈을 사용하며 브라우저 자동화, Android 자동화, OAuth 헬퍼, SMS 추상화 기반 인증, 그리고 두 개의 stdio MCP 서버를 한 워크스페이스에 묶어 제공합니다. 스크립트는 프레임워크 계층이 아닌 *운영 도메인*(account, antigravity, openai, oauth)별로 그룹화되어 있으며, 재사용 가능한 로직은 모두 `lib/`에 위치합니다.

| Capability / 기능 | Provided By / 제공 위치 |
|---|---|
| Browser automation / 브라우저 자동화 | Playwright, Rebrowser Playwright, Puppeteer, CDP via `lib/browser-launch.mjs`, `lib/cdp-utils.mjs` |
| Android automation / Android 자동화 | Appium (`webdriverio`), ADB via `lib/adb-utils.mjs`, Frida via `bin/setup_frida.sh` |
| AI-agent integration / AI 에이전트 연동 | MCP servers in `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` |
| OAuth / OAuth | Local callback server (`lib/oauth-callback-server.mjs`) + scripts in `oauth/` |
| SMS verification abstraction / SMS 인증 추상화 | `lib/sms-provider.mjs` (provider docs: `docs/ALTERNATIVE-SMS-PROVIDERS.md`) |
| Proxy routing / 프록시 라우팅 | `lib/proxy-config.mjs`, `lib/proxy-relay.mjs`, `lib/proxy-forwarder.mjs`, `lib/free-proxy.mjs` |
| Local credential store / 로컬 자격증명 저장소 | `bin/setup-1password-service-account.sh` |

---

## Key Features / 주요 기능

- **Multi-backend browser automation / 다중 백엔드 브라우저 자동화.** A single `lib/browser-launch.mjs` wrapper launches Playwright or Rebrowser Playwright with consistent proxy/fingerprint options.
- **Two MCP stdio servers / 두 개의 MCP stdio 서버.** `account/gmail-creator-mcp.mjs` (Gmail-oriented) and `openai/openai-creator-mcp.mjs` (OpenAI-oriented) speak the Model Context Protocol over stdio for AI-agent integration.
- **Pluggable SMS provider / 플러거블 SMS 제공자.** `lib/sms-provider.mjs` exposes a uniform interface; concrete providers are documented in `docs/ALTERNATIVE-SMS-PROVIDERS.md`.
- **Reusable OAuth callback server / 재사용 가능한 OAuth 콜백 서버.** `lib/oauth-callback-server.mjs` provides timeout/close semantics for local OAuth flows.
- **Android orchestration / Android 오케스트레이션.** ADB and Frida hooks complement Appium flows; an `account/infrastructure/setup-emulator.mjs` helper prepares emulators (see `account/AGENTS.md`).
- **Shared parsing and CLI helpers / 공유 파싱·CLI 헬퍼.** `lib/cli-args.mjs` and CSV readers in MCP/pipeline scripts share conventions.
- **Local token/state maintenance / 로컬 토큰·상태 유지.** The `antigravity/` subtree handles local state files and manual protobuf encoding (`antigravity/inject-vscdb-token.mjs`).
- **1Password-backed credentials / 1Password 기반 자격증명.** `bin/setup-1password-service-account.sh` and `bin/setup_credentials.sh` provide secure credential setup helpers.

---

## Repository Layout / 저장소 구조

| Path | Purpose / 용도 |
|---|---|
| `account/` | Largest script surface; Gmail signup, verification, and warmup flows; includes its own `AGENTS.md`. |
| `antigravity/` | Local Antigravity account-state and token maintenance helpers; includes its own `AGENTS.md`. |
| `openai/` | OpenAI-oriented script and MCP surface; has its own `README.md`. |
| `oauth/` | Narrow OAuth credential and login helpers (incl. GCP OAuth setup). |
| `lib/` | Shared utilities: browser launch, CDP, ADB, CLI parsing, proxy, OAuth callback, SMS provider, token exchange, verification pipeline, fingerprinting, behavior profile. |
| `bin/` | Shell wrappers: emulator setup, Frida setup, 1Password service-account setup, credential setup, `xdg-open` helper. |
| `tests/` | Script-driven smoke checks (no test framework configured). |
| `docs/` | Writeups: `ALTERNATIVE-SMS-PROVIDERS.md`, `QUICKSTART.md`, `adb-gmail-creation.md`, `verification-bypass-analysis.md`. |
| `data/` | Project data inputs (e.g. `warmup-progress.json`). |
| `complete.csv`, `openai-accounts.csv` | Account batch input files at repository root. |
| `package.json`, `package-lock.json` | npm manifest and lockfile (note: `npm test` is a placeholder). |
| `tmp/` | Throwaway scripts and UI dumps for debugging. |

> Scripts are ESM (`.mjs`) and grouped by operational domain, not by framework layer. (AGENTS.md)

---

## Architecture / 아키텍처

### Layered View / 계층 구조

| Layer | Role | Examples |
|---|---|---|
| Domain scripts / 도메인 스크립트 | Per-workflow entry points | `account/create-accounts.mjs`, `antigravity/antigravity-pipeline.mjs`, `openai/create-accounts.mjs`, `oauth/setup-gcp-oauth.mjs` |
| MCP servers (stdio) / MCP 서버 | AI-agent integration surfaces | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` |
| Shared library / 공유 라이브러리 | Cross-cutting helpers | `lib/browser-launch.mjs`, `lib/cdp-utils.mjs`, `lib/adb-utils.mjs`, `lib/cli-args.mjs`, `lib/oauth-callback-server.mjs`, `lib/proxy-config.mjs`, `lib/sms-provider.mjs`, `lib/verification-pipeline.mjs`, `lib/token-exchange.mjs`, `lib/google-auth-browser.mjs`, `lib/fingerprint-config.mjs`, `lib/behavior-profile.mjs`, `lib/antigravity-shared.mjs` |
| Shell wrappers / 셸 래퍼 | Environment and credential bootstrap | `bin/setup-*.sh`, `bin/create-gmail.sh`, `bin/xdg-open` |
| Inputs / 입력 | Batch and config | `complete.csv`, `openai-accounts.csv`, `data/warmup-progress.json` |

### Request Flow (MCP → Script) / 요청 흐름 (MCP → 스크립트)

1. AI agent invokes an MCP tool over stdio. / AI 에이전트가 stdio로 MCP 도구를 호출합니다.
2. The MCP server (`gmail-creator-mcp.mjs` or `openai-creator-mcp.mjs`) parses the input, registers the job, and dispatches. / MCP 서버가 입력을 파싱하고 작업을 등록한 뒤 디스패치합니다.
3. The MCP server hands off to a domain script (e.g. `create-accounts.mjs`), which calls `lib/browser-launch.mjs` for browser context. / MCP 서버는 도메인 스크립트에 핸드오프하며, 해당 스크립트는 브라우저 컨텍스트를 위해 `lib/browser-launch.mjs`를 호출합니다.
4. Browser/CDP/ADB flows run; SMS provider, OAuth callback server, and proxy helpers are pulled in as needed. / 브라우저/CDP/ADB 플로우가 실행되며, 필요에 따라 SMS 제공자, OAuth 콜백 서버, 프록시 헬퍼가 호출됩니다.
5. Results are persisted to local CSVs / JSON state files in `data/`. / 결과는 로컬 CSV / JSON 상태 파일(`data/`)에 저장됩니다.
6. MCP server returns the result to the agent over stdout. / MCP 서버는 결과를 stdout을 통해 에이전트에 반환합니다.

> **MCP stdout rule / MCP stdout 규칙.** In MCP server files, stdout is reserved for protocol messages. All diagnostics must use stderr. (AGENTS.md)

---

## Quick Start / 빠른 시작

### Prerequisites / 사전 요구 사항

| Tool | Purpose | Notes |
|---|---|---|
| Node.js ≥ 18 | ESM runtime | `.mjs` modules used throughout |
| npm | Dependency install | `package-lock.json` is present |
| Chromium / Chrome | Playwright/Puppeteer targets | Headless Linux must be assumed (no X server) |
| Android SDK + `adb` | Android flows | Used by `lib/adb-utils.mjs` and emulator setup |
| Appium server | Mobile automation | `@playwright/mcp` is bundled; Appium server is external |
| Frida | Runtime hooks | Setup via `bin/setup_frida.sh` |
| `1Password` CLI (optional) | Credential bootstrap | Setup via `bin/setup-1password-service-account.sh` |

### Install / 설치

```bash
git clone <repo-url> gmail
cd gmail
npm install
```

### First Run / 첫 실행

```bash
# 1) Configure credentials / 자격증명 설정
./bin/setup_credentials.sh             # generic credential helper
./bin/setup-1password-service-account.sh   # optional, if using 1Password

# 2) Prepare GCP OAuth / GCP OAuth 준비
node oauth/setup-gcp-oauth.mjs

# 3) Run a domain script / 도메인 스크립트 실행
node account/create-accounts.mjs --help
node openai/create-accounts.mjs --help
```

> CLI flag names vary per script; each script parses `process.argv` directly via `lib/cli-args.mjs`. Run with `--help` where supported to inspect local flags.

---

## Configuration / 설정

### Input Files / 입력 파일

| File | Format | Used By |
|---|---|---|
| `complete.csv` | Multi-line CSV | `account/gmail-creator-mcp.mjs` and account flows |
| `openai-accounts.csv` | CSV | `openai/openai-creator-mcp.mjs` and OpenAI flows |
| `data/warmup-progress.json` | JSON | Warmup progress tracking |

### Environment / 환경 변수

Many scripts expect the operator to provide credentials and provider secrets via environment variables or through the 1Password helper. Refer to:

- `docs/QUICKSTART.md` for an end-to-end bootstrap.
- `docs/ALTERNATIVE-SMS-PROVIDERS.md` for SMS provider keys and selectors.
- `docs/adb-gmail-creation.md` for ADB-side prerequisites.

### Browser / Fingerprint / Proxy

- Browser launch options are normalized in `lib/browser-launch.mjs`.
- Fingerprint and behavior profiles live in `lib/fingerprint-config.mjs` and `lib/behavior-profile.mjs`.
- Proxy options and warning metadata are produced by `lib/proxy-config.mjs`; relay/forwarder helpers are in `lib/proxy-relay.mjs` and `lib/proxy-forwarder.mjs`; free-proxy discovery is in `lib/free-proxy.mjs`.

---

## Commands Reference / 명령어 참조

### Domain Scripts / 도메인 스크립트

| Script | Purpose |
|---|---|
| `node account/create-accounts.mjs` | Batch Gmail account orchestration (entry point: `main`). |
| `node account/create-accounts-cdp.mjs` | CDP-driven signup variant. |
| `node account/create-accounts-adb.mjs` | ADB-driven signup variant. |
| `node account/create-accounts-appium.mjs` | Appium-driven signup variant. |
| `node account/youtube-signup.mjs`, `account/youtube-signup-cdp.mjs` | YouTube signup variants. |
| `node account/redroid-signup-cdp.mjs` | Redroid + CDP signup variant. |
| `node account/puppeteer-gmail.mjs` | Puppeteer-driven Gmail flow. |
| `node account/warmup-account.mjs` | Warmup a single account. |
| `node account/verify-account.mjs`, `account/verify-all-accounts.mjs`, `account/verify-age.mjs` | Verification helpers. |
| `node account/check-account-exists.mjs`, `account/diagnostic-login.mjs`, `account/direct-login-test.mjs`, `account/cdp-login-test.mjs` | Login diagnostics. |
| `node account/family-group.mjs`, `account/test-partner-oauth.mjs` | Family/partner OAuth tests. |
| `node account/process-batch-verification.mjs`, `account/infrastructure-diagnostic.mjs`, `account/debug-sms-capture.mjs` | Pipeline and SMS diagnostics. |
| `node account/infrastructure/setup-emulator.mjs` | Emulator preparation. |
| `node antigravity/antigravity-pipeline.mjs` | Antigravity account-state orchestration (entry point: `main`). |
| `node antigravity/antigravity-auth.mjs` | Antigravity authentication helper. |
| `node antigravity/manual-token-acquire.mjs`, `antigravity/inject-vscdb-token.mjs`, `antigravity/unlock-features.mjs` | Token and feature state maintenance. |
| `node openai/create-accounts.mjs`, `node openai/check-accounts.mjs` | OpenAI account batch operations. |
| `node oauth/setup-gcp-oauth.mjs`, `node oauth/oauth-login.mjs` | GCP OAuth setup and OAuth login helpers. |

### MCP Servers / MCP 서버

| Command | Role |
|---|---|
| `node account/gmail-creator-mcp.mjs` | Gmail-oriented MCP stdio server. |
| `node openai/openai-creator-mcp.mjs` | OpenAI-oriented MCP stdio server. |

Configure your AI agent's MCP client to launch one of these over stdio.

### Shell Wrappers / 셸 래퍼

| Script | Purpose |
|---|---|
| `./bin/create-gmail.sh` | Convenience wrapper around Gmail creation. |
| `./bin/setup_credentials.sh` | Generic credential setup. |
| `./bin/setup-1password-service-account.sh` | 1Password service-account bootstrap. |
| `./bin/setup_frida.sh` | Frida runtime setup. |
| `./bin/xdg-open` | Local URL interception helper used by flows. |

---

## Local Development / 로컬 개발

- **Module system / 모듈 시스템.** All scripts are ESM (`.mjs`); the codebase avoids CommonJS. Preserve existing flag names when editing CLI parsing (AGENTS.md).
- **Shared helpers / 공유 헬퍼.** Prefer reuse from `lib/` over copying flow-local helpers — especially `lib/browser-launch.mjs`, `lib/cli-args.mjs`, `lib/oauth-callback-server.mjs`, `lib/proxy-config.mjs`, and `lib/antigravity-shared.mjs`.
- **Headless assumption / 헤드리스 가정.** Browser flows must work under headless Linux; do not assume an X server is available.
- **MCP diagnostics / MCP 진단 출력.** In `account/gmail-creator-mcp.mjs` and `openai/openai-creator-mcp.mjs`, never use `console.log`; stdout is the MCP channel. Use `console.error` or stderr for diagnostics.
- **CSV parsing / CSV 파싱.** `parseAccountsCsv` (in `account/gmail-creator-mcp.mjs` and `antigravity/antigravity-pipeline.mjs`) is multiline-tolerant — keep it that way when extending.
- **Domain guidance / 도메인 가이드.** Read `account/AGENTS.md`, `antigravity/AGENTS.md`, `openai/AGENTS.md`, and `lib/AGENTS.md` for module-specific conventions before editing.
- **Linting / 린팅.** No linter is configured in `package.json`; follow existing code style (single quotes, 2-space indent, trailing commas consistent with surrounding code).

---

## Testing / 테스트

- `npm test` is a placeholder (`echo "Error: no test specified" && exit 1`); it does **not** execute the smoke checks.
- The script-driven smoke check lives at `tests/gmail-creator-mcp-smoke.mjs` — invoke it directly:

```bash
node tests/gmail-creator-mcp-smoke.mjs
```

- `tests/qa-manual.mjs` is a manual QA script.
- `tmp/` contains throwaway debug scripts and UI dumps (e.g. `tmp/ui.xml`, `tmp/debug-selects.mjs`, `tmp/sms-fast-v2.mjs`); not part of the test suite.

---

## Documentation / 문서

| Document | Topic |
|---|---|
| `docs/QUICKSTART.md` | End-to-end bootstrap. |
| `docs/ALTERNATIVE-SMS-PROVIDERS.md` | SMS provider options and integration notes. |
| `docs/adb-gmail-creation.md` | ADB-driven Gmail creation walkthrough. |
| `docs/verification-bypass-analysis.md` | Verification pipeline analysis (read-only research notes). |
| `openai/README.md` | OpenAI subtree-specific notes. |
| `account/AGENTS.md`, `antigravity/AGENTS.md`, `lib/AGENTS.md` | Module-level conventions for contributors. |
| `CONTRIBUTING.md` | Contribution guidelines. |

> Do not mirror operational examples into AGENTS files — keep them maintenance/diagnostic-only. (AGENTS.md)

---

## Contributing / 기여

1. Read the relevant `AGENTS.md` for the module you are editing.
2. Prefer shared helpers in `lib/`; do not duplicate browser launch, CLI parsing, OAuth callback, or proxy normalization logic.
3. Preserve CLI flag names of existing scripts.
4. In MCP server files, never use `console.log`; stdout is the protocol channel.
5. Run the smoke check before submitting changes:

```bash
node tests/gmail-creator-mcp-smoke.mjs
```

6. Follow `CONTRIBUTING.md` for pull-request and review conventions.

---

## License / 라이선스

Released under the **ISC License** (see `LICENSE`).

본 프로젝트는 **ISC 라이선스** 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.