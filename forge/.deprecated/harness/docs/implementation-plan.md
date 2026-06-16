# Harness Framework Implementation Plan

> 작성: 2026-04-14
> 상태: draft
> 전략: A+B 병행, C는 fixture 선행 설계 후 Phase 6에서 합류

---

## 0. 전제

### 0.1 세 도메인

| 도메인 | 설명 | 핵심 산출물 |
|--------|------|------------|
| **A. 하네스 자체 개발** | 하네스 스킬/에이전트를 만들고 검증 | dev/specs/, dev/tests/, bench/evals/ |
| **B. 하네스 기반 개발** | 하네스를 사용해 새 프로젝트 구축 | skills/, agents/, scripts/, hooks.json |
| **C. 마이그레이션** | 기존 프로젝트에 하네스 도입 | skills/migrate/, bench/evals/migrate/fixtures/ |

```
도메인 A (하네스 만들기) ──→ 도메인 B를 사용해서 하네스를 만든다 (self-hosting)
                              ↕
                         도메인 B (신규 프로젝트)  ← 코어 파이프라인
                              ↑
도메인 C (기존 프로젝트) ──→ 역추출 후 도메인 B에 합류
```

### 0.2 구축 원칙

- **A+B 병행:** 각 Phase에서 스킬을 만들면서(B) 동시에 그 스킬의 spec/test를 작성(A)
- **Self-hosting:** Phase 4부터 하네스 자신의 spec/plan으로 하네스를 만든다
- **레이어 순서:** 설계의 6-레이어(Safety → Knowledge → Agent → Quality → Workflow → Config)가 곧 구축 순서
- **도메인 C fixture 선행:** migrate 스킬 구현 전에 테스트 대상(fixture project)을 먼저 설계

### 0.3 규모 추산

| 영역 | 항목 수 |
|------|---------|
| Skills (SKILL.md + skill.yaml) | 15개 |
| Core Agents (.md) | 12개 |
| 공용 Scripts (.mjs) | ~28개 (+event-emit, +route-hint, +track-bash-files, +knowledge×3) |
| 스킬 로컬 Scripts (.mjs) | ~40개 |
| hooks.json | 1개 (5 이벤트, 17 스크립트 등록) |
| Templates / References | ~20개 |
| Config Schema (config.yaml.tmpl) | 1개 |
| plugin.json | 1개 |
| Fixture 프로젝트 (도메인 C) | 4~6개 |
| Eval runner (도메인 A) | 스킬당 1개 |

---

## 1. Phase 1 — 뼈대 + Safety Layer

> 즉시 가치: 파괴적 작업 차단이 작동하면 하네스의 존재 이유가 증명된다.

### 1.1 도메인 B — 구현

```
marketplace/plugins/harness/
├── .claude-plugin/
│   └── plugin.json                      ← 플러그인 매니페스트
│
├── hooks/
│   └── hooks.json                       ← Hook 이벤트 등록 (Phase 1: Safety만)
│
├── scripts/
│   ├── guardrails/
│   │   ├── block-destructive.mjs        ← rm -rf, DROP TABLE 등 차단
│   │   ├── block-force-push.mjs         ← git push --force 차단
│   │   └── protect-harness.mjs          ← .harness/state/ 직접 수정 차단
│   │
│   └── state/
│       └── audit-append.mjs             ← 공용 audit emitter (flock + rotate)
│
└── settings.json                        ← 플러그인 기본 설정
```

**hooks.json (Phase 1 범위):**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/block-destructive.mjs" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/block-force-push.mjs" }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/protect-harness.mjs" }
        ]
      }
    ]
  }
}
```

**구현 세부:**

| 스크립트 | 입력 | 판단 기준 | 출력 |
|---------|------|----------|------|
| `block-destructive.mjs` | `TOOL_INPUT` (Bash 명령) | 패턴 매칭: `rm -rf`, `DROP TABLE`, `truncate`, `--hard` 등 | exit(0) 통과 / exit(2) 차단 + stderr 사유 |
| `block-force-push.mjs` | `TOOL_INPUT` | 패턴: `git push --force`, `git push -f` | exit(0) / exit(2) |
| `protect-harness.mjs` | `TOOL_INPUT` (Edit/Write 경로) | 대상 경로가 `.harness/state/` 하위인지 | exit(0) / exit(2) |
| `audit-append.mjs` | stdin JSON | — | audit.jsonl에 append (flock 직렬화) |

### 1.2 도메인 A — 자체 검증

```
dev/
├── specs/
│   └── safety-layer.spec.yaml           ← Safety Layer Spec (AC 정의)
└── tests/
    └── guardrails/
        ├── block-destructive.test.mjs   ← 패턴 매칭 단위 테스트
        ├── block-force-push.test.mjs
        └── protect-harness.test.mjs
