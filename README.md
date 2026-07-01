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

| Field | Value | Note |
|-------|-------|------|
| Package name | `gmail` | `package.json` |
| Module system | ESM (`*.mjs`) | Node.js 18+ 권장 |
| License | ISC | `LICENSE` |
| `npm test` | placeholder | exits 1, 실제 테스트 미실행 |
| MCP servers | 2 stdio | `account/gmail-creator-mcp.mjs`, `openai/openai-creator-mcp.mjs` |
| Headless support | Linux 비-X 환경 고려 | `lib/browser-launch.mjs` |
| 운영 책임 | 운영자 부담 | 약관/법규 준수 |
| Deprecation | 활성(Active) | production-ready 단언 없음 |

---

## Quick Flow / 빠른 흐름

1. Operator or AI agent invokes a CLI script or MCP tool.
2. `lib/` 헬퍼가 CLI 인자, 프록시, 브라우저 런치, OAuth 콜백 서버를 정규화
3. 운영 도메인 진입점(`account/`, `openai/`, `antigravity/`, `oauth/`)이 도메인별 흐름 실행
4. Backend adapter(CDP/Playwright/Appium/ADB/Frida)가 브라우저/디바이스와 상호작용
5. 결과는 로컬 아티팩트로 기록 — CSV 레코드, JSON 토큰, 로컬 상태 파일, 스크린샷, 덤프

### Role-based next action / 역할별 다음 행동

| Role | Next command / endpoint |
|------|-------------------------|
| Operator | `bash bin/setup_credentials.sh` → 도메인 진입점 실행 |
| MCP client (Gmail) | `node account/gmail-creator-mcp.mjs` (stdio) |
| MCP client (OpenAI) | `node openai/openai-creator-mcp.mjs` (stdio) |
| Maintainer | `AGENTS.md` 및 도메인별 `AGENTS.md` 검토 |

---

## Package Contents / 패키지 구성

| Directory | Role |
|-----------|------|
| `account/` | Gmail-oriented automation scripts and MCP server |
| `antigravity/` | Antigravity 로컬 계정 상태/토큰 유지 보수 헬퍼 |
| `lib/` | 공유 유틸리티(CLI, 브라우저, CDP, ADB, 프록시, OAuth 콜백, 파서) |
| `oauth/` | 좁은 범위의 OAuth 자격 증명/로그인 헬퍼 |
| `openai/` | OpenAI 지향 별도 스크립트 및 MCP 서버 |
| `tests/` | MCP 스모크 체크 |
| `docs/` | 운영/분석 문서 |
| `bin/` | 셸 래퍼 및 로컬 URL 인터셉션 헬퍼 |
| `data/` | 프로젝트 데이터 입력(예: 워밍업 진행 상태) |

---

## First Files to Read / 먼저 읽을 파일

| File | Why |
|------|-----|
| `package.json` | 의존성, 메타, 진입점 선언 |
| `AGENTS.md` | 저장소 유지 보수 가이드, 코드 맵 |
| `account/AGENTS.md` | `account/` 세부 규칙 |
| `openai/AGENTS.md` | `openai/` 세부 규칙 |
| `antigravity/AGENTS.md` | `antigravity/` 세부 규칙 |
| `lib/AGENTS.md` | 공유 헬퍼 사용 규약 |
| `docs/QUICKSTART.md` | 운영 문서(재사용 전 검토) |

---

