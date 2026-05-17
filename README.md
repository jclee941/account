<think>
The user wants me to generate a comprehensive README.md for a repository based on the project structure, workflow files, package.json, current README.md, and AGENTS.md content provided.

Let me analyze the key information:

1. **Project Purpose**: Gmail automation workspace for account creation, Antigravity IDE auth, OAuth credential management
2. **Tech Stack**: Node.js ESM, Playwright/Rebrowser, 5sim SMS
3. **Current README** (partial): Shows basic structure, features, requirements, installation, quick start

From the data provided:
- Workflow files: 27 total workflows (01_branch-to-pr.yml through 60_ci-auto-heal.yml, plus ci.yml)
- No Go automation tools (0 total)
- Package dependencies: @gongrzhe/server-gmail-autoauth-mcp, @modelcontextprotocol/sdk, @playwright/mcp, ghost-cursor-playwright, jsqr, pngjs, rebrowser-playwright, webdriverio, ws

From AGENTS.md:
- Structure clearly outlined
- Key scripts identified with line counts
- MCP server with 4 tools
- Tests directory mentioned

From workflow file names:
- Branch/PR automation: 01, 02, 03, 10, 13, 14, 15
- Security scanning: 04 (actionlint), 05 (gitleaks), 06 (codeql), 07 (dependency-review)
- Quality: 08 (scorecard), 09 (semantic-pr)
- Issue management: 18, 19, 37, 43
- Documentation: 20 (readme-gen), 21 (docs-sync), 42 (docs-sync reusable), 44 (pr-checks reusable)
- Release: 24, 25
- Downstream: 29 (downstream-health-check)
- Dependabot: 12


- Bot automation: 60 (ci-auto-heal)

Now I need to create a bilingual README (Korean and English) with a comprehensive professional structure. I'll write it in Korean first, then English, using the detailed project information to ensure accuracy.

</think>

# Gmail 자동화 워크스페이스 README