```

**AC 예시 (safety-layer.spec.yaml):**

```yaml
acceptance_criteria:
  - id: AC-S01
    desc: "rm -rf / 패턴 차단"
    testable: "block-destructive.mjs에 rm -rf 포함 명령 전달 → exit(2)"
  - id: AC-S02
    desc: "git push --force 차단"
    testable: "block-force-push.mjs에 force push 명령 전달 → exit(2)"
  - id: AC-S03
    desc: ".harness/state/ 직접 편집 차단"
    testable: "protect-harness.mjs에 state/ 하위 경로 전달 → exit(2)"
  - id: AC-S04
    desc: "정상 명령은 통과"
    testable: "block-destructive.mjs에 ls, git status 전달 → exit(0)"
  - id: AC-S05
    desc: "audit-append.mjs가 flock 직렬화로 append"
    testable: "동시 10회 호출 후 audit.jsonl 줄 수 = 10, JSON 파싱 전부 성공"
```

### 1.3 검증 기준

- [ ] `rm -rf /` 입력 → exit(2) + stderr 메시지
- [ ] `git push --force origin main` → exit(2)
- [ ] `.harness/state/workflow.json` Edit 시도 → exit(2)
- [ ] `git status`, `ls -la` 등 정상 명령 → exit(0)
- [ ] audit-append.mjs 동시 호출 시 JSONL 무결성 유지

---

## 2. Phase 2 — State + Context Layer

> 세션 시작/종료 시 워크플로우 상태를 저장하고 복원하는 연속성 확보.

### 2.1 도메인 B — 구현

```
scripts/
├── state/
│   ├── load-state.mjs                   ← SessionStart: workflow.json 로드
│   ├── update-workflow.mjs              ← Stop: phase/gates 갱신
│   ├── compact-recovery.mjs             ← SessionStart: snapshot 불일치 시 event fold
│   ├── event-emit.mjs                   ← Feature lifecycle event writer (flock + upcaster)
│   └── upcaster.mjs                     ← 이벤트 스키마 버전 변환
│
└── hooks/
    └── session-start-context.mjs        ← SessionStart: 스킬 카탈로그·상태 요약 주입
```

**event-emit.mjs — Feature Event Stream:**

audit-append.mjs가 policy audit 전용인 반면, event-emit.mjs는 feature lifecycle event를 기록한다.
- 출력: `.harness/state/events/{domain}/{feature}/{YYYY-MM}.jsonl`
- 직렬화: flock (audit-append.mjs와 동일 패턴)
- 스키마 버전: upcaster.mjs 체인과 공유
- 호출: 각 스킬 스크립트에서 `event-emit.mjs` 호출 (spec_created, plan_approved, test_passed, review_completed 등)
- compact-recovery.mjs가 이 event stream을 fold하여 workflow.json을 rebuild

**hooks.json 추가 (Phase 2):**

```json
{
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/load-state.mjs" },
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/compact-recovery.mjs" },
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/session-start-context.mjs" },
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/workflow/determine-mode.mjs" }
      ]
    }
  ],
  "Stop": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/update-workflow.mjs" }
      ]
    }
  ]
}
```

**State 파일 스키마 (초기):**

```jsonc
// .harness/state/workflow.json
{
  "v": 1,
  "session": {
    "mode": "standard",
    "started_at": null,
    "right_size": null
  },
  "features": {
    // per-feature state — event-emit.mjs가 기록, compact-recovery가 rebuild
    // 예: "auth/login": { ... }
  },
  "bypass_budgets": {
    "gate": { "used": 0, "max": 3 },
    "review": { "used": 0, "max": 3 },
    "qa": { "used": 0, "max": 3 }
  },
  "active_worktrees": [],
  "last_updated": null
}

