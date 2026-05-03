<!--
PR 제목 형식 (Conventional Commits):
  feat(scope): 새 기능
  fix(scope): 버그 수정
  docs(scope): 문서
  refactor(scope): 리팩토링
  test(scope): 테스트
  chore(scope): 잡무
  ci(scope): CI/CD
  perf(scope): 성능
  security(scope): 보안

브랜치 이름: feat/* | fix/* | hotfix/* | docs/* | refactor/* | chore/* | ci/* | perf/* | security/* | test/*
-->

## Changes / 변경 사항

<!-- 무엇을 / 왜 바꿨는지 한눈에 -->

-
-
-

## Why / 동기

<!-- 이 변경이 필요한 이유. 이슈가 있다면 `Closes #N` 으로 연결 -->

## How to verify / 검증 방법

<!-- 리뷰어가 따라할 수 있는 구체적인 단계 -->

```bash
# 예) 로컬 검증 명령
```

## Risk / 영향 범위

- [ ] 후방 호환성 영향 없음
- [ ] 보안 영향 없음 (있다면 `security-review` 라벨 부착)
- [ ] 다운스트림 11개 리포에 자동 동기화됨 (`scripts/cmd/deploy-to-repos/main.go` 변경 시)

## Checklist

- [ ] PR 제목이 Conventional Commits 규약 준수
- [ ] 브랜치 이름이 표준 prefix 사용
- [ ] 관련 문서 (README/AGENTS.md/docs/) 업데이트
- [ ] 새 기능/설정 변경 시 예시 추가
- [ ] 테스트 추가/갱신 (해당하는 경우)

> 이 PR은 `jclee-bot`이 자동 리뷰합니다 (cli_proxy + Kimi-k2.6, 한국어 응답).
