# 07. Hooks System — Hook Lifecycle & 하네스 개입

> **반복 등장 용어:** `Hook`(Claude Code가 제공하는 이벤트 기반 확장 지점), `Script`(Hook에 등록된 `.mjs` 실행 단위), `Matcher`(Hook이 반응할 도구/조건 필터). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 1. Hook이란

Claude Code는 세션의 주요 시점마다 **Hook 이벤트**를 발생시킨다. 하네스는 이 이벤트에 `.mjs` 스크립트를 등록하여 **LLM 호출 없이(토큰 0)** 결정론적 검증·차단·상태관리를 수행한다.

```
유저 프롬프트
  → Hook(결정론적, 0t) → Skill(LLM) → Agent(LLM)
      ↑ 여기서 막으면 LLM 호출 자체가 발생하지 않음
```

**핵심 원칙:**

| 원칙 | 설명 |
|------|------|
| **Hook > Skill > Agent** | Hook이 LLM보다 먼저 실행. 게이트 검증·파괴적 명령 차단은 모두 Hook 레벨 (02-architecture.md §2) |
| **토큰 비용 0** | Hook command 타입은 셸 스크립트 실행. LLM 호출 없음. Safety/Gate/Side-effect 검사를 Hook으로 구현하면 작업 1회당 ~7,000t 절감 |
| **결정론적** | 같은 입력 → 항상 같은 결과. LLM 합리화 불가 (물리적 차단) |
| **exit code 통신** | `process.exit(0)` = 통과, `process.exit(2)` = 정책 차단. stdout으로 JSON 반환 가능 |

---

## 2. Claude Code Hook 이벤트 전체 목록

Claude Code 플랫폼이 제공하는 전체 Hook 이벤트와 하네스 개입 여부:

### 2.1 하네스가 개입하는 이벤트

| Hook 이벤트 | 시점 | Matcher | 하네스 스크립트 | 분류 |
|---|---|---|---|---|
| **SessionStart** | 세션 시작 | `""` (전체) | `load-state.mjs`, `compact-recovery.mjs`(조건부), `session-start-context.mjs`, `determine-mode.mjs` | State, Context |
| **UserPromptSubmit** | 유저 프롬프트 입력 | `""` (전체) | `gate-engine.mjs`, `quality-check.mjs`, `auto-transform.mjs`, `route-hint.mjs` | Gate, Quality, Context |
| **PreToolUse** | 도구 실행 전 | `"Bash"` | `block-destructive.mjs`, `block-force-push.mjs` | Safety |
| **PreToolUse** | 도구 실행 전 | `"Edit\|Write"` | `protect-harness.mjs` | Safety |
| **PostToolUse** | 도구 실행 후 | `"Bash"` | `track-bash-files.mjs` | Safety |
| **PostToolUse** | 도구 실행 후 | `"Edit\|Write"` | `check-side-effects.mjs` | Quality |
| **Stop** | 세션/스킬 종료 | `""` (전체) | `update-workflow.mjs` | State |

**총 13개 스크립트, 5개 이벤트 + 공용 emitter(`audit-append.mjs`)**

> **C5/C6 참고:** `detect-drift.mjs`와 `route-hint.mjs`는 SessionStart에서 제거됨. detect-drift는 `/harness:sync` 호출 시에만 실행 (새 프로젝트에서 sync 전에는 비교 대상 없음). route-hint는 UserPromptSubmit에서 유저 입력 후 힌트 생성으로 이동 (SessionStart 시점에는 유저 입력이 없어 "B 경로 실패"를 판단할 수 없음).

### 2.2 하네스가 개입하지 않는 이벤트 (확장 예비)

| Hook 이벤트 | 시점 | 비개입 이유 |
|---|---|---|
| PermissionRequest | 도구 권한 요청 | Claude Code 내장 처리 |
| Elicitation / ElicitationResult | MCP input | Claude Code 내장 처리 |
| SubagentStart / SubagentStop | 서브에이전트 생명주기 | Claude Code 내장 처리 |
| TaskCreated / TaskCompleted | 태스크 관리 | Claude Code 내장 처리 |
| Notification | 비동기 알림 | 확장 예비 |
| TeammateIdle | 팀메이트 대기 | 확장 예비 |
| PreCompact / PostCompact | compact 전후 | compact-recovery는 SessionStart에서 snapshot 불일치로 감지 |
| WorktreeCreate / WorktreeRemove | worktree 생명주기 | 확장 예비 |
| CwdChanged / FileChanged | 파일 시스템 변화 | 확장 예비 |
| ConfigChange | 설정 변경 | 확장 예비 |
| InstructionsLoaded | CLAUDE.md 로드 | 확장 예비 |
| SessionEnd | 세션 종료 | 확장 예비 |

