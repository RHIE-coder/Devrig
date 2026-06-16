# 09. Script System — 실행 모델 & 프로토콜

> **반복 등장 용어:** `Script`(하네스의 결정론적 `.mjs` 실행 단위, 토큰 비용 0), `Hook`(Script가 등록되는 Claude Code 이벤트 지점), `Audit`(Script가 emit하는 판단 기록). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 1. Script란

Script는 하네스의 **결정론적 실행 단위**다. LLM을 호출하지 않고 순수 Node.js 로직으로 게이트 검증, 상태 관리, 품질 검사, 감사 기록을 수행한다.

```
                 LLM 영역 (토큰 소비)
                 ┌─────────────────────┐
                 │ SKILL.md → Agent    │
                 └────────┬────────────┘
                          │ 호출
                 ┌────────▼────────────┐
Script 영역      │ scripts/*.mjs       │  ← 토큰 0, 결정론적
(토큰 0)         │ exit(0|2) + stdout  │
                 └─────────────────────┘
```

**핵심 원칙:**

| 원칙 | 설명 | 근거 |
|------|------|------|
| **LLM 의존 금지** | 모든 스크립트는 순수 JS/Node.js. 토큰 비용 0 | Script-First (01-philosophy.md P7) |
| **결정론적** | 같은 입력 → 항상 같은 결과. LLM 합리화 불가 | 물리적 차단 > 프롬프트 지시 |
| **단일 책임** | 한 스크립트 = 한 결정 | gate-check는 Gate만, audit은 공용 emitter 호출 |
| **cross-platform** | Node ≥ 20, macOS/Linux/WSL 호환 | 02-architecture.md §2.5 |

---

## 2. .mjs 컨벤션

### 2.1 왜 .mjs인가

| 항목 | 선택 | 근거 |
|------|------|------|
| 런타임 | **Node.js** | Claude Code가 이미 Node 런타임을 보장 (추가 설치 불필요) |
| 형식 | **`.mjs` (ESM)** | top-level await, 표준 import/export, 미래 호환 |
| 호출 | `node ${CLAUDE_PLUGIN_ROOT}/path/to/script.mjs` | shebang 비의존 → Windows/macOS/Linux **동일 동작** |
| 셸 스크립트 | ❌ 사용 안 함 | Windows 미지원. `.bat` 병행은 유지보수 지옥 |
| 파이썬 | ❌ 사용 안 함 | 환경 편차, 런타임 추가 설치 요구 |

### 2.2 파일 구조 컨벤션

```javascript
// scripts/gates/gate-engine.mjs
//
// [Model Limit Assumption]
// LLM은 "spec이 필요하다"는 지시를 합리화로 우회할 수 있다.
// → Hook 레벨에서 물리적으로 차단.
//
// [Exit Protocol]
// exit(0) = 게이트 통과
// exit(2) = 게이트 실패 (결정론적 차단)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR;
// ... 로직 ...

if (!specExists) {
  console.error('⛔ G1: Spec이 없습니다. /harness:spec 을 먼저 실행하세요.');
  process.exit(2);
}

process.exit(0);
```

**헤더 규약:**
- `[Model Limit Assumption]` — 이 스크립트가 보완하는 모델 한계 (분기별 재검토 대상)
- `[Exit Protocol]` — exit code 의미 명시

---

## 3. Exit Code 프로토콜

| exit code | 의미 | 효과 | 예시 |
|---|---|---|---|
| **0** | 통과 (success) | 다음 단계로 진행 | gate-check: 전제조건 충족 |
| **2** | 정책 차단 (deterministic block) | 해당 동작 차단. stderr 메시지 유저 표시 | gate-check: spec 없음 |
| **1** (또는 기타) | 런타임 에러 (script bug) | 동작 차단되지 않되 경고 발생 | 파일 읽기 실패, JSON 파싱 에러 |

**설계 의도:**
- `exit(2)`는 **의도적 차단** — 재현 가능하고 수정 가능한 상태 (spec 추가하면 해결)
- `exit(1)`은 **스크립트 버그** — 하네스 개발자가 수정해야 하는 문제
- 이 구분이 있으므로 유저는 exit 2를 보고 "내가 뭘 해야 하는지" 알 수 있고, exit 1을 보고 "하네스에 문제가 있다"고 판단할 수 있다

---

## 4. 통신 프로토콜