```markdown
# Gmail Automation Workspace / Gmail 자동화 워크스페이스

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/$(gh repo-owner --repo-name)/ci.yml?label=CI)](https://github.com/$(gh repo-owner --repo-name)/actions)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node.js-18%2B-green)](https://nodejs.org/)

---

## Overview / 개요

A Node.js ESM workspace for Gmail account creation, Antigravity IDE authentication, and OAuth credential management. Uses Playwright/Rebrowser for browser automation and 5sim for SMS verification.

Gmail 계정 생성, Antigravity IDE 인증 및 OAuth 자격 증명 관리를 위한 Node.js ESM 워크스페이스입니다. 브라우저 자동화에는 Playwright/Rebrowser를 사용하고, SMS 인증에는 5sim을 사용합니다.

---

## Features / 기능

| Feature | Description | Script |
|---------|-------------|--------|
| **Gmail 계정 생성** | 5sim SMS 인증을 통한 일괄 Gmail 계정 생성 | `account/create-accounts.mjs` |
| **ADB/Android 자동화** | Android Chrome 기반 ADB 자동화 | `account/create-accounts-adb.mjs` |
| **CDP 모드** | ReDroid WebView를 통한 Chrome DevTools Protocol 모드 | `account/create-accounts-cdp.mjs` |
| **Appium 지원** | Docker Android 에뮬레이터 + Appium 통합 | `account/create-accounts-appium.mjs` |
| **Antigravity 인증** | OAuth + SMS 인증 파이프라인 | `antigravity/antigravity-auth.mjs` |
| **Antigravity 파이프라인** | 종단간 계정 활성화 오케스트레이터 | `antigravity/antigravity-pipeline.mjs` |
| **MCP 서버** | Model Context Protocol 기반 계정 생성 도구 (4개 도구) | `account/gmail-creator-mcp.mjs` |
| **가족 그룹** | Gmail 가족 초대/수락 워크플로우 | `account/family-group.mjs` |
| **나이 인증** | 5sim SMS를 통한 나이 확인 | `account/verify-age.mjs` |
| **OAuth 헬퍼** | GCP OAuth 자격 증명 설정 자동화 | `oauth/setup-gcp-oauth.mjs` |

---

## Architecture / 아키텍처

```
gmail-automation-workspace/
├── account/                          # Gmail 계정 생성 자동화
│   ├── create-accounts.mjs           # 주요 계정 생성 흐름 (3,727줄)
│   ├── create-accounts-adb.mjs       # ADB + Android Chrome (871줄)
│   ├── create-accounts-cdp.mjs      # ReDroid WebView CDP (965줄)
│   ├── create-accounts-appium.mjs    # Appium + Docker Android (1,576줄)
│   ├── create-accounts.mjs          # 기본 계정 생성 흐름 (2,650줄)
│   ├── family-group.mjs             # 가족 초대/수락 (496줄)
│   ├── gmail-creator-mcp.mjs        # MCP 서버: 4개 도구 (681줄)
│   ├── verify-age.mjs               # 5sim SMS 나이 인증 (814줄)
│   ├── verify-account.mjs           # 계정 검증
│   ├── verify-all-accounts.mjs      # 전체 계정 검증
│   ├── warmup-account.mjs           # 계정 워밍업
│   ├── diagnostic-login.mjs         # 진단 로그인
│   ├── direct-login-test.mjs        # 직접 로그인 테스트
│   ├── cdp-login-test.mjs           # CDP 로그인 테스트
│   ├── check-account-exists.mjs    # 계정 존재 확인
│   ├── debug-sms-capture.mjs        # SMS 캡처 디버깅
│   ├── process-batch-verification.mjs # 배치 검증 처리
│   ├── infrastructure-diagnostic.mjs  # 인프라 진단
│   ├── youtube-signup.mjs           # YouTube 가입
│   ├── youtube-signup-cdp.mjs       # YouTube CDP 가입
│   ├── redroid-signup-cdp.mjs      # ReDroid CDP 가입
│   ├── test-partner-oauth.mjs       # 파트너 OAuth 테스트
│   └── infrastructure/
│       └── setup-emulator.mjs       # 에뮬레이터 설정
│
├── antigravity/                      # Antigravity IDE 인증
│   ├── antigravity-auth.mjs          # OAuth + SMS 인증 파이프라인 (710줄)
│   ├── antigravity-pipeline.mjs      # 종단간 활성화 오케스트레이터 (755줄)
│   ├── inject-vscdb-token.mjs        # VSCDB protobuf 토큰 주입 (467줄)
│   ├── manual-token-acquire.mjs      # 수동 OAuth 토큰 획득 (286줄)
│   ├── unlock-features.mjs           # 5sim SMS 기능 잠금 해제 (757줄)
│   └── antigravity-auth-results.json # 인증 결과
│
├── oauth/                            # OAuth 자격 증명 흐름
│   ├── oauth-login.mjs               # OAuth 동의/로그인 헬퍼 (219줄)
│   └── setup-gcp-oauth.mjs           # GCP OAuth 자격 증명 설정 (208줄)
│
├── lib/                              # 공유 유틸리티
│   ├── oauth-callback-server.mjs     # localhost OAuth 콜백 서버 (176줄)
│   ├── token-exchange.mjs            # OAuth code→token 교환 (29줄)
│   ├── google-auth-browser.mjs      # Google 인증 브라우저 자동화 (129줄)
│   ├── browser-launch.mjs            # 브라우저 실행 헬퍼
│   ├── cli-args.mjs                  # CLI 인자 파서
│   ├── adb-utils.mjs                # ADB 명령 래퍼 (246줄)
│   ├── sms-provider.mjs              # 모듈형 SMS 제공자 (5sim/sms-activate) (363줄)
│   ├── verification-pipeline.mjs    # 3단계 계정 검증 파이프라인
│   ├── behavior-profile.mjs          # 인간 유사 타이핑/마우스 시뮬레이션
│   ├── cdp-utils.mjs                # Chrome DevTools Protocol 유틸리티
│   ├── antigravity-shared.mjs        # Antigravity 공유 유틸리티
│   ├── fingerprint-config.mjs        # 지문 설정
│   ├── free-proxy.mjs                # 무료 프록시
│   ├── proxy-config.mjs              # 프록시 설정
│   └── proxy-forwarder.mjs          # 프록시 포워더
│
├── _bot-scripts/                     # GitHub Bot 자동화
│   ├── scripts/
│   │   ├── repo_review.py           # 저장소 검토
│   │   ├── pr_review_runner.py      # PR 검토_runner
│   │   ├── pr_review_runner_test.py # PR 검토 테스트
│   │   └── redact_exposed_secrets.py # 노출된 시크릿 수정
│   ├── docker-compose.yml            # GitHub App Docker 구성
│   ├── Dockerfile.github_app         # GitHub App Dockerfile
│   ├── Dockerfile.github_action     # GitHub Action Dockerfile
│   └── requirements.txt              # Python 의존성
│
├── bin/                              # 쉘 스크립트
│   ├── create-gmail.sh              # Gmail 생성
│   ├── setup-1password-service-account.sh
│   ├── setup-credentials.sh
│   └── setup_frida.sh
│
├── docs/                             # 문서
│   ├── ALTERNATIVE-SMS-PROVIDERS.md # 대안적 SMS 제공자
│   ├── QUICKSTART.md                # 빠른 시작
│   ├── adb-gmail-creation.md        # ADB Gmail 생성
│   └── verification-bypass-analysis.md # 검증 우회 분석
│
├── tests/                            # 테스트
│   ├── gmail-creator-mcp-smoke.mjs   # 29개 단언 MCP 서버 스모크 테스트
│   └── qa-manual.mjs                 # 6개 테스트 수동 QA 검증
│
├── tmp/                              # 임시 스크립트
│   ├── debug-selects.mjs
│   ├── sms-fast-v2.mjs
│   ├── sms-verify-fast.mjs
│   ├── tmp-reauth.mjs
│   └── ui.xml
│
├── package.json                      # Node.js 의존성
├── complete.csv                       # 완료된 계정 상태
├── openai-accounts.csv               # OpenAI 계정 상태
└── AGENTS.md / CONTRIBUTING.md       # 프로젝트 지식 베이스

