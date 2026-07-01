# gmail — Automation Toolkit / 자동화 툴킷

## 한국어 요약

Node.js(ESM) 자동화 워크스페이스로, 브라우저 및 Android 기반 워크플로를 자동화합니다. 백엔드로 Playwright/Rebrowser, Puppeteer, Chrome DevTools Protocol(CDP), Appium/WDIO, ADB, Frida를 사용하며, AI 에이전트 통합을 위한 Model Context Protocol(MCP) stdio 서버 2개와 OAuth 콜백 서버, SMS 제공자 추상화 계층, 플러거블 프록시 헬퍼를 함께 제공합니다. 스크립트는 운영 도메인(계정, OAuth, OpenAI, Antigravity, 인프라)별로 분리되어 공유 `lib/` 유틸리티 계층 위에서 실행됩니다.

English summary: Node.js (ESM) workspace that automates browser- and Android-driven workflows through Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, and Frida. Exposes two MCP stdio servers for AI-agent integration and ships shared helpers for OAuth callbacks, SMS providers, and proxy routing. Scripts are grouped by operational domain.

> ⚠️ **Responsible Use / 책임 있는 사용.** This toolkit is published for legitimate testing, internal tooling, QA, and security research on systems you own or are explicitly authorized to test. Operators are responsible for complying with each platform's Terms of Service and all applicable laws.
>
> 본 툴킷은 사용자가 정당하게 소유하거나 명시적으로 테스트 권한을 부여받은 시스템에 대한 정당한 테스트, 내부 도구 개발, QA, 보안 연구를 위해 공개되었습니다. 운영자는 각 플랫폼의 이용약관과 모든 관련 법규를 준수할 책임이 있습니다.

---

## 목차 / Table of Contents

