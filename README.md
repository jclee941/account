# gmail — Automation Toolkit / 자동화 툴킷

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)
[![Runtime: Node.js (ESM)](https://img.shields.io/badge/Runtime-Node.js%20ESM-339933.svg)](./package.json)
[![MCP: stdio](https://img.shields.io/badge/MCP-stdio-5A67D8.svg)](./account/gmail-creator-mcp.mjs)
[![Status: Internal / Research](https://img.shields.io/badge/Status-Internal%20%2F%20Research-yellow.svg)](#status--%EC%83%81%ED%83%9C)

## 한국어 요약

Node.js(ESM) 자동화 워크스페이스로, 브라우저 및 Android 기반 워크플로우의 유지보수와 진단을 위한 코드 베이스를 제공합니다. 백엔드로 Playwright/Rebrowser, Puppeteer, Chrome DevTools Protocol(CDP), Appium/WDIO, ADB, Frida를 사용하며, AI 에이전트 통합을 위한 Model Context Protocol(MCP) stdio 서버와 OAuth 콜백 서버, SMS 제공자 추상화 계층, 플러거블 프록시 헬퍼를 함께 제공합니다. 스크립트는 운영 도메인(계정, OAuth, OpenAI, Antigravity, 인프라)별로 분리되어 공유 `lib/` 유틸리티 계층 위에서 실행됩니다. 이 저장소는 정당한 테스트, 내부 도구 개발, QA, 보안 연구 목적으로만 사용해야 합니다.

## English summary

A Node.js (ESM) workspace that hosts the maintenance and diagnostic code for browser- and Android-driven automation flows. It is built on Playwright/Rebrowser, Puppeteer, CDP, Appium/WDIO, ADB, and Frida, and ships two MCP stdio servers for AI-agent integration along with shared helpers for OAuth callbacks, SMS providers, and proxy routing. Scripts are grouped by operational domain (account, OAuth, OpenAI, Antigravity, infrastructure) and reuse a single `lib/` utility layer. This repository is intended for legitimate testing, internal tooling, QA, and security research only.

---

> ⚠️ **책임 있는 사용 / Responsible Use.** 본 툴킷은 사용자가 정당하게 소유하거나 명시적으로 테스트 권한을 부여받은 시스템에 대한 정당한 테스트, 내부 도구 개발, QA, 보안 연구를 위해 공개되었습니다. 운영자는 각 플랫폼의 이용약관과 모든 관련 법규를 준수할 책임이 있습니다. This toolkit is published for legitimate testing, internal tooling, QA, and security research on systems you own or are explicitly authorized to test. Operators are responsible for complying with each platform's Terms of Service and all applicable laws.

---

## 목차 / Table of Contents

1. [상태 / Status](#status--%EC%83%81%ED%83%9C)
2. [빠른 흐름 / Quick Flow](#%EB%B9%A0%EB%A5%B8-%ED%9D%90%EB%A6%BC--quick-flow)
3. [패키지 구성 / Package Contents](#%ED%8C%A8%ED%82%A4%EC%A7%80-%EA%B5%AC%EC%84%B1--package-contents)
4. [먼저 읽을 파일 / First Files to Read](#%EB%A8%BC%EC%A0%80-%EC%9D%BD%EC%9D%84-%ED%8C%8C%EC%9D%BC--first-files-to-read)
5. [API / 진입점 / Entry Points](#api--%EC%A7%84%EC%9E%85%EC%A0%90--entry-points)
6. [Quickstart / 사용 시작](#quickstart--%EC%82%AC%EC%9A%A9-%EC%8B%9C%EC%9E%91)
7. [명령어 참조 / Commands Reference](#%EB%AA%85%EB%A0%B9%EC%96%B4-%EC%B0%B8%EC%A1%B0--commands-reference)
8. [로컬 개발 / Local Development](#%EB%A1%9C%EC%BB%AC-%EA%B0%9C%EB%B0%9C--local-development)
9. [테스트 / Testing](#%ED%85%8C%EC%8A%A4%ED%8C%85--testing)
10. [유지보수자 / Maintainers](#%EC%9C%A0%EC%A7%80%EB%B3%B4%EC%88%98%EC%9E%90--maintainers)
11. [기여 / Contributing](#%EA%B8%B0%EC%97%AC--contributing)
12. [추가 문서 / Further Documentation](#%EC%B6%94%EA%B0%80-%EB%AC%B8%EC%84%9C--further-documentation)
13. [라이선스 / License](#%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4--license)

---

## 상태 / Status

| 영역 / Area | 상태 / Status | 메모 / Notes |
|---|---|---|
| 안정성 / Stability | 내부 / Research | 운영 환경 검증 전 |
| 사용 범위 / Intended use | 유지보수·진단 / Maintenance & diagnostics | 자동화 런북은 본 저장소에서 분리 유지 |
| 테스트 / Tests | 스모크 체크만 / Smoke checks only | 루트 `npm test`는 플레이스홀더 |
| MCP 전송 / MCP transport | stdio | stdout은 프로토콜 전용, 진단은 stderr로 |
| 브라우저 모드 / Browser mode | 헤드리스 Linux 가정 | X 서버 없이는 헤디드 모드 비추천 |
| 의존성 잠금 / Lock file | `package-lock.json` | 재현 가능한 설치 지원 |
| 문서 / Docs | `docs/`, `openai/README.md`, `AGENTS.md` | 운영 예시는 `docs/` 참조 |

## 빠른 흐름 / Quick Flow

운영자가 신규 환경에서 코드 베이스를 점검할 때 따르는 흐름입니다. 자동화 시나리오 실행이 아닌, **유지보수와 진단 관점**의 절차입니다.

1. 저장소를 클론하고 Node.js 의존성을 설치합니다. → `npm install`
2. `package.json`과 `lib/AGENTS.md`로 공유 헬퍼 표면을 파악합니다.
3. 도메인 디렉터리(`account/`, `antigravity/`, `oauth/`, `openai/`)의 자식 `AGENTS.md`를 읽고 진입점 규약을 확인합니다.
4. MCP 서버는 `node account/gmail-creator-mcp.mjs` 또는 `node openai/openai-creator-mcp.mjs`로 stdio 실행합니다.
5. 회귀 확인은 `tests/gmail-creator-mcp-smoke.mjs`로 스모크 체크합니다.
6. 자세한 운영 절차는 `docs/`의 문서를 참조합니다.

---

## 패키지 구성 / Package Contents

도메인별로 분리된 디렉터리 구조입니다. 각 영역은 독립적으로 import 가능하며, 공통 로직은 `lib/`을 거치도록 설계되어 있습니다.

| 경로 / Path | 역할 / Role | 진입점 / Entry point |
|---|---|---|
| `account/` | Gmail·YouTube 등 계정 도메인 스크립트와 MCP 서버 | `account/gmail-creator-mcp.mjs` (MCP), `account/create-accounts.mjs` (배치) |
| `antigravity/` | Antigravity 계정 상태 및 토큰 유지보수 | `antigravity/antigravity-pipeline.mjs` |
| `oauth/` | OAuth 자격 증명·로그인 협소 래퍼 | `oauth/oauth-login.mjs`, `oauth/setup-gcp-oauth.mjs` |
| `openai/` | OpenAI 도메인 스크립트와 MCP 서버 | `openai/openai-creator-mcp.mjs` (MCP) |
| `lib/` | 공유 헬퍼(브라우저, CDP, ADB, 프록시, SMS, CLI, 콜백 서버) | `lib/browser-launch.mjs`, `lib/oauth-callback-server.mjs` |
| `bin/` | 셸 래퍼 및 로컬 URL 처리 도구 | `bin/setup-*.sh`, `bin/xdg-open` |
| `tests/` | MCP 스모크 체크 | `tests/gmail-creator-mcp-smoke.mjs`, `tests/qa-manual.mjs` |
| `docs/` | 운영 문서 및 분석 | `docs/QUICKSTART.md` 등 |
| `data/` | 프로젝트 데이터 입력 | `data/warmup-progress.json` |
| `tmp/` | 일시적 디버깅 산출물 | `tmp/ui.xml` 등 |

### 도메인별 핵심 심볼 / Key symbols by domain

| 심볼 / Symbol | 종류 / Kind | 위치 / Location | 역할 / Role |
|---|---|---|---|
| `main` | function | `account/create-accounts.mjs` | 배치 오케스트레이션 진입점 |
| `createAccountWithRetries` | function | `account/create-accounts.mjs` | 단일 플로우 재시도 정책 |
| `Server` | top-level | `account/gmail-creator-mcp.mjs` | MCP 도구 등록·작업 관리·CSV 파싱 |
| `parseAccountsCsv` | function | `account/gmail-creator-mcp.mjs`, `antigravity/antigravity-pipeline.mjs` | 멀티라인 허용 CSV 파싱 |
| `main` | function | `antigravity/antigravity-pipeline.mjs` | 로컬 계정 상태 오케스트레이션 |
| `encodeOAuthTokenInfo` | function | `antigravity/inject-vscdb-token.mjs` | 로컬 상태 기록용 프로토버프 인코딩 |
| `createCallbackServer` | function | `lib/oauth-callback-server.mjs` | 타임아웃·종료 시맨틱을 가진 로컬 HTTP 콜백 서버 |
| `launchBrowser` | function | `lib/browser-launch.mjs` | Playwright/Rebrowser 공통 래퍼 |
| `parseCliArgs` | function | `lib/cli-args.mjs` | 이메일/비밀번호 스크립트용 단순 CLI 파서 |
| `createProxyConfig` | function | `lib/proxy-config.mjs` | 프록시 옵션 정규화 및 경고 메타 |
| `Server` | top-level | `openai/openai-creator-mcp.mjs` | 별도 MCP stdio 서버 표면 |

---

## 먼저 읽을 파일 / First Files to Read

저장소를 처음 접할 때 아래 순서로 읽으면 도메인 경계와 규약을 빠르게 잡을 수 있습니다.

| 순서 / # | 파일 / File | 이유 / Why |
|---|---|---|
| 1 | `AGENTS.md` | 프로젝트 지식 베이스, 구조와 규약 |
| 2 | `package.json` | 의존성과 런타임 버전 |
| 3 | `lib/AGENTS.md` | 공유 헬퍼 표면과 재사용 규칙 |
| 4 | `account/AGENTS.md` | 가장 큰 스크립트 영역의 진입점 규약 |
| 5 | `openai/AGENTS.md` | OpenAI 표면 규약 |
| 6 | `antigravity/AGENTS.md` | 토큰·상태 유지보수 규약 |
| 7 | `docs/QUICKSTART.md` | 운영 컨텍스트 보조 문서 |

---

## API / 진입점 / Entry Points

MCP 서버, CLI 스크립트, 라이브러리 진입점을 분리해서 정리합니다. **이 표는 코드 위치와 시그니처만 안내하며, 실행 가능한 자동화 절차는 포함하지 않습니다.**

| 종류 / Kind | 진입점 / Entry | 전송·호출 방식 / Transport | 진단 출력 / Diagnostics |
|---|---|---|---|
| MCP stdio 서버 (Gmail 도메인) | `account/gmail-creator-mcp.mjs` | stdio (`node ...mjs`) | stderr 전용 |
| MCP stdio 서버 (OpenAI 도메인) | `openai/openai-creator-mcp.mjs` | stdio (`node ...mjs`) | stderr 전용 |
| 배치 오케스트레이션 | `account/create-accounts.mjs`의 `main` | Node 스크립트 | stdout·stderr 모두 사용 가능 |
| Antigravity 오케스트레이션 | `antigravity/antigravity-pipeline.mjs`의 `main` | Node 스크립트 | stdout·stderr 모두 사용 가능 |
| OAuth 콜백 서버 | `lib/oauth-callback-server.mjs`의 `createCallbackServer` | 라이브러리 import | 호출자 정책 따름 |
| 브라우저 부트스트랩 | `lib/browser-launch.mjs`의 `launchBrowser` | 라이브러리 import | 호출자 정책 따름 |
| 프록시 정규화 | `lib/proxy-config.mjs`의 `createProxyConfig` | 라이브러리 import | 경고 메타데이터 |
| CLI 인자 파서 | `lib/cli-args.mjs`의 `parseCliArgs` | 라이브러리 import | — |

### 외부 의존성 / External dependencies

| 패키지 / Package | 용도 / Purpose |
|---|---|
| `@gongrzhe/server-gmail-autoauth-mcp` | Gmail 자동 인증 MCP 백엔드 |
| `@modelcontextprotocol/sdk` | MCP 서버 SDK |
| `@playwright/mcp` | Playwright MCP 어댑터 |
| `ghost-cursor-playwright` | 사람형 커서 시뮬레이션 |
| `jsqr`, `pngjs` | QR·이미지 파싱 |
| `rebrowser-playwright` | Playwright 패치 포크 |
| `webdriverio` | Appium/WDIO 클라이언트 |
| `ws` | WebSocket 클라이언트(CDP 등) |

---

## Quickstart / 사용 시작

> 📋 이 섹션은 **로컬 개발 환경 구성**만 다룹니다. 자동화 워크플로우의 실행 절차는 의도적으로 본 README에 포함하지 않으며, `docs/`의 별도 문서 또는 도메인 `AGENTS.md`를 참조하십시오.

### 1. 요구 사항 / Requirements

- Node.js (LTS 권장, ESM 지원 버전)
- Linux 환경 권장(헤드리스 시나리오 가정이 다수 존재)
- 필요 시 `adb` 및 Android 에뮬레이터/디바이스, Frida 서버

### 2. 설치 / Install

```bash
npm install
```

`package-lock.json`이 커밋되어 있으므로 재현 가능한 설치가 가능합니다.

### 3. 환경 점검 / Sanity check

```bash
# MCP 서버가 stdio에서 응답하는지 진단(직접 stdio 송수신은 자동화 클라이언트에 위임)
node account/gmail-creator-mcp.mjs < /dev/null

# 스모크 체크 실행
node tests/gmail-creator-mcp-smoke.mjs
```

> ⚠️ MCP 서버는 stdout을 프로토콜 메시지 전용으로 사용합니다. 진단 로깅은 반드시 stderr로 보내야 합니다.

---

## 명령어 참조 / Commands Reference

| 명령 / Command | 설명 / Description |
|---|---|
| `npm install` | 의존성 설치 |
| `npm test` | 현재는 플레이스홀더(에러 후 비정상 종료) — `tests/`의 스모크 스크립트를 직접 실행 권장 |
| `node account/gmail-creator-mcp.mjs` | Gmail 도메인 MCP stdio 서버 |
| `node openai/openai-creator-mcp.mjs` | OpenAI 도메인 MCP stdio 서버 |
| `node account/create-accounts.mjs` | 배치 오케스트레이션 진입점 |
| `node antigravity/antigravity-pipeline.mjs` | Antigravity 오케스트레이션 진입점 |
| `node oauth/oauth-login.mjs` | OAuth 로그인 협소 헬퍼 |
| `bash bin/setup-credentials.sh` | 자격 증명 부트스트랩(로컬) |
| `bash bin/setup_frida.sh` | Frida 환경 준비(로컬) |
| `bash bin/setup-1password-service-account.sh` | 1Password 서비스 계정 부트스트랩(로컬) |
| `bash bin/create-gmail.sh` | 로컬 래퍼(내부 사용) |
| `node tests/gmail-creator-mcp-smoke.mjs` | MCP 스모크 체크 |
| `node tests/qa-manual.mjs` | 수동 QA 시나리오 진입점 |

---

## 로컬 개발 / Local Development

### 코딩 규약 / Conventions

- 모든 스크립트는 ESM(`.mjs`)으로 작성합니다.
- 도메인별 디렉터리(`account/`, `antigravity/`, `oauth/`, `openai/`, `lib/`)에 그룹화합니다. 프레임워크 계층이 아닌 운영 도메인 기준입니다.
- 브라우저 플로우는 헤드리스 Linux 환경을 가정합니다. X 서버가 없는 환경에서 헤디드 모드를 가정하지 마십시오.
- CLI 플래그는 `process.argv`에서 직접 파싱하는 스크립트가 많습니다. 기존 플래그 이름을 유지해 주십시오.
- 공유 헬퍼(브라우저 부트스트랩, CLI 파서, OAuth 콜백, 프록시 정규화, 상태 파싱)는 `lib/`에서 우선 재사용하십시오.
- MCP 서버 파일에서는 `console.log`로 진단을 출력하지 마십시오. stdout은 MCP 메시지 전용입니다.
- CSV, JSON 토큰, 다운로드 키, 스크린샷, 덤프 등은 **로컬 산출물**이며 저장소에 커밋하지 마십시오.

### 디렉터리 책임 / Directory responsibilities

| 디렉터리 / Dir | 책임 / Responsibility | 금지 / Avoid |
|---|---|---|
| `account/` | 계정 도메인 스크립트와 MCP 표면 | 공유 로직 복제 |
| `antigravity/` | 로컬 상태 파일, 토큰 주입, 서브프로세스 | 외부 API 직접 호출 |
| `lib/` | 재사용 가능한 헬퍼 | 도메인 지식 포함 |
| `oauth/` | OAuth 자격 증명·로그인 협소 래퍼 | 광범위 비즈니스 로직 |
| `openai/` | OpenAI 도메인 스크립트와 MCP 표면 | `account/` 코드 의존 |
| `bin/` | 셸 부트스트랩, URL 처리 | 비결정적 동작 |
| `tests/` | 스모크 체크 | 광범위 통합 테스트 |
| `docs/` | 운영 문서·분석 | 소스 코드 미러 |

---

## 테스트 / Testing

| 대상 / Target | 방법 / Method | 위치 / Location |
|---|---|---|
| MCP 기본 동작 | 스크립트형 스모크 체크 | `tests/gmail-creator-mcp-smoke.mjs` |
| 수동 QA | `qa-manual.mjs` 진입 | `tests/qa-manual.mjs` |
| 루트 테스트 | 현재 플레이스홀더 | `package.json`의 `scripts.test` |

> 🔍 신규 헬퍼는 가능하면 `tests/` 아래에 스모크 체크를 추가해 회귀를 빠르게 감지하도록 합니다.

---

## 유지보수자 / Maintainers

| 항목 / Item | 값 / Value |
|---|---|
| 패키지명 / Package name | `gmail` |
| 버전 / Version | `1.0.0` |
| 라이선스 / License | ISC (`./LICENSE`) |
| 작성자(공식) / Author (declared) | `package.json` 기준 미기재 — 도메인 `AGENTS.md`와 저장소 히스토리 참조 |
| 유지보수 범위 / Maintenance scope | 내부 연구·진단 코드 베이스 |

새로운 유지보수자는 먼저 `AGENTS.md`와 각 도메인의 `AGENTS.md`를 읽어 코드 표면과 규약을 파악한 뒤 작업을 시작해 주십시오.

---

## 기여 / Contributing

기여 절차는 [`CONTRIBUTING.md`](./CONTRIBUTING.md)를 참조하십시오. 일반 가이드라인:

- 도메인 디렉터리의 자식 `AGENTS.md`를 먼저 확인합니다.
- 공유 로직은 `lib/`의 기존 헬퍼 재사용을 우선합니다.
- CLI 플래그 이름과 시그니처는 기존 호출자와 호환되도록 유지합니다.
- MCP 서버 변경 시 stdout 사용(프로토콜)과 stderr 사용(진단) 경계를 지킵니다.
- 로컬 산출물(CSV, 토큰 JSON, 키, 스크린샷, 덤프)은 커밋하지 않습니다.

---

## 추가 문서 / Further Documentation

| 문서 / Document | 위치 / Path | 내용 / Content |
|---|---|---|
| 프로젝트 지식 베이스 | `AGENTS.md` | 구조, 코드 맵, 규약 |
| 계정 도메인 가이드 | `account/AGENTS.md` | Gmail 도메인 진입점 규약 |
| Antigravity 가이드 | `antigravity/AGENTS.md` | 토큰·상태 유지보수 규약 |
| OpenAI 가이드 | `openai/AGENTS.md` | OpenAI 도메인 규약 |
| OpenAI 도메인 README | `openai/README.md` | OpenAI 표면 메모 |
| 라이브러리 가이드 | `lib/AGENTS.md` | 공유 헬퍼 표면과 재사용 규칙 |
| 빠른 시작 | `docs/QUICKSTART.md` | 운영 컨텍스트 보조 문서 |
| 대안 SMS 제공자 | `docs/ALTERNATIVE-SMS-PROVIDERS.md` | SMS 추상화 계층 메모 |
| ADB Gmail 생성 메모 | `docs/adb-gmail-creation.md` | ADB 기반 진단 메모 |
| 인증 우회 분석 | `docs/verification-bypass-analysis.md` | 분석 자료(런북 아님) |

---

## 라이선스 / License

이 저장소는 [ISC License](./LICENSE) 하에 배포됩니다. 사용 시 각 플랫폼의 이용약관과 관련 법규를 준수할 책임은 운영자에게 있습니다.