---

## Automation Inventory / 자동화 인벤토리

### GitHub Workflows / GitHub 워크플로우 (27개)

| # | Workflow 파일 | 목적 |
|---|---------------|------|
| 01 | `01_branch-to-pr.yml` | 브랜치 → PR 생성 |
| 02 | `02_issue-to-branch.yml` | 이슈 → 브랜치 생성 |
| 03 | `03_pr-checks.yml` | PR 검사 |
| 04 | `04_actionlint.yml` | GitHub Actions lint |
| 05 | `05_gitleaks.yml` | 시크릿 스캐닝 |
| 06 | `06_codeql.yml` | CodeQL 정적 분석 |
| 07 | `07_dependency-review.yml` | 의존성 검토 |
| 08 | `08_scorecard.yml` | SLSA 점수카드 |
| 09 | `09_semantic-pr.yml` | 시맨틱 PR 검사 |
| 10 | `10_pr-review.yml` | 자동 PR 검토 |
| 12 | `12_dependabot-auto-merge.yml` | Dependabot 자동 병합 |
| 13 | `13_pr-auto-merge.yml` | PR 자동 병합 |
| 14 | `14_bot-auto-fix.yml` | Bot 자동 수정 |
| 15 | `15_merged-pr-cleanup.yml` | 병합된 PR 정리 |
| 18 | `18_issue-management.yml` | 이슈 관리 |
| 19 | `19_issue-backfill.yml` | 이슈 백필 |
| 20 | `20_readme-gen.yml` | README 생성 |
| 21 | `21_docs-sync.yml` | 문서 동기화 |
| 24 | `24_release-notes.yml` | 릴리스 노트 생성 |
| 25 | `25_release-publish.yml` | 릴리스 게시 |
| 29 | `29_downstream-health-check.yml` | 다운스트림 상태 확인 |
| 37 | `37_ci-failure-issues.yml` | CI 실패 이슈 생성 |
| 42 | `42_reusable-docs-sync.yml` | 재사용 가능한 문서 동기화 |
| 43 | `43_reusable-issue-management.yml` | 재사용 가능한 이슈 관리 |
| 44 | `44_reusable-pr-checks.yml` | 재사용 가능한 PR 검사 |
| 60 | `60_ci-auto-heal.yml` | CI 자동 복구 |
| - | `ci.yml` | 메인 CI |

### Bot Automation Tools / Bot 자동화 도구

| 도구 | 언어 | 위치 |
|------|------|------|
| `repo_review.py` | Python | `_bot-scripts/scripts/` |
| `pr_review_runner.py` | Python | `_bot-scripts/scripts/` |
| `redact_exposed_secrets.py` | Python | `_bot-scripts/scripts/` |

### MCP Server Tools / MCP 서버 도구 (4개)

`account/gmail-creator-mcp.mjs`에서 제공하는 도구:

