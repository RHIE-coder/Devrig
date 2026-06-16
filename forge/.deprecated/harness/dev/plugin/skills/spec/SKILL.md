# /harness:spec

Feature의 Spec(요구사항 + Acceptance Criteria)을 작성하는 스킬.

## 목표

1. Feature의 요구사항을 구조화하여 `.harness/specs/{domain}/{feature}.spec.yaml`에 저장
2. 모든 AC에 `testable` 필드가 존재하는지 검증
3. AC → coverage.json 엔트리 생성

## 인자

- `<domain/feature>` — 예: `auth/login`, `payments/checkout`

## 실행 순서

### Step 1: 기존 Spec 확인

이미 spec이 존재하면 유저에게 알리고 덮어쓸지 확인한다.

### Step 2: 요구사항 수집

유저와 대화하여 feature의 요구사항을 수집한다. 에이전트 활용:
- **requirements-analyst**: 요구사항을 구조화
- **devils-advocate**: 빈틈/모호성 공격

### Step 3: Spec 작성

수집한 요구사항을 기반으로 spec.yaml 작성. 템플릿:
```bash
# 템플릿 참조
cat ${CLAUDE_PLUGIN_ROOT}/skills/spec/templates/spec.template.yaml
```

### Step 4: 검증

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/spec/scripts/validate-spec.mjs
node ${CLAUDE_PLUGIN_ROOT}/skills/spec/scripts/check-testability.mjs
```

검증 통과 후:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/spec/scripts/gen-coverage-map.mjs
```

### Step 5: Event emit

Spec 생성 완료 이벤트:
```bash
echo '{"type":"SpecCreated","payload":{"domain":"<domain>","feature":"<feature>"}}' | \
  node ${CLAUDE_PLUGIN_ROOT}/scripts/state/event-emit.mjs
```

## 완료 조건

- `.harness/specs/{domain}/{feature}.spec.yaml` 존재
- 모든 AC에 `testable` 필드 존재
- coverage.json에 AC 엔트리 추가됨

## 참조

- `references/spec-writing-guide.md` — Spec 작성 가이드
- `references/acceptance-patterns.md` — AC 패턴 카탈로그