// Feature 상태 스키마 (features[key] 구조)
// features["auth/login"] =
{
  "phase": "spec",          // spec | architect | plan | implement | review | qa | deploy | done
  "gates_passed": [],       // ["g1", "g2", ...] 통과한 게이트
  "iteration": 0,           // QA 반복 횟수
  "right_size": null,       // small | medium | large (determine-size.mjs가 설정)
  "spec_path": null,        // .harness/specs/auth/login.spec.yaml
  "plan_path": null,        // .harness/plans/auth/login.plan.md
  "review_verdicts": {},    // { security: "pass", performance: "pass", ... }
  "qa_passed": false,
  "created_at": null,
  "updated_at": null
}
```

### 2.2 도메인 A — 자체 검증

```
dev/
├── specs/
│   └── state-layer.spec.yaml
└── tests/
    └── state/
        ├── load-state.test.mjs          ← workflow.json 로드/생성 테스트
        ├── update-workflow.test.mjs      ← phase 전이 테스트
        ├── compact-recovery.test.mjs     ← snapshot 불일치 → rebuild 테스트
        ├── event-emit.test.mjs          ← feature event 기록/직렬화 테스트
        ├── upcaster.test.mjs            ← 버전 변환 체인 테스트
        └── determine-mode.test.mjs      ← mode auto-detect 테스트
```

### 2.3 검증 기준

- [ ] 세션 시작 시 workflow.json 없으면 초기 스키마로 생성
- [ ] 세션 시작 시 workflow.json 있으면 로드 → additionalContext에 상태 요약 주입
- [ ] Stop 시 phase/gates_passed 갱신 → workflow.json 저장
- [ ] compact-recovery: snapshot 해시 불일치 → events fold → 재구축
- [ ] upcaster: v1 이벤트 → 최신 버전 변환, 필드 누락 시 default 주입
- [ ] event-emit: feature event 기록 → events/{domain}/{feature}/{YYYY-MM}.jsonl 생성
- [ ] event-emit: 동시 호출 시 flock 직렬화 무결성 유지
- [ ] determine-mode: opt-in 설정 시 SessionStart에서 mode 자동 분류
- [ ] determine-mode: opt-in 꺼져 있으면 skip (기존 mode 유지)

---

## 3. Phase 3 — Gate + Workflow + Init 스킬

> 워크플로우 강제 메커니즘과 첫 번째 사용자 진입점.

### 3.1 도메인 B — 구현

```
scripts/
├── gates/
│   └── gate-engine.mjs                  ← G1~G6 게이트 통합 엔진
│
├── workflow/
│   ├── determine-mode.mjs               ← mode auto-detect (opt-in)
│   ├── determine-size.mjs               ← right-size 3축 판정
│   └── route-hint.mjs                   ← UserPromptSubmit: workflow 상태 기반 다음 스킬 추천


skills/
└── init/
    ├── SKILL.md                         ← 오케스트레이션 지시
    ├── skill.yaml                       ← 메타데이터
    ├── scripts/
    │   ├── scaffold-harness.mjs         ← .harness/ 디렉토리 생성
    │   ├── gen-config.mjs               ← config.yaml 생성
    │   └── copy-examples.mjs            ← example/ 복사 (유저 동의 시)
    ├── templates/
    │   ├── config.yaml.tmpl             ← config 템플릿
    │   └── gitignore.tmpl
    └── examples/
        ├── CLAUDE.md.example
        └── rules/
            ├── harness-workflow.md.example
            ├── test-first.md.example
            └── architecture.md.example