## API and Entry Points / API 및 진입점

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `main` | function | `account/create-accounts.mjs` | 배치 오케스트레이션 진입점 |
| `createAccountWithRetries` | function | `account/create-accounts.mjs` | 단일 흐름의 재시도 정책 |
| `Server` setup | top-level | `account/gmail-creator-mcp.mjs` | MCP 도구 등록, 작업 관리, CSV 파싱 |
| `parseAccountsCsv` | function | `account/gmail-creator-mcp.mjs`, `antigravity/antigravity-pipeline.mjs` | 멀티라인 허용 CSV 레코드 파싱 |
| `main` | function | `antigravity/antigravity-pipeline.mjs` | 로컬 계정 상태 오케스트레이션 진입점 |
| `encodeOAuthTokenInfo` | function | `antigravity/inject-vscdb-token.mjs` | 로컬 상태 쓰기용 수동 protobuf 인코딩 |
| `createCallbackServer` | function | `lib/oauth-callback-server.mjs` | 타임아웃/종료 시맨틱의 로컬 HTTP 콜백 서버 |
| `launchBrowser` | function | `lib/browser-launch.mjs` | 공유 Playwright/Rebrowser 런치 래퍼 |
| `parseCliArgs` | function | `lib/cli-args.mjs` | 이메일/비밀번호 스크립트용 CLI 파서 |
| `createProxyConfig` | function | `lib/proxy-config.mjs` | 프록시 옵션 정규화 및 경고 메타데이터 |
| `Server` setup | top-level | `openai/openai-creator-mcp.mjs` | 별도 MCP stdio 서버 서피스 |

---

## Architecture / 아키텍처

### Layered responsibilities / 계층별 책임

| Layer | Responsibility |
|-------|----------------|
| Entry points | 도메인별 CLI/MCP 진입점 |
| Shared utilities | 파싱, 런치, 콜백, 프록시 정규화 |
| Backend adapters | Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, Frida |
| External integrations | OAuth 제공자, SMS 제공자, 프록시 제공자 |
| Local artifacts | CSV, JSON, 토큰 상태, 스크린샷, 덤프 |

### Request flow / 요청 흐름

1. Operator/agent가 CLI 또는 MCP 도구를 호출
2. `lib/` 헬퍼가 CLI 인자, 프록시, 브라우저 런치, OAuth 콜백을 정규화
3. 도메인 진입점이 도메인별 흐름 실행
4. Backend adapter가 브라우저/디바이스 상호작용 수행
5. 결과는 로컬 아티팩트로 기록

---

## Quick Start / 빠른 시작

> 운영 책임은 운영자에게 있습니다. 자동화 대상 시스템의 이용약관과 권한을 먼저 확인하세요.

### Requirements / 요구 사항

- Node.js 18+ (ESM, `*.mjs`)
- Linux headless 환경 권장(헤드리스 가정, X 서버 불필요)
- Android 흐름 사용 시 ADB, Appium, Frida
- MCP 통합 시 stdio 지원 클라이언트

### Install / 설치

```bash
npm install
```

### Configure / 설정

```bash
bash bin/setup_credentials.sh
bash bin/setup-1password-service-account.sh
node oauth/setup-gcp-oauth.mjs
```

### Run MCP servers / MCP 서버 실행

```bash
node account/gmail-creator-mcp.mjs     # Gmail 도메인 MCP stdio 서버
node openai/openai-creator-mcp.mjs     # OpenAI 도메인 MCP stdio 서버
```

> MCP 서버는 stdout을 프로토콜 메시지에 사용합니다. 진단 로그는 stderr로 출력하세요.

---

## Configuration / 설정

| Area | Location | Form |
|------|----------|------|
| CLI flags | 각 `*.mjs` | `process.argv` 직접 파싱, 기존 플래그명 유지 |
| OAuth callback | `lib/oauth-callback-server.mjs` | 로컬 HTTP 서버, 타임아웃/종료 시맨틱 |
| Proxy | `lib/proxy-config.mjs`, `lib/proxy-relay.mjs`, `lib/proxy-forwarder.mjs` | 정규화 옵션 + 경고 메타데이터 |
| SMS provider | `lib/sms-provider.mjs` | 추상화된 제공자 계층 |
| Browser fingerprint | `lib/fingerprint-config.mjs` | 공유 지문 설정 |
| Behavior profile | `lib/behavior-profile.mjs` | 동작 시뮬레이션 프로파일 |
| Token exchange | `lib/token-exchange.mjs` | OAuth 토큰 교환 헬퍼 |
| Google auth browser | `lib/google-auth-browser.mjs` | Google 인증용 브라우저 헬퍼 |
| Account state | `data/warmup-progress.json` | 로컬 진행 상태 |
| Antigravity results | `antigravity/antigravity-auth-results.json` | 인증 결과 캐시 |
| Free proxy | `lib/free-proxy.mjs` | 무료 프록시 디스커버리 헬퍼 |

