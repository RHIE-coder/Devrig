# Migration Strategy Reference

## 3-Level Migration

### Level 1: Planning
- `init` — .harness/ scaffolding (기존 코드 미변경)
- `analyze` — 스택 감지 + 구조 파악
- **산출물:** .harness/config.yaml, .harness/state/analysis.json
- **검증:** 구조 정확도 (결정론적 테스트)

### Level 2: Wrapping
- `extract-spec` — 코드 → Spec AC 역추출
- `gen-test` — 미커버 코드 테스트 생성
- **산출물:** .harness/specs/*.spec.yaml, tests/*.test.mjs
- **검증:** eval (AC 수, testable 필드, 테스트 통과율)

### Level 3: Refactoring
- `/harness:refactor` 와 합류
- 코드 구조 개선 (행동 보존)
- **검증:** spec invariant + test identity

## 정방향 합류 조건

마이그레이션 후 도메인 B 파이프라인과 합류하려면:
1. `.harness/` 구조 존재
2. `config.yaml` 유효
3. `/harness:implement` 실행 가능 (spec + plan 존재)

## 기존 코드 보호 원칙

- `init`은 .harness/만 생성, 기존 파일 수정 금지
- `analyze`는 읽기 전용
- `extract-spec`은 .harness/specs/에만 쓰기
- `gen-test`는 tests/에만 쓰기