```

**hooks.json 추가 (Phase 3):**

```json
{
  "UserPromptSubmit": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/gates/gate-engine.mjs" },
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/workflow/route-hint.mjs" }
      ]
    }
  ]
}
```

**gate-engine.mjs 판정 규칙:**

| Gate | 조건 | 차단 메시지 |
|------|------|-----------|
| G1 | `/harness:implement` 호출 + spec 없음 | "Spec이 없습니다. /harness:spec 먼저" |
| G2 | `/harness:implement` 호출 + plan 없음 | "Plan이 없습니다. /harness:plan 먼저" |
| G3 | `/harness:qa` 호출 + test 없음 | "Test가 없습니다" |
| G4 | `/harness:deploy` 호출 + qa.passed=false | "QA PASS가 필요합니다" |
| G5 | (구조적) 구현자 ≠ 검증자 | Skill 레벨에서 강제 |
| G6 | spec 존재 + plan/test 파일이 빈 문서 | "IL-7: Spec이 있으면 Plan/Test는 substantive해야 합니다" |

**G6 (IL-7 enforcement) 세부:**
- Spec 파일이 존재하는 feature에 대해 plan/test 파일의 실질 내용(빈 YAML, 템플릿만 남은 상태) 감지
- 판단 기준: 파일 크기 < threshold 또는 AC mapping이 0건
- `/harness:plan`, `/harness:implement`, `/harness:review` 진입 시 검사

**Early-exit 분기:**
- `mode: explore` → 모든 게이트 skip
- `mode: prototype` → G1~G3 skip, G4(deploy)만 강제
- `--bypass-*` 감지 → 통과 + `gate_bypassed` audit emit

### 3.2 도메인 A — 자체 검증

```
dev/
├── specs/
│   ├── gate-engine.spec.yaml
│   └── init-skill.spec.yaml
└── tests/
    ├── gates/
    │   └── gate-engine.test.mjs         ← 각 게이트별 통과/차단 테스트
    └── skills/
        └── init.test.mjs               ← scaffold 결과 검증
```

### 3.3 도메인 C — fixture 설계 시작

```
bench/evals/migrate/
└── fixtures/                            ← 이 시점에 fixture 구조만 설계
    ├── README.md                        ← fixture 설계 원칙
    └── (Phase 4에서 실제 프로젝트 구축)
```

### 3.4 검증 기준

- [ ] standard 모드에서 spec 없이 `/harness:implement` → exit(2) + 안내
- [ ] prototype 모드에서 spec 없이 `/harness:implement` → 통과 (G1 skip)
- [ ] explore 모드에서 모든 게이트 skip
- [ ] `--bypass-gates:g1 --reason "긴급"` → 통과 + audit 기록
- [ ] G6: spec 존재 + plan 빈 파일 → exit(2) + IL-7 안내
- [ ] G6: spec 존재 + plan에 AC mapping 1건 이상 → 통과
- [ ] `/harness:init` → .harness/ 구조 생성, config.yaml 생성
- [ ] `/harness:init --mode prototype` → config.yaml에 mode: prototype

---

## 4. Phase 4 — 핵심 스킬 체인 (Spec → Plan → Implement)

> 하네스의 핵심 가치: Spec-Driven + Test-First 개발 파이프라인.
> 이 Phase부터 self-hosting — 하네스 자신의 spec/plan으로 하네스를 만든다.

### 4.1 도메인 B — 구현

```
skills/
├── spec/
│   ├── SKILL.md
│   ├── skill.yaml
│   ├── scripts/
│   │   ├── validate-spec.mjs            ← Spec 형식/완성도 검증
│   │   ├── check-testability.mjs        ← AC testable 필드 검증
│   │   └── gen-coverage-map.mjs         ← AC → coverage.json 엔트리 생성
│   ├── references/
│   │   ├── spec-writing-guide.md
│   │   └── acceptance-patterns.md
│   └── templates/
│       └── spec.template.yaml
│
├── plan/
│   ├── SKILL.md
│   ├── skill.yaml
│   ├── scripts/
│   │   ├── gate-check.mjs              ← G1: spec 존재 확인
│   │   ├── decompose.mjs               ← 태스크 분해 보조
│   │   └── validate-plan.mjs           ← Plan↔Spec AC 매핑 검증
│   ├── references/
│   │   └── plan-writing-guide.md
│   └── templates/
│       └── plan.template.md
│
└── implement/
    ├── SKILL.md
    ├── skill.yaml
    ├── scripts/
    │   ├── gate-check.mjs              ← G1+G2: spec+plan 존재 확인
    │   ├── gen-test-skeleton.mjs        ← Spec → test skeleton 생성
    │   ├── run-tests.mjs               ← 테스트 실행 래퍼
    │   ├── check-side-effects.mjs       ← 기존 test 깨짐 감지
    │   └── coverage-report.mjs          ← 커버리지 산출
    └── references/
        └── tdd-workflow.md

