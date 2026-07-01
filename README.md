# gmail — Automation Toolkit / 자동화 툴킷

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)
[![Runtime: Node.js (ESM)](https://img.shields.io/badge/Runtime-Node.js%20ESM-339933.svg)](./package.json)
[![MCP: stdio](https://img.shields.io/badge/MCP-stdio-5A67D8.svg)](./account/gmail-creator-mcp.mjs)
[![Status: Internal / Research](https://img.shields.io/badge/Status-Internal%20%2F%20Research-yellow.svg)](#status--%EC%83%81%ED%83%9C)

## 한국어 요약

Node.js(ESM) 자동화 워크스페이스로, 브라우저 및 Android 기반 워크플로우의 **유지보수와 진단**을 위한 코드 베이스를 제공합니다. 백엔드로 Playwright/Rebrowser, Puppeteer, Chrome DevTools Protocol(CDP), Appium/WDIO, ADB, Frida를 사용하며, AI 에이전트 통합을 위한 Model Context Protocol(MCP) stdio 서버와 OAuth 콜백 서버, SMS 제공자 추상화 계층, 플러거블 프록시 헬퍼를 함께 제공합니다. 스크립트는 운영 도메인(계정, OAuth, OpenAI, Antigravity, 인프라)별로 분리되어 공유 `lib/` 유틸리티 계층 위에서 실행됩니다. 이 저장소는 정당한 테스트, 내부 도구 개발, QA, 보안 연구 목적으로만 사용해야 합니다.

## Status / 상태

| 항목 / Item | 값 / Value | 출처 / Source |
|---|---|---|
| Runtime | Node.js (ESM, `.mjs`) | [`package.json`](./package.json) |
| Package manager | npm | [`package-lock.json`](./package-lock.json) |
| License | ISC | [`LICENSE`](./LICENSE) |
| Status | 내부 / 리서치 (production-ready 아님) | 본 README |
| `npm test` 동작 | placeholder (`echo Error && exit 1`) | [`package.json`](./package.json) |
| MCP transport | stdio (stdout은 MCP 전용) | [`account/gmail-creator-mcp.mjs`](./account/gmail-creator-mcp.mjs) |
| Browser 모드 | headless Linux 우선 권장 | [`lib/browser-launch.mjs`](./lib/browser-launch.mjs) |
| 첫 진입점 (`main`) | `index.js` (현재 부재 — 실제 진입은 `account/`) | [`package.json`](./package.json) |

## 운영 흐름 한눈에 / Operator flow at a glance

1. **설치** — `npm install` 로 의존성(`@playwright/mcp`, `rebrowser-playwright`, `webdriverio`, `ws`, `jsqr`, `pngjs`, `@modelcontextprotocol/sdk`, `ghost-cursor-playwright`, `@gongrzhe/server-gmail-autoauth-mcp`)을 설치합니다.
2. **분리 이해** — 스크립트 도메인은 `account/`, `oauth/`, `openai/`, `antigravity/`, `account/infrastructure/` 이고, 공유 유틸리티는 `lib/` 입니다.
3. **진단 우선** — 실제 운영 시퀀스를 실행하기 전에 `lib/` 헬퍼와 MCP 서버의 `lib/` 진입점(`gmail-creator-mcp.mjs`, `openai-creator-mcp.mjs`)을 먼저 읽습니다.
4. **MCP 통합** — stdio MCP 서버 두 종을 AI 에이전트 클라이언트에 등록하고, 진단 로그는 stderr 로만 출력합니다.
5. **스모크 검증** — `node tests/gmail-creator-mcp-smoke.mjs` 로 MCP 메시지 채널이 살아 있는지 확인합니다 (root `npm test` 는 placeholder).
6. **문서 참조** — 운영 세부사항은 [`docs/QUICKSTART.md`](./docs/QUICKSTART.md) 및 [`docs/`](./docs/) 의 분석 문서를 참고합니다.

## English summary

A Node.js (ESM) workspace that hosts the **maintenance and diagnostic** code for browser- and Android-driven automation flows. It is built on Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, and Frida, and ships two MCP stdio servers for AI-agent integration along with shared helpers for OAuth callbacks, SMS providers, and proxy routing. Scripts are grouped by operational domain (account, OAuth, OpenAI, Antigravity, infrastructure) and reuse a single `lib/` utility layer. This repository is intended for legitimate testing, internal tooling, QA, and security research only.

---

> ⚠️ **책임 있는 사용 / Responsible Use.** 본 툴킷은 사용자가 정당하게 소유하거나 명시적으로 테스트 권한을 부여받은 시스템에 대한 정당한 테스트, 내부 도구 개발, QA, 보안 연구를 위해 공개되었습니다. 운영자는 각 플랫폼의 이용약관과 모든 관련 법규를 준수할 책임이 있습니다. This toolkit is published for legitimate testing, internal tooling, QA, and security research on systems you own or are explicitly authorized to test. Operators are responsible for complying with each platform's Terms of Service and all applicable laws.

---

## 목차 / Table of Contents

1. [상태 / Status](#status--%EC%83%81%ED%83%9C)
2. [목적 / Purpose](#목적--purpose)
3. [패키지 구성 / Package Contents](#패키지-구성--package-contents)
4. [저장소 레이아웃 / Repository Layout](#저장소-레이아웃--repository-layout)
5. [먼저 읽을 파일 / First Files to Read](#먼저-읽을-파일--first-files-to-read)
6. [아키텍처 / Architecture](#아키텍처--architecture)
7. [진입점 / API & Entry Points](#진입점--api--entry-points)
8. [빠른 시작 / Quickstart](#빠른-시작--quickstart)
9. [설정 / Configuration](#설정--configuration)
10. [명령 참조 / Commands Reference](#명령-참조--commands-reference)
11. [로컬 개발 / Local Development](#로컬-개발--local-development)
12. [테스트 / Testing](#테스트--testing)
13. [기여 / Contributing](#기여--contributing)
14. [유지보수자 / Maintainers & Contact](#유지보수자--maintainers--contact)
15. [라이선스 / License](#라이선스--license)
16. [추가 문서 / Further Documentation](#추가-문서--further-documentation)

## 목적 / Purpose

이 저장소는 정당한 테스트·내부 도구·QA·보안 연구 시나리오에서 사용할 수 있는 Node.js ESM 자동화 워크스페이스의 **유지보수 표면**입니다. 코드는 다음을 지원합니다.

- 브라우저 자동화(Playwright/Rebrowser, Puppeteer, CDP) 및 Android 자동화(Appium/WDIO, ADB, Frida).
- AI 에이전트 통합용 MCP stdio 서버 두 종.
- 로컬 OAuth 콜백 처리, 프록시 정규화, SMS 제공자 추상화, 클라이언트 프로파일링 헬퍼.
- Antigravity 및 OpenAI 도메인에 대한 별도 운영 스크립트.

이 README 는 **운영 플레이북**(계정 생성, 인증 우회, SMS/프록시 설정 절차)이 아니라, 새로운 기여자가 코드 베이스를 빠르게 이해하고 안전하게 수정하기 위한 **진단·유지보수 가이드**입니다. 실행 가능한 운영 시퀀스는 [`docs/`](./docs/) 의 개별 문서를 참고하세요.

## 패키지 구성 / Package Contents

| 영역 / Area | 디렉터리 / Directory | 역할 / Role |
|---|---|---|
| Main script surface | [`account/`](./account/) | Gmail 지향 MCP 서버와 운영 스크립트 모음. 가장 큰 스크립트 영역. |
| Antigravity helpers | [`antigravity/`](./antigravity/) | 로컬 상태 파일 및 서브프로세스 오케스트레이션용 헬퍼. |
| Shared utilities | [`lib/`](./lib/) | CLI 파서, 브라우저 런처, 콜백 서버, 프록시 정규화, CDP/ADB 유틸. |
| OAuth | [`oauth/`](./oauth/) | 좁은 범위의 OAuth 자격 증명/로그인 도우미. |
| OpenAI surface | [`openai/`](./openai/) | OpenAI 지향 별도 스크립트 및 MCP 서버. |
| Smoke tests | [`tests/`](./tests/) | MCP 스모크 검사 (수동 실행). |
| Docs | [`docs/`](./docs/) | 분석 및 운영 세부 문서. |
| Shell helpers | [`bin/`](./bin/) | 셸 래퍼 및 로컬 URL 인터셉션 헬퍼. |
| Data inputs | [`data/`](./data/) | 워밍업 진행 상태 등 프로젝트 데이터 입력. |
| Manifest | [`package.json`](./package.json) | npm 의존성; `npm test` 는 현재 placeholder. |

## 저장소 레이아웃 / Repository Layout

| 경로 / Path | 종류 / Type | 비고 / Note |
|---|---|---|
| `AGENTS.md` | 문서 | 저장소 유지보수 가이드. |
| `CONTRIBUTING.md` | 문서 | 기여 절차. |
| `LICENSE` | 문서 | ISC 라이선스 전문. |
| `README.md` | 문서 | 본 문서. |
| `package.json` / `package-lock.json` | 매니페스트 | 의존성 목록 (MCP SDK, Playwright, WDIO 등). |
| `complete.csv`, `openai-accounts.csv` | 데이터 | CSV 입력 — 멀티라인 허용 파서 사용. |
| `bin/` | 셸 | `create-gmail.sh`, `setup-*.sh`, `xdg-open`. |
| `oauth/` | ESM 스크립트 | OAuth 콜백/자격 증명 도우미. |
| `account/` | ESM 스크립트 | 메인 운영 스크립트 + Gmail MCP stdio 서버. |
| `account/infrastructure/` | ESM 스크립트 | 에뮬레이터 셋업 헬퍼. |
| `antigravity/` | ESM 스크립트 | Antigravity 상태/토큰 유지보수. |
| `openai/` | ESM 스크립트 | OpenAI 운영 스크립트 + 별도 MCP 서버. |
| `lib/` | 공유 모듈 | CLI·브라우저·OAuth·프록시·SMS·CDP·ADB 헬퍼. |
| `docs/` | 문서 | 분석 문서 (예: `verification-bypass-analysis.md`). |
| `tests/` | ESM 스크립트 | MCP 스모크 검사. |
| `data/` | JSON | `warmup-progress.json` 등. |
| `tmp/` | 일시 | 디버그용 임시 파일 (운영 산출물 X). |

## 먼저 읽을 파일 / First Files to Read

새로운 기여자는 아래 순서로 코드 베이스를 훑어 보길 권장합니다.

1. [`AGENTS.md`](./AGENTS.md) — 저장소 규칙·구조 요약.
2. [`package.json`](./package.json) — 의존성과 스크립트 진입점.
3. [`lib/cli-args.mjs`](./lib/cli-args.mjs) — 모든 스크립트가 공유하는 CLI 파서.
4. [`lib/browser-launch.mjs`](./lib/browser-launch.mjs) — Playwright/Rebrowser 공통 런처.
5. [`lib/oauth-callback-server.mjs`](./lib/oauth-callback-server.mjs) — 로컬 HTTP 콜백 서버.
6. [`lib/proxy-config.mjs`](./lib/proxy-config.mjs) — 프록시 옵션 정규화.
7. [`account/gmail-creator-mcp.mjs`](./account/gmail-creator-mcp.mjs) — Gmail 도메인 MCP stdio 서버.
8. [`openai/openai-creator-mcp.mjs`](./openai/openai-creator-mcp.mjs) — OpenAI 도메인 MCP stdio 서버.
9. [`antigravity/antigravity-pipeline.mjs`](./antigravity/antigravity-pipeline.mjs) — Antigravity 로컬 상태 오케스트레이션.
10. [`tests/gmail-creator-mcp-smoke.mjs`](./tests/gmail-creator-mcp-smoke.mjs) — MCP 메시지 채널 스모크 검사.

## 아키텍처 / Architecture

이 워크스페이스는 **도메인별 디렉터리** 위에 **단일 공유 `lib/` 계층**을 얹은 구조입니다. 두 개의 stdio MCP 서버가 AI 에이전트 표면을 제공하고, 운영 스크립트는 도메인 디렉터리에서 `lib/` 헬퍼를 재사용합니다.

| 계층 / Layer | 위치 / Location | 책임 / Responsibility |
|---|---|---|
| AI 에이전트 표면 | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` | MCP stdio 서버; 도구 등록·작업 관리·CSV 파싱. |
| 운영 스크립트 | `account/`, `oauth/`, `antigravity/`, `openai/`, `account/infrastructure/` | 도메인별 워크플로우 오케스트레이션. |
| 공유 유틸리티 | `lib/` | CLI 파싱, 브라우저 런치, OAuth 콜백, 프록시 정규화, SMS 추상화, CDP/ADB 헬퍼, 행동 프로파일링. |
| 데이터 입력 | `*.csv`, `data/*.json` | 멀티라인 허용 파서(`parseAccountsCsv`)로 읽음. |
| 진단 산출물 | 로컬 CSV/JSON/스크린샷/덤프 | 운영자가 검사하는 일시 산출물 (저장소에 커밋하지 않음 권장). |
| 셸 진입 | `bin/` | 자격 증명 셋업, Frida 환경 셋업, `xdg-open` 등 보조. |

### 요청 흐름 (Request flow)

1. AI 에이전트 클라이언트가 `account/gmail-creator-mcp.mjs` (또는 `openai/openai-creator-mcp.mjs`) 를 stdio 자식 프로세스로 기동합니다.
2. MCP 서버는 **stdout 에 MCP 메시지만** 쓰고, 진단 로그는 **stderr** 로 보냅니다.
3. 도구 호출이 들어오면 서버는 `lib/cli-args.mjs` 와 `lib/oauth-callback-server.mjs` 같은 공유 헬퍼를 통해 흐름을 구성합니다.
4. 브라우저가 필요하면 `lib/browser-launch.mjs` 가 headless 친화적인 Playwright/Rebrowser 인스턴스를 띄웁니다.
5. CSV 입력은 멀티라인 허용 파서(`parseAccountsCsv`)로 정규화되어 도메인 스크립트로 전달됩니다.
6. Android 흐름이 필요하면 `account/infrastructure/setup-emulator.mjs` 와 `lib/adb-utils.mjs`, `lib/cdp-utils.mjs` 가 관여합니다.
7. 운영 결과(계정 상태 토큰, 검증 로그 등)는 로컬 JSON/CSV 로 기록되며, 후속 진단에서 `lib/antigravity-shared.mjs` 등으로 재읽기 됩니다.

### 공유 헬퍼 참조 (Shared helpers)

| 헬퍼 / Helper | 파일 / File | 역할 / Role |
|---|---|---|
| CLI 파서 | [`lib/cli-args.mjs`](./lib/cli-args.mjs) | 이메일/비밀번호 스크립트용 단순 argv 파서. |
| 브라우저 런처 | [`lib/browser-launch.mjs`](./lib/browser-launch.mjs) | Playwright/Rebrowser 공통 실행. |
| OAuth 콜백 서버 | [`lib/oauth-callback-server.mjs`](./lib/oauth-callback-server.mjs) | 타임아웃/종료 의미론을 갖춘 로컬 HTTP 서버. |
| 프록시 정규화 | [`lib/proxy-config.mjs`](./lib/proxy-config.mjs) | 프록시 옵션 정규화 및 경고 메타데이터. |
| 프록시 릴레이 | [`lib/proxy-relay.mjs`](./lib/proxy-relay.mjs), [`lib/proxy-forwarder.mjs`](./lib/proxy-forwarder.mjs) | 트래픽 릴레이·포워딩 헬퍼. |
| CDP 유틸 | [`lib/cdp-utils.mjs`](./lib/cdp-utils.mjs) | Chrome DevTools Protocol 공통 함수. |
| ADB 유틸 | [`lib/adb-utils.mjs`](./lib/adb-utils.mjs) | Android Debug Bridge 공통 함수. |
| 행동 프로파일링 | [`lib/behavior-profile.mjs`](./lib/behavior-profile.mjs), [`lib/fingerprint-config.mjs`](./lib/fingerprint-config.mjs) | 인간형 입력 패턴 및 핑거프린트 설정. |
| OAuth 토큰 교환 | [`lib/token-exchange.mjs`](./lib/token-exchange.mjs) | OAuth 토큰 교환 헬퍼. |
| Google 인증 | [`lib/google-auth-browser.mjs`](./lib/google-auth-browser.mjs) | 브라우저 기반 Google 인증 헬퍼. |
| SMS 추상화 | [`lib/sms-provider.mjs`](./lib/sms-provider.mjs) | 플러거블 SMS 제공자 인터페이스. |
| Antigravity 공유 | [`lib/antigravity-shared.mjs`](./lib/antigravity-shared.mjs) | Antigravity 도메인 공통 로직. |
| 무료 프록시 | [`lib/free-proxy.mjs`](./lib/free-proxy.mjs) | 프록시 후보 조회 헬퍼. |
| 검증 파이프라인 | [`lib/verification-pipeline.mjs`](./lib/verification-pipeline.mjs) | 검증 단계 파이프라인. |

## 진입점 / API & Entry Points

이 저장소는 NPM 패키지 라이브러리가 아니라 **스크립트 + MCP 서버 모음**이므로, "진입점" 은 라이브러리 export 가 아니라 **실행 가능한 스크립트와 MCP 도구**입니다.

### MCP stdio 서버

| 서버 / Server | 파일 / File | transport | 비고 / Note |
|---|---|---|---|
| Gmail creator MCP | [`account/gmail-creator-mcp.mjs`](./account/gmail-creator-mcp.mjs) | stdio | 도구 등록, 작업 관리, 멀티라인 CSV 파싱. stdout 은 MCP 전용. |
| OpenAI creator MCP | [`openai/openai-creator-mcp.mjs`](./openai/openai-creator-mcp.mjs) | stdio | OpenAI 도메인 별도 표면. stdout 은 MCP 전용. |

### 주요 운영 스크립트 (도메인별)

| 도메인 / Domain | 주요 파일 / Key files |
|---|---|
| Account / Gmail | `account/create-accounts.mjs`, `account/create-accounts-cdp.mjs`, `account/create-accounts-appium.mjs`, `account/create-accounts-adb.mjs`, `account/verify-account.mjs`, `account/verify-age.mjs`, `account/verify-all-accounts.mjs`, `account/warmup-account.mjs`, `account/check-account-exists.mjs` |
| OAuth | `oauth/oauth-login.mjs`, `oauth/setup-gcp-oauth.mjs` |
| OpenAI | `openai/create-accounts.mjs`, `openai/check-accounts.mjs` |
| Antigravity | `antigravity/antigravity-pipeline.mjs`, `antigravity/antigravity-auth.mjs`, `antigravity/inject-vscdb-token.mjs`, `antigravity/manual-token-acquire.mjs`, `antigravity/unlock-features.mjs` |
| Infrastructure | `account/infrastructure/setup-emulator.mjs`, `bin/setup_frida.sh`, `bin/setup-credentials.sh`, `bin/setup-1password-service-account.sh` |

### 코드 맵 (Code map)

| 심볼 / Symbol | 종류 / Type | 위치 / Location | 역할 / Role |
|---|---|---|---|
| `main` | function | [`account/create-accounts.mjs`](./account/create-accounts.mjs) | 배치 오케스트레이션 진입점. |
| `createAccountWithRetries` | function | [`account/create-accounts.mjs`](./account/create-accounts.mjs) | 단일 계정 흐름의 재시도/실패 정책. |
| `Server` | top-level | [`account/gmail-creator-mcp.mjs`](./account/gmail-creator-mcp.mjs) | MCP 서버 셋업; 도구 등록·작업 관리·CSV 파싱. |
| `parseAccountsCsv` | function | `account/gmail-creator-mcp.mjs`, [`antigravity/antigravity-pipeline.mjs`](./antigravity/antigravity-pipeline.mjs) | 멀티라인 허용 CSV 레코드 파서. |
| `main` | function | [`antigravity/antigravity-pipeline.mjs`](./antigravity/antigravity-pipeline.mjs) | Antigravity 로컬 상태 오케스트레이션 진입점. |
| `encodeOAuthTokenInfo` | function | [`antigravity/inject-vscdb-token.mjs`](./antigravity/inject-vscdb-token.mjs) | 로컬 상태 쓰기용 수동 protobuf 인코딩. |
| `createCallbackServer` | function | [`lib/oauth-callback-server.mjs`](./lib/oauth-callback-server.mjs) | 타임아웃/종료 의미론을 갖춘 로컬 HTTP 콜백 서버. |
| `launchBrowser` | function | [`lib/browser-launch.mjs`](./lib/browser-launch.mjs) | 공유 Playwright/Rebrowser 런치 래퍼. |
| `parseCliArgs` | function | [`lib/cli-args.mjs`](./lib/cli-args.mjs) | 이메일/비밀번호 스크립트용 공유 단순 CLI 파서. |
| `createProxyConfig` | function | [`lib/proxy-config.mjs`](./lib/proxy-config.mjs) | 프록시 옵션 정규화 및 경고 메타데이터. |
| `Server` | top-level | [`openai/openai-creator-mcp.mjs`](./openai/openai-creator-mcp.mjs) | 별도 MCP stdio 서버 표면. |

## 빠른 시작 / Quickstart

> 이 README 는 운영 플레이북을 제공하지 않습니다. 아래는 **환경 점검과 의존성 설치**까지의 표준 시퀀스입니다.

```bash
# 1. 저장소 클론 후 의존성 설치
npm install

# 2. MCP 서버를 자식 프로세스로 띄울 수 있는지 sanity check
node tests/gmail-creator-mcp-smoke.mjs

# 3. 문서 확인 후 도메인 진입점 실행
#    (각 스크립트의 플래그와 입력은 docs/ 및 AGENTS.md 참고)
node account/gmail-creator-mcp.mjs --help 2>/dev/null || true
```

자세한 운영 시퀀스는 [`docs/QUICKSTART.md`](./docs/QUICKSTART.md) 를 참고하세요.

## 설정 / Configuration

| 설정 영역 / Area | 위치 / Location | 비고 / Note |
|---|---|---|
| npm 의존성 | [`package.json`](./package.json) | MCP SDK, Playwright, WDIO, Frida 등. |
| CSV 입력 | `complete.csv`, `openai-accounts.csv` | 멀티라인 허용 파서 사용. |
| OAuth 자격 증명 | `oauth/`, `bin/setup-credentials.sh` | 로컬 자격 증명 셋업 스크립트. |
| Antigravity 상태 | `antigravity/antigravity-auth-results.json`, `data/warmup-progress.json` | 로컬 상태 파일; 커밋 정책 확인 필요. |
| 환경 변수 | 각 스크립트 내 `process.env` 참조 | 운영 시 추가 env 가 필요할 수 있음 (스크립트별 확인). |
| 네트워크/프록시 | [`lib/proxy-config.mjs`](./lib/proxy-config.mjs) | 프록시 옵션 정규화. 스크립트별 구체 env 는 코드를 확인. |

> 민감한 자격 증명이나 토큰은 **절대 저장소에 커밋하지 마세요**. 운영자가 로컬 환경에서 별도로 주입해야 합니다.

## 명령 참조 / Commands Reference

| 명령 / Command | 설명 / Description |
|---|---|
| `npm install` | 의존성 설치. |
| `npm test` | 현재 placeholder (`echo Error && exit 1`). MCP 스모크는 직접 실행. |
| `node tests/gmail-creator-mcp-smoke.mjs` | Gmail MCP stdio 채널 sanity check. |
| `node account/gmail-creator-mcp.mjs` | Gmail 도메인 MCP stdio 서버 기동. |
| `node openai/openai-creator-mcp.mjs` | OpenAI 도메인 MCP stdio 서버 기동. |
| `node account/create-accounts.mjs` | 배치 오케스트레이션 진입점. |
| `node antigravity/antigravity-pipeline.mjs` | Antigravity 로컬 상태 오케스트레이션. |
| `bash bin/setup_frida.sh` | Frida 환경 셋업. |
| `bash bin/setup-credentials.sh` | 자격 증명 셋업. |
| `bash bin/setup-1password-service-account.sh` | 1Password 서비스 계정 셋업. |
| `bash bin/create-gmail.sh` | (참고용) Gmail 생성 셸 래퍼. |

개별 스크립트 플래그는 해당 파일의 `process.argv` 파싱 부분을 직접 확인하세요 (대부분 [`lib/cli-args.mjs`](./lib/cli-args.mjs) 를 공유).

## 로컬 개발 / Local Development

| 주제 / Topic | 가이드 / Guidance |
|---|---|
| Node 버전 | ESM + `@modelcontextprotocol/sdk` v1 호환 Node 권장 (LTS). |
| Headless 모드 | Linux 서버에서 실행 시 headless 가정. X 서버 없이는 headed 모드가 동작하지 않을 수 있음. |
| MCP 진단 로그 | **stderr 로만 출력.** stdout 은 MCP 메시지 전용. |
| 의존성 추가 | [`package.json`](./package.json) 에 명시적으로 추가하고 `package-lock.json` 갱신. |
| 새 운영 스크립트 | 도메인 디렉터리에 배치하고 `lib/` 헬퍼 재사용 우선. |
| 기존 플래그 이름 | 편집 시 기존 flag 이름 유지 (많은 스크립트가 `process.argv` 를 직접 파싱). |
| CSV 변경 | 멀티라인 허용 파서를 가정 — 새 필드 추가 시 파서 영향 확인. |
| 산출물 | CSV/JSON/스크린샷/덤프는 로컬 산출물. `.gitignore` 정책 확인. |

자세한 도메인별 규칙은 [`AGENTS.md`](./AGENTS.md) 와 각 하위 디렉터리의 `AGENTS.md` 를 참고하세요.

## 테스트 / Testing

| 검사 / Check | 명령 / Command | 비고 / Note |
|---|---|---|
| MCP stdio 스모크 | `node tests/gmail-creator-mcp-smoke.mjs` | MCP 메시지 채널 sanity check. |
| 수동 QA | [`tests/qa-manual.mjs`](./tests/qa-manual.mjs) | 수동 점검 스크립트. |
| `npm test` | `npm test` | 현재 placeholder — 위 항목으로 대체. |

운영 시퀀스에 대한 자동 회귀 테스트는 이 저장소에서 제공되지 않습니다 (내부/리서치 단계).

## 기여 / Contributing

기여 절차는 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 를 참고하세요. 일반 가이드:

- 새 운영 스크립트는 도메인 디렉터리(`account/`, `oauth/`, `openai/`, `antigravity/`, `account/infrastructure/`)에 추가.
- `lib/` 의 헬퍼를 우선 재사용. 헬퍼를 복제하지 말 것.
- CLI 플래그 이름을 임의로 변경하지 말 것.
- MCP 서버 파일에서는 `console.log` 로 진단 메시지를 출력하지 말 것 (stdout 은 MCP 전용).
- CSV 파싱은 멀티라인 허용 동작을 유지.
- 새 의존성은 [`package.json`](./package.json) 에 명시.

## 유지보수자 / Maintainers & Contact

| 역할 / Role | 위치 / Where |
|---|---|
| 저장소 규칙·구조 안내 | [`AGENTS.md`](./AGENTS.md) |
| 계정 도메인 규칙 | [`account/AGENTS.md`](./account/AGENTS.md) |
| Antigravity 도메인 규칙 | [`antigravity/AGENTS.md`](./antigravity/AGENTS.md) |
| OpenAI 도메인 규칙 | [`openai/AGENTS.md`](./openai/AGENTS.md), [`openai/README.md`](./openai/README.md) |
| 라이브러리 도메인 규칙 | [`lib/AGENTS.md`](./lib/AGENTS.md) |

> 이 저장소는 내부/리서치 단계이므로 별도 외부 연락 채널이 명시되어 있지 않습니다. 운영 관련 문의는 저장소 이슈 트래커를 통해 주세요.

## 라이선스 / License

이 저장소는 [ISC 라이선스](./LICENSE) 하에 배포됩니다. 사용 전 라이선스 전문을 확인하세요.

## 추가 문서 / Further Documentation

| 문서 / Document | 경로 / Path | 용도 / Purpose |
|---|---|---|
| 빠른 시작 | [`docs/QUICKSTART.md`](./docs/QUICKSTART.md) | 운영 진입 가이드. |
| 대체 SMS 제공자 분석 | [`docs/ALTERNATIVE-SMS-PROVIDERS.md`](./docs/ALTERNATIVE-SMS-PROVIDERS.md) | SMS 제공자 비교·대안 검토. |
| ADB 기반 Gmail 생성 | [`docs/adb-gmail-creation.md`](./docs/adb-gmail-creation.md) | ADB 경로 운영 세부사항. |
| 인증 우회 분석 | [`docs/verification-bypass-analysis.md`](./docs/verification-bypass-analysis.md) | 검증 메커니즘 분석. 책임 있는 사용 정책과 함께 참고. |
| OpenAI 도메인 README | [`openai/README.md`](./openai/README.md) | OpenAI 도메인 세부 안내. |
| 저장소 규칙 | [`AGENTS.md`](./AGENTS.md) | 구조·코드 맵·규약. |
| 기여 절차 | [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 기여 가이드. |

---

> ⚠️ **상태 고지 / Status notice.** 이 코드 베이스는 **production-ready 가 아니며**, 운영 도메인의 유지보수와 진단을 위한 내부/리서치 표면입니다. 공개된 실행 스크립트의 운영 사용 전, [`docs/`](./docs/) 의 관련 분석 문서와 본 상단의 책임 있는 사용 고지를 반드시 확인하세요.