# 계정 자동화 워크스페이스

Gmail 계정 생성, Antigravity IDE 인증, OAuth 자격 증명 관리를 위한 Node.js ESM 워크스페이스. 브라우저 자동화에는 Playwright/Rebrowser를 사용하고, SMS 인증에는 5sim을 사용합니다.

## 기능

- **Gmail 계정 생성** — 5sim을 통한 SMS 인증과 함께 일괄 생성
- **ADB/Android 자동화** — ADB를 통한 Android Chrome 자동화
- **CDP 모드** — WebView 자동화를 위한 Chrome DevTools Protocol
- **Appium 지원** — Docker Android 에뮬레이터 통합
- **Antigravity 인증** — Antigravity IDE용 OAuth + SMS 인증 파이프라인
- **MCP 서버** — Model Context Protocol을 통한 도구 기반 계정 생성
- **가족 그룹** — Gmail 가족 초대/수락 워크플로우

## 요구사항

- Node.js 18+
- npm
- Playwright 의존성 (`npm install`로 설치)
- 선택: Android 자동화를 위한 ADB
- 선택: Appium 에뮬레이터를 위한 Docker

## 설치

```bash
npm install
npx playwright install
```

## 빠른 시작

### Gmail 계정 생성

```bash
# 드라이런 (실제 계정 생성 없음)
node account/create-accounts.mjs --dry-run --start 1 --end 3

# 5sim API 키로 프로덕션 실행
node account/create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### ADB/Android 모드

```bash
node account/create-accounts-adb.mjs --dry-run --count 1
node account/create-accounts-adb.mjs --count 1 --api-key "$FIVESIM_API_KEY" --region indonesia
```

### 나이 인증

```bash
node account/verify-age.mjs --dry-run --start 1 --end 5
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia
```

### MCP 서버

```bash
node account/gmail-creator-mcp.mjs
```

## 프로젝트 구조

```
./
├── account/                       # Gmail 계정 자동화
│   ├── create-accounts.mjs        # 주요 계정 생성 흐름
│   ├── create-accounts-adb.mjs    # ADB + Android Chrome 자동화
│   ├── create-accounts-cdp.mjs    # ReDroid WebView CDP 모드
│   ├── create-accounts-appium.mjs # Appium + Docker Android 에뮬레이터
│   ├── family-group.mjs           # 가족 초대/수락 흐름
│   ├── gmail-creator-mcp.mjs      # MCP 서버 (4개 도구)
│   └── verify-age.mjs             # 5sim SMS를 통한 나이 인증
├── antigravity/                   # Antigravity IDE 인증 및 검증
│   ├── antigravity-auth.mjs       # OAuth + SMS 인증 파이프라인
│   ├── antigravity-pipeline.mjs   # 종단간 활성화 오케스트레이터
│   ├── inject-vscdb-token.mjs     # VSCDB protobuf 토큰 주입
│   ├── manual-token-acquire.mjs   # 수동 지원 OAuth 토큰 획득
│   └── unlock-features.mjs        # 5sim SMS 기능 잠금 해제
├── oauth/                         # OAuth 자격 증명 흐름
│   ├── oauth-login.mjs            # OAuth 동의/로그인 도우미
│   └── setup-gcp-oauth.mjs        # GCP OAuth 자격 증명 설정
├── lib/                           # 공유 유틸리티
│   ├── oauth-callback-server.mjs  # localhost OAuth 콜백 서버
│   ├── token-exchange.mjs         # OAuth 코드→토큰 교환
│   ├── google-auth-browser.mjs    # Google 인증 브라우저 자동화
│   ├── browser-launch.mjs         # 브라우저 실행 도우미
│   ├── cli-args.mjs               # CLI 인수 파서
│   ├── adb-utils.mjs              # ADB 명령 래퍼
│   ├── sms-provider.mjs           # 모듈식 SMS 제공자 (5sim/sms-activate)
│   ├── verification-pipeline.mjs  # 3단계 계정 검증
│   ├── behavior-profile.mjs       # 인간 같은 타이핑/마우스 시뮬레이션
│   └── cdp-utils.mjs              # Chrome DevTools Protocol 유틸리티
├── tests/                         # MCP 서버 스모크 + QA 테스트
│   ├── gmail-creator-mcp-smoke.mjs
│   └── qa-manual.mjs
├── accounts.csv                   # 생성된 계정 상태
├── gcp-oauth.keys.json            # 로컬 OAuth 키 아티팩트 (런타임 출력)
└── package.json                   # 의존성
```

## 환경 변수

| 변수 | 필수 | 기본값 | 설명 |
|----------|----------|---------|-------------|
| `FIVESIM_API_KEY` | 예 (`--dry-run` 제외) | — | 5sim SMS 인증 API 키 |
| `SMS_PROVIDER` | 아니오 | `5sim` | SMS 제공자 선택 |
| `FIVESIM_REGION` | 아니오 | `russia` | 5sim 전화번호 지역 |
| `PROXY_SERVER` | 아니오 | — | 브라우저용 HTTP 프록시 주소 |
| `PROXY_USER` | 아니오 | — | 프록시 인증 사용자 이름 |
| `PROXY_PASS` | 아니오 | — | 프록시 인증 비밀번호 |
| `SMS_API_KEY` | 아니오 | — | 대체 SMS API 키 |
| `GMAIL_OAUTH_CLIENT_ID` | 아니오 | — | Google OAuth 클라이언트 ID |
| `GMAIL_OAUTH_CLIENT_SECRET` | 아니오 | — | Google OAuth 클라이언트 비밀 |
| `GMAIL_OAUTH_REDIRECT_URI` | 아니오 | `http://localhost:3000/oauth2callback` | OAuth 리디렉션 URI |