agents/core/
├── explorer.md                          ← 읽기 전용 탐색
├── implementer.md                       ← worktree 격리 구현
├── test-strategist.md                   ← test 전략 수립
├── verifier.md                          ← test 실행 + 결과 판단
├── requirements-analyst.md              ← 요구사항 구조화
└── devils-advocate.md                   ← 반론/빈틈 공격
```

**Knowledge Layer 구현 (Layer ②):**

```
scripts/knowledge/
├── search.mjs                           ← 솔루션 아카이브 검색 (domain tag 기반)
├── inject.mjs                           ← 관련 솔루션 → Skill context 주입 (max_inject_tokens 제한)
└── prune.mjs                            ← 오래된/미참조 솔루션 정리 (reference count 기반)
```

- search.mjs: implement/review/qa 스킬 진입 시 호출, 동일 domain의 과거 솔루션을 검색
- inject.mjs: 검색 결과를 config.knowledge.max_inject_tokens (기본 800) 이내로 truncate 후 주입
- prune.mjs: `/harness:sync` 또는 수동 호출 시 reference_count=0인 솔루션 정리

**Quality Pipeline 추가 (UserPromptSubmit):**

```
scripts/prompt/
├── quality-check.mjs                    ← 프롬프트 모호성/스코프 검사
└── auto-transform.mjs                   ← 프롬프트 자동변환 (opt-in)
```

**hooks.json UserPromptSubmit 최종 순서 (P4 완료 시):**

```
gate-engine.mjs → quality-check.mjs → auto-transform.mjs → route-hint.mjs
```

순서 근거: gate가 먼저 차단 판단 → quality가 프롬프트 검증/변환 → hint가 다음 스킬 추천.
gate exit(2) 시 후속 훅 실행 안 됨 (Claude Code hook 체인 규칙).

### 4.2 도메인 A — self-hosting 시작

이 Phase의 스킬들을 **하네스 자신의 spec/plan으로 만든다:**

```
dev/
├── specs/
│   ├── spec-skill.spec.yaml             ← /harness:spec 스킬 자체의 Spec
│   ├── plan-skill.spec.yaml             ← /harness:plan 스킬 자체의 Spec
│   └── implement-skill.spec.yaml        ← /harness:implement 스킬 자체의 Spec
├── plans/
│   ├── spec-skill.plan.md
│   ├── plan-skill.plan.md
│   └── implement-skill.plan.md
└── tests/
    ├── skills/
    │   ├── spec/
    │   │   ├── validate-spec.test.mjs
    │   │   └── check-testability.test.mjs
    │   ├── plan/
    │   │   ├── decompose.test.mjs
    │   │   └── validate-plan.test.mjs
    │   └── implement/
    │       ├── gen-test-skeleton.test.mjs
    │       └── coverage-report.test.mjs
    └── knowledge/
        ├── search.test.mjs              ← domain tag 매칭, 빈 아카이브 처리
        ├── inject.test.mjs              ← max_inject_tokens 초과 시 truncate
        └── prune.test.mjs               ← reference_count=0 솔루션 정리
```

### 4.3 도메인 C — fixture 프로젝트 구축

```
bench/evals/migrate/
├── fixtures/
│   ├── node-express-no-test/            ← Express API, 테스트 0, spec 0
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── routes/auth.js
│   │   │   └── routes/users.js
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── ts-nextjs-partial/               ← Next.js, 테스트 일부, 문서 없음
│   │   ├── src/
│   │   ├── tests/                       ← 일부만 존재
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── python-flask-messy/              ← Flask, 구조 불규칙
│   │   ├── app.py
│   │   ├── helpers.py
│   │   └── requirements.txt
│   │
│   └── minimal-cli/                     ← 파일 3개짜리 CLI
│       ├── cli.js
│       ├── utils.js
│       └── package.json
│
└── expected/                            ← 기대 출력 (Phase 6 eval에서 사용)
    ├── node-express-no-test/
    │   └── assertions.json
    └── ...
