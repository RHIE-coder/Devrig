# /harness:plan

Feature의 구현 Plan을 작성하는 스킬. Spec의 AC를 구현 step으로 분해.

## 전제조건

- G1: Spec이 존재해야 함 (`gate-engine.mjs`가 검증)

## 목표

1. Spec의 AC를 구현 가능한 step으로 분해
2. 각 step이 최소 1 AC에 매핑되는지 검증
3. `.harness/plans/{domain}/{feature}.plan.md`에 저장

## 인자

- `<domain/feature>` — 예: `auth/login`

## 실행 순서

### Step 1: Gate check

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plan/scripts/gate-check.mjs
```

### Step 2: Spec 로드 + 분해

Spec을 읽고 에이전트를 활용하여 태스크 분해:
- **explorer**: 기존 코드 탐색 (관련 파일, 의존성)
- **requirements-analyst**: AC를 구현 step으로 분해

분해 보조:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plan/scripts/decompose.mjs
```

### Step 3: Plan 작성

템플릿 기반으로 plan.md 작성:
```bash
cat ${CLAUDE_PLUGIN_ROOT}/skills/plan/templates/plan.template.md
```

### Step 4: 검증

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plan/scripts/validate-plan.mjs
```

### Step 5: Event emit

```bash
echo '{"type":"PlanApproved","payload":{"domain":"<domain>","feature":"<feature>"}}' | \
  node ${CLAUDE_PLUGIN_ROOT}/scripts/state/event-emit.mjs
```

## 완료 조건

- `.harness/plans/{domain}/{feature}.plan.md` 존재
- 모든 AC가 최소 1 step에 매핑
- Plan이 substantive (G6 통과 가능)

## 참조

- `references/plan-writing-guide.md`