1. [상태 / Status](#status--상태)
2. [빠른 흐름 / Quick Flow](#quick-flow--빠른-흐름)
3. [패키지 구성 / Package Contents](#package-contents--패키지-구성)
4. [먼저 읽을 파일 / First Files to Read](#first-files-to-read--먼저-읽을-파일)
5. [API 및 진입점 / API and Entry Points](#api-and-entry-points--api-및-진입점)
6. [아키텍처 / Architecture](#architecture--아키텍처)
7. [빠른 시작 / Quick Start](#quick-start--빠른-시작)
8. [설정 / Configuration](#configuration--설정)
9. [명령어 참조 / Commands Reference](#commands-reference--명령어-참조)
10. [로컬 개발 / Local Development](#local-development--로컬-개발)
11. [테스트 / Testing](#testing--테스트)
12. [문서 / Documentation](#documentation--문서)
13. [유지보수 및 연락처 / Maintainers and Contacts](#maintainers-and-contacts--유지보수-및-연락처)
14. [기여 / Contributing](#contributing--기여)
15. [라이선스 / License](#license--라이선스)

---

## Status / 상태

| 영역 / Area | 상태 / Status | 비고 / Notes |
|-------------|---------------|--------------|
| Package metadata | Released as `gmail@1.0.0` | `package.json` 필드; author 미지정 |
| Module system | ESM (`type: module` implied by `.mjs`) | 모든 스크립트가 `.mjs` |
| Default `npm test` | Placeholder | `echo Error: no test specified && exit 1` |
| MCP servers | 2 stdio servers | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` |
| Browser backends | Playwright/Rebrowser, Puppeteer, CDP | 헤드리스 Linux 가정 |
| Mobile backends | Appium/WDIO, ADB, Frida | Android 에뮬레이터/디바이스 |
| OAuth callback | Local HTTP server | `lib/oauth-callback-server.mjs` |
| License | ISC | `LICENSE` 참조 |
| Production readiness | Internal / research | 운영 자동화 가이드는 의도적으로 README에서 제외 |

## Quick Flow / 빠른 흐름

운영자가 가장 먼저 식별해야 할 핵심 진입점은 다음과 같습니다. 상세 실행 절차는 의도적으로 본 README에 포함되지 않으며, 각 스크립트와 `docs/` 폴더를 별도로 참고해야 합니다.

| 단계 / Step | 위치 / Location | 역할 / Role |
|-------------|-----------------|-------------|
| 1. 의존성 설치 | `package.json` | `npm install` |
| 2. 환경 준비 | `bin/setup-*.sh`, `account/infrastructure/setup-emulator.mjs` | 자격증명·에뮬레이터·서비스 계정 셋업 |
| 3. 도메인 진입점 실행 | `account/`, `openai/`, `antigravity/`, `oauth/` | 운영 도메인별 메인 스크립트 |
| 4. MCP 통합 (선택) | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` | AI 에이전트에 도구 노출 |
| 5. 결과 수집 | `complete.csv`, `openai-accounts.csv`, `data/`, `antigravity/*.json` | 로컬 아티팩트 |

---

## Package Contents / 패키지 구성

이 워크스페이스는 모노레포 빌드 시스템 없이 운영 도메인별 폴더에 스크립트를 평면적으로 배치한 형태입니다. 프레임워크 계층이 아니라 운영 도메인을 기준으로 그룹화되어 있습니다.

| 폴더 / Folder | 목적 / Purpose | 핵심 파일 / Key Files |
|---------------|----------------|----------------------|
| `account/` | Gmail 지향 자동화 및 진단 스크립트, MCP stdio 서버 | `create-accounts.mjs`, `gmail-creator-mcp.mjs`, `verify-*.mjs`, `warmup-account.mjs`, `infrastructure/setup-emulator.mjs` |
| `openai/` | OpenAI 계정 작업 및 별도 MCP 표면 | `create-accounts.mjs`, `check-accounts.mjs`, `openai-creator-mcp.mjs`, `README.md` |
| `antigravity/` | Antigravity 로컬 상태 및 토큰 유지보수 | `antigravity-pipeline.mjs`, `antigravity-auth.mjs`, `inject-vscdb-token.mjs`, `unlock-features.mjs`, `manual-token-acquire.mjs` |
| `oauth/` | 좁은 범위의 OAuth 자격증명/로그인 헬퍼 | `oauth-login.mjs`, `setup-gcp-oauth.mjs` |
| `lib/` | 공유 유틸리티 계층(권장 사용처) | `cli-args.mjs`, `browser-launch.mjs`, `cdp-utils.mjs`, `adb-utils.mjs`, `oauth-callback-server.mjs`, `proxy-*.mjs`, `sms-provider.mjs`, `verification-pipeline.mjs`, `fingerprint-config.mjs`, `google-auth-browser.mjs`, `antigravity-shared.mjs`, `behavior-profile.mjs`, `free-proxy.mjs`, `token-exchange.mjs` |
| `bin/` | 셸 래퍼 및 로컬 URL 처리 도구 | `create-gmail.sh`, `setup-credentials.sh`, `setup-1password-service-account.sh`, `setup_frida.sh`, `xdg-open` |
| `tests/` | MCP 스모크 체크 | `gmail-creator-mcp-smoke.mjs`, `qa-manual.mjs` |
| `docs/` | 운영 상세 문서 | `QUICKSTART.md`, `adb-gmail-creation.md`, `ALTERNATIVE-SMS-PROVIDERS.md`, `verification-bypass-analysis.md` |
| `data/` | 로컬 데이터 입력 | `warmup-progress.json` |
| `tmp/` | 일시적 진단 산출물 | `ui.xml`, `sms-fast-v2.mjs`, 디버그 스크립트 |
| 루트 / Root | 메타데이터 | `package.json`, `package-lock.json`, `LICENSE`, `CONTRIBUTING.md`, `AGENTS.md`, `complete.csv`, `openai-accounts.csv` |

---

## First Files to Read / 먼저 읽을 파일

새로운 기여자나 운영자는 다음 순서로 파일을 읽는 것을 권장합니다. 각 항목은 한 줄 설명과 함께 제공됩니다.

| 순서 / Order | 파일 / File | 이유 / Why |
|--------------|-------------|------------|
| 1 | `AGENTS.md` | 저장소 전체 컨벤션, 코드 맵, "어디를 볼 것인가" 표 |
| 2 | `account/AGENTS.md` | 가장 큰 스크립트 영역인 `account/`의 세부 규칙 |
| 3 | `openai/AGENTS.md` | OpenAI 표면의 세부 규칙 |
| 4 | `antigravity/AGENTS.md` | Antigravity 로컬 상태 처리 규칙 |
| 5 | `lib/AGENTS.md` | 공유 유틸리티 사용 규칙 |
| 6 | `package.json` | 의존성 및 진입점 정의 |
| 7 | `account/gmail-creator-mcp.mjs` | MCP 표면과 도구 등록 패턴 |
| 8 | `lib/browser-launch.mjs`, `lib/cli-args.mjs`, `lib/oauth-callback-server.mjs` | 공유 헬퍼 사용법 |
| 9 | `docs/QUICKSTART.md` | 문서화된 운영 진입 경로 |
| 10 | `CONTRIBUTING.md` | 기여 절차 |

---

## API and Entry Points / API 및 진입점

### 1. 스크립트 진입점 (CLI)

| 진입점 / Entry | 함수 / Function | 위치 / Location | 역할 / Role |
|----------------|-----------------|-----------------|-------------|
| 배치 오케스트레이션 | `main` | `account/create-accounts.mjs` | 다중 계정 흐름의 최상위 진입점 |
| 단일 흐름 재시도 정책 | `createAccountWithRetries` | `account/create-accounts.mjs` | 한 계정 흐름에 대한 재시도/실패 정책 |
| Antigravity 오케스트레이션 | `main` | `antigravity/antigravity-pipeline.mjs` | 로컬 계정 상태 관리 진입점 |
| 수동 토큰 인코딩 | `encodeOAuthTokenInfo` | `antigravity/inject-vscdb-token.mjs` | 로컬 상태 쓰기를 위한 수동 protobuf 인코딩 |

### 2. 공유 라이브러리 진입점

| 진입점 / Entry | 함수 / Function | 위치 / Location | 역할 / Role |
|----------------|-----------------|-----------------|-------------|
| 콜백 서버 | `createCallbackServer` | `lib/oauth-callback-server.mjs` | 타임아웃/종료 시맨틱을 가진 로컬 HTTP 서버 |
| 브라우저 실행 | `launchBrowser` | `lib/browser-launch.mjs` | Playwright/Rebrowser 공통 래퍼 |
| CLI 파서 | `parseCliArgs` | `lib/cli-args.mjs` | 이메일/비밀번호 스크립트용 간단한 공통 파서 |
| 프록시 정규화 | `createProxyConfig` | `lib/proxy-config.mjs` | 프록시 옵션 정규화 및 경고 메타데이터 |

### 3. MCP stdio 서버 (AI 에이전트 통합)

| 서버 / Server | 위치 / Location | 전송 / Transport | 용도 / Purpose |
|---------------|-----------------|------------------|----------------|
| Gmail 작업 MCP | `account/gmail-creator-mcp.mjs` | stdio | 도구 등록, 작업 관리, CSV 파싱 |
| OpenAI 작업 MCP | `openai/openai-creator-mcp.mjs` | stdio | 별도 MCP 표면 |

> MCP 서버에서는 `stdout`이 프로토콜 전용이므로 진단 메시지는 반드시 `stderr`로 작성해야 합니다.

---

## Architecture / 아키텍처

### 계층 구조

| 계층 / Layer | 위치 / Location | 책임 / Responsibility |
|--------------|-----------------|------------------------|
| 운영 도메인 | `account/`, `openai/`, `antigravity/`, `oauth/` | 도메인별 비즈니스 흐름 및 진입점 |
| 공유 유틸리티 | `lib/` | 브라우저 실행, CLI 파싱, OAuth 콜백, 프록시 정규화, CDP/ADB, 상태 파싱 등 재사용 가능한 헬퍼 |
| 플랫폼 백엔드 | Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, Frida | 외부 시스템과의 실제 상호작용 |
| MCP 표면 | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` | AI 에이전트에 도구 노출 (stdio) |
| 셸 래퍼 | `bin/` | 셸 환경에서 호출되는 셋업/도우미 스크립트 |
| 로컬 아티팩트 | `complete.csv`, `openai-accounts.csv`, `data/`, `antigravity/*.json`, `tmp/` | CSV, JSON 토큰, 다운로드 키, 스크린샷, 덤프 등 |

### 요청 흐름 (예: MCP 호출 → 운영 스크립트)

1. AI 에이전트가 stdio를 통해 MCP 서버(`account/gmail-creator-mcp.mjs` 또는 `openai/openai-creator-mcp.mjs`)에 도구 호출을 보냅니다.
2. MCP 서버는 `parseAccountsCsv` 같은 헬퍼로 입력을 정규화하고 작업을 등록합니다.
3. 운영 도메인의 `main` 진입점(예: `account/create-accounts.mjs`)이 작업을 받아 흐름을 시작합니다.
4. 공유 `lib/` 유틸리티(`launchBrowser`, `createCallbackServer`, `createProxyConfig` 등)를 통해 외부 시스템과 상호작용합니다.
5. 결과는 로컬 아티팩트(CSV, JSON)에 기록되며, MCP 응답으로 에이전트에 반환됩니다.

### 설계 컨벤션

- 스크립트는 ESM(`.mjs`)이며 프레임워크 계층이 아닌 운영 도메인별로 그룹화되어 있습니다.
- 많은 스크립트가 `process.argv`에서 직접 CLI 플래그를 파싱합니다. 기존 플래그 이름은 유지해야 합니다.
- 브라우저 흐름, CDP 흐름, ADB 흐름은 헤드리스 Linux 환경을 가정합니다. X 서버가 없는 환경에서 헤디드 모드는 동작하지 않을 수 있습니다.
- 런타임 산출물은 모두 로컬 아티팩트로 취급되며 저장소에 커밋되지 않아야 합니다(루트 CSV는 예외적 결과 누적본).

---

## Quick Start / 빠른 시작

본 README는 운영 자동화 플레이북(계정 생성, 인증 우회, 공급자 호출, 프록시 호출 등)을 포함하지 않습니다. 다음은 일반적인 셋업 절차의 골격이며, 구체적인 운영 절차는 각 스크립트와 `docs/` 폴더를 직접 참고해야 합니다.

| 단계 / Step | 명령 / Command | 설명 / Description |
|-------------|----------------|--------------------|
| 1. 저장소 클론 | `git clone <repository-url>` | 소스 코드 확보 |
| 2. 의존성 설치 | `npm install` | `package.json` 기반 설치 |
| 3. 자격증명 준비 | `bin/setup-credentials.sh` 또는 `bin/setup-1password-service-account.sh` | 로컬 자격증명 위임 |
| 4. OAuth 설정 | `oauth/setup-gcp-oauth.mjs` | GCP OAuth 클라이언트 준비 |
| 5. 모바일 백엔드 준비 | `bin/setup_frida.sh` 또는 `account/infrastructure/setup-emulator.mjs` | Frida 또는 에뮬레이터 셋업 |
| 6. 도메인 진입점 실행 | `node account/create-accounts.mjs` 또는 MCP 서버 실행 | 운영 흐름 시작 |

> 헤드리스 Linux에서는 Playwright/Puppeteer가 헤디드 모드를 가정해서는 안 되며, 디스플레이가 없는 환경에서 X 서버 의존성을 점검해야 합니다.

---

## Configuration / 설정

설정은 주로 환경 변수, 스크립트 플래그, 그리고 `bin/` 셸 래퍼를 통해 이루어집니다. 본 README는 어떤 메커니즘이 존재하는지만 식별하며, 각 키/플래그의 정확한 값이나 운영 의미는 포함하지 않습니다.

| 채널 / Channel | 위치 / Location | 사용처 / Used By |
|----------------|-----------------|------------------|
| 환경 변수 | OS 환경, `.env`(저장소 외부 권장) | 모든 스크립트 |
| CLI 플래그 | `process.argv`, `lib/cli-args.mjs` | 이메일/비밀번호 스크립트 |
| 프록시 설정 | `lib/proxy-config.mjs`, `lib/proxy-relay.mjs`, `lib/proxy-forwarder.mjs`, `lib/free-proxy.mjs` | 브라우저/네트워크 흐름 |
| SMS 제공자 | `lib/sms-provider.mjs` | 인증 흐름 |
| 브라우저 핑거프린트 | `lib/fingerprint-config.mjs`, `lib/behavior-profile.mjs` | 브라우저 실행 |
| OAuth 콜백 | `lib/oauth-callback-server.mjs`, `oauth/` | OAuth 흐름 |
| CDP/ADB 헬퍼 | `lib/cdp-utils.mjs`, `lib/adb-utils.mjs` | 디버깅 및 디바이스 자동화 |

각 키의 정확한 의미와 운영 절차는 해당 헬퍼 파일과 `docs/` 폴더를 참고해야 합니다.

---

## Commands Reference / 명령어 참조

### npm 스크립트

| 명령 / Command | 정의 / Definition | 상태 / Status |
|----------------|-------------------|---------------|
| `npm test` | `echo "Error: no test specified" && exit 1` | 현재 플레이스홀더 |

루트 `npm test`는 실제 테스트를 실행하지 않습니다. 테스트 절차는 [Testing](#testing--테스트) 섹션을 참고하세요.

### 도메인별 메인 스크립트 카테고리

다음 표는 어떤 운영 도메인에 어떤 종류의 스크립트가 있는지를 식별합니다. 각 스크립트의 정확한 호출 형태와 인자 목록은 해당 파일과 `docs/QUICKSTART.md`를 참고하세요.

| 도메인 / Domain | 스크립트 종류 / Script Kind | 대표 파일 / Representative Files |
|----------------|------------------------------|----------------------------------|
| `account/` | 배치 오케스트레이션, MCP, 진단, 인증/연령/웜업 | `create-accounts.mjs`, `gmail-creator-mcp.mjs`, `verify-*.mjs`, `warmup-account.mjs`, `diagnostic-login.mjs`, `infrastructure-diagnostic.mjs` |
| `account/` | 브라우저/CDP 흐름 | `puppeteer-gmail.mjs`, `cdp-login-test.mjs`, `youtube-signup*.mjs`, `redroid-signup-cdp.mjs`, `direct-login-test.mjs` |
| `account/` | 모바일 흐름 | `create-accounts-adb.mjs`, `create-accounts-appium.mjs`, `frida-sms-hook.js` |
| `account/` | 보조 작업 | `family-group.mjs`, `check-account-exists.mjs`, `process-batch-verification.mjs` |
| `openai/` | 배치/점검/MCP | `create-accounts.mjs`, `check-accounts.mjs`, `openai-creator-mcp.mjs`, `test-partner-oauth.mjs` |
| `antigravity/` | 상태/토큰 작업 | `antigravity-pipeline.mjs`, `antigravity-auth.mjs`, `inject-vscdb-token.mjs`, `unlock-features.mjs`, `manual-token-acquire.mjs` |
| `oauth/` | 자격증명/콜백 | `oauth-login.mjs`, `setup-gcp-oauth.mjs` |
| `bin/` | 셸 셋업 | `create-gmail.sh`, `setup-credentials.sh`, `setup-1password-service-account.sh`, `setup_frida.sh`, `xdg-open` |

---

## Local Development / 로컬 개발

| 항목 / Item | 안내 / Guidance |
|-------------|-----------------|
| 언어 / Language | Node.js (ESM, `.mjs`) |
| 의존성 설치 | `npm install` |
| 공통 컨벤션 | `AGENTS.md` 및 하위 도메인 `AGENTS.md` 참조 |
| 스크립트 그룹화 | 운영 도메인 기준(`account/`, `openai/`, `antigravity/`, `oauth/`) |
| 공유 헬퍼 우선 | `lib/`의 헬퍼를 재사용(예: `launchBrowser`, `parseCliArgs`, `createCallbackServer`, `createProxyConfig`) |
| CLI 플래그 호환성 | 기존 플래그 이름 유지 |
| 헤드리스 가정 | Linux 헤드리스에서 동작해야 함 |
| MCP 출력 규약 | MCP 서버 파일에서 `console.log` 사용 금지, 진단은 `stderr`로 |
| 로컬 아티팩트 | CSV/JSON/스크린샷은 커밋 대상이 아님(루트 CSV는 예외) |
| 임시 작업 | `tmp/` 활용, 영구 보관 금지 |

---

## Testing / 테스트

| 항목 / Item | 안내 / Guidance |
|-------------|-----------------|
| 루트 `npm test` | 현재 플레이스홀더로 실제 테스트를 실행하지 않음 |
| 스모크 체크 | `tests/gmail-creator-mcp-smoke.mjs` — 스크립트 기반 MCP 동작 점검 |
| 수동 QA | `tests/qa-manual.mjs` — 수동 절차 참조 |
| 신규 테스트 추가 | 도메인 폴더 또는 `tests/` 아래에 `*.mjs`로 추가 |
| 운영 테스트 | 계정 생성, 인증 우회, 공급자 호출, 프록시 호출 등의 운영 테스트는 의도적으로 본 저장소/AGENTS에서 안내하지 않음 — 로컬 환경에서 별도로 구성 |

테스트 실행은 `node tests/gmail-creator-mcp-smoke.mjs` 형태로 직접 호출하며, npm 스크립트로 묶이지 않은 점에 유의하세요.

---

## Documentation / 문서

| 문서 / Document | 위치 / Location | 범위 / Scope |
|-----------------|-----------------|---------------|
| 저장소 가이드 | `AGENTS.md` | 코드 맵, 컨벤션, "어디를 볼 것인가" |
| 도메인 가이드 | `account/AGENTS.md`, `openai/AGENTS.md`, `antigravity/AGENTS.md`, `lib/AGENTS.md` | 각 도메인별 세부 규칙 |
| 운영 진입 문서 | `docs/QUICKSTART.md` | 운영 진입 절차의 단일 시작점 |
| 운영 상세 문서 | `docs/adb-gmail-creation.md`, `docs/ALTERNATIVE-SMS-PROVIDERS.md`, `docs/verification-bypass-analysis.md` | 각 운영 주제별 상세 |
| OpenAI 표면 안내 | `openai/README.md` | OpenAI 도메인 표면 전용 문서 |
| 기여 절차 | `CONTRIBUTING.md` | 기여 가이드 |

운영 절차에 대한 자세한 내용은 위 문서를 직접 참고하세요. AGENTS 파일에는 운영 예시를 미러링하지 않습니다.

---

## Maintainers and Contacts / 유지보수 및 연락처

| 항목 / Item | 값 / Value |
|-------------|------------|
| `package.json` `author` | (미지정 / unset) |
| `package.json` `name` | `gmail` |
| `package.json` `version` | `1.0.0` |
| `package.json` `license` | ISC |

현재 `package.json`에 유지보수자 메타데이터가 등록되어 있지 않습니다. 내부 유지보수자 또는 책임 엔지니어는 별도 운영 채널을 통해 지정되며, 본 저장소 외부의 연락 경로를 따릅니다. 기여 관련 문의는 `CONTRIBUTING.md`를 참고하세요.

---

## Contributing / 기여

기여 절차는 [`CONTRIBUTING.md`](./CONTRIBUTING.md)를 참고하세요. 일반적인 가이드라인은 다음과 같습니다.

| 가이드라인 / Guideline | 설명 / Description |
|------------------------|--------------------|
| 컨벤션 준수 | `AGENTS.md` 및 도메인별 `AGENTS.md`의 규칙 우선 |
| 공유 헬퍼 재사용 | `lib/` 헬퍼 우선 사용, 흐름 로컬 헬퍼 복제 지양 |
| CLI 플래그 호환성 | 기존 플래그 이름 유지 |
| MCP 출력 규약 | MCP 서버에서 `console.log` 사용 금지, 진단은 `stderr`로 |
| 헤드리스 호환 | Linux 헤드리스 가정에 부합해야 함 |
| 산출물 커밋 금지 | CSV/JSON/스크린샷 등 로컬 아티팩트는 커밋하지 않음(루트 CSV는 예외) |
| 문서 갱신 | 운영 동작 변경 시 `docs/` 동기화 |

---

## License / 라이선스

본 프로젝트는 ISC 라이선스로 배포됩니다. 전문은 [`LICENSE`](./LICENSE) 파일을 참고하세요.

This project is released under the ISC License. See the [`LICENSE`](./LICENSE) file for the full text.