```

### 4.4 검증 기준

- [ ] `/harness:spec auth/login` → .harness/specs/auth/login.spec.yaml 생성
- [ ] AC에 testable 필드 누락 시 경고/차단
- [ ] `/harness:plan auth/login` → spec 없으면 G1 차단, 있으면 plan.md 생성
- [ ] Plan의 모든 step이 최소 1 AC에 매핑
- [ ] `/harness:implement auth/login` → G1+G2 통과 후 test skeleton 생성 → TDD 실행
- [ ] 각 agent .md 파일이 역할·도구·격리·모델 명시
- [ ] knowledge/search: 동일 domain 솔루션 검색 성공 (아카이브 비어있으면 빈 배열)
- [ ] knowledge/inject: max_inject_tokens 초과 시 truncate, 이내이면 전문 주입
- [ ] knowledge/prune: reference_count=0 솔루션 제거, >0 유지

---

## 5. Phase 5 — Quality Layer (Review + QA)

> Distrust by Structure: 구현자 ≠ 검증자를 구조적으로 강제.

### 5.1 도메인 B — 구현

```
skills/
├── review/
│   ├── SKILL.md
│   ├── skill.yaml
│   ├── scripts/
│   │   ├── gate-check.mjs              ← implement 완료 확인
│   │   ├── diff-analyzer.mjs            ← 변경 범위 분석
│   │   └── collect-verdicts.mjs         ← 리뷰어 판단 종합
│   └── references/
│       ├── security-review.md           ← OWASP Top 10, CWE Top 25
│       ├── performance-review.md        ← N+1, 메모리 누수 패턴
│       └── code-quality-review.md       ← SOLID, Clean Code
│
└── qa/
    ├── SKILL.md
    ├── skill.yaml
    ├── scripts/
    │   ├── gate-check.mjs              ← review PASS 확인
    │   ├── stack-runner.mjs             ← QA Stack bottom-up 실행
    │   ├── attribution.mjs              ← 실패 귀인 리포트
    │   ├── mock-ratio.mjs               ← integration_ratio + mock_guard
    │   └── coverage-trend.mjs           ← iteration 간 delta 계산
    └── references/
        ├── qa-strategy.md
        └── test-types.md

agents/core/
├── reviewer-security.md                 ← OWASP 기준 보안
├── reviewer-performance.md              ← N+1, 메모리, 복잡도
├── reviewer-quality.md                  ← SOLID, 클린 코드
├── reviewer-spec.md                     ← AC 충족 여부
└── qa-engineer.md                       ← QA Stack 실행

scripts/qa/                              ← 공용 QA 엔진 (스킬/agent 양쪽에서 호출)
├── stack-runner.mjs                     ← QA Stack 실행 엔진 (layer 순서, mode 판정)
├── attribution.mjs                      ← 실패 귀인 엔진 (verdict 산출)
├── mock-ratio.mjs                       ← mock_guard 검사 엔진
└── coverage-trend.mjs                   ← delta 계산 엔진

# Note: skills/qa/scripts/*.mjs는 스킬 진입점 래퍼로,
# 공용 scripts/qa/ 엔진을 호출하면서 gate-check, 결과 수집 등 스킬 고유 로직을 추가.
# 예: skills/qa/scripts/stack-runner.mjs → gate-check 후 → scripts/qa/stack-runner.mjs 호출

scripts/validators/
├── check-side-effects.mjs               ← PostToolUse(Edit|Write): 기존 test 깨짐 감지
├── track-bash-files.mjs                 ← PostToolUse(Bash): Bash로 생성/수정된 파일 추적
├── doc-coverage.mjs                     ← Spec 있는데 Plan/Test 없으면 경고
└── check-coverage.mjs                   ← Spec↔Test AC 매핑 확인
```

**hooks.json 추가 (Phase 5 — PostToolUse):**

```json
{
  "PostToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/validators/track-bash-files.mjs" }
      ]
    },
    {
      "matcher": "Edit|Write",
      "hooks": [
        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/validators/check-side-effects.mjs" }
      ]
    }
  ]
}
```

### 5.2 도메인 A — eval 기반 검증

```
bench/evals/
├── review/
│   ├── fixtures/                        ← 리뷰 대상 코드 (의도적 결함 포함)
│   │   ├── sql-injection/               ← A03 위반 코드
│   │   ├── n-plus-one/                  ← 성능 안티패턴
│   │   └── spec-drift/                  ← AC 미충족 코드
│   ├── expected/
│   │   └── assertions.json              ← 리뷰어가 발견해야 하는 결함 목록
│   └── run-review-eval.mjs
│
└── qa/
    ├── fixtures/                        ← QA 대상 (계층별 실패 시나리오)
    │   ├── api-fail-db-pass/            ← DB 통과, API 실패 → verdict: pure_api_issue
    │   └── mock-heavy/                  ← mock_guard 위반 시나리오
    └── run-qa-eval.mjs
