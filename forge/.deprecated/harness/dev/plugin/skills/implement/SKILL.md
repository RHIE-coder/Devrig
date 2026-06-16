# /harness:implement

Feature를 TDD로 구현하는 스킬. Spec + Plan을 기반으로 test-first 개발.

## 전제조건

- G1: Spec 존재
- G2: Plan 존재
- G6: Plan이 substantive

## 목표

1. Plan의 각 step에 대해 test → code → verify 순서로 구현
2. 기존 테스트 깨짐 감지 (side-effect)
3. 커버리지 리포트 산출

## 인자

- `<domain/feature>` — 예: `auth/login`

## 실행 순서

### Step 1: Gate check

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/implement/scripts/gate-check.mjs
```

### Step 2: Test skeleton 생성

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/implement/scripts/gen-test-skeleton.mjs
```

Spec의 AC를 기반으로 test 파일 골격 생성.

### Step 3: TDD 루프 (Plan step별)

Plan의 각 step에 대해:
1. **test 작성** — test-strategist 에이전트 활용
2. **구현** — implementer 에이전트 (worktree 격리)
3. **검증** — verifier 에이전트 (test 실행)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/implement/scripts/run-tests.mjs
```

### Step 4: Side-effect 확인

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/implement/scripts/check-side-effects.mjs
```

### Step 5: 커버리지 리포트

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/implement/scripts/coverage-report.mjs
```

### Step 6: Event emit

```bash
echo '{"type":"ImplementCompleted","payload":{"domain":"<domain>","feature":"<feature>"}}' | \
  node ${CLAUDE_PLUGIN_ROOT}/scripts/state/event-emit.mjs
```

## 완료 조건

- 모든 테스트 통과
- 기존 테스트 깨짐 없음
- 커버리지 임계값 충족

## 참조

- `references/tdd-workflow.md`
