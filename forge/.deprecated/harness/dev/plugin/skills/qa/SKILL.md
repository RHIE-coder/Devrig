# /harness:qa

QA 스킬. QA Stack을 bottom-up으로 실행하고 실패 귀인(attribution) 리포트 산출.

## 전제조건

- G3: Review 완료 (또는 implement.passed)

## 목표

1. QA Stack 4개 레이어 bottom-up 실행 (Infra → DB → API → UI)
2. 하위 실패 시 상위 skip (sequential_bottom_up)
3. 실패 귀인 리포트 (어느 계층의 문제인가)
4. mock_guard 검사 (하위 mock → 상위 결과 불신)
5. 커버리지 트렌드 (iteration 간 delta)

## 인자

- `<domain/feature>` — 예: `auth/login`
- `--only <type>` — 단일 유형만 실행
- `--skip <type> --reason "..."` — 특정 유형 skip
- `--force-size <size>` — 이번만 강제 Right-Size

## 실행 순서

### Step 1: Gate check

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/qa/scripts/gate-check.mjs
```

### Step 2: QA Stack 실행

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/qa/scripts/stack-runner.mjs
```

모드: `sequential_bottom_up` (large), `parallel` (small/medium)

### Step 3: Attribution 리포트

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/qa/scripts/attribution.mjs
```

### Step 4: Mock Ratio 검사

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/qa/scripts/mock-ratio.mjs
```

### Step 5: Coverage Trend

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/qa/scripts/coverage-trend.mjs
```

### Step 6: Event emit

```bash
echo '{"type":"QAPassed","payload":{"domain":"<domain>","feature":"<feature>"}}' | \
  node ${CLAUDE_PLUGIN_ROOT}/scripts/state/event-emit.mjs
```

## 완료 조건

- 모든 QA Stack 레이어 PASS
- mock_guard 위반 없음 (strict_lower_real 모드)
- 커버리지 임계값 충족
- qa.passed=true → /harness:deploy 가능

## 참조

- `references/qa-strategy.md`
- `references/test-types.md`