### 4.1 stdout — 구조화 데이터 반환

```
stdout → Claude Code에 JSON 데이터 전달
```

| 용도 | 스크립트 | stdout 내용 |
|------|---------|------------|
| additionalContext 주입 | `session-start-context.mjs` | 스킬 카탈로그 + 워크플로우 상태 요약 (JSON) |
| 라우터 힌트 | `route-hint.mjs` | `{ "hint": "/harness:plan", "reason": "spec 통과, plan 미통과" }` |
| 프롬프트 변환 결과 | `auto-transform.mjs` | 변환된 프롬프트 텍스트 |
| 커버리지 리포트 | `coverage-report.mjs` | 8축 커버리지 JSON |

**규칙:** stdout에는 **JSON 또는 구조화 텍스트만** 출력. 디버그 메시지, 로그는 stderr로.

### 4.2 stderr — 유저 표시용 메시지

```
stderr → 유저에게 직접 표시되는 텍스트
```

| 용도 | 예시 |
|------|------|
| 차단 사유 (exit 2) | `⛔ G1: Spec이 없습니다. /harness:spec 을 먼저 실행하세요.` |
| 경고 (exit 0이지만 주의 필요) | `⚠️ bypass 사용 중 (이번 세션 잔여: 2/3)` |
| side-effect 감지 | `⚠️ Side-effect: tests/auth.test.ts 가 실패합니다.` |
| 디버그 정보 | 스크립트 내부 로깅 (유저에게 참고용으로 노출) |

### 4.3 환경 변수 (입력)

Claude Code가 스크립트 실행 시 주입하는 환경 변수:

| 변수 | 설명 | 가용 시점 |
|------|------|----------|
| `CLAUDE_PLUGIN_ROOT` | 하네스 플러그인 루트 절대 경로 | 항상 |
| `CLAUDE_PROJECT_DIR` | 유저 프로젝트 루트 절대 경로 | 항상 |
| `HOOK_EVENT` | 현재 Hook 이벤트명 | Hook 경유 시 |
| `TOOL_NAME` | 호출된 도구명 (Bash, Edit 등) | PreToolUse/PostToolUse |
| `TOOL_INPUT` | 도구 입력 (JSON 문자열) | PreToolUse |

---

## 5. Script 분류 체계 (Taxonomy)

하네스의 모든 스크립트는 9개 카테고리로 분류된다. 카테고리는 **디렉토리 경로**로 표현.

### 5.1 공용 스크립트 (`scripts/` — 스킬 간 공유)

| # | 카테고리 | 경로 | 책임 | 스크립트 수 |
|---|---------|------|------|:---------:|
| ① | **Safety (Guardrails)** | `scripts/guardrails/` | 파괴적 동작 물리적 차단 | 4 |
| ② | **Gate** | `scripts/gates/` | 워크플로우 전제조건 강제 | 1 |
| ③ | **Prompt Pipeline** | `scripts/prompt/` | 프롬프트 품질 검사 · 변환 | 2 |
| ③-b | **Knowledge** | `scripts/knowledge/` | 지식 축적 · 검색 · 정리 | 3 |
| ④ | **State** | `scripts/state/` | 워크플로우 상태 관리 | 4 |
| ④-b | **Hooks Context** | `scripts/hooks/` | 세션 컨텍스트 주입 | 1 |
| ⑤ | **Workflow** | `scripts/workflow/` | 모드 감지 · Right-Size 판정 | 2 |
| ⑥ | **QA** | `scripts/qa/` | QA Stack 실행 · 귀인 · 커버리지 | 5 |
| ⑦ | **Validators** | `scripts/validators/` | 문서 커버리지 · Spec 필드 · Side-effect | 3 |

### 5.2 스킬 로컬 스크립트 (`skills/*/scripts/`)

각 스킬 디렉토리 내부의 결정론적 로직. SKILL.md가 호출하거나 Hook에서 호출.