---

## Commands Reference / 명령어 참조

> 운영 플레이북은 본 README에서 제공하지 않습니다. 각 스크립트 실행 전 해당 스크립트의 CLI 인자를 확인하세요.

### Gmail 도메인 진입점

| Command | Purpose |
|---------|---------|
| `node account/create-accounts.mjs` | 배치 오케스트레이션 |
| `node account/create-accounts-cdp.mjs` | CDP 기반 배치 생성 |
| `node account/create-accounts-appium.mjs` | Appium 기반 배치 생성 |
| `node account/create-accounts-adb.mjs` | ADB 기반 배치 생성 |
| `node account/gmail-creator-mcp.mjs` | Gmail MCP stdio 서버 |
| `node account/puppeteer-gmail.mjs` | Puppeteer 기반 Gmail 흐름 |
| `node account/verify-account.mjs` | 단일 계정 검증 |
| `node account/verify-all-accounts.mjs` | 전체 계정 검증 |
| `node account/verify-age.mjs` | 연령/생년월일 검증 흐름 |
| `node account/warmup-account.mjs` | 워밍업 흐름 |
| `node account/youtube-signup.mjs` | YouTube 가입 흐름 |
| `node account/youtube-signup-cdp.mjs` | YouTube 가입(CDP 변형) |
| `node account/redroid-signup-cdp.mjs` | Redroid 기반 가입(CDP) |
| `node account/diagnostic-login.mjs` | 로그인 진단 |
| `node account/direct-login-test.mjs` | 직접 로그인 테스트 |
| `node account/cdp-login-test.mjs` | CDP 로그인 테스트 |
| `node account/check-account-exists.mjs` | 계정 존재 여부 |
| `node account/family-group.mjs` | 패밀리 그룹 흐름 |
| `node account/process-batch-verification.mjs` | 배치 검증 처리 |
| `node account/infrastructure-diagnostic.mjs` | 인프라 진단 |
| `node account/debug-sms-capture.mjs` | SMS 캡처 디버그 |
| `node account/test-partner-oauth.mjs` | 파트너 OAuth 테스트 |

### OpenAI 도메인 진입점

| Command | Purpose |
|---------|---------|
| `node openai/create-accounts.mjs` | OpenAI 배치 생성 |
| `node openai/check-accounts.mjs` | OpenAI 계정 점검 |
| `node openai/openai-creator-mcp.mjs` | OpenAI MCP stdio 서버 |

### Antigravity 진입점

| Command | Purpose |
|---------|---------|
| `node antigravity/antigravity-pipeline.mjs` | Antigravity 상태/토큰 오케스트레이션 |
| `node antigravity/antigravity-auth.mjs` | Antigravity 인증 흐름 |
| `node antigravity/inject-vscdb-token.mjs` | 수동 토큰 주입 |
| `node antigravity/manual-token-acquire.mjs` | 수동 토큰 획득 |
| `node antigravity/unlock-features.mjs` | 기능 잠금 해제 흐름 |

### OAuth 및 셸 래퍼

| Command | Purpose |
|---------|---------|
| `node oauth/oauth-login.mjs` | OAuth 로그인 |
| `node oauth/setup-gcp-oauth.mjs` | GCP OAuth 설정 |
| `bash bin/create-gmail.sh` | Gmail 생성 셸 래퍼 |
| `bash bin/setup_credentials.sh` | 자격 증명 설정 셸 래퍼 |
| `bash bin/setup-1password-service-account.sh` | 1Password 서비스 계정 설정 |
| `bash bin/setup_frida.sh` | Frida 환경 설정 |
| `bash bin/xdg-open` | 로컬 URL 인터셉션 래퍼 |

