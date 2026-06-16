# /harness:review

코드 리뷰 스킬. 4종 리뷰어가 병렬로 코드를 검사하고 verdict를 종합.

## 전제조건

- G3: Implement 완료

## 목표

1. 변경 범위 분석 (diff-analyzer)
2. 4종 리뷰어 병렬 실행 (Right-Size에 따라 수/깊이 조절)
3. Verdict 종합: ALL PASS → QA / NEEDS_CHANGE → implement 복귀 / BLOCK → 즉시 중단

## 인자

- `<domain/feature>` — 예: `auth/login`

## 실행 순서

### Step 1: Gate check

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/review/scripts/gate-check.mjs
```

### Step 2: Diff 분석

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/review/scripts/diff-analyzer.mjs
```

변경 파일 수, 영향 모듈, 복잡도 신호 분석.

### Step 3: 리뷰어 병렬 실행

Right-Size에 따라 리뷰어 수/깊이 조절:
- **small**: reviewer-security + reviewer-spec
- **medium**: 4종 전체 (기본 깊이)
- **large**: 4종 전체 (심층 분석)

리뷰어 에이전트:
1. `reviewer-security` — OWASP Top 10, CWE Top 25
2. `reviewer-performance` — N+1, 메모리 누수, 복잡도
3. `reviewer-quality` — SOLID, Clean Code
4. `reviewer-spec` — Spec AC 충족 여부

### Step 4: Verdict 종합

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/review/scripts/collect-verdicts.mjs
```

### Step 5: Event emit

```bash
echo '{"type":"ReviewCompleted","payload":{"domain":"<domain>","feature":"<feature>"}}' | \
  node ${CLAUDE_PLUGIN_ROOT}/scripts/state/event-emit.mjs
```

## 완료 조건

- 모든 리뷰어 PASS
- BLOCK 항목 없음
- NEEDS_CHANGE 시 피드백 포함

## 참조

- `references/security-review.md`
- `references/performance-review.md`
- `references/code-quality-review.md`