```

### 5.3 검증 기준

- [ ] `/harness:review` → 4종 리뷰어 병렬 실행 (Right-Size에 따라 수 조절)
- [ ] 구현자 에이전트와 리뷰어 에이전트가 동일하지 않음 (IL-5)
- [ ] `/harness:qa` → QA Stack bottom-up 실행 (sequential_bottom_up 모드)
- [ ] 하위 계층 FAIL 시 상위 skip + `qa_layer_halted` audit
- [ ] attribution.json에 `verdict: pure_{layer}_issue` 정확 귀인
- [ ] mock_guard 위반 감지 → `qa_attribution_warning` audit
- [ ] coverage-trend.json에 iteration 간 delta 기록
- [ ] track-bash-files: Bash로 파일 생성/수정 시 추적 기록
- [ ] check-side-effects: Edit/Write 후 기존 테스트 깨짐 감지

---

## 6. Phase 6 — 나머지 스킬 + 도메인 C 완성

> 우선순위에 따라 점진 추가. migrate가 이 Phase의 핵심.

### 6.1 스킬 우선순위

| 우선순위 | 스킬 | 이유 |
|:--------:|------|------|
| 1 | `/harness:migrate` | 도메인 C 완성 = 실질적 채택 경로 |
| 2 | `/harness:sync` | 코드↔Spec 동기화 + 엔트로피 스윕 |
| 3 | `/harness:architect` | medium+ 프로젝트 필수 (ADR) |
| 4 | `/harness:brainstorm` | 탐색 단계 지원 |
| 5 | `/harness:persona` | 페르소나 관리 (create/list/edit/delete) |
| 6 | `/harness:deploy` | 배포 게이트 (G4) |
| 7 | `/harness:ux` | UI/UX 설계 (Architect와 직교) |
| 8 | `/harness:refactor` | 유지보수 루프 |
| 9 | `/harness:mode` | 세션 mode 수동 전환 |

### 6.2 도메인 C — migrate 구현 + eval

```
skills/migrate/
├── SKILL.md                             ← 서브커맨드 dispatch 오케스트레이션
├── skill.yaml
├── scripts/
│   ├── dispatch.mjs                     ← 인자 파싱 → sub.mjs 라우팅
│   ├── init.mjs                         ← .harness/ 구조 생성 (기존 프로젝트용)
│   ├── analyze.mjs                      ← 스택 감지, 구조 파악, 파일 분류
│   ├── extract-spec.mjs                 ← Code → Spec 역추출 (LLM 의존)
│   ├── gen-test.mjs                     ← 테스트 없는 코드 → 테스트 생성 (LLM 의존)
│   ├── detect-stack.mjs                 ← 기존 프로젝트 스택 감지
│   └── scaffold-harness.mjs             ← 공용 .harness/ 생성 (init과 공유)
└── references/
    └── migration-strategy.md
```

**도메인 C 테스트:**

```
bench/evals/migrate/
├── fixtures/                            ← Phase 4에서 구축 완료
│   ├── node-express-no-test/
│   ├── ts-nextjs-partial/
│   ├── python-flask-messy/
│   └── minimal-cli/
│
├── expected/
│   ├── node-express-no-test/
│   │   └── assertions.json
│   │       {
│   │         "analyze": {
│   │           "stack.language": "javascript",
│   │           "stack.framework": "express",
│   │           "files_count_min": 3
│   │         },
│   │         "extract_spec": {
│   │           "ac_count_min": 2,
│   │           "all_ac_have_testable": true
│   │         },
│   │         "gen_test": {
│   │           "tests_created": true,
│   │           "tests_pass": true
│   │         },
│   │         "forward_compat": {
│   │           "harness_dir_exists": true,
│   │           "config_valid": true,
│   │           "can_run_harness_implement": true
│   │         }
│   │       }
│   └── ...
│
└── run-migrate-eval.mjs                 ← headless eval runner
```

**eval runner 흐름:**

```
각 fixture에 대해:
  1. fixture → temp dir 복사 (원본 보존)
  2. /harness:migrate init 실행
  3. /harness:migrate analyze 실행 → analyze 결과 vs expected 비교
  4. /harness:migrate extract-spec 실행 → AC 수, testable 필드 검증
  5. /harness:migrate gen-test 실행 → 테스트 생성 + 실행 (PASS 확인)
  6. 정방향 합류 검증: .harness/ 구조가 도메인 B 호환인지
  7. 결과 리포트 생성

