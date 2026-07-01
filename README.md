# gmail — Automation Toolkit / 자동화 툴킷

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)
[![Runtime: Node.js (ESM)](https://img.shields.io/badge/Runtime-Node.js%20ESM-339933.svg)](./package.json)
[![MCP: stdio](https://img.shields.io/badge/MCP-stdio-5A67D8.svg)](./account/gmail-creator-mcp.mjs)
[![Status: Internal / Research](https://img.shields.io/badge/Status-Internal%20%2F%20Research-yellow.svg)](#status--%EC%83%81%ED%83%9C)

## 한국어 요약

Node.js(ESM) 자동화 워크스페이스로, 브라우저 및 Android 기반 워크플로를 자동화합니다. 백엔드로 Playwright/Rebrowser, Puppeteer, Chrome DevTools Protocol(CDP), Appium/WDIO, ADB, Frida를 사용하며, AI 에이전트 통합을 위한 Model Context Protocol(MCP) stdio 서버 2개와 OAuth 콜백 서버, SMS 제공자 추상화 계층, 플러거블 프록시 헬퍼를 함께 제공합니다. 스크립트는 운영 도메인(계정, OAuth, OpenAI, Antigravity, 인프라)별로 분리되어 공유 `lib/` 유틸리티 계층 위에서 실행됩니다.

**English summary.** A Node.js (ESM) workspace that automates browser- and Android-driven workflows through Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, and Frida. It exposes two MCP stdio servers for AI-agent integration and ships shared helpers for OAuth callbacks, SMS providers, and proxy routing. Scripts are grouped by operational domain and reuse a single shared `lib/` utility layer.

---

> ⚠️ **책임 있는 사용 / Responsible Use.** 본 툴킷은 사용자가 정당하게 소유하거나 명시적으로 테스트 권한을 부여받은 시스템에 대한 정당한 테스트, 내부 도구 개발, QA, 보안 연구를 위해 공개되었습니다. 운영자는 각 플랫폼의 이용약관과 모든 관련 법규를 준수할 책임이 있습니다. This toolkit is published for legitimate testing, internal tooling, QA, and security research on systems you own or are explicitly authorized to test. Operators are responsible for complying with each platform's Terms of Service and all applicable laws.

---

## 목차 / Table of Contents

1. [상태 / Status](#status--%EC%83%81%ED%83%9C)
2. [빠른 흐름 / Quick Flow](#quick-flow--%EB%B9%A8%EB%A5%B8-%ED%9D%90%EB%8F%99)
3. [패키지 구성 / Package Contents](#package-contents--%ED%8C%A8%ED%82%A4%EC%A7%80-%EA%B5%AC%EC%84%B1)
4. [먼저 읽을 파일 / First Files to Read](#first-files-to-read--%EB%A8%BC%EC%A0%80-%EC%9D%BD%EC%9D%84-%ED%8C%8C%EC%9D%BC)
5. [API 및 진입점 / API and Entry Points](#api-and-entry-points--api-%EB%B0%8F-%EC%A7%84%EC%9E%85%EC%A0%90)
6. [아키텍처 / Architecture](#architecture--%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98)
7. [빠른 시작 / Quick Start](#quick-start--%EB%B9%A0%EB%A5%B8-%EC%8B%9C%EC%9E%91)
8. [설정 / Configuration](#configuration--%EC%84%A4%EC%A0%95)
9. [명령어 참조 / Commands Reference](#commands-reference--%EB%AA%85%EB%A0%B9%EC%96%B4-%EC%B0%B8%EC%A1%B0)
10. [로컬 개발 / Local Development](#local-development--%EB%A1%9C%EC%BB%AC-%EA%B0%9C%EB%B0%9C)
11. [테스트 / Testing](#testing--%ED%85%8C%EC%8A%A4%ED%8A%B8)
12. [문서 / Documentation](#documentation--%EB%AC%B8%EC%84%9C)
13. [유지보수 및 연락처 / Maintainers and Contacts](#maintainers-and-contacts--%EC%9C%A0%EC%A7%80%EB%B3%B4%EC%88%98-%EB%B0%8F-%EC%97%B0%EB%9D%BC%EC%B2%98)
14. [기여 / Contributing](#contributing--%EA%B8%B0%EC%97%AC)
15. [라이선스 / License](#license--%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4)

---

## Status / 상태

| 항목 / Aspect | 상태 / State | 비고 / Notes |
|---|---|---|
| 런타임 / Runtime | Node.js (ESM `.mjs`) | `package.json` 기준 |
| 테스트 명령 / Test command | 자리표시자 / Placeholder | `npm test`는 에러 메시지를 출력하고 비정상 종료 |
| MCP 전송 / MCP transport | stdio | stdout은 프로토콜 전용, 진단은 stderr |
| 브라우저 대상 / Browser targets | Playwright/Rebrowser, Puppeteer, CDP | 헤드리스 Linux 가정 (X 서버 불필요) |
| 모바일 대상 / Mobile targets | Appium/WDIO, ADB, Frida | `account/infrastructure/setup-emulator.mjs` 참고 |
| OAuth 헬퍼 / OAuth helpers | 로컬 콜백 서버 | `lib/oauth-callback-server.mjs` |
| 프록시 헬퍼 / Proxy helpers | 정규화 + 경고 메타데이터 | `lib/proxy-config.mjs`, `lib/proxy-relay.mjs`, `lib/proxy-forwarder.mjs` |
| SMS 헬퍼 / SMS helpers | 추상화 계층 | `lib/sms-provider.mjs` |
| 프로덕션 준비 / Production-ready | 아니오 / No | 연구·내부 툴킷 성격 (위 "책임 있는 사용" 참조) |

---

## Quick Flow / 빠른 흐름

| 운영자 목표 / Operator Goal | 진입점 / Entry Point | 산출 / 다음 단계 / Output / Next Step |
|---|---|---|
| 배치 오케스트레이션의 진단 뷰 / Batch orchestration diagnostics | `account/create-accounts.mjs` | CSV + 진단은 stderr |
| AI 에이전트 통합 — Gmail 표면 / AI-agent Gmail surface | `account/gmail-creator-mcp.mjs` | stdio JSON-RPC, 진단은 stderr |
| AI 에이전트 통합 — OpenAI 표면 / AI-agent OpenAI surface | `openai/openai-creator-mcp.mjs` | stdio JSON-RPC, 진단은 stderr |
| 단일 브라우저 세션 부트스트랩 / Single browser session bootstrap | `lib/browser-launch.mjs` | Playwright/Rebrowser 인스턴스 반환 |
| 로컬 OAuth 콜백 수신 / Local OAuth callback capture | `lib/oauth-callback-server.mjs` | 타임아웃 HTTP 리스너 |
| Antigravity 로컬 상태 유지 / Antigravity local-state maintenance | `antigravity/antigravity-pipeline.mjs` | 로컬 상태 파일 갱신 |
| MCP 스모크 체크 / MCP smoke check | `tests/gmail-creator-mcp-smoke.mjs` | 프로토콜 교환 기반 pass/fail |

---

## Package Contents / 패키지 구성

아래 표는 실제 최상위 트리를 반영합니다. `tmp/` 디렉터리는 임시 디버그 스크립트 모음이며 안정 경로가 아닙니다.

| 디렉터리 / Directory | 역할 / Role | 주요 예시 / Notable Files |
|---|---|---|
| `account/` | Gmail 지향 스크립트 + MCP 서버 (가장 큰 스크립트 영역) | `gmail-creator-mcp.mjs`, `verify-account.mjs`, `warmup-account.mjs`, `cdp-login-test.mjs` |
| `account/infrastructure/` | 모바일/에뮬레이터 인프라 헬퍼 | `setup-emulator.mjs` |
| `openai/` | OpenAI 지향 스크립트 + MCP 서버 | `openai-creator-mcp.mjs`, `create-accounts.mjs`, `check-accounts.mjs` |
| `antigravity/` | Antigravity 토큰·로컬 상태 헬퍼 | `antigravity-pipeline.mjs`, `inject-vscdb-token.mjs`, `unlock-features.mjs` |
| `oauth/` | 협소한 OAuth 자격 증명/로그인 래퍼 | `oauth-login.mjs`, `setup-gcp-oauth.mjs` |
| `lib/` | 공유 유틸리티 (파싱, 브라우저, 콜백, 프록시, CDP, ADB) | `browser-launch.mjs`, `cli-args.mjs`, `oauth-callback-server.mjs`, `proxy-config.mjs`, `sms-provider.mjs`, `cdp-utils.mjs`, `adb-utils.mjs`, `fingerprint-config.mjs` |
| `bin/` | 셸 래퍼 / 로컬 헬퍼 | `setup-credentials.sh`, `setup_frida.sh`, `setup-1password-service-account.sh`, `create-gmail.sh`, `xdg-open` |
| `tests/` | 수동 스모크 체크 | `gmail-creator-mcp-smoke.mjs`, `qa-manual.mjs` |
| `docs/` | 운영 상세 writeup 모음 | `QUICKSTART.md`, `adb-gmail-creation.md`, `ALTERNATIVE-SMS-PROVIDERS.md`, `verification-bypass-analysis.md` |
| `data/` | 프로젝트 데이터 입력 | `warmup-progress.json` |
| `tmp/` | 임시 디버그 스크립트 (안정 아님) | `debug-selects.mjs`, `sms-fast-v2.mjs`, `sms-verify-fast.mjs`, `ui.xml` |
| 루트 / Root | 메타데이터 / 입력 CSV | `package.json`, `package-lock.json`, `complete.csv`, `openai-accounts.csv`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md` |

---

## First Files to Read / 먼저 읽을 파일

1. `package.json` — 의존성 표면과 (자리표시자) 테스트 진입점.
2. `AGENTS.md` — 저장소 컨벤션과 위치 룩업 테이블.
3. `account/AGENTS.md` — 가장 큰 스크립트 디렉터리의 하위 컨벤션.
4. `openai/AGENTS.md`, `antigravity/AGENTS.md` — 다른 도메인의 하위 컨벤션.
5. `lib/AGENTS.md` — 공유 헬퍼 컨벤션.
6. `docs/QUICKSTART.md` — 운영 빠른 참조 (재사용 전 검토).
7. `openai/README.md` — openai 영역 전용 안내.

---

## API and Entry Points / API 및 진입점

| 종류 / Type | 심볼 / Symbol 또는 엔드포인트 | 위치 / Location | 역할 / Role |
|---|---|---|---|
| 함수 / Function | `main` | `account/create-accounts.mjs` | 배치 오케스트레이션 진입점 |
| 함수 / Function | `createAccountWithRetries` | `account/create-accounts.mjs` | 단일 흐름의 재시도/실패 정책 |
| 서버 / Server | MCP stdio setup | `account/gmail-creator-mcp.mjs` | 툴 등록, 작업 관리, CSV 파싱 |
| 함수 / Function | `parseAccountsCsv` | `account/gmail-creator-mcp.mjs`, `antigravity/antigravity-pipeline.mjs` | 멀티라인 허용 CSV 레코드 파싱 |
| 함수 / Function | `main` | `antigravity/antigravity-pipeline.mjs` | 로컬 상태 오케스트레이션 진입점 |
| 함수 / Function | `encodeOAuthTokenInfo` | `antigravity/inject-vscdb-token.mjs` | 로컬 상태 쓰기를 위한 수동 protobuf 인코딩 |
| 함수 / Function | `createCallbackServer` | `lib/oauth-callback-server.mjs` | 타임아웃/close 시맨틱을 갖춘 로컬 HTTP 콜백 서버 |
| 함수 / Function | `launchBrowser` | `lib/browser-launch.mjs` | 공유 Playwright/Rebrowser 부트스트랩 래퍼 |
| 함수 / Function | `parseCliArgs` | `lib/cli-args.mjs` | 이메일/비밀번호 스크립트용 공유 CLI 파서 |
| 함수 / Function | `createProxyConfig` | `lib/proxy-config.mjs` | 프록시 옵션 정규화 + 경고 메타데이터 |
| 서버 / Server | MCP stdio setup | `openai/openai-creator-mcp.mjs` | 별도 MCP stdio 표면 |

---

## Architecture / 아키텍처

### 계층 구조 / Layered Design

| 계층 / Layer | 책임 / Responsibility | 예시 / Examples |
|---|---|---|
| 진입 스크립트 / Entry scripts | 도메인별 오케스트레이션 | `account/create-accounts.mjs`, `antigravity/antigravity-pipeline.mjs`, `openai/create-accounts.mjs` |
| MCP 서버 / MCP servers | AI 에이전트용 stdio JSON-RPC | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` |
| 공유 헬퍼 / Shared helpers | 횡단 관심사 (브라우저, OAuth, 프록시, 파싱) | `lib/browser-launch.mjs`, `lib/oauth-callback-server.mjs`, `lib/proxy-config.mjs`, `lib/sms-provider.mjs` |
| 플랫폼 어댑터 / Platform adapters | 브라우저/모바일 브리지 | Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, Frida |
| 외부 아티팩트 / External artifacts | CSV/JSON 입력·출력 | `complete.csv`, `openai-accounts.csv`, `data/warmup-progress.json` |

### 운영자 흐름 (진단 관점) / Operator Flow — Diagnostics View

1. 운영자가 진입 스크립트를 CLI 플래그와 함께 실행합니다.
2. `lib/cli-args.mjs`와 `lib/proxy-config.mjs`가 입력을 정규화합니다.
3. `lib/browser-launch.mjs`(또는 Appium/ADB 등가)를 통해 브라우저/모바일 어댑터를 부트스트랩합니다.
4. 도메인별 흐름이 실행되며 진단은 stderr로 출력합니다.
5. 결과는 로컬 아티팩트(CSV, JSON 상태, 스크린샷, 덤프)로 저장됩니다.
6. OAuth 흐름의 경우 `lib/oauth-callback-server.mjs`가 로컬 리디렉션을 캡처합니다.

### MCP 흐름 / MCP Request Flow

1. AI 에이전트가 서버 프로세스를 띄우고 stdio로 JSON-RPC를 교환합니다.
2. 초기화 단계에서 서버가 툴을 등록합니다.
3. 툴 호출은 동일한 `lib/` 공유 계층 아래의 도메인 헬퍼로 디스패치됩니다.
4. 진단은 stderr로, stdout은 프로토콜 전용으로 유지됩니다.

---

## Quick Start / 빠른 시작

> ⚠️ 아래 단계는 대상 시스템에 대한 정당한 권한을 이미 보유하고 있음을 전제로 합니다. 계속 진행하기 전 위 "책임 있는 사용" 섹션을 다시 확인하십시오.

| 단계 / Step | 명령 / Command 또는 동작 / Action | 비고 / Notes |
|---|---|---|
| 1 | `node --version` | ESM과 최신 문법 지원 버전 필요 |
| 2 | `npm install` | Playwright, Rebrowser, MCP SDK, Appium 등 설치 |
| 3 | `package.json` 검토 | `npm test`는 자리표시자. 진입점은 직접 실행 |
| 4 | `AGENTS.md`, `account/AGENTS.md` 읽기 | 유지보수 컨벤션을 먼저 파악 |
| 5 | 스모크 체크 실행 | `node tests/gmail-creator-mcp-smoke.mjs` |
| 6 | MCP 서버 수동 기동 | `node account/gmail-creator-mcp.mjs` 또는 `node openai/openai-creator-mcp.mjs` |

MCP 통합 노트: MCP 서버를 기동할 때는 stdout을 만지지 마십시오. 호스트가 stdio로 JSON-RPC를 교환합니다.

---

## Configuration / 설정

| 출처 / Source | 목적 / Purpose | 위치 / Location |
|---|---|---|
| `package.json` | 의존성 핀닝 및 스크립트 진입점 | 저장소 루트 |
| 런타임 CSV 입력 | 배치 입력 및 진행 상태 | `complete.csv`, `openai-accounts.csv` |
| 로컬 상태 파일 | Antigravity 토큰 영속화 | `antigravity/` (헬퍼가 관리) |
| 셸 래퍼 | 일회성 환경 설정 | `bin/setup-*.sh` |
| OAuth 클라이언트 시크릿 | GCP OAuth 클라이언트 구성 | `oauth/setup-gcp-oauth.mjs` 플로우를 통해 설정 |
| 프록시 / SMS 옵션 | 정책·플러그인 진입점 | `lib/proxy-config.mjs`, `lib/sms-provider.mjs` |

프록시와 SMS 제공자 동작은 `lib/proxy-config.mjs`와 `lib/sms-provider.mjs`에 집중되어 있습니다. 로컬로 재정의하기 전에 해당 모듈을 먼저 검토하십시오.

---

## Commands Reference / 명령어 참조

| 명령 / Command | 목적 / Purpose |
|---|---|
| `npm install` | 선언된 의존성 설치 |
| `npm test` | 자리표시자. 비정상 종료 (현재 동작) |
| `node tests/gmail-creator-mcp-smoke.mjs` | Gmail MCP 표면 수동 스모크 체크 |
| `node tests/qa-manual.mjs` | 수동 QA 스크래치패드 |
| `node account/gmail-creator-mcp.mjs` | Gmail MCP stdio 서버 기동 |
| `node openai/openai-creator-mcp.mjs` | OpenAI MCP stdio 서버 기동 |
| `node account/create-accounts.mjs ...` | 배치 오케스트레이션 (플래그는 소스 참조) |
| `node antigravity/antigravity-pipeline.mjs ...` | Antigravity 로컬 상태 오케스트레이션 |
| `node antigravity/inject-vscdb-token.mjs ...` | Antigravity 상태에 토큰 주입 |
| `node oauth/setup-gcp-oauth.mjs ...` | GCP OAuth 클라이언트 설정 |
| `node oauth/oauth-login.mjs ...` | 협소 OAuth 로그인 헬퍼 |
| `node account/infrastructure/setup-emulator.mjs ...` | 모바일 에뮬레이터 부트스트랩 |
| `bash bin/setup-credentials.sh` | 환경 자격 증명 부트스트랩 |
| `bash bin/setup_frida.sh` | Frida 헬퍼 설정 |
| `bash bin/setup-1password-service-account.sh` | 1Password 서비스 계정 설정 |
| `bash bin/create-gmail.sh` | 원샷 Gmail 셸 래퍼 (백업 스크립트) |

CLI 플래그는 스크립트마다 다르며 정확한 인자 이름과 순서는 소스를 확인하십시오. 공유 파서는 `lib/cli-args.mjs`에 있습니다.

---

## Local Development / 로컬 개발

| 단계 / Step | 동작 / Action |
|---|---|
| 1 | 선언된 의존성을 지원하는 Node.js 버전 사용 |
| 2 | 새 의존성을 받은 후 `npm install` 실행 |
| 3 | 해당 하위 영역 AGENTS 파일을 열어 두기 (`account/`, `antigravity/`, `openai/`, `lib/`) |
| 4 | `lib/` 헬퍼를 우선 재사용. 흐름 한정 헬퍼 중복 작성 금지 |
| 5 | 기존 CLI 플래그 이름 보존 — 많은 스크립트가 `process.argv`를 직접 읽음 |
| 6 | MCP 파일을 수정할 때는 `console.log`를 stdout에 쓰지 말고 stderr/`console.error` 사용 |
| 7 | `tmp/`는 일시적. 안정 코드 경로로 승격하지 말 것 |
| 8 | 헤드리스 Linux가 기본 실행 대상. Headed 모드는 X 서버 필요 |

---

## Testing / 테스트

| 체크 / Check | 위치 / Location | 비고 / Notes |
|---|---|---|
| 수동 스모크 테스트 / Manual smoke test | `tests/gmail-creator-mcp-smoke.mjs` | 스크립트 기반 프로토콜 교환. `npm test`에 연결되어 있지 않음 |
| 수동 QA 스크래치패드 / Manual QA scratchpad | `tests/qa-manual.mjs` | 운영자 주도의 체크리스트 |

`npm test`는 현재 `echo "Error: no test specified" && exit 1`을 출력하는 자리표시자입니다. 러너가 연결될 때까지는 스크립트 체크를 직접 실행하십시오.

---

## Documentation / 문서

| 문서 / Document | 위치 / Location | 대상 / Audience |
|---|---|---|
| 저장소 컨벤션 / Repository conventions | `AGENTS.md` (루트 + 영역별) | 유지보수 담당자 |
| OpenAI 하위 영역 안내 / OpenAI sub-area note | `openai/README.md` | OpenAI 스크립트 유지보수자 |
| 운영 빠른 참조 / Operational quick reference | `docs/QUICKSTART.md` | 운영자 (재사용 전 검토) |
| ADB 기반 Gmail 생성 writeup | `docs/adb-gmail-creation.md` | 운영자 |
| 대체 SMS 제공자 / Alternative SMS providers | `docs/ALTERNATIVE-SMS-PROVIDERS.md` | 제공자 구성 운영자 |
| 검증 분석 writeup | `docs/verification-bypass-analysis.md` | 운영자/연구자 |

---

## Maintainers and Contacts / 유지보수 및 연락처

| 역할 / Role | 비고 / Notes |
|---|---|
| 저장소 소유자 / Repository owner | `package.json`의 `author` 필드 (현재 비어 있음) |
| 유지보수 가이드 / Maintainer guidance | 루트 및 하위 영역의 `AGENTS.md` 파일 |
| 기여 창구 / Contribution surface | 아래 "Contributing" 참조 |

`author` 필드가 비어 있는 경우, 현재 담당자는 커밋 이력 또는 `CONTRIBUTING.md`를 통해 확인하십시오.

---

## Contributing / 기여

1. `CONTRIBUTING.md`와 해당 하위 영역 `AGENTS.md`를 먼저 읽으십시오.
2. 브라우저, CLI, 콜백, 프록시, 파싱 로직을 중복 구현하지 말고 `lib/` 헬퍼를 재사용하십시오.
3. `process.argv`를 직접 읽는 모든 스크립트에서 기존 CLI 플래그 이름을 보존하십시오.
4. MCP 관련 파일에서는 `console.log`를 stdout에 쓰지 말고 진단은 `console.error`/stderr로 라우팅하십시오.
5. 커밋되는 기본값에 사설/내부 IP 주소나 컨테이너 식별자를 하드코딩하지 말고 플레이스홀더를 사용하십시오.
6. `tmp/` 스크립트를 안정 흐름으로 승격하지 마십시오.

---

## License / 라이선스

본 저장소는 ISC 라이선스 하에 공개되어 있습니다. 자세한 내용은 `LICENSE` 파일을 참조하십시오. This repository is released under the ISC license. See the `LICENSE` file for details.