### Infrastructure 및 테스트

| Command | Purpose |
|---------|---------|
| `node account/infrastructure/setup-emulator.mjs` | 에뮬레이터 설정 |
| `node tests/gmail-creator-mcp-smoke.mjs` | Gmail MCP 스모크 체크 |
| `node tests/qa-manual.mjs` | 수동 QA 진입점 |

---

## Local Development / 로컬 개발

- ESM(`.mjs`) 및 운영 도메인별 그룹화 규칙 유지
- 공유 헬퍼 우선 재사용 — `lib/`의 browser launch, CLI parsing, OAuth callback, proxy normalization, local state parsing
- 기존 CLI 플래그 시그니처 유지(`process.argv` 직접 파싱 스크립트 다수)
- Linux 헤드리스 환경 가정, headed 모드 가정 금지
- MCP 서버에서 진단 로그는 stderr로 출력(stdout은 MCP 메시지 전용)
- 로컬 아티팩트(CSV, JSON, 스크린샷, 덤프, 다운로드 키)는 커밋 대상 아님
- `data/`, `tmp/`, `*.csv` 파일은 변경 의도를 확인한 뒤에만 수정

---

## Testing / 테스트

| Item | Location | Note |
|------|----------|------|
| Root `npm test` | `package.json` | placeholder — 실제 테스트 미실행, 종료 코드 1 |
| MCP smoke | `tests/gmail-creator-mcp-smoke.mjs` | 스크립트 기반 수동 체크 |
| Manual QA | `tests/qa-manual.mjs` | 수동 QA 진입점 |
| Throwaway debug | `tmp/` | 일회성 디버그 산출물 |

CI/자동 테스트는 저장소에 포함되어 있지 않습니다. 자동화된 검증 파이프라인을 도입하기 전까지 새 스크립트는 수동 점검을 기준으로 합니다.

---

## Documentation / 문서

| Document | Location | Note |
|----------|----------|------|
| Quick start | `docs/QUICKSTART.md` | 운영 진입 가이드 |
| ADB Gmail creation | `docs/adb-gmail-creation.md` | ADB 흐름 상세 |
| Alternative SMS providers | `docs/ALTERNATIVE-SMS-PROVIDERS.md` | SMS 제공자 비교 |
| Verification bypass analysis | `docs/verification-bypass-analysis.md` | 분석 노트 |
| OpenAI notes | `openai/README.md` | OpenAI 하위 디렉토리 안내 |
| Project knowledge base | `AGENTS.md` | 유지 보수/진단 가이드 |

운영 세부 절차는 `docs/`를 우선 참고하되, AGENTS.md 정책상 본 README는 운영 플레이북을 복제하지 않습니다.

---

## Maintainers and Contacts / 유지보수 및 연락처

| Role | Source |
|------|--------|
| Repo-wide maintenance guide | `AGENTS.md` |
| `account/` rules | `account/AGENTS.md` |
| `openai/` rules | `openai/AGENTS.md` |
| `antigravity/` rules | `antigravity/AGENTS.md` |
| `lib/` conventions | `lib/AGENTS.md` |
| Contribution process | `CONTRIBUTING.md` |
| License terms | `LICENSE` |

도움을 받을 위치: 도메인별 `AGENTS.md`로 시작해 코드 맵에서 심볼 위치를 찾고, 필요 시 `docs/`의 분석 노트로 이동합니다.

---

## Contributing / 기여

기여 절차는 `CONTRIBUTING.md`를 따릅니다. 스크립트 편집 시 다음을 유지하세요:

- ESM(`.mjs`) 및 도메인별 그룹화 규칙
- 기존 CLI 플래그 시그니처
- 공유 `lib/` 헬퍼 우선 사용
- MCP 서버의 stdout/stderr 분리
- 로컬 아티팩트 미커밋
- 자동화 대상 시스템의 이용약관 준수

---

## License / 라이선스

ISC — 자세한 내용은 [`LICENSE`](./LICENSE) 참조.