결정론적 스크립트 (analyze, detect-stack):
  → unit test (정확히 맞아야 함)

LLM 의존 스킬 (extract-spec, gen-test):
  → eval (품질 임계값 기준 판정)
```

### 6.3 검증 기준

- [ ] `/harness:migrate init` → 기존 프로젝트에 .harness/ 생성 (기존 코드 미변경)
- [ ] `/harness:migrate analyze` → 스택/구조 정확 감지 (fixture별 assertion)
- [ ] `/harness:migrate extract-spec` → 핵심 기능의 AC 역추출 (testable 필드 포함)
- [ ] `/harness:migrate gen-test` → 생성된 테스트가 기존 코드 대상 PASS
- [ ] 마이그레이션 후 `/harness:implement` 정상 실행 (정방향 합류)

---

## 7. 도메인 C fixture 설계 원칙

### 7.1 변이 축

| 축 | 값 | 검증 대상 |
|---|---|---|
| **스택** | node/python/go/ts | `detect-stack.mjs` 정확도 |
| **테스트 유무** | 0% / 부분 / 있지만 깨짐 | `gen-test`의 기존 테스트 존중 여부 |
| **구조 품질** | 정돈 / 불규칙 / 모노레포 | `analyze`의 구조 파악 한계 |
| **규모** | 파일 3개 / 30개 / 100개+ | 토큰 한계, 처리 시간 |

### 7.2 fixture 작성 규칙

1. **실제 동작하는 코드여야 함** — extract-spec이 의미 있는 AC를 뽑으려면 코드가 실제로 무언가를 해야 함
2. **의도적 결함 포함** — 테스트 누락, 보안 취약점 등 마이그레이션이 발견해야 하는 문제
3. **규모 제한** — 각 fixture는 파일 20개 이하. eval 실행 시간과 토큰 비용 통제
4. **독립적** — fixture 간 의존성 없음. 개별 실행 가능

### 7.3 결정론 vs LLM 의존 경계

```
결정론적 (unit test로 검증):
  ├── detect-stack.mjs     → 스택 감지 (package.json, requirements.txt 등 파일 기반)
  ├── analyze.mjs          → 파일 분류, 구조 파악 (AST/패턴 기반)
  └── scaffold-harness.mjs → .harness/ 생성

LLM 의존 (eval로 검증):
  ├── extract-spec.mjs     → Code → Spec 역추출 (LLM이 코드 읽고 AC 도출)
  └── gen-test.mjs         → 테스트 생성 (LLM이 코드 읽고 테스트 작성)
```

---

## 8. 산출물 누적 매트릭스

각 Phase 완료 시 누적되는 산출물:

| 산출물 | P1 | P2 | P3 | P4 | P5 | P6 |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|
| plugin.json | ✅ | · | · | · | · | · |
| hooks.json | safety | +state/stop/mode | +gate/submit/hint | +quality | +postToolUse | · |
| guardrails/*.mjs (3) | ✅ | · | · | · | · | · |
| state/*.mjs (5) | audit | +4 (incl. event-emit) | · | · | · | · |
| gates/*.mjs (1) | · | · | ✅ (G1~G6) | · | · | · |
| workflow/*.mjs (3) | · | · | ✅ (incl. route-hint) | · | · | · |
| knowledge/*.mjs (3) | · | · | · | ✅ | · | · |
| prompt/*.mjs (2) | · | · | · | ✅ | · | · |
| qa/*.mjs (4) | · | · | · | · | ✅ | · |
| validators/*.mjs (4) | · | · | · | · | ✅ (incl. track-bash-files) | · |
| hooks/context.mjs (1) | · | ✅ | · | · | · | · |
| skills/ | · | · | init | +spec,plan,impl | +review,qa | +9 |
| agents/core/ | · | · | · | 6 | +5 | +1 |
| dev/specs/ | 1 | +1 | +2 | +3 | +2 | +rest |
| dev/tests/ | 3 | +6 (incl. event-emit, mode) | +2 | +9 (incl. knowledge) | +eval | +eval |
| bench/evals/ | · | · | · | fixtures | review,qa | migrate |
| templates/ | · | · | config | +spec,plan | · | +rest |
| references/ | · | · | · | 3 | +3 | +rest |