| 스킬 | 주요 스크립트 |
|------|-------------|
| init | `scaffold-harness.mjs`, `gen-config.mjs`, `copy-examples.mjs` |
| brainstorm | `load-personas.mjs`, `suggest-personas.mjs`, `summarize-session.mjs` |
| spec | `validate-spec.mjs`, `check-testability.mjs`, `gen-coverage-map.mjs` |
| architect | `check-constraints.mjs`, `dep-graph.mjs` |
| ux | `check-accessibility.mjs`, `gen-ux-adr.mjs`, `platform-guide.mjs` |
| plan | `gate-check.mjs`, `decompose.mjs`, `validate-plan.mjs` |
| implement | `gate-check.mjs`, `gen-test-skeleton.mjs`, `coverage-report.mjs` |
| review | `gate-check.mjs`, `dispatch-reviewers.mjs`, `merge-reviews.mjs` |
| qa | `gate-check.mjs`, `stack-runner.mjs`, `mock-ratio.mjs`, `attribution.mjs`, `coverage-trend.mjs`, `context-redundancy.mjs` |
| deploy | `gate-check.mjs` |
| sync | `detect-drift.mjs`, `diff-analyzer.mjs`, `update-specs.mjs`, `entropy-sweep.mjs`, `schedule-register.mjs` |
| persona | `dispatch.mjs`, `create.mjs`, `list.mjs`, `edit.mjs`, `delete.mjs` |
| migrate | `dispatch.mjs`, `init.mjs`, `analyze.mjs`, `extract-spec.mjs`, `gen-test.mjs` |
| refactor | `check-invariant.mjs`, `detect-moves.mjs`, `rollback.mjs` |

### 5.3 공용 vs 스킬 로컬 기준

| 기준 | 배치 |
|------|------|
| 여러 스킬 / Hook 에서 호출 | `scripts/` (공용) |
| 특정 스킬 내부에서만 사용 | `skills/{name}/scripts/` (로컬) |
| 로컬에서 공용을 래핑 | 가능 — 예: `skills/qa/scripts/gate-check.mjs`가 `scripts/gates/gate-engine.mjs`의 특정 게이트만 호출 |

---

## 6. Audit Emit 계약

### 6.1 공용 Emitter

모든 audit 이벤트는 반드시 `scripts/state/audit-append.mjs`를 경유한다:

```javascript
// 다른 스크립트에서 audit emit 하는 방법
import { execSync } from 'node:child_process';

execSync(`node ${process.env.CLAUDE_PLUGIN_ROOT}/scripts/state/audit-append.mjs`, {
  input: JSON.stringify({
    event: 'right_size_determined',
    decision: { from: null, to: 'medium' },
    signals: { ac: 5, files: 8, loc: 250 },
    rule_id: 'determine-size:medium-band',
  }),
});
```

**공용 emitter가 보장하는 것:**
- `flock` 직렬화 (동시 append 충돌 방지)
- 자동 `ts`, `session_id` 주입
- PII `redact_fields` hash 치환
- `rotate_mb` 초과 시 자동 회전 (`audit-{YYYY-MM}.jsonl`)

### 6.2 Audit Event 공통 스키마

```jsonc
{
  "ts": "2026-04-14T10:23:45.123Z",     // 자동 주입
  "session_id": "abc-123",               // 자동 주입
  "event": "right_size_determined",      // 이벤트 타입 (아래 §6.3 참조)
  "source": "scripts/workflow/determine-size.mjs",  // emit 한 스크립트
  "decision": {                          // 판단 결과
    "from": null,                        // 이전 상태 (없으면 null)
    "to": "medium"                       // 결정된 상태
  },
  "signals": {                           // 판단 근거 (입력 신호)
    "ac": 5,
    "files": 8,
    "loc": 250
  },
  "rule_id": "determine-size:medium-band",  // 적용된 규칙 ID
  "reversible": true                     // 이 판단이 되돌릴 수 있는가
}
```

**필수 필드:** `event`, `source`
**자동 주입 필드:** `ts`, `session_id`
**권장 필드:** `decision`, `signals`, `rule_id`, `reversible`

### 6.3 Audit Event 타입 카탈로그