---

## 3. Hook Lifecycle 흐름

```
┌─── Session ────────────────────────────────────────────────────────┐
│                                                                     │
│  ① SessionStart                                                     │
│     load-state → compact-recovery(조건부) → session-start-context   │
│     → determine-mode                                                │
│                                                                     │
│  ┌─── Each Turn ─────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  ② UserPromptSubmit                                            │  │
│  │     gate-engine → quality-check → auto-transform → route-hint  │  │
│  │                                                                │  │
│  │  ┌─── Agentic Loop ────────────────────────────────────────┐  │  │
│  │  │                                                          │  │  │
│  │  │  ③ PreToolUse                                            │  │  │
│  │  │     [Bash] block-destructive → block-force-push          │  │  │
│  │  │     [Edit|Write] protect-harness                         │  │  │
│  │  │                                                          │  │  │
│  │  │  ④ [tool executes]                                       │  │  │
│  │  │                                                          │  │  │
│  │  │  ⑤ PostToolUse                                           │  │  │
│  │  │     [Bash] track-bash-files                              │  │  │
│  │  │     [Edit|Write] check-side-effects                      │  │  │
│  │  │                                                          │  │  │
│  │  │  (SubagentStart/Stop, TaskCreated/Completed — 미개입)     │  │  │
│  │  │                                                          │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ⑥ Stop                                                             │
│     update-workflow                                                 │
│                                                                     │
│  (Notification, TeammateIdle, Pre/PostCompact — 비동기/미개입)       │
│                                                                     │
│  ⑦ SessionEnd (미개입)                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Hook 실행 모델

### 4.1 등록 구조 (hooks.json)

Hook 스크립트는 `hooks.json`에 등록된다. 위치: 하네스 플러그인 루트 (`forge/harness/marketplace/plugins/harness/hooks.json`).

```json
{
  "hooks": {
    "<HookEvent>": [
      {
        "matcher": "<tool_name_regex | condition>",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/<category>/<script>.mjs"
          }
        ]
      }
    ]
  }
}
```

**필드 설명:**

| 필드 | 설명 |
|------|------|
| `HookEvent` | Claude Code Hook 이벤트명 (SessionStart, PreToolUse 등) |
| `matcher` | 이벤트 필터. `""` = 모든 호출에 반응. `"Bash"` = Bash 도구만. `"Edit\|Write"` = 복수 도구 |
| `type` | 항상 `"command"` — 셸 명령 실행 |
| `command` | `node ${CLAUDE_PLUGIN_ROOT}/...` 형식. `CLAUDE_PLUGIN_ROOT`는 Claude Code가 자동 주입하는 플러그인 루트 경로 |

### 4.2 실행 순서 보장

```
동일 HookEvent + 동일 matcher 내:
  hooks[] 배열 순서대로 순차 실행 (직렬)
  앞 스크립트가 exit(2)로 차단하면 뒤 스크립트 실행되지 않음

동일 HookEvent + 다른 matcher:
  matcher 순서대로 평가
  매치되는 첫 matcher 블록만 실행
