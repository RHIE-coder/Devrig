# TDD Workflow

## 순서

1. **Red** — 실패하는 테스트 작성
2. **Green** — 테스트를 통과하는 최소 코드 작성
3. **Refactor** — 코드 정리 (테스트는 여전히 통과)

## 하네스에서의 TDD

- test-strategist가 테스트 설계
- implementer가 worktree에서 격리 구현
- verifier가 테스트 실행 및 결과 판단
- 구현자 ≠ 검증자 (Distrust by Structure)

## Side-effect 감지

- 새 코드 작성 후 기존 전체 테스트 실행
- 깨지는 테스트가 있으면 즉시 알림