| Event | Emitter | 의미 |
|---|---|---|
| `mode_auto_detected` | determine-mode.mjs | auto mode가 확정한 session mode |
| `mode_changed` | /harness:mode | 유저 명시 모드 전환 |
| `right_size_determined` | determine-size.mjs | AC/files/LOC 3축 판정 결과 |
| `force_size_applied` | Architect 단계 | 상향 override (upward_only) |
| `prompt_transformed` | auto-transform.mjs | 프롬프트 자동변환 diff |
| `model_tier_escalated` | Agent 호출 | haiku → sonnet → opus 승격 |
| `gate_skipped` | gate-engine.mjs | explore/prototype에서 skip된 게이트 |
| `gate_bypassed` | gate-engine.mjs | 유저 `--bypass-*`로 우회 — `--reason` 포함 |
| `agent_escalation` | Agent 종료 | DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED 전이 |
| `qa_invoked` | /harness:qa 진입 | 실행 플래그 + 실행 집합 |
| `qa_scope_overridden` | /harness:qa 진입 | Right-Size 매트릭스와 실제 집합 불일치 |
| `coverage_evaluated` | /harness:qa 완료 | 8축 Coverage 평가 결과 + gaps |
| `qa_layer_halted` | stack-runner.mjs | 하위 계층 FAIL → 상위 skip |
| `qa_attribution_report` | attribution.mjs | 실패 귀인 리포트 |
| `qa_attribution_warning` | mock-ratio.mjs | mock_guard 위반 경고 |
| `solution_recorded` | record-solution.mjs | Knowledge Layer 솔루션 기록 |
| `knowledge_prune_candidates` | prune-stale.mjs | 정리 후보 솔루션 목록 |
| `ux_decision_recorded` | /harness:ux (`gen-ux-adr.mjs`) | UX ADR 기록 |
| `entropy_sweep_started` | entropy-sweep.mjs | 엔트로피 스윕 시작 |
| `entropy_sweep_completed` | entropy-sweep.mjs | 엔트로피 스윕 완료 |
| `assumption_review` | 분기 스윕 | `retired_assumptions[]` 후보 발견 |
| `refactor_started` | /harness:refactor | 리팩토링 시작 |
| `refactor_move_applied` | /harness:refactor | move별 적용 |
| `refactor_rolled_back` | /harness:refactor | RED 감지 → 롤백 |
| `refactor_completed` | /harness:refactor | 리팩토링 완료 |

---

## 7. 실행 시점 매트릭스

스크립트가 **언제** 호출되는지 한눈에 보는 매트릭스:

| 시점 | Hook 이벤트 | 호출되는 스크립트 |
|------|-----------|----------------|
| 세션 시작 | SessionStart | `load-state` → `session-start-context` → `determine-mode` → `route-hint` → `detect-drift` |
| compact 복구 | SessionStart (compact) | `compact-recovery` |
| 유저 프롬프트 | UserPromptSubmit | `gate-engine` → `quality-check` → `auto-transform` |
| Bash 실행 전 | PreToolUse (Bash) | `block-destructive` → `block-force-push` |
| 파일 편집 전 | PreToolUse (Edit\|Write) | `protect-harness` |
| Bash 실행 후 | PostToolUse (Bash) | `track-bash-files` |
| 파일 편집 후 | PostToolUse (Edit\|Write) | `check-side-effects` |
| 스킬 진입 | Skill 내부 | `gate-check` → `determine-size` → 스킬별 스크립트 |
| QA 실행 | qa Skill 내부 | `stack-runner` → `mock-ratio` → `attribution` → `coverage-trend` |
| 스킬 완료 | Stop | `update-workflow` |
| 판단 기록 | 공용 (모든 시점) | `audit-append` |

---

## 8. 원칙 요약

1. **LLM 의존 금지** — 모든 스크립트는 순수 JS/Node.js. 토큰 비용 0, 결정론적
2. **단일 책임** — 한 스크립트 = 한 결정. gate-check는 Gate만, audit은 공용 emitter 호출
3. **공용 emitter 경유** — audit 이벤트는 반드시 `audit-append.mjs` 통과 (flock · rotate · PII redact)
4. **cross-platform** — `.mjs` (ESM), `node` 호출, shebang 비의존. macOS/Linux/WSL 호환
5. **skill-local vs 공용** — 특정 스킬 전용은 `skills/{name}/scripts/`, 공용은 `scripts/` 루트

---

## 참조

- [02-architecture.md §2.5](02-architecture.md) — 스크립트 실행 환경 (cross-platform)
- [06-cli-reference.md §5](06-cli-reference.md) — Scripts Reference (스크립트별 역할·호출시점)
- [07-hooks-system.md](07-hooks-system.md) — Hook 이벤트와 스크립트 매핑
- [08-skill-system.md](08-skill-system.md) — Skill → Script 호출 관계
- [10-state-and-audit.md](10-state-and-audit.md) — audit.jsonl 저장 형식, Event Sourcing
- [00-overview.md Glossary](00-overview.md) — Audit Log 이벤트 정의