| 도구 이름 | 기능 |
|-----------|------|
| `create_accounts` | Gmail 계정 생성 |
| `get_creation_job` | 생성 작업 상태 조회 |
| `list_accounts` | 생성된 계정 목록 |
| `get_account_status` | 계정 상태 조회 |

---

## Quick Start / 빠른 시작

### Requirements / 요구사항

- **Node.js** 18+
- **npm**
- **Playwright** (`npx playwright install`)
- 선택: Android 자동화를 위한 **ADB**
- 선택: Appium 에뮬레이터를 위한 **Docker**

### Installation / 설치

```bash
# Clone repository
git clone <repository-url>
cd <repository-name>

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Gmail Account Creation / Gmail 계정 생성

```bash
# 드라이런 (실제 계정 생성 없음)
node account/create-accounts.mjs --dry-run --start 1 --end 3

# 5sim API 키로 프로덕션 실행
node account/create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### ADB/Android Mode / ADB/Android 모드

```bash
# 드라이런
node account/create-accounts-adb.mjs --dry-run --count 1

# 프로덕션
node account/create-accounts-adb.mjs --count 1 --api-key "$FIVESIM_API_KEY" --region indonesia
```

### Age Verification / 나이 인증

```bash
# 드라이런
node account/verify-age.mjs --dry-run --start 1 --end 5

# 프로덕션
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### MCP Server / MCP 서버

```bash
# MCP 서버 시작
node account/gmail-creator-mcp.mjs

# 또는 npx로 실행
npx mcp dev account/gmail-creator-mcp.mjs
```

### OAuth Setup / OAuth 설정

```bash
# GCP OAuth 자격 증명 설정
node oauth/setup-gcp-oauth.mjs

# OAuth 로그인
node oauth/oauth-login.mjs --headed
```

---

## Local Development / 로컬 개발

### Environment Variables / 환경 변수

```bash
# Required for production
export FIVESIM_API_KEY="your-5sim-api-key"

# Optional
export ADB_HOST="localhost"
export ANDROID_SERIAL="emulator-5554"
```

### Running Tests / 테스트 실행

```bash
# MCP smoke test
node tests/gmail-creator-mcp-smoke.mjs

# Manual QA validation
node tests/qa-manual.mjs
```

### Directory Structure for Output Files / 출력 파일 디렉토리 구조

```
accounts.csv          # 생성된 계정 상태
complete.csv          # 완료된 계정
openai-accounts.csv   # OpenAI 계정 상태
family-results.csv    # 가족 그룹 결과
gcp-oauth.keys.json  # 로컬 OAuth 키 아티팩트
```

---

## Commands Reference / 명령어 참조

### Account Scripts / 계정 스크립트

| 명령어 | 설명 |
|--------|------|
| `node account/create-accounts.mjs` | 주요 Gmail 계정 생성 |
| `node account/create-accounts-adb.mjs` | ADB 기반 Android 계정 생성 |
| `node account/create-accounts-cdp.mjs` | CDP WebView 계정 생성 |
| `node account/create-accounts-appium.mjs` | Appium 에뮬레이터 계정 생성 |
| `node account/family-group.mjs` | Gmail 가족 그룹 관리 |
| `node account/verify-age.mjs` | 나이 인증 |
| `node account/verify-account.mjs` | 개별 계정 검증 |
| `node account/verify-all-accounts.mjs` | 전체 계정 검증 |
| `node account/warmup-account.mjs` | 계정 워밍업 |
| `node account/gmail-creator-mcp.mjs` | MCP 서버 실행 |

### Antigravity Scripts / Antigravity 스크립트

| 명령어 | 설명 |
|--------|------|
| `node antigravity/antigravity-auth.mjs` | OAuth + SMS 인증 |
| `node antigravity/antigravity-pipeline.mjs` | 종단간 활성화 오케스트레이터 |
| `node antigravity/unlock-features.mjs` | 5sim SMS 기능 잠금 해제 |
| `node antigravity/inject-vscdb-token.mjs` | VSCDB 토큰 주입 |
| `node antigravity/manual-token-acquire.mjs` | 수동 토큰 획득 |

### OAuth Scripts / OAuth 스크립트

| 명령어 | 설명 |
|--------|------|
| `node oauth/oauth-login.mjs` | OAuth 동의/로그인 |
| `node oauth/setup-g