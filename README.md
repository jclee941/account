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
10. [Documentation / 문서](#문서)
11. [Contributing / 기여](#contributing--기여)
12. [License / 라이선스](#license--라이선스)

---

## Overview / 개요

The package declares `name: "gmail"`, `version: "1.0.0"`, and `license: "ISC"` in `package.json`. It is an ESM-only workspace (`"type"` is implicit through `.mjs` extensions) with no build step and no transpiled output — every script is run directly with Node.

The workspace targets four overlapping automation surfaces:

- **Browser automation** — Playwright (`rebrowser-playwright`) and Puppeteer, with `ghost-cursor-playwright` for humanized cursor movement and `@playwright/mcp` for AI-agent browser control.
- **Android automation** — Appium (`webdriverio`) and ADB for emulator/real-device flows, plus Frida hooks for runtime instrumentation (see `account/frida-sms-hook.js`).
- **MCP servers for AI agents** — Two Model Context Protocol servers communicate over stdio: `account/gmail-creator-mcp.mjs` and `openai/openai-creator-mcp.mjs`. Both register tools, manage jobs, and parse CSV inputs.
- **Local OAuth & state helpers** — A reusable callback server (`lib/oauth-callback-server.mjs`), local state readers/writers for Antigravity (`antigravity/`, `lib/antigravity-shared.mjs`), and credential exchange wrappers.

Operator-facing artifacts (CSVs, JSON results, screenshots, dumps) are produced alongside the scripts in their respective folders; nothing is uploaded by the toolkit itself.

`package.json`은 `name: "gmail"`, `version: "1.0.0"`, `license: "ISC"`을 선언합니다. ESM 전용 워크스페이스이며 (`.mjs` 확장자 사용) 빌드 단계나 트랜스파일된 출력이 없습니다 — 모든 스크립트는 Node로 직접 실행됩니다.

이 워크스페이스는 네 가지 자동화 영역을 대상으로 합니다:

- **브라우저 자동화** — Playwright(`rebrowser-playwright`)와 Puppeteer, `ghost-cursor-playwright`로 사람 같은 커서 움직임 구현, `@playwright/mcp`로 AI 에이전트 브라우저 제어.
- **Android 자동화** — 에뮬레이터/실제 디바이스 플로우용 Appium(`webdriverio`)과 ADB, 런타임 인스트루멘테이션용 Frida 훅(`account/frida-sms-hook.js`).
- **AI 에이전트용 MCP 서버** — 두 개의 Model Context Protocol 서버가 stdio로 통신: `account/gmail-creator-mcp.mjs`와 `openai/openai-creator-mcp.mjs`. 도구 등록, 작업 관리, CSV 파싱을 수행합니다.
- **로컬 OAuth & 상태 헬퍼** — 재사용 가능한 콜백 서버(`lib/oauth-callback-server.mjs`), Antigravity용 로컬 상태 읽기/쓰기(`antigravity/`, `lib/antigravity-shared.mjs`), 자격 증명 교환 래퍼.

운영자용 산출물(CSV, JSON 결과, 스크린샷, 덤프)은 각 폴더의 스크립트 옆에 생성됩니다. 툴킷 자체는 아무것도 업로드하지 않습니다.

---

## Key Features / 주요 기능

| Area / 영역 | Capability / 기능 |
|---|---|
| Browser engines / 브라우저 엔진 | Playwright (rebrowser), Puppeteer, Chrome DevTools Protocol direct access / Playwright(rebrowser), Puppeteer, CDP 직접 접근 |
| Android / Android | Appium via WebdriverIO, ADB orchestration, Frida runtime hooks / WebdriverIO 기반 Appium, ADB 오케스트레이션, Frida 런타임 훅 |
| MCP servers / MCP 서버 | Gmail-oriented and OpenAI-oriented stdio servers; CSV-driven job queues / Gmail 지향 및 OpenAI 지향 stdio 서버, CSV 기반 작업 큐 |
| OAuth / OAuth | Local callback server with timeout/close semantics, GCP OAuth setup helper, token exchange wrapper / 타임아웃/종료 시맨틱이 있는 로컬 콜백 서버, GCP OAuth 설정 헬퍼, 토큰 교환 래퍼 |
| Network / 네트워크 | Pluggable proxy configuration, free-proxy helpers, proxy forwarder/relay / 플러거블 프록시 설정, free-proxy 헬퍼, 프록시 포워더/릴레이 |
| Humanization / 인간화 | `ghost-cursor-playwright` trajectories, behavior profiles, fingerprint configuration / `ghost-cursor-playwright` 궤적, 행동 프로필, 핑거프린트 설정 |
| SMS / SMS | Provider abstraction layer with multi-line CSV parsing / 다중 라인 CSV 파싱이 있는 제공자 추상화 계층 |
| Verification / 인증 | Multi-stage pipeline, retry policy, batch verification, age verification, partner OAuth tests / 다단계 파이프라인, 재시도 정책, 배치 인증, 나이 인증, 파트너 OAuth 테스트 |
| Token state / 토큰 상태 | Antigravity vscdb protobuf encoding, manual token acquire, unlock features / Antigravity vscdb 프로토버프 인코딩, 수동 토큰 획득, 기능 잠금 해제 |

---

## Repository Layout / 저장소 구조

```text
.
├── account/                 # Main script surface & Gmail-oriented MCP server
│   ├── AGENTS.md
│   ├── create-accounts.mjs  # Batch orchestration entry point
│   ├── gmail-creator-mcp.mjs
│   ├── infrastructure/      # Emulator setup
│   └── ...                  # CDP / Appium / diagnostic / verification scripts
├── antigravity/             # Antigravity account-state and token maintenance
│   ├── AGENTS.md
│   ├── antigravity-pipeline.mjs
│   ├── antigravity-auth.mjs
│   ├── inject-vscdb-token.mjs
│   ├── manual-token-acquire.mjs
│   └── unlock-features.mjs
├── lib/                     # Shared utilities (browser, CLI, callback, proxy, CDP, ADB)
│   ├── AGENTS.md
│   ├── browser-launch.mjs
│   ├── cli-args.mjs
│   ├── oauth-callback-server.mjs
│   ├── proxy-config.mjs
│   ├── proxy-forwarder.mjs
│   ├── proxy-relay.mjs
│   ├── free-proxy.mjs
│   ├── sms-provider.mjs
│   ├── verification-pipeline.mjs
│   ├── token-exchange.mjs
│   ├── google-auth-browser.mjs
│   ├── behavior-profile.mjs
│   ├── fingerprint-config.mjs
│   ├── cdp-utils.mjs
│   ├── adb-utils.mjs
│   └── antigravity-shared.mjs
├── oauth/                   # Narrow OAuth credential/login helpers
│   ├── oauth-login.mjs
│   └── setup-gcp-oauth.mjs
├── openai/                  # OpenAI-oriented script and MCP surface
│   ├── AGENTS.md
│   ├── README.md
│   ├── openai-creator-mcp.mjs
│   ├── create-accounts.mjs
│   └── check-accounts.mjs
├── tests/                   # MCP smoke checks
│   ├── gmail-creator-mcp-smoke.mjs
│   └── qa-manual.mjs
├── docs/                    # Writeups / design notes
│   ├── ALTERNATIVE-SMS-PROVIDERS.md
│   ├── QUICKSTART.md
│   ├── adb-gmail-creation.md
│   └── verification-bypass-analysis.md
├── bin/                     # Shell wrappers & URL interception
│   ├── create-gmail.sh
│   ├── setup-1password-service-account.sh
│   ├── setup-credentials.sh
│   ├── setup_frida.sh
│   └── xdg-open
├── data/                    # Project data inputs
│   └── warmup-progress.json
├── tmp/                     # Scratch / experimental scripts
├── package.json
├── package-lock.json
├── complete.csv
├── openai-accounts.csv
├── AGENTS.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

`tmp/` is intentionally outside the supported surface — contents there are scratch or experimental and are not part of the maintained scripts.

`tmp/`는 의도적으로 지원되는 영역 밖에 있습니다 — 그 안의 내용은 임시 또는 실험용이며 유지 관리되는 스크립트에 속하지 않습니다.

---

## Architecture / 아키텍처

### Module responsibilities / 모듈 책임

| Folder / 폴더 | Responsibility / 책임 | Notable exports / 주요 모듈 |
|---|---|---|
| `account/` | Per-account flows, batch orchestration, Gmail MCP server, CDP/Appium/ADB entry points / 계정별 플로우, 배치 오케스트레이션, Gmail MCP 서버, CDP/Appium/ADB 진입점 | `create-accounts.mjs`, `gmail-creator-mcp.mjs`, `puppeteer-gmail.mjs`, `frida-sms-hook.js` |
| `antigravity/` | Local state reads/writes, manual token acquire, vscdb protobuf injection / 로컬 상태 읽기/쓰기, 수동 토큰 획득, vscdb 프로토버프 주입 | `antigravity-pipeline.mjs`, `inject-vscdb-token.mjs` |
| `lib/` | Cross-cutting helpers: browser launch, CLI parsing, callback server, proxy normalization, CDP/ADB utils, CSV parsing, verification pipeline / 횡단 헬퍼: 브라우저 실행, CLI 파싱, 콜백 서버, 프록시 정규화, CDP/ADB 유틸, CSV 파싱, 인증 파이프라인 | `browser-launch.mjs`, `oauth-callback-server.mjs`, `proxy-config.mjs`, `cli-args.mjs`, `verification-pipeline.mjs` |
| `oauth/` | Narrow OAuth setup and login flows / 좁은 범위의 OAuth 설정 및 로그인 플로우 | `setup-gcp-oauth.mjs`, `oauth-login.mjs` |
| `openai/` | OpenAI-oriented account helpers and a parallel MCP server / OpenAI 지향 계정 헬퍼와 병렬 MCP 서버 | `openai-creator-mcp.mjs`, `create-accounts.mjs` |
| `tests/` | Script-driven MCP smoke checks / 스크립트 기반 MCP 스모크 체크 | `gmail-creator-mcp-smoke.mjs` |
| `bin/` | Shell wrappers and `xdg-open` override for URL interception / 셸 래퍼와 URL 인터셉션을 위한 `xdg-open` 오버라이드 | `setup_frida.sh`, `setup-credentials.sh`, `xdg-open` |
| `docs/` | Long-form writeups; review before operational reuse / 장문 문서, 운영 재사용 전 검토 | `QUICKSTART.md`, `ALTERNATIVE-SMS-PROVIDERS.md`, `adb-gmail-creation.md` |
| `data/` | Static inputs (e.g. warmup progress) / 정적 입력 (예: 워밍업 진행 상황) | `warmup-progress.json` |

### Request flow / 요청 흐름 (high-level)

1. **Operator input / 운영자 입력** — CSV at repo root (`complete.csv`, `openai-accounts.csv`) or CLI flags parsed by `lib/cli-args.mjs`. / 저장소 루트의 CSV(`complete.csv`, `openai-accounts.csv`) 또는 `lib/cli-args.mjs`로 파싱된 CLI 플래그.
2. **MCP server pickup (optional) / MCP 서버 픽업 (선택)** — An AI agent launches `account/gmail-creator-mcp.mjs` or `openai/openai-creator-mcp.mjs` over stdio and calls a registered tool. / AI 에이전트가 `account/gmail-creator-mcp.mjs` 또는 `openai/openai-creator-mcp.mjs`를 stdio로 실행하고 등록된 도구를 호출.
3. **Script dispatch / 스크립트 디스패치** — `create-accounts.mjs` (`main`) iterates rows, calls `createAccountWithRetries` for per-row retry policy. / `create-accounts.mjs`(`main`)이 행을 순회하며 행별 재시도 정책으로 `createAccountWithRetries`를 호출.
4. **Browser launch / 브라우저 실행** — `lib/browser-launch.mjs` produces a Playwright/Rebrowser context with proxy options from `lib/proxy-config.mjs` and behavior/fingerprint from `lib/behavior-profile.mjs` + `lib/fingerprint-config.mjs`. / `lib/browser-launch.mjs`가 `lib/proxy-config.mjs`의 프록시 옵션과 `lib/behavior-profile.mjs` + `lib/fingerprint-config.mjs`의 행동/핑거프린트로 Playwright/Rebrowser 컨텍스트를 생성.
5. **Network / SMS / Verification / 네트워크 · SMS · 인증** — `lib/proxy-forwarder.mjs` / `lib/proxy-relay.mjs` route traffic; `lib/sms-provider.mjs` handles code retrieval; `lib/verification-pipeline.mjs` runs the multi-stage policy. / `lib/proxy-forwarder.mjs` / `lib/proxy-relay.mjs`가 트래픽 라우팅, `lib/sms-provider.mjs`가 코드 수신, `lib/verification-pipeline.mjs`가 다단계 정책 실행.
6. **OAuth callback / OAuth 콜백** — `lib/oauth-callback-server.mjs` (`createCallbackServer`) waits on a local port with a timeout; the script uses the captured `code` via `lib/token-exchange.mjs` or `oauth/setup-gcp-oauth.mjs`. / `lib/oauth-callback-server.mjs`(`createCallbackServer`)가 타임아웃과 함께 로컬 포트에서 대기, 스크립트는 캡처된 `code`를 `lib/token-exchange.mjs` 또는 `oauth/setup-gcp-oauth.mjs`로 사용.
7. **State persistence / 상태 영속화** — Antigravity flows read/write local state through `lib/antigravity-shared.mjs`; `antigravity/inject-vscdb-token.mjs` performs manual protobuf encoding with `encodeOAuthTokenInfo`. / Antigravity 플로우는 `lib/antigravity-shared.mjs`를 통해 로컬 상태를 읽기/쓰기, `antigravity/inject-vscdb-token.mjs`는 `encodeOAuthTokenInfo`로 수동 프로토버프 인코딩.
8. **Artifacts / 산출물** — CSVs, JSON, screenshots, and dumps are written next to the invoking script. / CSV, JSON, 스크린샷, 덤프는 호출 스크립트 옆에 기록.

### Key symbols / 주요 심볼

| Symbol | Type | Location | Role |
|---|---|---|---|
| `main` | function | `account/create-accounts.mjs` | Batch orchestration entry point / 배치 오케스트레이션 진입점 |
| `createAccountWithRetries` | function | `account/create-accounts.mjs` | Per-row retry/failure policy / 행별 재시도/실패 정책 |
| `Server` setup | top-level | `account/gmail-creator-mcp.mjs` | Tool registration, job management, CSV parsing / 도구 등록, 작업 관리, CSV 파싱 |
| `parseAccountsCsv` | function | `account/gmail-creator-mcp.mjs`, `antigravity/antigravity-pipeline.mjs` | Multiline-tolerant CSV record parsing / 다중 라인 허용 CSV 레코드 파싱 |
| `main` | function | `antigravity/antigravity-pipeline.mjs` | Local account-state orchestration entry point / 로컬 계정 상태 오케스트레이션 진입점 |
| `encodeOAuthTokenInfo` | function | `antigravity/inject-vscdb-token.mjs` | Manual protobuf encoding for local state writes / 로컬 상태 쓰기용 수동 프로토버프 인코딩 |
| `createCallbackServer` | function | `lib/oauth-callback-server.mjs` | Local HTTP callback server with timeout/close semantics / 타임아웃/종료 시맨틱이 있는 로컬 HTTP 콜백 서버 |
| `launchBrowser` | function | `lib/browser-launch.mjs` | Shared Playwright/Rebrowser launch wrapper / 공유 Playwright/Rebrowser 실행 래퍼 |
| `parseCliArgs` | function | `lib/cli-args.mjs` | Shared simple CLI parser for email/password scripts / 이메일/비밀번호 스크립트용 간단한 공유 CLI 파서 |
| `createProxyConfig` | function | `lib/proxy-config.mjs` | Proxy option normalization and warning metadata / 프록시 옵션 정규화 및 경고 메타데이터 |
| `Server` setup | top-level | `openai/openai-creator-mcp.mjs` | Separate MCP stdio server surface / 별도 MCP stdio 서버 영역 |

---

## Quick Start / 빠른 시작

### Prerequisites / 사전 요구사항

- Node.js (ESM runtime; tested against current LTS majors).
- For browser scripts: a working Playwright/Rebrowser install and (for headed mode) an X server.
- For Android scripts: `adb` on `PATH`, an emulator/real device reachable over ADB, and (for Frida) `frida-server` matching the device architecture.
- 1Password service account credentials reachable through the wrapper in `bin/setup-1password-service-account.sh` (if you choose that credential store).

- Node.js (ESM 런타임; 현재 LTS 메이저 기준).
- 브라우저 스크립트용: 동작하는 Playwright/Rebrowser 설치, (헤디드 모드의 경우) X 서버.
- Android 스크립트용: `PATH`의 `adb`, ADB로 접근 가능한 에뮬레이터/실제 디바이스, (Frida용) 디바이스 아키텍처와 일치하는 `frida-server`.
- `bin/setup-1password-service-account.sh`의 래퍼를 통해 접근 가능한 1Password 서비스 계정 자격 증명 (해당 자격 증명 저장소를 선택한 경우).

### Install / 설치

```bash
git clone <repository-url> gmail
cd gmail
npm install
```

### First run / 첫 실행

```bash
# 1) Provision credentials (choose one path)
# 자격 증명 준비 (한 가지 경로 선택)
./bin/setup-credentials.sh
# or / 또는
./bin/setup-1password-service-account.sh

# 2) (Optional) Configure GCP OAuth / (선택) GCP OAuth 설정
node oauth/setup-gcp-oauth.mjs

# 3) Run the Gmail creator MCP server (for an AI agent)
# Gmail creator MCP 서버 실행 (AI 에이전트용)
node account/gmail-creator-mcp.mjs

# 4) Or run the batch orchestrator directly
# 또는 배치 오케스트레이터 직접 실행
node account/create-accounts.mjs
```

> ℹ️  Headless Linux note / 헤드리스 Linux 참고. Browser flows must account for headless Linux — do not assume headed mode works without an X server. When in doubt, set `HEADLESS=1` (or your script's equivalent) or use `xvfb-run`.
>
> 브라우저 플로우는 헤드리스 Linux를 고려해야 합니다 — X 서버 없이 헤디드 모드가 동작한다고 가정하지 마세요. 확신이 없으면 `HEADLESS=1`(또는 스크립트에 상응하는 값)을 설정하거나 `xvfb-run`을 사용하세요.

---

## Configuration / 설정

Configuration is mostly **file- and CLI-flag-driven** rather than environment-variable-driven. Most scripts accept flags directly from `process.argv`; preserve existing flag names when extending.

설정은 대부분 환경 변수가 아닌 **파일 및 CLI 플래그 기반**입니다. 대부분의 스크립트는 `process.argv`에서 직접 플래그를 받습니다. 확장할 때 기존 플래그 이름을 유지하세요.

| Surface / 영역 | Source / 출처 | Notes / 참고 |
|---|---|---|
| Account data / 계정 데이터 | `complete.csv`, `openai-accounts.csv` at repo root / 저장소 루트의 `complete.csv`, `openai-accounts.csv` | Multiline-tolerant; see `parseAccountsCsv`. / 다중 라인 허용, `parseAccountsCsv` 참조. |
| MCP inputs / MCP 입력 | Tool arguments passed over stdio / stdio로 전달되는 도구 인수 | Server registers tools at startup; see `Server` setup entries. / 서버는 시작 시 도구 등록. |
| CLI flags / CLI 플래그 | `process.argv` parsed by `lib/cli-args.mjs` | Preserve existing flag names when editing. / 편집 시 기존 플래그 이름 유지. |
| Browser proxy / 브라우저 프록시 | Normalized through `lib/proxy-config.mjs` / `lib/proxy-config.mjs`로 정규화 | Warning metadata is emitted on stderr, not stdout. / 경고 메타데이터는 stdout이 아닌 stderr로 출력. |
| Free proxy list / 무료 프록시 목록 | `lib/free-proxy.mjs` | Returns structured proxy records. / 구조화된 프록시 레코드 반환. |
| SMS provider / SMS 제공자 | `lib/sms-provider.mjs` | Pluggable; see `docs/ALTERNATIVE-SMS-PROVIDERS.md` for alternatives. / 플러거블, 대안은 `docs/ALTERNATIVE-SMS-PROVIDERS.md` 참조. |
| Antigravity state files / Antigravity 상태 파일 | Read/written by `lib/antigravity-shared.mjs` / `lib/antigravity-shared.mjs`로 읽기/쓰기 | Manual protobuf encoding in `antigravity/inject-vscdb-token.mjs`. / `antigravity/inject-vscdb-token.mjs`의 수동 프로토버프 인코딩. |
| Warmup progress / 워밍업 진행 | `data/warmup-progress.json` | Read by warmup orchestrator. / 워밍업 오케스트레이터가 읽음. |
| `xdg-open` override / `xdg-open` 오버라이드 | `bin/xdg-open` | Place earlier in `PATH` to intercept URL opens. / URL 열기를 인터셉트하려면 `PATH` 앞쪽에 배치. |

> 🔐 **Never commit secrets / 시크릿을 커밋하지 마세요.** `complete.csv`, JSON result files, and downloaded keys are local artifacts. Add them to your local ignore list and rotate any credential that lands in source control.
>
> `complete.csv`, JSON 결과 파일, 다운로드된 키는 로컬 산출물입니다. 로컬 무시 목록에 추가하고 소스 컨트롤에 들어간 모든 자격 증명을 회전시키세요.

---

## Commands Reference / 명령어 참조

> Most scripts in this workspace are run directly with `node` rather than through `npm` scripts. The `package.json` `"test"` entry is currently a placeholder.
>
> 이 워크스페이스의 대부분의 스크립트는 `npm` 스크립트가 아닌 `node`로 직접 실행됩니다. `package.json`의 `"test"` 항목은 현재 자리 표시자입니다.

| Task / 작업 | Command / 명령 | Notes / 참고 |
|---|---|---|
| Run Gmail creator MCP / Gmail creator MCP 실행 | `node account/gmail-creator-mcp.mjs` | stdio transport; diagnostics on stderr only. / stdio 전송, 진단은 stderr만. |
| Run OpenAI creator MCP / OpenAI creator MCP 실행 | `node openai/openai-creator-mcp.mjs` | Parallel server; same stdio rules. / 병렬 서버, 동일한 stdio 규칙. |
| Batch account creation / 배치 계정 생성 | `node account/create-accounts.mjs` | Reads `complete.csv` by default. / 기본적으로 `complete.csv` 읽음. |
| Batch OpenAI accounts / OpenAI 계정 배치 | `node openai/create-accounts.mjs` | Reads `openai-accounts.csv`. / `openai-accounts.csv` 읽음. |
| Check OpenAI accounts / OpenAI 계정 확인 | `node openai/check-accounts.mjs` | Status pass. / 상태 확인. |
| Setup GCP OAuth / GCP OAuth 설정 | `node oauth/setup-gcp-oauth.mjs` | One-time credential bootstrap. / 일회성 자격 증명 부트스트랩. |
| OAuth login flow / OAuth 로그인 플로우 | `node oauth/oauth-login.mjs` | Uses `lib/oauth-callback-server.mjs`. / `lib/oauth-callback-server.mjs` 사용. |
| Antigravity pipeline / Antigravity 파이프라인 | `node antigravity/antigravity-pipeline.mjs` | Local state orchestration. / 로컬 상태 오케스트레이션. |
| Inject vscdb token / vscdb 토큰 주입 | `node antigravity/inject-vscdb-token.mjs` | Manual protobuf encoding. / 수동 프로토버프 인코딩. |
| Manual token acquire / 수동 토큰 획득 | `node antigravity/manual-token-acquire.mjs` | Operator-driven. / 운영자 주도. |
| Unlock features / 기능 잠금 해제 | `node antigravity/unlock-features.mjs` | Post-acquisition hook. / 획득 후 훅. |
| CDP-based signup / CDP 기반 가입 | `node account/youtube-signup-cdp.mjs`, `node account/redroid-signup-cdp.mjs` | Direct CDP, no Playwright. / Playwright 없이 직접 CDP. |
| Appium-based signup / Appium 기반 가입 | `node account/create-accounts-appium.mjs` | Uses WebdriverIO. / WebdriverIO 사용. |
| ADB-based signup / ADB 기반 가입 | `node account/create-accounts-adb.mjs` | Pure ADB path. / 순수 ADB 경로. |
| Diagnostic login / 진단 로그인 | `node account/diagnostic-login.mjs`, `node account/direct-login-test.mjs` | Compare paths. / 경로 비교. |
| Verification pipeline / 인증 파이프라인 | `node account/verify-account.mjs`, `node account/verify-all-accounts.mjs`, `node account/verify-age.mjs` | Single, batch, age. / 단일, 배치, 나이. |
| Warmup / 워밍업 | `node account/warmup-account.mjs` | Persists to `data/warmup-progress.json`. / `data/warmup-progress.json`에 영속화. |
| Family group / 가족 그룹 | `node account/family-group.mjs` | Group maintenance. / 그룹 유지 관리. |
| Frida SMS hook / Frida SMS 훅 | `node account/frida-sms-hook.js` | Load via `frida` CLI on a hooked process. / 후크된 프로세스에서 `frida` CLI로 로드. |
| Emulator setup / 에뮬레이터 설정 | `node account/infrastructure/setup-emulator.mjs` | Bring-up helper. / 부팅 헬퍼. |
| Shell: credentials / 셸: 자격 증명 | `./bin/setup-credentials.sh` | Operator prompt. / 운영자 프롬프트. |
| Shell: 1Password SA / 셸: 1Password SA | `./bin/setup-1password-service-account.sh` | Service-account bootstrap. / 서비스 계정 부트스트랩. |
| Shell: Frida setup / 셸: Frida 설정 | `./bin/setup_frida.sh` | Installs `frida-server` to device. / 디바이스에 `frida-server` 설치. |
| Smoke test / 스모크 테스트 | `node tests/gmail-creator-mcp-smoke.mjs` | Script-driven, not part of `npm test`. / 스크립트 기반, `npm test`에 포함되지 않음. |
| QA manual / QA 매뉴얼 | `node tests/qa-manual.mjs` | Operator walkthrough. / 운영자 워크스루. |

---

## Local Development / 로컬 개발

### Conventions / 컨벤션

- All scripts are **ESM** (`.mjs`); there is no transpile step.
- Group by **operational domain** (e.g. `account/`, `antigravity/`, `openai/`, `oauth/`), not by framework layer.
- Prefer **shared helpers in `lib/`** for browser launch, CLI parsing, OAuth callback handling, proxy normalization, and local state parsing.
- **MCP servers use stdio.** In `account/gmail-creator-mcp.mjs` and `openai/openai-creator-mcp.mjs`, **never** write diagnostics with `console.log`; stdout is reserved for MCP messages. Use `console.error` (stderr) for diagnostics.
- Many scripts parse CLI flags directly from `process.argv`; **preserve existing flag names** when editing.
- Browser flows must account for **headless Linux**. Do not assume headed mode works without an X server.
- Runtime outputs (CSVs, JSON results, downloaded keys, screenshots, dumps) are local artifacts. Do not commit them unless you mean to.

- 모든 스크립트는 **ESM** (`.mjs`); 트랜스파일 단계 없음.
- 프레임워크 계층이 아닌 **운영 도메인**별로 그룹화 (예: `account/`, `antigravity/`, `openai/`, `oauth/`).
- 브라우저 실행, CLI 파싱, OAuth 콜백 처리, 프록시 정규화, 로컬 상태 파싱에는 **`lib/`의 공유 헬퍼**를 우선 사용.
- **MCP 서버는 stdio 사용.** `account/gmail-creator-mcp.mjs`와 `openai/openai-creator-mcp.mjs`에서는 진단을 위해 `console.log`를 **절대** 사용하지 마세요; stdout은 MCP 메시지 전용입니다. 진단은 `console.error`(stderr)를 사용하세요.
- 많은 스크립트가 `process.argv`에서 CLI 플래그를 직접 파싱함; 편집 시 **기존 플래그 이름을 유지**.
- 브라우저 플로우는 **헤드리스 Linux**를 고려해야 함. X 서버 없이 헤디드 모드가 동작한다고 가정하지 마세요.
- 런타임 출력(CSV, JSON 결과, 다운로드된 키, 스크린샷, 덤프)은 로컬 산출물. 의도한 경우가 아니면 커밋하지 마세요.

### Adding a new script / 새 스크립트 추가

1. Pick the right operational domain folder. If the script spans domains, create it in the one whose retry/job model matches.
2. Reuse `lib/cli-args.mjs` for flag parsing, `lib/browser-launch.mjs` for browser contexts, `lib/proxy-config.mjs` for proxy normalization.
3. If the script is an MCP tool, register it in the appropriate `Server` setup block and route diagnostics to stderr.
4. Update `AGENTS.md` (project-level or domain-level) with the new control point in the code map.

1. 적절한 운영 도메인 폴더를 선택. 도메인을 가로지르는 경우 재시도/작업 모델이 일치하는 폴더에 생성.
2. 플래그 파싱에는 `lib/cli-args.mjs`를, 브라우저 컨텍스트에는 `lib/browser-launch.mjs`를, 프록시 정규화에는 `lib/proxy-config.mjs`를 재사용.
3. MCP 도구인 경우 적절한 `Server` 설정 블록에 등록하고 진단은 stderr로 라우팅.
4. 코드 맵의 새 제어 포인트로 `AGENTS.md`(프로젝트 또는 도메인 수준)를 업데이트.

### Hot-reload / 핫 리로드

There is no watcher or build step. To iterate, rerun the script directly. For MCP servers, restart the agent's child process; for batch scripts, re-invoke with updated inputs.

워처나 빌드 단계가 없습니다. 반복하려면 스크립트를 직접 재실행하세요. MCP 서버의 경우 에이전트의 자식 프로세스를 재시작; 배치 스크립트의 경우 업데이트된 입력으로 재호출.

---

## Testing / 테스트

The root `npm test` is intentionally a placeholder (`"Error: no test specified" && exit 1`). Real checks live as script-driven files under `tests/`.

루트 `npm test`는 의도적으로 자리 표시자입니다(`"Error: no test specified" && exit 1`). 실제 체크는 `tests/` 아래에 스크립트 기반 파일로 있습니다.

| Check / 체크 | Command / 명령 | Notes / 참고 |
|---|---|---|
| Gmail MCP smoke / Gmail MCP 스모크 | `node tests/gmail-creator-mcp-smoke.mjs` | Spawns the server over stdio, exercises a tool. / 서버를 stdio로 실행하고 도구 테스트. |
| QA manual / QA 매뉴얼 | `node tests/qa-manual.mjs` | Operator walkthrough; not CI-automated. / 운영자 워크스루, CI 자동화 아님. |

When adding new behavior, prefer a smoke check in `tests/` that spawns the relevant entry point and asserts on stderr-observable signals, since stdout may be a protocol channel.

새 동작을 추가할 때 stdout이 프로토콜 채널일 수 있으므로, 관련 진입점을 실행하고 stderr 관찰 가능 신호를 검증하는 `tests/`의 스모크 체크를 우선하세요.

---

## Documentation / 문서

Long-form writeups live in `docs/` and at the OpenAI subpackage. They are intended to be reviewed before operational reuse; do not mirror operational examples into AGENTS files.

장문 문서는 `docs/`와 OpenAI 서브패키지에 있습니다. 운영 재사용 전에 검토하도록 의도되었습니다; 운영 예제를 AGENTS 파일에 미러링하지 마세요.

| Document / 문서 | Purpose / 목적 |
|---|---|
| `docs/QUICKSTART.md` | End-to-end first-run guide / 엔드투엔드 첫 실행 가이드 |
| `docs/ALTERNATIVE-SMS-PROVIDERS.md` | Plugging alternate providers into `lib/sms-provider.mjs` / `lib/sms-provider.mjs`에 대체 제공자 연결 |
| `docs/adb-gmail-creation.md` | Pure-ADB Gmail creation path / 순수 ADB Gmail 생성 경로 |
| `docs/verification-bypass-analysis.md` | Analysis of the verification pipeline / 인증 파이프라인 분석 |
| `openai/README.md` | OpenAI subpackage specifics / OpenAI 서브패키지 세부사항 |
| `AGENTS.md` (root & per-domain) | Maintenance and diagnostic guidance for contributors / 기여자를 위한 유지 관리 및 진단 가이드 |
| `CONTRIBUTING.md` | Contribution rules / 기여 규칙 |

---

## Contributing / 기여

See `CONTRIBUTING.md` for contribution rules. Key points:

- Match existing ESM conventions and the `lib/` reuse policy.
- Preserve existing CLI flag names; document any new ones in the relevant `AGENTS.md`.
- New MCP tools must keep diagnostics on stderr.
- New automation surfaces should land in the matching operational domain folder, not the framework layer.

기여 규칙은 `CONTRIBUTING.md`를 참조하세요. 주요 사항:

- 기존 ESM 컨벤션과 `lib/` 재사용 정책 준수.
- 기존 CLI 플래그 이름 유지; 새 플래그는 관련 `AGENTS.md`에 문서화.
- 새 MCP 도구는 진단을 stderr에 유지해야 함.
- 새 자동화 영역은 프레임워크 계층이 아닌 일치하는 운영 도메인 폴더에 배치.

---

## License / 라이선스

`package.json` declares `"license": "ISC"`. The full text is provided in [`LICENSE`](./LICENSE).

`package.json`은 `"license": "ISC"`을 선언합니다. 전문은 [`LICENSE`](./LICENSE)에 있습니다.