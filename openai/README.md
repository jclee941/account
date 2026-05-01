# OpenAI Account Creator

OpenAI 계정 자동 생성 도구입니다. Playwright + rebrowser를 사용하여 안티봇 탐지를 우회하고, 5sim.net을 통해 SMS 인증을 처리합니다.

## 구조

```
openai/
├── create-accounts.mjs      # 메인 계정 생성 스크립트
├── check-accounts.mjs       # 계정 상태 확인 스크립트
└── openai-creator-mcp.mjs   # MCP 서버
```

## 요구사항

- Node.js 18+
- 5sim.net API 키
- xvfb-run (리눅스 헤드리스 모드용)

## 설치

```bash
cd /home/jclee/dev/gmail
npm install
```

## 사용법

### 1. 계정 생성

```bash
# 드라이런 (미리보기)
node openai/create-accounts.mjs --dry-run --start 1 --end 5

# 실제 생성 (5sim API 키 필요)
node openai/create-accounts.mjs --start 1 --end 5 --api-key YOUR_5SIM_KEY

# 리눅스 헤드리스 모드
xvfb-run node openai/create-accounts.mjs --start 1 --end 5 --api-key YOUR_5SIM_KEY

# 특정 지역 사용
node openai/create-accounts.mjs --start 1 --end 5 --api-key KEY --region indonesia
```

### 2. 계정 상태 확인

```bash
# 특정 범위 확인
node openai/check-accounts.mjs --start 1 --end 10

# 특정 이메일 확인
node openai/check-accounts.mjs --email qws94301@gmail.com

# CSV 파일에서 확인
node openai/check-accounts.mjs --csv openai-accounts.csv
```

### 3. MCP 서버 사용

```bash
# MCP 서버 실행
node openai/openai-creator-mcp.mjs
```

MCP 도구:
- `create_accounts` - 계정 생성 작업 시작
- `get_creation_job` - 작업 상태 확인
- `list_accounts` - 생성된 계정 목록
- `get_account_status` - 특정 계정 상태

## 설정 옵션

### CLI 인자

| 인자 | 설명 | 기본값 |
|------|------|--------|
| `--start` | 시작 번호 (1-50) | 1 |
| `--end` | 종료 번호 (1-50) | 50 |
| `--api-key` | 5sim API 키 | FIVESIM_API_KEY env |
| `--region` | SMS 지역 | russia |
| `--sms-provider` | SMS 제공자 (5sim, sms-activate) | 5sim |
| `--headed` | 브라우저 표시 모드 | false |
| `--dry-run` | 미리보기 모드 | false |

### 환경 변수

```bash
export FIVESIM_API_KEY="your_api_key_here"
export FIVESIM_REGION="russia"  # 또는 indonesia, usa 등
```

## 출력 파일

- `openai-accounts.csv` - 생성된 계정 목록
- `screenshots/openai/` - 스크린샷 저장
- `openai-account-status.csv` - 계정 상태 확인 결과

## 계정 형식

- 이메일: `qws94301@gmail.com` ~ `qws94350@gmail.com`
- 비밀번호: `bingogo1`
- 이름: 랜덤 영어 이름

## 안티탐지 기능

- rebrowser-playwright (CDP leak 패치)
- ghost-cursor (베지에 곡선 마우스 이동)
- 인간처럼 타이핑 (가변 지연)
- 계정당 새 브라우저 인스턴스
- 랜덤화된 지문 (viewport, UA, locale, timezone)
- 계정 간 지연 (60-120초)

## 문제 해결

### CAPTCHA 발생

헤드리스 모드에서 CAPTCHA가 발생하면:
1. `--headed` 모드로 실행하여 수동으로 해결
2. 프록시 사용 고려
3. 계정 생성 간격 늘리기

### SMS 인증 실패

- 5sim 잔액 확인
- 다른 지역 시도 (`--region indonesia`, `--region usa`)
- SMS 제공자 변경 (`--sms-provider sms-activate`)

### 차단됨

- IP 변경 (프록시 사용)
- 더 긴 지연 시간
- 다른 User-Agent
