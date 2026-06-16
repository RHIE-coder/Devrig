# Layer Architecture

> 하네스의 6-레이어 아키텍처와 강제 메커니즘.
>
> **반복 등장 용어:** `AC`(Acceptance Criteria), `Right-Size`(small/medium/large). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 1. 레이어 전체 구조

```
┌──────────────────────────────────────────────────────────────────┐
│                        User Interface                            │
│   /harness:init  /harness:brainstorm  /harness:spec              │
│   /harness:architect  /harness:plan  /harness:implement          │
│   /harness:review  /harness:qa  /harness:deploy  /harness:migrate│
│   (단계 기반 스킬 — 사용자 진입점)                                   │
├──────────────────────────────────────────────────────────────────┤
│                      ⑥ Config Layer                              │
│   .harness/config.yaml                                           │
│   워크플로우 토글, 에이전트 선호, 프롬프트 파이프라인 on/off,           │
│   Right-Size 임계값, 프로젝트 구조 선언                              │
│   ※ ②~⑤ 조절 가능. ① Safety는 건드릴 수 없음                       │
├──────────────────────────────────────────────────────────────────┤
│                      ⑤ Workflow Layer                            │
│   SDLC 파이프라인 오케스트레이션                                     │
│   게이트 엔진: 단계 전환 전제조건 검증                                │
│   Right-Size Ceremony: 규모별 절차 조절                             │
│   상태 추적: .harness/state/workflow.json                          │
├──────────────────────────────────────────────────────────────────┤
│                      ④ Quality Layer                             │
│   프롬프트 품질 향상 (자동변환 + 피드백)                              │
│   불신 기반 리뷰 (구현자 ≠ 검증자)                                   │
│   Confidence Calibration + 합리화 방어 (Hook 기반)                  │
│   테스트 유효성 검증 + Side-effect 감지                              │
├──────────────────────────────────────────────────────────────────┤
│                      ③ Agent Layer                               │
│   역할별 Subagent 풀 (explorer/implementer/reviewer/...)           │
│   Model Tiering (haiku/sonnet/opus)                              │
│   페르소나 시스템 (기본 + 유저 생성)                                  │
│   에스컬레이션 프로토콜 (DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED)        │
├──────────────────────────────────────────────────────────────────┤
│                      ② Knowledge Layer                           │
│   지식 복리 축적 (solutions → learnings → 다음 plan)                │
│   Spec ↔ Test 추적성 매핑                                         │
│   문서 커버리지 검증 (빈 문서 금지)                                   │
│   .harness/knowledge/ 저장소                                      │
├──────────────────────────────────────────────────────────────────┤
│                      ① Safety Layer (Iron Laws)                  │
│   Guardrail-as-Code: PreToolUse Hook으로 파괴적 작업 차단           │
│   워크플로우 Gate: Spec/Plan/Test 존재 여부 검증                     │
│   Bash 파일 조작 추적 강제                                          │
│   ※ Config으로 비활성화 불가. 모든 레이어보다 우선 실행                 │
├──────────────────────────────────────────────────────────────────┤
│                    Claude Code Platform                           │
│   Skills / Agents / Hooks / MCP / Plugins / Worktree             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 레이어 간 규칙

| 규칙 | 설명 |
|------|------|
| ① Safety는 절대적 | Config(⑥)으로도 비활성화 불가. 다른 모든 레이어보다 우선 실행 |
| 상위가 하위를 호출 | Workflow(⑤) → Agent(③) → Knowledge(②) 방향. 역방향 호출 없음 |
| ⑥ Config는 ②~⑤를 조절 | Safety(①)는 건드릴 수 없지만 나머지는 사용자가 조절 가능 |
| 각 레이어는 자체 테스트 가능 | 하네스 자체 검증 — 레이어별 독립 테스트 |
| Hook은 LLM보다 먼저 | Hook(결정론적) → Skill(LLM) → Agent(LLM) 순서로 실행 |

---

## 2.5 스크립트 실행 환경 (Cross-Platform)

결정론적 검증/상태/게이트 로직은 모두 **Node.js ESM (`.mjs`)** 스크립트로 구현한다.

| 항목 | 선택 | 근거 |
|------|------|------|
| 런타임 | **Node.js** | Claude Code가 이미 Node 런타임을 보장 (추가 설치 불필요) |
| 형식 | `.mjs` (ESM) | top-level await, 표준 import/export |
| 호출 방식 | `node ${CLAUDE_PLUGIN_ROOT}/path/to/script.mjs` | shebang 비의존 → **Windows/macOS/Linux 동일 동작** |
| 쉘 스크립트 (`.sh`) | ❌ 사용 안 함 | Windows 미지원. `.bat` 병행은 유지보수 지옥 |
| 파이썬 | ❌ 사용 안 함 | 환경 편차, 런타임 추가 설치 요구 |

**Hook command 규약:**
```json
{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/gates/gate-engine.mjs" }
```

스크립트는 `process.exit(0|2)`로 Hook 결과를 반환한다. 표준 JSON 출력은 `stdout`으로 방출. 이 계약은 OS 무관하게 동일하다.

---

## 3. 각 레이어 상세

### 3.0 Feature = Aggregate — 일관성 경계 사고법

> **출처:** DDD의 *Aggregate* 개념을 어휘로 차용 (코드 프레임워크 도입 X). 배경: [docs/insights/patterns/01-ddd-aggregate-actor.md](../../insights/patterns/01-ddd-aggregate-actor.md), 적용 근거: [patterns/05-harness-applicability.md §4.1](../../insights/patterns/05-harness-applicability.md#41-aggregate-경계-사고법).

하네스의 **상태·규칙·불변식의 최소 단위**는 **feature** (예: `auth/login`, `billing/invoice`) 이다. 하네스 설계의 모든 일관성 규칙은 이 경계 안에서만 즉시 성립하고, 경계 간에는 **eventual consistency**를 허용한다.

**Aggregate 규칙 5가지 (feature에 적용):**

| # | 규칙 | 구체 |
|---|------|------|
| 1 | **단일 진입점** | feature의 state 변경은 **하네스 스크립트**(예: `scripts/state/update-workflow.mjs`)를 단일 지점으로 통과. 유저·Hook이 직접 쓰기 금지 (§7.5 Single Writer) |
| 2 | **ID로만 참조** | `spec.yaml` / `plan.md`에서 다른 feature는 **경로 문자열**로만 참조 (예: `depends_on: [auth/session]`). 객체·내부 필드 직접 참조 금지 |
| 3 | **트랜잭션 경계** | 한 skill 호출 범위 내에서 **하나의 feature**만 mutate. 여러 feature를 걸쳐야 하면 Saga 패턴(compensation 설계, [03-workflow.md §1.3](03-workflow.md) 참조) |
| 4 | **Eventual Consistency 허용** | `coverage.json`의 cross-feature 집계·리포트는 **지연** 허용. 실시간 일관성 요구 금지 |
| 5 | **작게 유지** | feature가 medium 밴드(AC ≤ 7 ∧ files ≤ 10 ∧ LOC ≤ 400)를 **어느 한 축이라도** 초과하면 Right-Size=large → Architect 단계 **분할 검토 필수** (`split_required=true`). 수치 근거는 [00-overview.md Right-Size](00-overview.md#right-size--작업-규모에-맞는-ceremony) |

**디렉토리 매핑:**

```
.harness/
├── specs/auth/login.spec.yaml         ← Aggregate: auth/login
│   └── 한 feature의 AC·edge case·test strategy
├── plans/auth/login.plan.md           ← 같은 Aggregate의 step 리스트
├── decisions/003-auth-strategy.md     ← 같은 Aggregate의 ADR (medium+)
└── state/
    ├── workflow.json                  ← 모든 feature의 현재 상태 snapshot
    └── events/auth/login/*.jsonl      ← 해당 Aggregate의 event stream (§7.5 참조)
```

**이게 주는 것:**
- 한 feature를 변경하면 **어디까지 검토·테스트해야 하는가**가 명확 (feature 경계 = 변경 영향 범위)
- 병렬 worktree 배정 기준이 자연스러움 — **독립 feature는 worktree 병렬 가능** (§7.1 참조)
- 버그 추적·회고 단위 = Aggregate 단위

> **한 줄:** "1 skill 호출 = 1 feature mutate = 1 Aggregate 트랜잭션". 이 문장이 깨지면 설계가 흐려진 신호.

---

### ① Safety Layer

**책임:** 파괴적 작업 차단, 워크플로우 게이트 강제, 절대 비활성화 불가.

**구현 수단:** Hook (command 타입, 토큰 비용 0, 결정론적)

**구체적 Hook:**

| Hook 이벤트 | Script | 동작 |
|-------------|--------|------|
| PreToolUse (Bash) | `guardrails/block-destructive.mjs` | `rm -rf`, `git push --force`, `DROP TABLE` 등 차단 (exit 2) |
| PreToolUse (Bash) | `guardrails/block-force-push.mjs` | `git push --force*`, `git push -f*` 차단 |
| PreToolUse (Edit\|Write) | `guardrails/protect-harness.mjs` | `.harness/state/` 직접 수정 차단 (하네스 스크립트만 수정 가능) |
| PostToolUse (Bash) | `guardrails/track-bash-files.mjs` | Bash로 파일 생성/수정 시 감지 → 경고 |
| (공용 emitter) | `scripts/state/audit-append.mjs` | 위 Hook + 아래 Workflow Layer 결정 엔진이 호출. append-only JSONL + flock + rotate. config.audit로 대상 이벤트 토글 |

**Audit Log — 자동 판단의 역추적 장치:**

하네스가 **자동으로** 내린 모든 판단은 `.harness/state/audit.jsonl`에 기록된다. 유저가 "왜 이렇게 됐지?"를 질문했을 때 답할 수 있어야 한다.

| 기록 시점 (Emitter) | Event | 의미 |
|---|---|---|
| SessionStart · `workflow/determine-mode.mjs` | `mode_auto_detected` | `config.workflow.mode: auto`에서 classifier가 확정한 session mode |
| 각 skill 진입 · `workflow/determine-size.mjs` | `right_size_determined` | AC/files/LOC 3축 판정 결과 |
| Architect 단계 · `skills/architect` | `force_size_applied` | Architect의 상향 override (upward_only) |
| UserPromptSubmit · `prompt/auto-transform.mjs` | `prompt_transformed` | 프롬프트 자동변환 diff |
| Agent 호출 · `scripts/agents/tier.mjs` | `model_tier_escalated` | haiku → sonnet → opus 승격 사유 |
| UserPromptSubmit · `gates/gate-engine.mjs` | `gate_skipped` | mode가 explore/prototype이라 skip한 게이트 목록 |
| Agent 종료 · emitter 공용 | `agent_escalation` | DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED 전이 |
| `/harness:qa` 진입 · `skills/qa` | `qa_invoked` | 호출 플래그(--all/--only/--exclude/--force-size/--reason) + 실행 집합 + reason |
| `/harness:qa` 진입 · `skills/qa` | `qa_scope_overridden` | Right-Size 매트릭스와 실제 실행 집합이 다를 때 (추가 emit) |
| `/harness:qa` 완료 · `qa/coverage-report.mjs` | `coverage_evaluated` | 다축 Coverage 평가 결과 (line/branch/mutation/ac/boundary/error_path/integration_ratio/delta + gaps) |
| `/harness:qa` 계층 실행 · `qa/stack-runner.mjs` | `qa_layer_halted` | `qa_stack.mode: sequential_bottom_up` 에서 하위 계층 FAIL로 상위 계층이 skip된 경우 |
| `/harness:qa` 완료 · `qa/attribution.mjs` | `qa_attribution_report` | 실패 귀인 리포트 — 하위 PASS + 상위 FAIL ⇒ `verdict: pure_{layer}_issue` 자동 결론 |
| `/harness:qa` 준비 · `qa/mock-ratio.mjs` | `qa_attribution_warning` | `mock_guard` 위반 — 상위 계층 테스트가 하위 계층을 mock 처리해 귀인 신뢰성 저하 |
| skill 진입 · `scripts/gates/gate-engine.mjs` · UserPromptSubmit lexicon 매칭 | `gate_bypassed` | 유저가 `--bypass-*` 로 gate/review/qa 우회. `{ bypassed: [...], reason, session_id }`. **`--reason` 필수** · append-only · 세션 sticky warning (03-workflow.md §1.9) |

**이벤트 공통 스키마 (JSONL 한 줄):**
```json
{
  "ts": "2026-04-13T14:22:01Z",
  "session_id": "sess-01HX...",
  "event": "mode_auto_detected",
  "decision": { "from": null, "to": "standard" },
  "signals": { "has_spec": true, "branch": "feature/auth-login" },
  "rule_id": "RULE-MODE-STANDARD-DEFAULT",
  "reversible": true,
  "source": "hook:SessionStart"
}
```

**불변식 (Audit Log Iron Law):**
- append-only — 기존 엔트리 수정/삭제 금지 (Event Sourcing 규칙 차용, §7.5 참조)
- flock 직렬화 — 동시 쓰기 race 차단
- PII redaction — `config.audit.redact_fields`에 명시된 필드는 hash로 치환
- `audit.enabled: false` 여도 자동 판단 자체는 정상 동작 — **기록만 중단** (관찰 가능성 포기 옵션)

→ Hook 실행 모델 상세: [07-hooks-system.md](07-hooks-system.md) · Audit Log / State 상세: [10-state-and-audit.md](10-state-and-audit.md)

**Gate 검증 (UserPromptSubmit):**

```
UserPromptSubmit → scripts/gates/gate-engine.mjs
  │
  ├── ★ Early-Exit 분기 (mode 기반)
  │   ※ mode 값 결정 순서:
  │     1) SessionStart 시 determine-mode가 session mode를 확정 (config.workflow.mode == auto일 때)
  │     2) 여기선 확정된 session mode만 읽음. 매 프롬프트 재분류 금지 (session_start_only).
  │   ├── session.mode == "explore" → exit 0 (Gate 전부 skip) + gate_skipped audit emit
  │   ├── session.mode == "prototype" → Deploy Gate만 평가, 나머지 skip + gate_skipped emit
  │   └── standard → 아래 분기 진행
  │
  ├── 입력 파싱: 어떤 스킬이 호출되는가?
  │
  ├── /harness:implement 호출 시:
  │   ├── .harness/specs/ 에 대상 spec 존재? → 없으면 exit 2
  │   ├── .harness/plans/ 에 대상 plan 존재? → 없으면 exit 2
  │   └── 통과 → exit 0
  │
  ├── /harness:qa 호출 시:
  │   ├── tests/ 에 대응 test 존재? → 없으면 exit 2
  │   └── /harness:review 완료 상태? → state/workflow.json 확인
  │
  ├── /harness:deploy 호출 시:
  │   └── /harness:qa PASS 상태? → state/workflow.json 확인
  │
  └── 그 외: exit 0 (통과)
```

### ② Knowledge Layer

**책임:** 지식 축적, Spec↔Test 추적, 문서 커버리지 검증.

**구현 수단:** Script + Skill

| 기능 | 구현 | 설명 |
|------|------|------|
| Spec↔Test 매핑 | `scripts/state/check-coverage.mjs` | spec의 acceptance criteria가 test에 매핑되는지 확인 |
| 문서 커버리지 | `scripts/validators/doc-coverage.mjs` | Spec이 있는데 Plan/Test가 없으면 경고 |
| 지식 축적 | `scripts/knowledge/record-solution.mjs` | 해결된 문제를 `.harness/knowledge/solutions/` 에 기록 |
| 지식 검색 | `scripts/knowledge/query-solutions.mjs` | domain + keyword 기반 유사 솔루션 검색, plan 컨텍스트 주입 |
| 지식 정리 | `scripts/knowledge/prune-stale.mjs` | `/harness:sync` 엔트로피 스윕 시 참조 0 + 90일 경과 항목 후보 제시 |

**솔루션 파일 형식** (`.harness/knowledge/solutions/{domain}/{slug}.md`):

```yaml
---
id: SOL-{domain}-{seq}            # 예: SOL-auth-003
domain: auth
related_specs: [SPEC-auth-login]  # 관련 Spec ID (추적성)
related_acs: [AC-001, AC-003]     # 관련 AC ID
tags: [bcrypt, timing-attack, security]
created: 2026-04-10
last_referenced: 2026-04-14       # query-solutions.mjs 가 자동 갱신
ref_count: 3                      # 참조 횟수 (prune 판단 기준)
---

## 문제
bcrypt 비교 시 timing attack 가능성 — 상수 시간 비교 누락.

## 해결
`crypto.timingSafeEqual` 로 래핑. bcrypt.compare 는 내부적으로 상수시간이나,
커스텀 해시 비교 경로에서 `===` 직접 사용하던 코드를 수정.

## 왜 이 접근이 맞았는가
bcrypt.compare 자체는 안전하지만 fallback 경로(`legacyHash`)가 직접 비교 사용.
해당 경로 제거 대신 래핑한 이유: 마이그레이션 기간 동안 레거시 해시 지원 필요.

## 교훈
해시 비교 경로가 여러 개면 모두 상수시간 보장 필요 — 단일 경로만 검증하면 놓침.
```

**지식 축적 흐름:**
```
문제 해결 (implement/review/qa 과정)
  → record-solution.mjs 호출 (자동: QA 재시도 성공 시 / 수동: 유저 판단)
  → knowledge/solutions/{domain}/{slug}.md 생성
  → workflow.json 에 solution_id 기록

다음 /harness:plan 호출 시:
  → query-solutions.mjs: domain + spec keywords 로 검색
  → 유사 솔루션 상위 3건을 plan 컨텍스트에 주입 (token budget: config.knowledge.max_inject_tokens, 기본 800)
  → last_referenced / ref_count 갱신
```

**정리 (Pruning) 규칙:**
- `/harness:sync` 엔트로피 스윕 시 `prune-stale.mjs` 실행
- 조건: `ref_count == 0 && (now - created) > 90일`
- 자동 삭제 아님 — 후보 목록을 유저에게 제시, 유저 승인 후 삭제 (User Sovereignty)

### ③ Agent Layer

**책임:** 역할별 에이전트 관리, 모델 배분, 에스컬레이션.

→ 상세: [04-agent-system.md](04-agent-system.md) · Skill→Agent 오케스트레이션: [08-skill-system.md](08-skill-system.md)

**핵심 구조:**

| 역할 | 모델 | 도구 제한 | 격리 |
|------|:----:|---------|:----:|
| explorer | haiku | Read, Grep, Glob | - |
| implementer | sonnet | 전체 | worktree |
| reviewer-* (4종) | sonnet (security만 opus) | Read, Grep, Glob | - |
| test-strategist | sonnet | Read, Grep, Bash(test) | - |
| verifier | haiku | Bash, Read, Grep | - |
| architect | opus | 전체 | - |
| requirements-analyst | sonnet | Read, Grep, Glob | - |
| devils-advocate | opus | Read, Grep | - |
| qa-engineer | sonnet | Bash, Read, Grep | worktree |

**에스컬레이션 프로토콜:**

모든 에이전트는 작업 완료 시 4가지 상태 중 하나를 반환한다:

| 상태 | 의미 | 후속 처리 |
|------|------|----------|
| `DONE` | 작업 완료, 결과 신뢰 가능 | Controller가 결과 수용 |
| `CONCERNS` | 완료했으나 우려 사항 존재 | Controller가 우려 검토 후 판단 |
| `NEEDS_CONTEXT` | 추가 정보 필요 | Controller가 정보 제공 또는 사용자 질문 |
| `BLOCKED` | 진행 불가 | Controller가 재배분 또는 사용자 에스컬레이션 |

### ④ Quality Layer

**책임:** 프롬프트 품질 향상, 출력 품질 검증, 불신 기반 리뷰 조율.

**구현 수단:** Hook + Skill

**프롬프트 품질 파이프라인:**

```
사용자 입력
  │
  ├── [UserPromptSubmit Hook]
  │   └── scripts/prompt/quality-check.mjs
  │       │
  │       ├── ★ Early-Exit 분기 (먼저 실행)
  │       │   ├── config.workflow.mode == "explore" → exit 0 (skip)
  │       │   ├── 입력이 `/harness:*` 스킬 호출이 아님 → exit 0 (skip)
  │       │   │   ※ 단순 QnA·대화·"이거 뭐야?" 질문에 변환 제안 붙이지 않음
  │       │   └── 그 외 → 아래 품질 검사 진행
  │       │
  │       ├── 모호성 검사: "빠르게", "적절히" 같은 비측정 표현 감지
  │       ├── 스코프 검사: 단일 프롬프트에 과도한 요청 감지
  │       ├── 누락 검사: 컨텍스트/조건 누락 감지
  │       │
  │       ├── auto_transform=true 이면:
  │       │   → 변환된 프롬프트를 stdout으로 반환
  │       │   → 원본 + 변환 사유를 additionalContext로 주입
  │       │
  │       └── feedback=true 이면:
  │           → 개선 제안을 additionalContext로 주입
  │           → Claude가 제안을 사용자에게 전달
  │
  ├── [PreToolUse Hook]
  │   └── Safety 검사 (① Safety Layer)
  │
  ├── [PostToolUse Hook — Edit|Write]
  │   └── scripts/validators/check-side-effects.mjs
  │       ├── 기존 test 실행 → 깨지면 경고
  │       ├── 새 코드에 대응 test 있는지 확인
  │       └── 커버리지 임계값 확인
  │
  └── [Stop Hook]
      └── scripts/state/update-workflow.mjs
          ├── 워크플로우 상태 갱신
          └── 품질 점수 기록
```

**불신 기반 리뷰 조율:**

```
/harness:review 호출 시:
  │
  ├── Controller(Skill)가 변경 범위 분석
  │   └── scripts/review/diff-analyzer.mjs
  │
  ├── 병렬 리뷰 dispatch:
  │   ├── reviewer-security (보안 관점)
  │   ├── reviewer-performance (성능 관점)
  │   ├── reviewer-quality (코드 품질 관점)
  │   └── reviewer-spec (Spec 준수 관점)
  │
  ├── 각 reviewer 독립 판단:
  │   └── PASS / NEEDS_CHANGE(구체 피드백) / BLOCK(심각)
  │
  └── Controller가 종합:
      └── scripts/review/collect-verdicts.mjs
          ├── 하나라도 BLOCK → 전체 BLOCK
          ├── NEEDS_CHANGE 있으면 → 피드백 정리 후 /harness:implement에 전달
          └── 모두 PASS → 다음 단계 진행
```

### ⑤ Workflow Layer

**책임:** SDLC 파이프라인 오케스트레이션, 게이트 관리, Right-Size 판단, Mode Auto-Detect.

**구현 수단:** Skill(오케스트레이션) + Hook(게이트) + Script(상태)

**상태 추적:**

```json
// .harness/state/workflow.json
{
  "current_feature": "auth/login",
  "phase": "implement",
  "gates_passed": {
    "spec": { "passed": true, "at": "2026-04-11T10:00:00Z", "file": "specs/auth/login.spec.yaml" },
    "test_strategy": { "passed": true, "at": "2026-04-11T10:30:00Z" },
    "plan": { "passed": true, "at": "2026-04-11T11:00:00Z", "file": "plans/auth/login.plan.md" },
    "implement": { "passed": false },
    "review": { "passed": false },
    "qa": { "passed": false }
  },
  "sprint": {
    "iteration": 1,
    "plan_steps_completed": [1, 2],
    "plan_steps_total": 5,
    "test_results": {
      "pass": 12,
      "fail": 3,
      "skip": 0
    }
  },
  "right_size": "medium",
  "session": {
    "mode": "standard",
    "mode_source": "config",          // "config" | "auto_detect"
    "mode_rule_id": null,              // auto_detect일 때 RULE-MODE-* 참조
    "started_at": "2026-04-13T14:22:01Z"
  }
}
```

**Mode Auto-Detect (opt-in, `config.workflow.mode: auto`):**

`config.workflow.mode`가 `standard|prototype|explore`로 고정된 경우는 여기를 건너뛴다. `auto`일 때만 SessionStart Hook이 classifier를 호출해 **세션 mode를 1회 확정**한다.

```
scripts/workflow/determine-mode.mjs  (SessionStart 시 1회 실행)
  │
  ├── 입력 신호 (모두 관찰 가능):
  │   ├── prompt.first_message   ← 세션 첫 프롬프트 텍스트
  │   ├── prompt.invokes_skill   ← /harness:* 호출 여부
  │   ├── git.branch_name         ← 현재 브랜치
  │   ├── fs.target_spec_exists   ← 대상 feature의 spec.yaml 존재
  │   └── fs.target_plan_exists   ← plan.md 존재
  │
  ├── 판정 (config.auto_detect.rules를 위→아래 평가, 첫 매치로 확정):
  │   ├── RULE-MODE-EXPLORE-001   → explore
  │   ├── RULE-MODE-PROTOTYPE-001 → prototype
  │   └── RULE-MODE-STANDARD-DEFAULT → standard (fallthrough · 가장 엄격)
  │
  ├── 안전 규칙 (config.auto_detect.safety):
  │   ├── narrow_only            → standard 이전 세션에서 조용히 낮추지 않음
  │   ├── promotion_requires_user → prototype/explore → standard는 /harness:sync만
  │   └── session_start_only     → 결과는 session.mode에 고정, 중간 전환 없음
  │
  ├── 결과: state/workflow.json.session.mode 에 기록 (mode + rule_id)
  └── Emit: audit.jsonl ← { event: "mode_auto_detected", decision, signals, rule_id }
```

**왜 opt-in인가:** mode는 게이트 on/off를 좌우한다. classifier 오판으로 standard → explore 전환되면 gate가 조용히 풀린다. 기본값은 `standard`, `auto`는 유저가 config로 명시 opt-in해야 동작하며, 설령 opt-in해도 **narrow_only**로 기존 standard 세션을 낮추지 못하게 이중 방어.

**Right-Size 판단 (결정론적, 3축 AND):**

수치 근거와 전체 설명은 [00-overview.md Glossary → Right-Size](00-overview.md#right-size--작업-규모에-맞는-ceremony). 여기선 구현 계약만 명시한다.

```
scripts/workflow/determine-size.mjs
  │
  ├── 입력 (모두 측정 가능):
  │   ├── AC_count    ← .harness/specs/{feature}.spec.yaml > acceptance_criteria[].length
  │   ├── files_count ← plan 단계: plan.md의 step.files_changed uniq
  │   │                 implement 단계: git diff --name-only | wc -l
  │   └── loc_delta   ← git diff --numstat | sum(added+changed), loc_exclude 적용
  │
  ├── 판정식 (deterministic, no ambiguity):
  │
  │   if  AC_count ≤ 3 ∧ files_count ≤ 4  ∧ loc_delta ≤ 100 → "small"
  │   elif AC_count ≤ 7 ∧ files_count ≤ 10 ∧ loc_delta ≤ 400 → "medium"
  │   else → "large" + split_required=true
  │
  ├── small → 건너뛰기: brainstorm, architect, ux · 리뷰: light (1 reviewer)
  ├── medium → 건너뛰기: brainstorm · 리뷰: standard (2-3 reviewer)
  └── large → 전 단계 필수 · 리뷰: deep (4 reviewer 병렬) · Architect가 분할 검토
  
  ※ Architect는 security/complexity 평가 후 right-size를 **상향**만 고정 가능 (force_size).
     Config 또는 Architect는 **하향** 고정 불가 (Iron Law 계열 보수 기본).

  ※ 재판정 경고: implement 단계에서 실측(git diff) 기반 재판정 시 규모가 상향되면
     (예: plan 시점 small → implement 실측 medium/large), right_size_escalated audit
     이벤트를 emit하고 유저에게 경고한다:
     - small → medium: "Architect(ADR) 없이 진행 중입니다. /harness:architect 실행 권장."
     - small/medium → large: "규모가 large로 확대되었습니다. 분할 검토를 권장합니다."
     경고일 뿐 차단하지는 않는다 (이미 implement 진행 중이므로 Architect 소급 강제는 비현실적).
     다만 /harness:review에서 reviewer-architecture가 ADR 부재를 지적할 수 있다.
```

### ⑥ Config Layer

**책임:** 사용자 커스터마이징, 워크플로우 조절, 에이전트 선호.

→ 상세: [05-project-structure.md](05-project-structure.md)의 Config Schema 섹션 · 스크립트 실행 모델: [09-script-system.md](09-script-system.md)

**핵심 규칙:**
- Config은 ②~⑤ 레이어를 조절할 수 있다
- Config은 ① Safety Layer를 조절할 수 없다
- Config의 기본값은 가장 엄격한 설정 (P6: Earn, Don't Assume)

---

## 4. 강제 메커니즘 — 전체 흐름

사용자가 `/harness:implement auth/login`을 호출한 경우의 전체 실행 흐름:

```
사용자: "/harness:implement auth/login"
│
▼ ────────── Hook Layer (결정론적, 토큰 0) ──────────
│
├── [SessionStart — 세션 시작 시 1회]
│   scripts/state/load-state.mjs
│   → .harness/state/workflow.json 읽기
│   → .harness/config.yaml 읽기
│   → 코드 변경 감지 (last-sync-commit vs HEAD)
│   │  → 변경 있으면: "코드가 직접 수정되었습니다. /harness:sync 권장" 주입
│   → additionalContext로 현재 상태 + 설정 + sync 안내 주입
│
├── [UserPromptSubmit]
│   ├── scripts/gates/gate-engine.mjs
│   │   → 파싱: skill=implement, target=auth/login
│   │   → .harness/specs/auth/login.spec.yaml 존재? ✓
│   │   → .harness/plans/auth/login.plan.md 존재? ✓
│   │   → exit 0 (통과)
│   │
│   └── scripts/prompt/quality-check.mjs
│       → 프롬프트 품질 검사
│       → (자동변환 결과가 있으면 주입)
│
▼ ────────── Skill Layer (LLM 오케스트레이션) ──────────
│
├── /harness:implement SKILL.md 로드
│   │
│   ├── 1단계: 컨텍스트 수집
│   │   → explorer 에이전트: spec, plan, config, 기존 코드 읽기
│   │   → Controller가 결과를 정리
│   │
│   ├── 2단계: Test-First
│   │   → test-strategist 에이전트: spec에서 test skeleton 생성
│   │   → scripts/implement/gen-test-skeleton.mjs 보조
│   │   → test-strategist: "이 test가 spec을 실제로 검증하는가?" 확인
│   │
│   ├── 3단계: Plan 단계별 구현
│   │   → implementer 에이전트 (worktree 격리):
│   │     ├── Plan step 1 구현
│   │     │   ├── [PostToolUse: Edit|Write]
│   │     │   │   scripts/validators/check-side-effects.mjs
│   │     │   │   → 기존 test 실행 → PASS ✓
│   │     │   └── 해당 step의 test 실행 → PASS ✓
│   │     ├── Plan step 2 구현
│   │     │   ├── [PostToolUse: Edit|Write]
│   │     │   │   scripts/validators/check-side-effects.mjs
│   │     │   │   → 기존 test 실행 → step 1 test 깨짐! → 경고 주입
│   │     │   └── implementer가 side-effect 수정
│   │     └── ... (반복)
│   │
│   └── 4단계: 최종 검증
│       → verifier 에이전트: 전체 test 실행
│       → scripts/implement/coverage-report.mjs: 커버리지 확인
│       → 결과 → Controller에 반환
│
▼ ────────── Hook Layer (완료 시) ──────────
│
└── [Stop]
    scripts/state/update-workflow.mjs
    → workflow.json: implement.passed = true
    → "다음 단계: /harness:review를 실행하세요" 안내
```

---

## 5. Worktree 활용 전략

| 시나리오 | Worktree | 이유 |
|---------|:--------:|------|
| `/harness:implement` — 코드 구현 | **필수** | 메인 브랜치 보호, 병렬 태스크 시 파일 충돌 방지 |
| `/harness:review` — 코드 리뷰 | 선택 | 읽기 전용이라 불필요할 수 있으나, 실행 검증 시 필요 |
| `/harness:qa` — QA 테스트 실행 | **권장** | 메인 작업 방해 방지, 독립 환경에서 테스트 |
| `/harness:migrate` — Lv3 리팩토링 시에만 | **Lv3만 필수** | 원본 코드 보호, 점진적 변경 안전. Lv1(관측)·Lv2(래핑)는 불필요 (03-workflow.md §2.3) |
| `/harness:architect` — 설계 비교 | 권장 | 여러 설계안을 별도 worktree에서 프로토타입 |
| `/harness:brainstorm`, `/harness:spec`, `/harness:plan` | 불필요 | 문서 작업은 .harness/ 내부, 코드 변경 없음 |

**Worktree 정책 (settings.json):**
```json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "vendor", ".gradle"],
    "sparsePaths": []
  }
}
```

---

## 6. Compact 방어

긴 세션에서 compact 발생 시 하네스 상태 보존:

| 항목 | Compact 후 | 방어 |
|------|:----------:|------|
| .harness/state/ | ✅ 디스크 존재 | SessionStart hook이 재로드 |
| Skill descriptions | ⚠️ 미호출 스킬 소실 | SessionStart hook의 `session-start-context.mjs` 가 스킬 카탈로그·워크플로우 요약을 `additionalContext`로 재주입 (CLAUDE.md 는 유저 소유 · optional) |
| 에이전트 컨텍스트 | ✅ 별도 윈도우 | Compact 영향 없음 |
| Config | ✅ 디스크 존재 | 재로드로 복원 |

**구현 — SessionStart hook 단일 경로 방어:**

업계 선례(OpenAI `AGENTS.md` · Anthropic `CLAUDE.md`)는 모두 유저 컨텍스트 파일로 취급한다. 하네스도 동일 — 프레임워크가 CLAUDE.md 를 자동 생성해 덮어쓰지 않는다. 대신 SessionStart hook이 매 세션 필요한 메타정보를 주입해 compact 후에도 스킬 인지를 복원한다.

> **실증 근거 (Gloaguen et al., ETH Zürich · AGENTbench 2026-02):** 138 태스크 × 12 레포 × 4 에이전트 평가 결과, LLM 자동 생성 컨텍스트 파일은 **성공률 −3% · 비용 +23%**, 개발자 수기 작성은 **+4% · +19%**. 저자 결론: *"omit LLM-generated context files; include only minimal repository-specific requirements."* 본 설계의 CLAUDE.md 자동 생성 배제 결정이 실증과 정렬 — insights/industry-harness-engineering/03-agentsmd-empirical.md 참조.

1. 상태 복원 (compact matcher):
```json
{
  "matcher": "compact",
  "hooks": [{
    "type": "command",
    "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/compact-recovery.mjs"
  }]
}
```

2. 컨텍스트 주입 (모든 SessionStart):
```json
{
  "matcher": "",
  "hooks": [{
    "type": "command",
    "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/session-start-context.mjs"
  }]
}
```

`session-start-context.mjs` 는 다음을 `additionalContext` 로 emit:
- 활성 스킬 카탈로그 (plugin.json 스캔)
- 현재 모드·Right-Size 요약 (workflow.json)
- `bypass_budgets` 잔량 (audit.jsonl 집계)
- 활성 feature 요약 (specs/ 스캔)

유저가 원하면 `skills/init/examples/CLAUDE.md.example` 을 복사해 프로젝트 루트에 배치할 수 있으며, 이 경우 유저 편집 영역으로 존중된다(하네스 덮어쓰기 없음).

**CLAUDE.md 작성 원칙 (실증 기반):** README 와 중복되는 아키텍처·관습 서술은 금지. 오직 **비자명한 레포-특화 제약**(특이 빌드 명령, 정책 금지사항, 숨은 환경 요구)만 기록. 이 원칙을 어기면 Gloaguen 2026 의 수치(+19% 비용 · +4% 성공 → 비용만 남고 효과 소실) 영역에 진입.

---

## 7. 병렬 실행 전략

### 7.1 병렬이 발생하는 시점

| 단계 | 병렬 대상 | 방식 |
|------|---------|------|
| `/harness:brainstorm` | 각 페르소나가 독립 의견 | 서브에이전트 병렬 스폰 |
| `/harness:review` | 4종 reviewer 동시 리뷰 | 서브에이전트 병렬 스폰 |
| `/harness:implement` | Plan 내 의존성 없는 태스크 | Worktree 분기 + 병렬 에이전트 |
| `/harness:qa` | 도메인별 QA (unit/API/UI/DB) | 서브에이전트 병렬 스폰 |

### 7.2 Worktree 자동 분기 (병렬 구현)

```
/harness:implement에서 Plan 의존성 분석:
  Step 1 → Step 2 (순차: Step 2가 Step 1에 의존)
  Step 3 (독립: Step 1,2와 무관)
  Step 4 (독립: Step 1,2와 무관)
  │
  ├── 순차 구간: implementer-1 → Step 1 → Step 2
  │
  ├── 병렬 구간 (자동 worktree 분기):
  │   ├── worktree-A: implementer-2 → Step 3
  │   └── worktree-B: implementer-3 → Step 4
  │
  └── 병합:
      ├── 모든 worktree 완료 대기
      ├── 변경 사항 merge
      ├── 충돌 있으면 Controller가 해결 시도
      │   └── 자동 해결 실패 시 사용자 에스컬레이션
      └── 병합 후 전체 test 실행 (side-effect 확인)
```

### 7.3 Config

```yaml
# .harness/config.yaml (정규 스키마: 05-project-structure.md §4)
execution:
  parallel:
    enabled: true
    max_worktrees: 3               # 동시 worktree 최대 수
    auto_merge: true               # 병렬 완료 후 자동 merge
```

### 7.4 병렬 안전성

| 위험 | 대응 |
|------|------|
| 파일 충돌 | Worktree 격리로 물리적 분리 |
| 테스트 간섭 | 각 worktree에서 독립 test 실행 |
| 병합 후 side-effect | 병합 직후 전체 test suite 재실행 |
| 에이전트 과다 스폰 | `max_concurrent_agents`로 제한 |
| **`.harness/state/` 동시 쓰기** | **워크트리에서 직접 쓰기 금지 — 아래 7.5 참조** |

### 7.5 `.harness/state/` 동시성 모델 — Single Writer (Actor 원칙 차용)

> **출처:** Actor Model의 *"한 Actor는 한 번에 한 메시지만 처리한다"* 원칙을 파일시스템 레벨로 차용. 배경: [patterns/01-ddd-aggregate-actor.md §3.2](../../insights/patterns/01-ddd-aggregate-actor.md), 적용 근거: [patterns/05-harness-applicability.md §4.5](../../insights/patterns/05-harness-applicability.md#45--single-writer-재확인--actor-원칙의-명시화).

**원칙: 단일 쓰기 지점 (Single Writer).** Actor의 mailbox가 동시성 충돌을 구조적으로 차단하듯, 하네스는 **`.harness/state/` 쓰기 진입을 단일 스크립트 경로**로 일원화한다. 병렬 worktree는 상태를 **읽기만** 가능하며, state 파일(`workflow.json`, `tasks.json`, `coverage.json`, `last-sync-commit`, `events/**/*.jsonl`)은 **메인 세션만** 쓴다.

```
메인 세션 (writer, .harness/state/ 소유)
  │
  ├── dispatch: worktree-A (implementer-2) — Step 3
  ├── dispatch: worktree-B (implementer-3) — Step 4
  │
  ├── 각 worktree는 자신의 결과를 summary로 반환 (state 파일 직접 쓰기 금지)
  │   └── worktree 결과물: 코드 + 테스트 + summary JSON (stdout)
  │
  └── 메인이 결과를 수신하여 .harness/state/ 일괄 갱신 (Stop hook or 오케스트레이터)
```

**강제 메커니즘:**
- `guardrails/protect-harness.mjs` (PreToolUse) — 모든 세션에서 `.harness/state/` 직접 Edit/Write 차단
- 예외: 하네스 자체 스크립트(`scripts/state/*.mjs`)만 통과. 실행 주체가 메인 세션이든 worktree든 **스크립트 경유 + flock**.
- `scripts/state/update-workflow.mjs`는 파일 잠금(`proper-lockfile` 또는 OS flock) 후 read-modify-write → 잠금 해제

**병합 시점의 state 동기화:**
- 모든 worktree 완료 → 메인이 결과 병합 → 단일 트랜잭션으로 `workflow.json` 갱신
- 이 구조는 "병렬은 결과물(코드) 생성, 메인은 상태 기록" 이라는 역할 분리를 강제한다.

→ Single Writer · Event Sourcing · Compact Recovery 상세: [10-state-and-audit.md](10-state-and-audit.md)

---

## 8. 토큰 / Context Window 효율 분석

### 8.1 비용 구조

| 컴포넌트 | 토큰 비용 | 최적화 전략 |
|---------|:--------:|-----------|
| Hook (command 타입) | **0** | Safety, Gate, Side-effect 검사 모두 무비용 |
| Script 실행 | **0** | 결정론적 로직은 전부 스크립트로 위임 |
| Skill description (10개) | ~1,000 | 수동 전용(`disable-model-invocation`)은 cost 0 |
| Skill 본문 (호출 시) | ~2,000-5,000 | 호출된 스킬만 로드. 미호출은 비용 0 |
| Subagent 스폰 | ~80 | 스폰 자체는 저렴 |
| Subagent 반환 | ~420 | 요약만 메인에 반환. 내부는 별도 윈도우 |
| 파일 읽기 (Read) | 1,000-3,000+ | explorer가 읽고 요약 → 메인은 요약만 수신 |

### 8.2 핵심 효율 전략

| # | 전략 | 효과 | 원리 |
|---|------|------|------|
| 1 | **Script-First** | 65% 토큰 절감 | 검증/분석/상태 관리를 scripts/로 위임 (토큰 0) |
| 2 | **Subagent 격리** | 메인 컨텍스트 보호 | explorer가 10개 파일 읽어도 메인에 ~420t만 |
| 3 | **Hook = 무료 품질 검증** | 반복 검증 무비용 | PostToolUse side-effect 검사 = 토큰 0 |
| 4 | **SessionStart 컨텍스트 주입** | 긴 세션 안정성 | `session-start-context.mjs` 가 스킬 카탈로그·워크플로우 요약을 매 세션 주입 (CLAUDE.md 의존 제거) |
| 5 | **병렬 = 컨텍스트 독립** | 선형 비용 대비 절감 | 4개 reviewer 병렬 = 메인에 ~2,000t |

### 8.3 일반 세션 토큰 예산 추정

```
세션 시작 시 (~8,000t / 200,000t 윈도우):
  System prompt:                     ~4,200t
  CLAUDE.md (유저 소유, optional):   ~1,800t  (없으면 0t)
  Auto memory:                         ~680t
  Skill descriptions (10개):         ~1,000t
  SessionStart context inject:       ~1,800t  (session-start-context.mjs — 스킬 카탈로그 + 워크플로우 요약)
  SessionStart hook 상태 복원:         ~200t

/harness:implement 호출 시 추가 (~7,000t):
  Skill 본문:                 ~3,000t
  Gate 검사:                       0t  (Hook)
  Config 읽기:                  ~500t
  Subagent 4종 (스폰+반환):   ~2,000t  (explorer, test-strategist, implementer, verifier)
  PostToolUse 검사:                0t  (Hook)
  Side-effect 검사:                0t  (Hook)

총 고정 비용: ~15,000t / 200,000t = ~7.5%
작업 가용 공간: ~185,000t

비교: Hook/Script 없이 전부 LLM으로 했다면
  Gate 검사:                  ~2,000t  (매 호출)
  Side-effect 검사:           ~3,000t  (매 Edit/Write)
  품질 검증:                  ~2,000t  (매 출력)
  → 작업 1회당 ~7,000t 추가 소비
```

### 8.4 비용 최적화 체크리스트

- [ ] Skill SKILL.md는 오케스트레이션 지시만 (~200줄 이하)
- [ ] 결정론적 검증은 Hook command로 (토큰 0)
- [ ] 수동 전용 스킬은 `disable-model-invocation: true`
- [ ] 대량 파일 읽기는 explorer 서브에이전트로 격리
- [ ] 리뷰/QA는 병렬 서브에이전트로 (순차 대비 컨텍스트 절약)
- [ ] `@path` 임포트 남발 금지 (유저가 CLAUDE.md·Rules를 선택적으로 둘 때)
- [ ] CLAUDE.md(유저 작성 시)·SessionStart inject 가 README 와 내용 중복 없는지 점검
      — Gloaguen 2026 은 README 중복 컨텍스트가 **성공률 -3% · 비용 +23%** 요인임을 실증.
      `scripts/qa/context-redundancy.mjs`(선택) 가 SessionStart 주입 ↔ README 의 텍스트 유사도(Jaccard)를
      측정, 임계 초과 시 `context_redundancy_warn` audit 이벤트 emit.