```

**예시 — PreToolUse에서 Bash 실행 시:**
1. `matcher: "Bash"` 매치 → `block-destructive.mjs` 실행
2. PASS → `block-force-push.mjs` 실행
3. PASS → 도구 실행 허용
4. 하나라도 `exit(2)` → 도구 실행 차단, 에러 메시지 반환

### 4.3 exit code 프로토콜

| exit code | 의미 | 효과 |
|---|---|---|
| **0** | 통과 | 다음 스크립트 또는 실행 계속 |
| **2** | 정책 차단 (결정론적) | 해당 동작 차단. stderr 메시지가 유저에게 표시 |
| **1** (또는 기타) | 런타임 에러 | 스크립트 자체의 버그. 동작은 차단되지 않되 경고 발생 |

**통신 채널:**

| 채널 | 용도 | 예시 |
|------|------|------|
| `stdout` | JSON 데이터 반환 (additionalContext 등) | `session-start-context.mjs` → 스킬 카탈로그 JSON |
| `stderr` | 유저 표시용 메시지 (차단 사유, 경고) | `block-destructive.mjs` → `"⛔ rm -rf 차단됨"` |
| `exit code` | Hook 결과 (0/2) | `gate-engine.mjs` → `exit(2)` = 게이트 실패 |

### 4.4 환경 변수

스크립트 실행 시 Claude Code가 주입하는 환경 변수:

| 변수 | 설명 |
|------|------|
| `CLAUDE_PLUGIN_ROOT` | 하네스 플러그인 루트 절대 경로 |
| `CLAUDE_PROJECT_DIR` | 유저 프로젝트 루트 절대 경로 |
| `HOOK_EVENT` | 현재 Hook 이벤트명 (SessionStart, PreToolUse 등) |
| `TOOL_NAME` | PreToolUse/PostToolUse 시 호출된 도구명 (Bash, Edit 등) |
| `TOOL_INPUT` | PreToolUse 시 도구 입력 (JSON 문자열) |

---

## 5. 스크립트 분류 체계

하네스가 Hook에 등록하는 15개 스크립트는 5개 분류로 나뉜다:

### 5.1 Safety (4개) — 구조적 강제

**"Claude가 협조하든 적대적이든 차단한다"**

| 스크립트 | Hook | Matcher | 역할 |
|---|---|---|---|
| `guardrails/block-destructive.mjs` | PreToolUse | Bash | `rm -rf`, `DROP TABLE` 등 파괴적 명령 패턴 차단 |
| `guardrails/block-force-push.mjs` | PreToolUse | Bash | `git push --force`, `git push -f` 차단 |
| `guardrails/protect-harness.mjs` | PreToolUse | Edit\|Write | `.harness/state/` 직접 수정 차단. 하네스 스크립트(`scripts/state/*.mjs`)만 통과 |
| `guardrails/track-bash-files.mjs` | PostToolUse | Bash | Bash로 파일 생성/수정 감지 → 감시 목록 갱신 + 경고 |

### 5.2 Gate (1개) — 워크플로우 전제조건

| 스크립트 | Hook | Matcher | 역할 |
|---|---|---|---|
| `gates/gate-engine.mjs` | UserPromptSubmit | `""` | Iron Law G1~G5 게이트 평가. 미충족 시 `exit(2)` + 안내 메시지. `--bypass-*` 플래그 감지 시 통과 + `gate_bypassed` audit |

### 5.3 Quality (3개) — 프롬프트 품질 · Side-effect

| 스크립트 | Hook | Matcher | 역할 |
|---|---|---|---|
| `prompt/quality-check.mjs` | UserPromptSubmit | `""` | 프롬프트 모호성("빠르게"), 스코프 누락, 요구사항 결함 검사 |
| `prompt/auto-transform.mjs` | UserPromptSubmit | `""` | 프롬프트 자동변환 (opt-in, `config.workflow.prompt_pipeline.auto_transform`) |
| `validators/check-side-effects.mjs` | PostToolUse | Edit\|Write | 코드 변경 후 영향받는 기존 테스트 식별 → 깨진 테스트 감지 시 경고 |

### 5.4 State (3개) — 상태 관리

| 스크립트 | Hook | Matcher | 역할 |
|---|---|---|---|
| `state/load-state.mjs` | SessionStart | `""` | `workflow.json` 로드 → 세션 초기화 (`session.mode`, `session.started_at`) |
| `state/compact-recovery.mjs` | SessionStart | `""` | `load-state` 직후 실행. `workflow.json`의 snapshot 해시와 `events/` stream의 최신 seq를 비교 → 불일치 시(= compact 발생) Event stream fold → `workflow.json` 재구축. 일치 시 즉시 exit 0 (no-op). (10-state-and-audit.md 참조) |
| `state/update-workflow.mjs` | Stop | `""` | 스킬 완료 시 `phase`, `gates_passed` 갱신 → `workflow.json` write |

### 5.5 Context (3개) — 세션 컨텍스트 주입

| 스크립트 | Hook | Matcher | 역할 |
|---|---|---|---|
| `hooks/session-start-context.mjs` | SessionStart | `""` | 스킬 카탈로그·워크플로우 요약·활성 feature·`bypass_budgets` 잔량 주입. `additionalContext` stdout 반환. `config.harness.session_start_context.max_tokens` (기본 1,800) 이하 유지. **Explore 모드에서는 카탈로그 미주입** (토큰 절감 + QnA 마찰 최소화) |
| `workflow/determine-mode.mjs` | SessionStart | `""` | `config.workflow.mode == auto` 시 3개 RULE 평가 → session mode 확정. `mode_auto_detected` audit |
| `state/route-hint.mjs` | UserPromptSubmit | `""` | 유저 입력 분석 후 워크플로우 상태 기반 다음 스킬 힌트 제안. 명시 호출(A 경로) 시 no-op |

---

## 6. 하드 보호 vs 소프트 유도

하네스의 보호 경계는 두 종류다. 혼동하면 "왜 안 막아주지?" 유형의 기대 불일치가 생긴다.

### 6.1 하드 보호 영역 (Hook 구조적 강제)

**Claude가 프롬프트 인젝션으로 오염되어도** Hook 레벨에서 차단:

| 보호 대상 | 방어 수단 | 우회 방법 |
|---|---|---|
| `.harness/state/` 직접 편집 | `protect-harness.mjs` (PreToolUse) | 유저가 세션 밖에서 직접 편집 |
| `.harness/audit.jsonl` 변조 | `protect-harness.mjs` — append-only 강제 | 없음 |
| 파괴적 bash 명령 | `block-destructive.mjs` (PreToolUse) | `--bypass-*` + `--reason` |
| force push | `block-force-push.mjs` (PreToolUse) | `--bypass-*` + `--reason` |
| 워크플로우 게이트 우회 | `gate-engine.mjs` (UserPromptSubmit) | `--bypass-*` + `--reason` |

### 6.2 소프트 유도 영역 (주입 · 규약)

하네스가 **의도적으로 막지 않는** 영역. Claude의 도메인 판단력을 짓누르지 않기 위함:

| 유도 대상 | 유도 수단 | 이유 |
|---|---|---|
| `src/**` 편집 스타일 | `.claude/rules/*.md` (유저 소유) | 도메인 코드 편집은 유저 권한 영역 |
| 스킬·워크플로우 선택 | `session-start-context.mjs` 카탈로그 주입 | 강제 아닌 제안 — Claude 판단 여지 필요 |
| 테스트 작성 스타일 | `examples/rules/testing.md.example` | 팀별 취향 차이 존중 |
| 커밋 메시지 형식 | `CLAUDE.md.example` | 관습이지 규약 아님 |

### 6.3 설계 의도

> `.harness/` 밖은 **"오염(contamination)이 아닌 drift(표류)"** 영역.
> 오염은 복구 불가능이지만 drift는 `/harness:sync`·`/harness:migrate`로 회복 가능하다.

Anthropic Rajasekaran의 "harness 구성요소는 **모델의 한계를 드러내는 거울**" 명제: 모델이 할 수 있는 일은 harness가 하지 말아야 한다. 하네스가 유저 코드 스타일까지 강제하면 모델의 맥락 판단을 짓누른다 ([01-philosophy.md](01-philosophy.md) P3 참조).

---

## 7. hooks.json 전체 구조

→ 전체 JSON 구조 및 설계 대응 교차참조: [05-project-structure.md §7](05-project-structure.md#7-hooksjson-전체-구조)

**요약:**

| Hook 이벤트 | 스크립트 수 | 분류 비중 |
|---|---|---|
| SessionStart | 6개 (+ compact 조건부 1) | State 3 + Context 3 |
| UserPromptSubmit | 3개 | Gate 1 + Quality 2 |
| PreToolUse | 3개 | Safety 3 |
| PostToolUse | 2개 | Safety 1 + Quality 1 |
| Stop | 1개 | State 1 |
| **합계** | **15개** | Safety 4, Gate 1, Quality 3, State 4, Context 3 |

---

## 8. 확장 가이드

### 8.1 새 Hook 스크립트 추가 시

1. `scripts/<category>/` 에 `.mjs` 스크립트 작성
2. `hooks.json`의 해당 `HookEvent` 배열에 command 추가
3. 배열 내 **순서가 실행 순서** — Safety → Gate → Quality → State → Context 순서 유지
4. exit code 프로토콜 준수: 0 = 통과, 2 = 차단
5. audit이 필요하면 `audit-append.mjs` 호출 (공용 emitter)
6. 이 문서 §2.1 테이블과 §5 분류 업데이트

### 8.2 확장 예비 이벤트 활용 시나리오

| 이벤트 | 잠재 용도 |
|---|---|
| WorktreeCreate | worktree 생성 시 `.harness/state/` 스냅샷 복사 |
| PreCompact | compact 전 critical state 백업 |
| FileChanged | `.harness/config.yaml` 변경 감지 → 자동 재로드 |
| SessionEnd | 세션 종료 시 메트릭 집계 → 대시보드 갱신 |
| TeammateIdle | 팀메이트 기반 병렬 작업 오케스트레이션 |

---

## 참조

- [02-architecture.md §2, §2.5](02-architecture.md) — 레이어 규칙, 스크립트 실행 환경
- [03-workflow.md §1.10](03-workflow.md) — 하드 보호 vs 소프트 유도 상세
- [05-project-structure.md §7](05-project-structure.md) — hooks.json 전체 JSON + 교차참조 테이블
- [06-cli-reference.md §4](06-cli-reference.md) — 스크립트별 역할·호출시점·Audit 참조
- [09-script-system.md](09-script-system.md) — .mjs 실행 모델, exit code, audit emit 상세
- [10-state-and-audit.md](10-state-and-audit.md) — Event Sourcing, Compact Recovery, audit.jsonl
