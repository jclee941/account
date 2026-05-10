```markdown
# 계정 자동화 워크스페이스

Gmail 계정 생성, Antigravity IDE 인증, OpenAI 계정 관리, OAuth 자격 증명 설정을 위한 Node.js(ESM) 기반 자동화 워크스페이스입니다. 브라우저 자동화에는 Playwright/Rebrowser를 사용하며, SMS 인증은 5sim 등 외부 프로바이더를 통해 처리합니다.

## 주요 기능

- **Gmail 계정 자동 생성** — 5sim을 통한 SMS 인증과 연동된 일괄 계정 생성
- **멀티 모드 브라우저 자동화** — 표준 Playwright, ADB(Android Debug Bridge), CDP(Chrome DevTools Protocol), Appium 지원
- **Antigravity IDE 인증** — OAuth + SMS 기반 인증 및 기능 활성화 파이프라인
- **OpenAI 계정 관리** — 계정 생성 및 상태 점검 자동화
- **GCP OAuth 설정** — Gmail API 등 연동을 위한 OAuth 자격 증명 구성
- **MCP 서버** — Model Context Protocol 기반 도구 제공 (Gmail 생성 등)
- **가족 그룹 워크플로우** — Gmail 가족 초대 및 수락 자동화

## 요구사항

- Node.js 18 이상
- npm
- Playwright 브라우저 엔진 (`npx playwright install`)
- (선택) Android 자동화를 위한 ADB
- (선택) Appium 에뮬레이터를 위한 Docker
- (선택) 5sim API 키 (SMS 인증 사용 시)

## 설치

```bash
npm install
npx playwright install
```

## 사용법

### 1. Gmail 계정 생성 (기본 모드)

```bash
# 드라이런 (실제 생성 없이 흐름 확인)
node account/create-accounts.mjs --dry-run --start 1 --end 3

# 프로덕션 실행
node account/create-accounts.mjs \
  --start 1 --end 5 \
  --api-key "$FIVESIM_API_KEY" \
  --region russia
```

### 2. ADB / Android 모드

```bash
# 에뮬레이터/실제 기기의 Android Chrome 자동화
node account/create-accounts-adb.mjs --dry-run --count 1
node account/create-accounts-adb.mjs --count 1 --api-key "$FIVESIM_API_KEY" --region indonesia
```

### 3. CDP / Appium 모드

```bash
# Chrome DevTools Protocol (WebView 자동화)
node account/create-accounts-cdp.mjs

# Docker Android + Appium
node account/create-accounts-appium.mjs
```

### 4. 나이 인증

```bash
node account/verify-age.mjs --dry-run --start 1 --end 5
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### 5. MCP 서버 실행

```bash
node account/gmail-creator-mcp.mjs
```

### 6. Antigravity IDE 인증

```bash
node antigravity/antigravity-auth.mjs
node antigravity/antigravity-pipeline.mjs
```

## 프로젝트 구조

```
.
├── account/               # Gmail 계정 생성 및 관리
│   ├── create-accounts.mjs
│   ├── create-accounts-adb.mjs
│   ├── create-accounts-cdp.mjs
│   ├── create-accounts-appium.mjs
│   ├── gmail-creator-mcp.mjs
│   ├── family-group.mjs
│   └── verify-age.mjs
├── antigravity/           # Antigravity IDE 인증 파이프라인
│   ├── antigravity-auth.mjs
│   ├── antigravity-pipeline.mjs
│   └── unlock-features.mjs
├── lib/                   # 공유 유틸리티
│   ├── adb-utils.mjs
│   ├── browser-launch.mjs
│   ├── google-auth-browser.mjs
│   ├── sms-provider.mjs
│   └── verification-pipeline.mjs
├── oauth/                 # GCP OAuth 자격 증명 설정
│   ├── oauth-login.mjs
│   └── setup-gcp-oauth.mjs
├── openai/                # OpenAI 계정 관리
│   ├── create-accounts.mjs
│   └── check-accounts.mjs
├── docs/                  # 가이드 및 분석 문서
│   ├── QUICKSTART.md
│   └── ALTERNATIVE-SMS-PROVIDERS.md
├── tests/                 # 스모크 테스트 및 QA 스크립트
├── bin/                   # 셸 설치/설정 스크립트
├── tmp/                   # 디버그 및 임시 스크립트
└── _bot-scripts/          # GitHub App/Action 관련 Python 봇 스크립트
```

## 기여 방법

이 프로젝트에 기여하고 싶으시다면 먼저 저장소 루트의 `CONTRIBUTING.md`와 `_bot-scripts/CONTRIBUTING.md`를 확인해 주세요.  
버그 수정, 문서 개선, 새로운 SMS 프로바이더 추가 등 모든 기여을 환영합니다.

## 라이선스

이 프로젝트는 루트 디렉터리의 `LICENSE` 파일에 명시된 조건에 따라 배포됩니다.
```