## 명령어

```bash
# 주요 계정 생성
node account/create-accounts.mjs --dry-run --start 1 --end 3
node account/create-accounts.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# ADB/Android 계정 생성
node account/create-accounts-adb.mjs --dry-run --count 1
node account/create-accounts-adb.mjs --count 1 --api-key "$FIVESIM_API_KEY" --region indonesia

# CDP 모드
node account/create-accounts.mjs --cdp --start 1 --end 1 --api-key "$FIVESIM_API_KEY"

# Appium
node account/create-accounts-appium.mjs --dry-run --count 3
node account/create-accounts-appium.mjs --count 1 --api-key "$FIVESIM_API_KEY"

# 나이 인증
node account/verify-age.mjs --dry-run --start 1 --end 5
node account/verify-age.mjs --start 1 --end 5 --api-key "$FIVESIM_API_KEY" --region russia

# MCP 서버
node account/gmail-creator-mcp.mjs

# MCP 테스트
node tests/gmail-creator-mcp-smoke.mjs
node tests/qa-manual.mjs

# 가족 및 OAuth
node account/family-group.mjs --dry-run --start 1 --end 3
node oauth/oauth-login.mjs --help
node oauth/setup-gcp-oauth.mjs --headed

# Antigravity
node antigravity/antigravity-auth.mjs --batch qws94301@gmail.com --api-key "$FIVESIM_API_KEY"
node antigravity/unlock-features.mjs qws94301@gmail.com --api-key "$FIVESIM_API_KEY"

# Antigravity 파이프라인
node antigravity/antigravity-pipeline.mjs --dry-run --accounts qws94201@gmail.com
node antigravity/antigravity-pipeline.mjs --from-csv --accounts qws94201@gmail.com --region indonesia
```

## 참고사항

- 스크립트는 ESM (`.mjs`)입니다.
- 실제 계정 생성 없이 작업을 미리 보려면 `--dry-run`을 사용하세요.
- 헤드 브라우저 모드에는 X 서버가 필요합니다; 헤드리스 Linux에서는 `xvfb-run`을 사용하세요.
- 실제 비밀을 커밋하지 마세요; 환경 변수 또는 `.env` 파일 (gitignored)을 사용하세요.
- MCP 서버는 `@modelcontextprotocol/sdk`와 stdio 전송을 사용합니다. 모든 로깅은 `stderr`로, `stdout`으로는 안 됩니다.
- 계정 패턴: `qws943XX@gmail.com` (XX = 01–50).

## 라이선스

비공개 — 내부 사용 전용.


<!-- LLM review probe 1777811213 — auto-removed after verification -->
