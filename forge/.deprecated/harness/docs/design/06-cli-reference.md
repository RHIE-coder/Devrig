# CLI Reference

> 모든 `/harness:*` 스킬의 호출 규약을 한눈에 정리한 문서. 각 스킬의 **인자(Arguments)**, **플래그(Flags)**, **Gate 전제조건(Preconditions)**, **출력물(Outputs — 파일 + audit 이벤트)**, **Exit Codes**, **예시**를 제공한다.
>
> 설계 근거는 다른 문서로 역참조한다. 여기서는 **사용법**만 정리한다.

---

## 0. 규약

- **네이밍:** `/{plugin}:{skill}` — 단일 콜론. Claude Code 플러그인 규약상 다단계 콜론 불가 (05-project-structure.md §2.0 참조). 그룹 스킬은 **git-style 서브커맨드** 사용: `/harness:migrate init`, `/harness:persona create`.
- **인자 형식:** 위치 인자는 `<domain>/<feature>` 경로 표기 (예: `auth/login`). 플래그는 `--flag <value>` 또는 `--flag` (불리언).
- **리스트 값:** 쉼표 구분 (`--only unit,load`).
- **Exit Codes:** `0`=성공, `2`=Gate/정책 블록(하네스 강제), 그 외 비제로=내부 오류.
- **Audit:** 자동 판단은 전부 `.harness/state/audit.jsonl`에 이벤트로 기록. 표의 **Audit** 열은 해당 스킬이 emit 가능한 이벤트.
- **Mode 종속:** `explore` 모드에선 Safety Layer + 파괴적 작업 차단만 유지, 워크플로우 게이트(G1~G4) 및 Quality Pipeline 전부 skip. `prototype` 모드에선 Safety Layer + Prompt Quality Pipeline 유지, 워크플로우 게이트 중 Deploy 게이트(G4)만 강제 (G1~G3 skip). `standard` 모드는 전체 게이트 + 전체 파이프라인 평가 (03-workflow.md §0.3, 01-philosophy.md §5).

---

## 1. 스킬 한눈 요약 (Cheat Sheet)

| 스킬 | 동작 | 주요 인자 | 주요 플래그 | Gate 전제 |
|------|------|----------|------------|----------|
| [`/harness:init`](#harnessinit) | 프로젝트 초기 구성 (신규 또는 마이그레이션 진입) | — | `--mode`, `--stack`, `--from-existing` | 없음 |
| [`/harness:brainstorm`](#harnessbrainstorm) | 페르소나 기반 아이디어 탐색 | `<topic>` | `--personas <list>` | init 완료 |
| [`/harness:spec`](#harnessspec) | 기능 명세 작성 (AC 포함) | `<domain>/<feature>` | `--from-brainstorm <id>`, `--edit` | init 완료 |
| [`/harness:architect`](#harnessarchitect) | 시스템 아키텍처 결정 (ADR) | `<domain>/<feature>` | `--force-size <size>` | spec 존재, right-size ≥ medium |
| [`/harness:plan`](#harnessplan) | 구현 계획 (태스크 분해 + 매핑) | `<domain>/<feature>` | `--from-spec <id>` | G1(spec) |
| [`/harness:implement`](#harnessimplement) | TDD 구현 (Test-First → Code) | `<domain>/<feature>` | `--step <n>`, `--no-worktree` | G1(spec), G2(plan) |
| [`/harness:review`](#harnessreview) | 병렬 리뷰 (security/perf/quality/spec) | `<domain>/<feature>` | `--depth <light\|standard\|deep>` | implement 완료 |
| [`/harness:qa`](#harnessqa) | 다축 QA + 다계층 검증 | `<domain>/<feature>` | `--all`, `--only`, `--exclude`, `--skip`, `--force-size`, `--reason`, `--stack-mode` | G3(test), review PASS |
| [`/harness:deploy`](#harnessdeploy) | 배포 (pivot transaction) | `<target>` | `--dry-run` | G4(qa.passed=true) |
| [`/harness:refactor`](#harnessrefactor) | 구조 개선 (behavior-preserving 유지보수 루프) | `<domain>/<feature>` | `--size <small\|medium\|large>`, `--bypass-coverage`, `--bypass-invariant`, `--reason` | 커버리지 ≥ `refactor.min_coverage` |
| [`/harness:sync`](#harnesssync) | 코드 ↔ Spec 동기화 + 엔트로피 스윕 | — | `--from <commit>`, `--promote`, `--schedule <daily\|weekly\|off>`, `--dry-run` | 없음 |
| [`/harness:migrate <sub>`](#harnessmigrate-group) | 기존 프로젝트 도입 | `{init\|analyze\|extract-spec\|gen-test}` | 서브커맨드별 | 없음 (init 자체) |
| [`/harness:persona <sub>`](#harnesspersona-group) | 페르소나 관리 | `{create\|list\|edit\|delete}` | 서브커맨드별 | 없음 |
| [`/harness:ux`](#harnessux) | UI/UX 설계 (Architect 축과 직교) | `<domain>/<feature>` | `--platform <web\|ios\|android>` | spec 존재 |
| [`/harness:mode`](#harnessmode) | 세션 mode 수동 전환 | `{show\|set}` | `set <standard\|prototype\|explore>` | — |

---

## 2. 스킬 상세

### `/harness:init`

프로젝트 초기 구성. 새 프로젝트는 scaffold, 기존 프로젝트는 `/harness:migrate init` 안내.

| 항목 | 값 |
|---|---|
| **인자** | 없음 |
| **플래그** | `--mode <standard\|prototype\|explore\|auto>` — 초기 mode. 기본 대화형 질문<br>`--stack <preset>` — 직접 지정 (예: `node-ts`, `python-fastapi`). 새 프로젝트는 대화형 질문으로 수집<br>`--from-existing` — 기존 프로젝트면 `/harness:migrate init` 으로 전환 |
| **Gate 전제조건** | 없음 (가장 먼저 실행) |
| **출력** | `.harness/` 디렉토리 구조 · `.harness/config.yaml` · `.claude/settings.json` (활성화 확인)<br>⚠️ `CLAUDE.md` · `.claude/rules/` 는 **자동 생성하지 않음** — 유저 소유 영역. `skills/init/examples/` 에서 복사 안내만 제공 (05-project-structure.md §6.1). 스킬 카탈로그는 SessionStart hook `session-start-context.mjs` 가 주입 |
| **Audit 이벤트** | `mode_auto_detected` (mode=auto 일 때) |
| **Exit codes** | 0=완료, 2=기존 `.harness/` 감지 시 overwrite 확인 필요 |
| **예시** | `/harness:init`<br>`/harness:init --mode prototype`<br>`/harness:init --from-existing` |

---

### `/harness:brainstorm`

페르소나 기반 아이디어 탐색. 결과는 `.harness/brainstorms/` 저장 → `spec --from-brainstorm`로 이어짐.

| 항목 | 값 |
|---|---|
| **인자** | `<topic>` — 탐색 주제 (예: `"사용자 로그인 전략"`) |
| **플래그** | `--personas <list>` — 사용할 페르소나 (기본: 기본 페르소나 + `.claude/agents/` 전부)<br>`--rounds <n>` — 페르소나 간 반박 라운드 수 (기본 2) |
| **Gate 전제조건** | init 완료 |
| **출력** | `.harness/brainstorms/{YYYY-MM-DD}-{slug}.md` |
| **Audit 이벤트** | `agent_escalation` (페르소나별) |
| **예시** | `/harness:brainstorm "로그인 전략"`<br>`/harness:brainstorm "JWT vs Session" --personas saas-cto,security-expert` |

---

### `/harness:spec`

기능 명세 작성. AC는 Testable·Atomic·Binary·User-visible 4조건 강제 (00-overview.md Glossary AC 참조).

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` — 예: `auth/login` |
| **플래그** | `--from-brainstorm <file>` — 브레인스토밍 결과 반영<br>`--edit` — 기존 spec 편집 모드<br>`--status <draft\|review\|approved>` — 초기 상태 (기본 `draft`) |
| **Gate 전제조건** | init 완료 |
| **출력** | `.harness/specs/{domain}/{feature}.spec.yaml` · `.harness/state/coverage.json` (AC 엔트리 추가) |
| **Audit 이벤트** | — |
| **Exit codes** | 0=완료, 2=AC testable 필드 누락 시 (하네스 강제) |
| **예시** | `/harness:spec auth/login`<br>`/harness:spec payment/checkout --from-brainstorm .harness/brainstorms/2026-04-13-payment.md` |

---

### `/harness:architect`

시스템 아키텍처 결정 (ADR). **medium 이상에서 필수**, small은 생략 허용 (00-overview.md Glossary Right-Size 참조).

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` |
| **플래그** | `--force-size <medium\|large>` — 상향 override만 허용 (upward_only · `force_size_applied` audit) |
| **Gate 전제조건** | spec 존재, right-size ≥ medium (small은 스킵 가능) |
| **출력** | `.harness/decisions/{nnn}-{title}.md` (ADR) |
| **Audit 이벤트** | `right_size_determined`, `force_size_applied` |
| **Exit codes** | 0=완료, 2=small 에서 호출 시 경고 + 확인 요청 |
| **예시** | `/harness:architect auth/login`<br>`/harness:architect payment/refund --force-size large` |

---

### `/harness:plan`

Spec + Architecture → 태스크 분해. 각 step은 AC에 매핑 (coverage.json 자동 추적).

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` |
| **플래그** | `--from-spec <id>` — 참조 spec 명시 (기본: 동일 경로 spec 자동 매칭) |
| **Gate 전제조건** | G1: spec 존재 (`.harness/specs/{domain}/{feature}.spec.yaml`) |
| **출력** | `.harness/plans/{domain}/{feature}.plan.md` · `.harness/state/coverage.json` (step ↔ AC 매핑) |
| **Audit 이벤트** | `right_size_determined` |
| **Exit codes** | 0=완료, 2=AC-step 매핑 누락 (Plan 모든 AC 커버 강제) |
| **예시** | `/harness:plan auth/login` |

---

### `/harness:implement`

Test-First TDD 구현. Test skeleton 먼저(모두 FAIL) → step 순서대로 GREEN.

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` |
| **플래그** | `--step <n>` — 특정 step 하나만 실행 (부분 진행)<br>`--no-worktree` — worktree 격리 비활성 (비권장, prototype/explore 전용)<br>`--resume` — 직전 iteration 이어서<br>`--bypass-gates <g1,g2,...>` — G1/G2 중 지정 gate 우회 (`--reason` 필수, §3.1) |
| **Gate 전제조건** | G1: spec 존재 · G2: plan 존재 |
| **출력** | 구현 코드 (worktree) · `tests/**` · `.harness/state/workflow.json` 갱신 · 커버리지 리포트 |
| **Audit 이벤트** | `right_size_determined`, `gate_skipped` (prototype 시), `gate_bypassed` (`--bypass-*`), `model_tier_escalated` |
| **Exit codes** | 0=완료, 2=Gate 실패 (spec/plan 없음 + bypass 없음), 1=test FAIL 지속 |
| **예시** | `/harness:implement auth/login`<br>`/harness:implement auth/login --step 3 --resume`<br>`/harness:implement auth/login --bypass-gates g1 --reason "spec은 Linear — 실험"` |

---

### `/harness:review`

병렬 리뷰 dispatch. 4명 reviewer (security/performance/quality/spec) 독립 판단 → PASS/NEEDS_CHANGE/BLOCK.

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` |
| **플래그** | `--depth <light\|standard\|deep>` — Right-Size 기본값 override (small=light, medium=standard, large=deep)<br>`--reviewers <list>` — 일부만 실행 (예: `security,spec`) |
| **Gate 전제조건** | implement 완료 (`state/workflow.json.implement.passed=true`) |
| **출력** | `.harness/reviews/{domain}/{feature}-review-{iter}.md` |
| **Audit 이벤트** | `agent_escalation` (reviewer별) |
| **Exit codes** | 0=PASS, 1=NEEDS_CHANGE, 2=BLOCK |
| **예시** | `/harness:review auth/login`<br>`/harness:review auth/login --depth deep` |

> Review 자체는 `--bypass-*` 를 받지 않음. 리뷰를 **건너뛰는** 경우는 `/harness:qa --bypass-review --reason "..."` 로 qa 단계에서 의도를 명시 (§3.1).

---

### `/harness:qa`

**다축 Coverage + 다계층 QA Stack 검증.** 하네스의 가장 복잡한 스킬 — Right-Size 매트릭스 / `--*` 플래그 / QA Stack mode 가 직교하게 작동.

**플래그 전체 스펙:**

| 플래그 | 용도 | 예 |
|---|---|---|
| (없음) | `config.testing.scope.mode`를 따름 (기본 `auto` → Right-Size 매트릭스) | `/harness:qa auth/login` |
| `--all` | 정의된 **모든 유형** 실행 (`testing.commands.*` 커맨드 전부) | `/harness:qa --all` |
| `--only <types>` | 지정 유형**만** 실행 (매트릭스 무시) | `/harness:qa --only unit,smoke` |
| `--exclude <types>` | 기본 집합에서 제외 | `/harness:qa --exclude load,stress` |
| `--skip <types>` | `--exclude`의 별칭 (하위호환) | `/harness:qa --skip load` |
| `--force-size <size>` | **이번 호출 1회만** right-size 지정 (workflow.json 불변) | `/harness:qa --force-size large` |
| `--reason "..."` | 필수 유형 skip 시 사유 기록 (audit + qa-log) | `/harness:qa --skip load --reason "infra maint, due 2026-04-20"` |
| `--stack-mode <mode>` | QA Stack 실행 모드 1회 override (`parallel\|sequential_bottom_up\|custom`) | `/harness:qa --stack-mode sequential_bottom_up` |
| `--bypass-review` | review PASS 요구 우회 (§3.1, `--reason` 필수) | `/harness:qa --bypass-review --reason "review는 별도 채널로 완료"` |
| `--bypass-gates <g1,...>` | G3 등 지정 gate 우회 (§3.1) | `/harness:qa --bypass-gates g3 --reason "test 부재 — 회귀만 확인"` |

**우선순위:** `--only` > `--all` > `--exclude`/`--skip`. `--force-size` 는 매트릭스 자체를 재계산. `--stack-mode` 는 실행 **순서**만 바꿈. `--bypass-*` 는 `--reason` 없으면 exit 2.

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` |
| **Gate 전제조건** | G3: test 존재 · review PASS (기본 강제, `--bypass-review --reason` 으로 우회 가능 — bypass 시 `gate_bypassed` audit + 세션 sticky 경고. Iron Law가 아닌 워크플로우 gate이므로 우회 경로 제공) |
| **출력** | `.harness/reviews/{domain}/{feature}-qa-{iter}.md` · `.harness/state/coverage-report.json` · `.harness/state/coverage-trend.json` · `.harness/state/qa-attribution.json` (stack 모드) · `.harness/state/qa-log.jsonl` (skip 사유) |
| **Audit 이벤트** | `qa_invoked`, `qa_scope_overridden`, `coverage_evaluated`, `qa_layer_halted`, `qa_attribution_report`, `qa_attribution_warning`, `gate_bypassed` (`--bypass-*`) |
| **Exit codes** | 0=G4 PASS (deploy 가능), 1=FAIL (Sprint 복귀), 2=`block_deploy` 정책상 차단 |
| **정책** | `config.testing.skip_required_policy: block_deploy\|warn\|allow` — 필수 유형 skip 시 G4 거동 제어 (03-workflow.md §1.3) |
| **예시** | `/harness:qa auth/login`<br>`/harness:qa --all --reason "post-refactor sweep"`<br>`/harness:qa --only smoke` (필수 누락 시 G4 차단)<br>`/harness:qa --force-size large`<br>`/harness:qa --stack-mode sequential_bottom_up` (계층 귀인) |

상세 시나리오·Coverage 8축 · QA Stack 계층: 03-workflow.md §1.3 / §1.3.1 / §4.4.

---

### `/harness:deploy`

**Pivot transaction** — 이후 실패는 retry만 가능 (보상 불가). 운영 영향 발생.

| 항목 | 값 |
|---|---|
| **인자** | `<target>` — 환경 이름 (예: `staging`, `production`) |
| **플래그** | `--dry-run` — 실제 배포 없이 Gate/변경 범위만 점검<br>`--bypass-qa` — qa.passed 요구 우회 (`--reason` 필수, §3.1)<br>`--bypass-deploy-gate` — G4 전체 우회 (`--reason` 필수, §3.1). **prototype mode는 여전히 차단** |
| **Gate 전제조건** | G4: `state/workflow.json.qa.passed=true` · mode ≠ `prototype` (prototype은 deploy 차단) |
| **출력** | 배포 로그 · `.harness/state/deploys/{YYYY-MM-DD}-{target}.md` · 실패 시 `.harness/state/incidents/` |
| **Audit 이벤트** | `gate_skipped` (explore 에선 호출 불가), `gate_bypassed` (`--bypass-*`) |
| **Exit codes** | 0=성공, 2=Gate 실패 (bypass 없음) 또는 `--bypass-*` 에 `--reason` 누락, 1=배포 실패 (incident 기록) |
| **예시** | `/harness:deploy staging`<br>`/harness:deploy production --dry-run`<br>`/harness:deploy staging --bypass-qa --reason "캠페인 시작 H-2, 회귀만 확인 완료"` |

---

### `/harness:refactor`

**유지보수 루프.** 이미 커밋된 코드의 구조 개선 (behavior-preserving). Spec 불변이 진입·종료 조건. TDD의 REFACTOR 스텝(= 방금 구현한 코드 청소)과 스코프가 다름 (03-workflow.md §1.11.3).

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` — 대상 범위. glob 허용 (`auth/**`) |
| **플래그** | `--size <small\|medium\|large>` — Right-Size 수동 지정. 기본 자동 (코드 규모·의존 그래프 기반)<br>`--bypass-coverage --reason "..."` — Pre-gate 커버리지 우회 (migrate 연계·긴급 구조 개선용)<br>`--bypass-invariant --reason "..."` — Post-gate spec/test 동일성 우회 (spec 동반 변경 시에만) |
| **Gate 전제조건** | 커버리지 ≥ `config.refactor.min_coverage` (기본 70%)<br>※ `/harness:migrate` Lv3 내부 호출 시 임계값 완화 |
| **출력** | 갱신된 `src/**` · `.harness/state/refactor-log.jsonl` (적용된 move 시퀀스) · refactor 보고서 (AC 동일성 증거 + 커버리지 델타) |
| **Audit 이벤트** | `refactor_started` · `refactor_move_applied` (move별) · `refactor_rolled_back` (RED 발생 시) · `refactor_completed` · `gate_bypassed` (`--bypass-*`) |
| **Exit codes** | 0=완료, 2=Gate 실패 (coverage 부족 또는 invariant 실패, `--bypass-*` 누락), 1=move 중 복구 불가 (worktree 보존 후 수동 개입) |
| **예시** | `/harness:refactor auth/login`<br>`/harness:refactor payments/** --size large` (경계 재설계 동반)<br>`/harness:refactor legacy/cart --bypass-coverage --reason "migrate Lv3 연계, gen-test 이후 재평가"`<br>`/harness:refactor auth/session --bypass-invariant --reason "spec 섹션 session_ttl 변경 동반, /harness:spec 완료"` |

> **왜 reviewer-spec이 없는가.** spec 파일 불변은 `scripts/refactor/verify-spec-unchanged.mjs` 가 hash diff로 결정론 검증 (Script-First). LLM 재검증 중복을 피한다. 상세: 04-agent-system.md §4 `/harness:refactor`.

> **전담 에이전트 없음.** strategist는 Right-Size로 기존 에이전트 재활용 — small=implementer 직접 / medium=test-strategist / large=architect. executor는 implementer의 `mode: refactor` 플래그 분기.

---

### `/harness:sync`

**세 가지 역할.** (1) 유저가 코드 직접 수정 → spec/plan/test 역추출 갱신 (2) prototype → standard 승격 진입점 (3) **주기 엔트로피 스윕** — drift·문서 일관성·의존성·bypass 잔량을 스케줄로 감사.

| 항목 | 값 |
|---|---|
| **인자** | 없음 (현재 브랜치 기준 자동) |
| **플래그** | `--from <commit>` — 지정 커밋부터 diff (기본: `last-sync-commit`)<br>`--promote` — prototype → standard 승격 플로우 실행<br>`--dry-run` — 실제 수정 없이 제안만<br>`--schedule <daily\|weekly\|@cron\|off>` — **엔트로피 스윕 등록/해제.** daily: drift·audit rotate / weekly: spec↔plan↔code 일관성·의존성 레이어·`bypass_budgets` 잔량 리포트 / off: 해제. 등록은 `.harness/config.yaml` 에 기록되어 다음 세션부터 유효 |
| **Gate 전제조건** | 없음 (언제나 호출 가능) |
| **출력** | 갱신된 `specs/**`·`plans/**`·`tests/**` · `.harness/state/sync-log.jsonl`<br>스케줄 모드 추가 출력: `.harness/state/entropy-report.jsonl` (스윕 누적) |
| **Audit 이벤트** | `mode_auto_detected` (승격 시) · `entropy_sweep_started` · `entropy_sweep_completed` (스케줄 스윕) · `assumption_review` (분기 스윕이 `retired_assumptions[]` 후보를 찾을 때) |
| **Exit codes** | 0=성공, 2=drift 해결 불가 (유저 개입 필요) |
| **예시** | `/harness:sync`<br>`/harness:sync --promote` (prototype → standard)<br>`/harness:sync --from abc1234 --dry-run`<br>`/harness:sync --schedule weekly` (주간 엔트로피 스윕 등록)<br>`/harness:sync --schedule off` (해제) |

> **엔트로피 스윕 (OpenAI Lopopolo 2026-02 인용).** 하네스는 on-demand만 제공하면 drift가 축적된다. `--schedule` 은 **문서 일관성·제약 위반·의존성 감사·bypass 잔량**을 주기 실행해 "AI 에이전트용 가비지 컬렉션" 역할. 상세 배경: [insights/industry-harness-engineering/01 §E](../insights/industry-harness-engineering/01-patterns-distilled.md).

---

### `/harness:migrate` (group)

기존 프로젝트 도입용 그룹. 서브커맨드는 `dispatch.mjs`가 첫 인자로 분기.

| 서브커맨드 | 역할 | 주요 인자/플래그 | 출력 |
|---|---|---|---|
| `init` | `.harness/` scaffold + config 자동 생성 (기존 구조 보존) | `--strategy <wrap\|refactor\|mixed>` | `.harness/` 구조, `config.yaml` |
| `analyze` | 코드 → 기능 역추출, 의존성 그래프, 우선순위 제안 | `--depth <shallow\|deep>` | `.harness/migration/analysis.md` |
| `extract-spec` | 기존 코드 → Spec 초안, 기존 test → AC 역변환 | `<path or glob>`, `--approve-all` | `.harness/specs/**` (역추출) |
| `gen-test` | Spec AC 중 test 없는 것 → test 자동 생성 | `<domain>/<feature>`, `--coverage-target 80` | `tests/**` (누락 보강) |

| 항목 | 값 |
|---|---|
| **Gate 전제조건** | 없음 (`init`이 선두) · 나머지는 직전 서브커맨드 완료 상태 체크 |
| **Audit 이벤트** | `right_size_determined` (extract-spec 시 feature별) |
| **예시** | `/harness:migrate init`<br>`/harness:migrate analyze --depth deep`<br>`/harness:migrate extract-spec src/auth/**`<br>`/harness:migrate gen-test auth/login` |

상세 흐름: 03-workflow.md §2.

---

### `/harness:persona` (group)

페르소나 관리 (Persona Maker). `.claude/agents/*.md` 파일 조작.

| 서브커맨드 | 역할 | 주요 인자/플래그 | 출력 |
|---|---|---|---|
| `create` | 대화형 페르소나 생성 | `--template <domain-expert\|business-role\|tech-specialist>` | `.claude/agents/{name}.md` |
| `list` | 현재 활성 페르소나 목록 | `--show-personas <basic\|user\|all>` | stdout |
| `edit` | 기존 페르소나 편집 | `<name>` | `.claude/agents/{name}.md` 수정 |
| `delete` | 페르소나 삭제 | `<name>`, `--confirm` | 파일 제거 |

| 항목 | 값 |
|---|---|
| **Gate 전제조건** | 없음 |
| **Audit 이벤트** | — |
| **예시** | `/harness:persona create --template domain-expert`<br>`/harness:persona list`<br>`/harness:persona edit saas-cto` |

상세: 04-agent-system.md §5.

---

### `/harness:ux`

UI/UX 설계 축. Architect (시스템 축)와 **직교** — 같은 feature에 대해 시스템 ADR과 UX ADR이 각각 독립 생성됨.

| 항목 | 값 |
|---|---|
| **인자** | `<domain>/<feature>` |
| **플래그** | `--platform <web\|ios\|android>` — 대상 플랫폼 (기본: `config.testing.platforms[0]`)<br>`--a11y-level <A\|AA\|AAA>` — 접근성 목표 (기본 AA) |
| **Gate 전제조건** | spec 존재 |
| **출력** | `.harness/decisions/{nnn}-ux-{title}.md` (UX ADR) · 와이어프레임 링크 (있으면) |
| **Audit 이벤트** | `ux_decision_recorded` |
| **예시** | `/harness:ux auth/login --platform web`<br>`/harness:ux checkout/payment --a11y-level AAA` |

**Architect 와의 관계:**

```
/harness:spec  ──→  /harness:architect (시스템 축: 레이어·패턴·의존성)
                │
                └→  /harness:ux        (사용자 축: 인터랙션·접근성·반응형)

두 축의 출력은 같은 decisions/ 디렉토리에 저장되지만 prefix로 구분:
  decisions/003-arch-auth-jwt.md    ← /harness:architect
  decisions/004-ux-auth-login.md    ← /harness:ux
```

- **실행 순서:** 선후 관계 없음 (직교). spec만 있으면 어느 쪽이든 먼저 실행 가능
- **충돌 해소:** 두 ADR 간 제약 충돌 시 (예: architect가 SPA 금지했는데 UX가 SPA 전제) `/harness:plan` 단계에서 탐지 → 유저에게 결정 요청
- **UX 리뷰:** 전용 `reviewer-ux` 에이전트 대신 **페르소나 시스템** 활용 — `config.personas`에 UX Designer 페르소나 등록 시 review 단계에서 해당 관점 주입 (04-agent-system.md §5 페르소나). 이는 P10(Start Simple, Grow Proven)에 따른 설계 — UX 리뷰 빈도가 충분히 높아지면 전용 에이전트로 승격 가능

---

### `/harness:mode`

세션 mode 수동 조회/전환. Mode Auto-Detect와 **직교** — 이건 유저 명시 전환용.

| 서브커맨드 | 역할 | 주요 인자/플래그 |
|---|---|---|
| `show` | 현재 세션 mode 출력 (+ 결정 출처) | — |
| `set <standard\|prototype\|explore>` | config 수정 없이 **이번 세션**만 전환 | `--persist` (config에 영구 저장) |

| 항목 | 값 |
|---|---|
| **Gate 전제조건** | 없음 |
| **출력** | `.harness/state/workflow.json.session.mode` 갱신 |
| **Audit 이벤트** | `mode_changed` (source: `skill:/harness:mode`, fields: `from`, `to`, `persist`) |
| **예시** | `/harness:mode show`<br>`/harness:mode set prototype`<br>`/harness:mode set explore --persist` |

**모드 전환 규칙 매트릭스:**

| From \ To | **standard** | **prototype** | **explore** |
|-----------|:---:|:---:|:---:|
| **standard** | — | ✅ 즉시 (`set prototype`) | ✅ 즉시 (`set explore`) |
| **prototype** | ❌ `/harness:sync --promote` 필수 | — | ✅ 즉시 (`set explore`) |
| **explore** | ❌ `/harness:sync --promote` 필수 | ✅ 즉시 (`set prototype`) | — |

**규칙 해설:**
- **standard로 승격은 항상 `/harness:sync --promote`** — prototype/explore 어디서든 standard로 가려면 Spec 역추출·Test 보강이 필요 (§1.7). `set standard` 명령은 명시적으로 차단 (`promotion_requires_user`)
- **standard → prototype/explore는 즉시 허용** — 실험/탐색으로의 강등은 위험이 낮으므로 제약 없음. 다만 standard에서 생성한 산출물(spec/plan/test)은 보존
- **explore ↔ prototype은 양방향 즉시 허용** — 둘 다 "비정규" 모드이며 ceremony 수준만 다름 (explore: 오케스트레이션 없음, prototype: Safety+Deploy gate만 강제). 전환 시 기존 세션 상태(state/workflow.json)는 새 모드에 맞게 리셋
- **`--persist` 플래그** — 없으면 세션 범위만 변경 (다음 세션에서 config.yaml의 `workflow.mode` 유지). 있으면 config.yaml에 영구 기록

---

## 3. 플래그 네이밍 일관성

| 플래그 | 의미 | 등장 스킬 |
|---|---|---|
| `--force-size <s>` | Right-Size 상향 override (upward_only) — **safety 우회 아님** | `architect`, `qa` |
| `--from-<source> <id>` | 상류 산출물 참조 | `spec` (`--from-brainstorm`), `plan` (`--from-spec`), `sync` (`--from <commit>`) |
| `--reason "..."` | 정책 우회·skip 시 사유 기록 (audit 필수) | `qa`, **모든 `--bypass-*` 동반 필수** |
| `--dry-run` | 실제 변경 없이 제안/점검만 | `deploy`, `sync` |
| `--depth <l\|s\|d>` | 실행 깊이 — `review`: light/standard/deep (3값), `migrate analyze`: shallow/deep (2값) | `review`, `migrate analyze` |
| `--persist` | 세션 범위를 config 영구 저장으로 승격 | `mode set` |
| **`--bypass-<control>`** | **Safety/Gate 우회 (Escape Hatch)** — `gate_bypassed` audit + `--reason` 필수 + 세션 sticky warning | `implement` (`--bypass-gates`), `review` (`--bypass-review`), `qa` (`--bypass-qa`), `deploy` (`--bypass-deploy-gate`) |

**원칙:**
1. **`--force-*`** 는 Iron Law 우회가 아닌 **파라미터 override** (상향 방향만).
2. **`--reason`** 은 하네스가 기록 의무를 부여하는 플래그 — 생략 시 정책 레벨에서 BLOCK 가능 (`block_deploy`).
3. **`--bypass-*`** 는 `--force-*` 와 의미가 완전히 다름: safety/gate **우회**. 구조적 안전장치로 위험을 강제 (이름이 아닌 규칙).
4. **리스트 값** 은 쉼표 구분 (공백 없음). 쉘 이스케이프 주의.

---

### 3.1 Escape Hatch — `--bypass-*` 상세

유저가 의도적으로 Gate/Safety 안전장치를 우회해야 하는 상황(핫픽스·실험·데모 등) 전용 계열 플래그. Claude Code의 `--dangerously-skip-permissions`에 대응하지만, 하네스는 **이름이 아닌 구조**로 위험을 강제한다.

**Bypass 가능 대상**

| 플래그 | 우회 대상 | 등장 스킬 | Prompt Lexicon (자연어 트리거) |
|---|---|---|---|
| `--bypass-gates <g1,g2,...>` | G1~G4 중 지정 gate (G5는 구조적 위반 불가 — 03-workflow.md §1.2) | `implement`, `qa`, `deploy` | "gate 건너뛰어", "게이트 무시" |
| `--bypass-review` | review PASS 요구 (→ qa 직행) | `qa` | "리뷰 스킵", "리뷰 없이" |
| `--bypass-qa` | qa.passed=true 요구 (→ deploy 직행) | `deploy` | "QA 없이 배포", "긴급 배포" |
| `--bypass-deploy-gate` | G4 전체 (prototype mode 제외) | `deploy` | "지금 바로 배포", "hotfix 배포" |
| `--bypass-safety` | **거부됨** — Safety Layer(파괴적 명령 차단 등)는 절대 우회 불가 | — | — |

**3중 안전장치 (이름이 아닌 구조)**

1. **`--reason "..." 필수`** — 생략 시 exit 2 (BLOCK). audit + `qa-log.jsonl` 양쪽 기록.
2. **`gate_bypassed` audit 이벤트** — `{ skill, bypassed: [g1,review], reason, session_id, ts }` 형식으로 `audit.jsonl` append.
3. **세션 sticky warning** — 해당 세션 내 후속 모든 skill 실행 시 stderr에 배너 출력. `.harness/state/workflow.json.session.bypass_stack[]` 에 누적.

**Safety Layer 불가변**

파괴적 bash 차단(`rm -rf`, `DROP TABLE`, force-push 등)은 `--bypass-*` 대상이 아니다. `scripts/guardrails/*.mjs` 는 exit 2로 고정 차단되며, 유저가 해당 명령을 직접 실행하려면 shell에서 할 일이다. 하네스 경유 우회는 불가.

**예시**

```bash
# ✓ 정상: 사유 동반
/harness:deploy staging --bypass-qa --reason "캠페인 시작 H-2, 회귀만 확인 완료"

# ✗ BLOCK (exit 2): 사유 누락
/harness:deploy staging --bypass-qa

# ✓ 부분 gate skip (G1만 건너뛰기)
/harness:implement auth/login --bypass-gates g1 --reason "spec은 Linear에만 있음 — 실험 단계"
```

**Prompt 경로 (자연어 의도)**

UserPromptSubmit hook이 lexicon에 매칭되는 자연어를 탐지하면 **자동 우회하지 않고** 유저에게 확인 프롬프트를 띄운다:

> `감지: "긴급 배포" — /harness:deploy 에 --bypass-qa --reason "..." 를 붙일까요? [y/N]`

유저가 수락하면 CLI 플래그 경로와 동일한 3중 안전장치가 적용된다. 상세: [03-workflow.md §1.9 Escape Hatch](03-workflow.md#19-escape-hatch--유저-의도-기반-우회).

---

## 4. 전형적 호출 시퀀스

**Domain B (Standard 신규):**
```
/harness:init
/harness:brainstorm "기능 아이디어"
/harness:spec auth/login --from-brainstorm <id>
/harness:architect auth/login        # medium+ 에서 필수
/harness:plan auth/login
/harness:implement auth/login
/harness:review auth/login
/harness:qa auth/login
/harness:deploy staging
```

**Domain B (Prototype):**
```
/harness:init --mode prototype
/harness:implement some-idea          # 게이트 생략 (Safety는 유지)
...
/harness:sync --promote               # 승격 후
/harness:review → /harness:qa → /harness:deploy
```

**Domain C (Migration):**
```
/harness:migrate init --strategy mixed  # 기본값 wrap (03-workflow.md §2.1)
/harness:migrate analyze --depth deep
/harness:migrate extract-spec src/**
/harness:migrate gen-test auth/login
# 이후는 Domain B 정방향 합류
```

**One-shot 탐색:**
```
/harness:qa auth/login --only smoke                  # 빠른 확인
/harness:qa auth/login --force-size large            # 1회 풀 매트릭스
/harness:qa auth/login --stack-mode sequential_bottom_up --reason "계층 귀인 필요"
```

**Entropy 스윕 (주기 등록/해제):**
```
/harness:sync --schedule daily                       # drift 감지 + audit rotate (매일)
/harness:sync --schedule weekly                      # spec↔plan↔code · 의존성 · bypass 잔량 (주간)
/harness:sync --schedule off                         # 해제
/harness:sync                                        # 즉시 수동 실행 (등록과 무관)
```

**Escape Hatch (긴급/실험):**
```
# 핫픽스 배포 — QA 우회
/harness:deploy production --bypass-qa --reason "P0 incident 2026-04-13-auth-outage"

# 실험 구현 — spec 없이
/harness:implement scratch/idea --bypass-gates g1 --reason "프로토타입 전 아이디어 검증"

# 리뷰 건너뛰기 (2인 1팀 · 세션 내 구두 리뷰 완료)
/harness:qa auth/login --bypass-review --reason "pair programming, 리뷰 세션 내 완료"
```
세부 의미: §3.1 Escape Hatch.

---

## 5. Scripts Reference

하네스 플러그인 내부에서 실행되는 결정론적 스크립트(.mjs) 목록. **LLM을 쓰지 않고** 순수 로직으로 동작하며, Hook/Skill/CLI 진입점에서 호출된다. 토큰 비용 0.

### 5.1 공용 스크립트 (`scripts/` — 스킬 간 공유)

**① Safety Layer — `scripts/guardrails/`**

| 스크립트 | 역할 | 호출 시점 | 차단 대상 |
|---|---|---|---|
| `block-destructive.mjs` | 파괴적 bash 커맨드 차단 (exit 2) | PreToolUse (Bash) | `rm -rf`, `DROP TABLE`, `:(){:|:&};:` 등 |
| `block-force-push.mjs` | force-push 차단 | PreToolUse (Bash) | `git push --force*`, `git push -f*` |
| `protect-harness.mjs` | 하네스 상태 파일 직접 수정 차단 | PreToolUse (Edit\|Write) | `.harness/state/` 유저 편집 시도 |

**② Gate — `scripts/gates/`**

| 스크립트 | 역할 | 호출 시점 | 평가 대상 |
|---|---|---|---|
| `gate-engine.mjs` | 통합 게이트 엔진 — G1~G5 일괄 평가 + mode Early-Exit | UserPromptSubmit | skill 호출 시 전제조건 · mode별 skip |

**③ Prompt Pipeline — `scripts/prompt/`**

| 스크립트 | 역할 | 호출 시점 | Audit |
|---|---|---|---|
| `quality-check.mjs` | 모호성("빠르게") · 스코프 · 누락 검사 | UserPromptSubmit | — |
| `auto-transform.mjs` | 프롬프트 자동변환 (opt-in) | UserPromptSubmit | `prompt_transformed` |

**③-b Knowledge — `scripts/knowledge/`**

| 스크립트 | 역할 | 호출 시점 | Audit |
|---|---|---|---|
| `record-solution.mjs` | 해결된 문제를 `.harness/knowledge/solutions/{domain}/{slug}.md` 에 기록 (frontmatter + 구조화 본문) | QA 재시도 성공 후 자동 / 유저 수동 호출 | `solution_recorded` |
| `query-solutions.mjs` | domain + keyword 기반 유사 솔루션 검색, 상위 3건을 plan 컨텍스트에 주입. `last_referenced`·`ref_count` 갱신 | `/harness:plan` 진입 시 | — |
| `prune-stale.mjs` | `ref_count == 0 && created > 90일` 솔루션 후보 목록 제시 (자동 삭제 아님, 유저 승인 필요) | `/harness:sync` 엔트로피 스윕 시 | `knowledge_prune_candidates` |

**④ State — `scripts/state/`**

| 스크립트 | 역할 | 호출 시점 | 출력 |
|---|---|---|---|
| `load-state.mjs` | workflow.json 로드 → 세션 초기화 | SessionStart | `session.mode`, `session.started_at` |
| `update-workflow.mjs` | 스킬 완료 시 phase/gates_passed 갱신 | Stop | `workflow.json` write |
| `compact-recovery.mjs` | Compact 후 상태 복원 (Event stream fold) | SessionStart (compact 감지 시) | `workflow.json` rebuild |
| `audit-append.mjs` | `audit.jsonl` append (flock + rotate) | 공용 emitter (모든 이벤트) | append-only JSONL |

**④-b Hooks 컨텍스트 주입 — `scripts/hooks/`**

| 스크립트 | 역할 | 호출 시점 | 출력 |
|---|---|---|---|
| `session-start-context.mjs` | 스킬 카탈로그·워크플로우 요약·활성 feature·`bypass_budgets` 잔량을 세션에 주입 (CLAUDE.md 의존 제거). 주입 내용은 `config.harness.session_start_context.max_tokens` (기본 1,800) 이하로 유지. README 와 텍스트 중복 금지 — Gloaguen 2026 실증상 redundant context 가 성공률 −3%·비용 +23% 의 주 원인 | SessionStart | `additionalContext` stdout |

**⑤ Workflow — `scripts/workflow/`**

| 스크립트 | 역할 | 호출 시점 | Audit |
|---|---|---|---|
| `determine-mode.mjs` | 3개 RULE 평가 → session mode 확정 (opt-in) | SessionStart (mode=auto 일 때만) | `mode_auto_detected` |
| `determine-size.mjs` | AC/files/LOC 3축 AND → small/medium/large | 각 skill 진입 시 | `right_size_determined` |

**⑥ QA — `scripts/qa/`**

| 스크립트 | 역할 | 호출 시점 | Audit |
|---|---|---|---|
| `stack-runner.mjs` | `qa_stack.mode` 에 따른 계층 순차 실행 (Infra→DB→API→UI) · `halt_upstream` 처리 | `/harness:qa` 진입 | `qa_layer_halted` |
| `attribution.mjs` | 실패 귀인 리포트 → `qa-attribution.json` (`verdict: pure_{layer}_issue` 등) | stack-runner 완료 후 | `qa_attribution_report` |
| `mock-ratio.mjs` | `integration_ratio` 계산 + `mock_guard` 위반 탐지 (상위가 하위 mock) | stack-runner 사전 + Coverage 평가 | `qa_attribution_warning` |
| `coverage-trend.mjs` | iteration 간 각 축 델타 계산 → `coverage-trend.json` | Coverage 평가 단계 | (직접 emit 없음, coverage_evaluated에 포함) |
| `context-redundancy.mjs` (선택) | SessionStart 주입 텍스트 ↔ `README.md` Jaccard 유사도 > `config.harness.session_start_context.redundancy_threshold` (기본 0.4) 시 경고. 근거: Gloaguen 2026 — redundant context = 성능 저하 주 원인 | `/harness:sync` 또는 SessionStart 직후(선택) | `context_redundancy_warn` |

**⑦ Validators — `scripts/validators/`**

| 스크립트 | 역할 | 호출 시점 |
|---|---|---|
| `check-side-effects.mjs` | 코드 변경 후 기존 test 깨짐 감지 | PostToolUse (Edit\|Write) |
| `doc-coverage.mjs` | Spec 있는데 Plan/Test 누락 → 경고 | `/harness:plan`·`/harness:implement` 진입 |
| `check-coverage.mjs` | Spec ↔ Test AC 매핑 확인 → `coverage.json` 갱신 | `/harness:implement` 완료 시 |

---

### 5.2 스킬별 스크립트 (`skills/*/scripts/`)

각 스킬 디렉토리 내부의 결정론적 로직. `SKILL.md` (LLM 오케스트레이션)가 호출하거나 Hook 에서 호출.

**`/harness:init` — `skills/init/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `scaffold-harness.mjs` | `.harness/` 디렉토리 구조 생성 (specs/plans/decisions/reviews/knowledge/state) |
| `gen-config.mjs` | 유저 답변(타입·스택·선호) → `.harness/config.yaml` 템플릿 렌더. 새 프로젝트는 대화형 질문 기반 (코드 감지 없음) |
| `copy-examples.mjs` | `skills/init/examples/` (CLAUDE.md.example · rules/*.md.example) 복사 안내 — **유저 동의 시에만** 프로젝트 루트에 복사. 하네스가 덮어쓰지 않음. 안내 문구에 **"README 복사 금지 · 비자명한 레포-특화 제약만 작성"** 경고 포함 (ETH Zürich AGENTbench 2026: LLMCtx −3%/+23%, DevCtx +4%/+19%) |

> **제거됨 (Phase 1):** `gen-rules.mjs`·`gen-claude-md.mjs` 는 업계 선례(OpenAI AGENTS.md · Anthropic CLAUDE.md 모두 유저 소유)에 따라 삭제. 스킬 카탈로그·워크플로우 요약은 `scripts/hooks/session-start-context.mjs` 가 매 세션 `additionalContext` 로 주입 (02-architecture.md §6). 이 결정은 **Gloaguen et al. (ETH Zürich AGENTbench, 2026-02)** 의 실증(LLM 자동 생성 컨텍스트는 성공률 −3%, 비용 +23%)과 정렬됨.

**`/harness:brainstorm` — `skills/brainstorm/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `load-personas.mjs` | `.claude/agents/*.md` + 기본 페르소나 로드 → 서브에이전트 목록 |
| `suggest-personas.mjs` | 주제·프로젝트 타입 기반 페르소나 추천. `.claude/agents/`에 없는 유용한 관점을 제안 (유저 승인 시 `/harness:persona create`로 이어짐) |
| `summarize-session.mjs` | 페르소나별 의견 → 합의점/쟁점 정리 문서 생성 |

**`/harness:spec` — `skills/spec/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `validate-spec.mjs` | Spec YAML 형식·필수 필드·AC id 유일성 검증 |
| `check-testability.mjs` | 각 AC의 `testable` 필드 존재 + 검증 가능 여부 확인 (없으면 exit 2) |
| `extract-criteria.mjs` | Spec → AC 배열 추출 → `coverage.json` 엔트리 생성 |

**`/harness:architect` — `skills/architect/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `check-constraints.mjs` | `config.architecture` 제약(hexagonal·clean 등) 대비 ADR 일관성 검증 |
| `dep-graph.mjs` | 의존성 그래프 분석 → 순환 감지 · 레이어 위반 경고 |

**`/harness:ux` — `skills/ux/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `check-accessibility.mjs` | WCAG 2.1 기준 접근성 체크리스트 자동 점검 (명세 레벨). `--a11y-level` 플래그에 따라 A/AA/AAA 기준 전환 |
| `gen-ux-adr.mjs` | Spec AC + platform 플래그 → UX ADR 골격 생성 (`decisions/{nnn}-ux-{title}.md`). 기존 arch ADR 참조하여 충돌 후보 표시 |
| `platform-guide.mjs` | `--platform` 값에 따라 플랫폼별 UX 가이드라인 (터치 타겟 크기, 반응형 브레이크포인트, 네비게이션 패턴 등) 컨텍스트 주입 |

**`/harness:plan` — `skills/plan/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `gate-check.mjs` | G1: Spec 존재 확인 (없으면 exit 2) |
| `decompose.mjs` | Spec AC → 태스크 분해 보조 (순서·의존성 힌트) |
| `validate-plan.mjs` | Plan의 모든 step이 ≥1 AC에 매핑 + 모든 AC가 ≥1 step에 매핑 |

**`/harness:implement` — `skills/implement/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `gate-check.mjs` | G1·G2: Spec + Plan 존재 확인 |
| `gen-test-skeleton.mjs` | Spec AC → test 파일 skeleton 자동 생성 (모두 FAIL 상태) |
| `run-tests.mjs` | 테스트 러너 래퍼 (`config.testing.commands.*` 호출) |
| `check-side-effects.mjs` | step 구현 후 기존 test 깨짐 감지 (PostToolUse 공용과 연동) |
| `coverage-report.mjs` | 커버리지 러너 결과 파싱 → `coverage-report.json` |

**`/harness:review` — `skills/review/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `gate-check.mjs` | implement 완료(`workflow.json.implement.passed=true`) 확인 |
| `diff-analyzer.mjs` | 변경 파일 수·LOC·영향 모듈 산출 → reviewer depth 결정 |
| `collect-verdicts.mjs` | reviewer 4명 판단 종합 (BLOCK 1개라도 → 전체 BLOCK) |

**`/harness:qa` — `skills/qa/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `gate-check.mjs` | review PASS 확인 |
| `regression-runner.mjs` | 전체 test suite 재실행 (regression 검증) |
| `coverage-threshold.mjs` | 다축 Coverage 임계값 확인 (line/branch/mutation/ac/boundary/error_path/integration_ratio/delta) |
| `report-gen.mjs` | QA 보고서 생성 → `.harness/reviews/{feature}-qa-{iter}.md` |

**`/harness:deploy` — `skills/deploy/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `gate-check.mjs` | G4: `qa.passed=true` 확인 · mode ≠ `prototype` 확인 |

**`/harness:sync` — `skills/sync/scripts/`**

| 스크립트 | 역할 |
|---|---|
| `detect-drift.mjs` | `last-sync-commit` vs `HEAD` 비교 → 변경 범위 산출 |
| `extract-changes.mjs` | 코드 변경에서 spec 영향(함수 시그니처 · API 경로 · 테스트 추가 등) 추출 |
| `update-specs.mjs` | spec/plan/test 역방향 갱신 (유저 승인 후) |
| `entropy-sweep.mjs` | `--schedule` 등록 시 주기 실행 — 문서 일관성(spec↔plan↔code) · 의존성 레이어 · `bypass_budgets` 잔량 집계 → `.harness/state/entropy-report.jsonl` + `entropy_sweep_*` audit |
| `schedule-register.mjs` | `--schedule` 플래그 처리 — cron 표현식을 `config.harness.entropy_sweep.schedule` 에 기록 (실 실행은 외부 스케줄러가 `/harness:sync` 를 non-interactive 호출) |

**`/harness:persona <sub>` — `skills/persona/scripts/` (git-style dispatch)**

| 스크립트 | 역할 |
|---|---|
| `dispatch.mjs` | 첫 인자(create/list/edit/delete) → 해당 스크립트 라우팅 |
| `create.mjs` | 대화형 페르소나 생성 플로우 |
| `list.mjs` | 활성 페르소나 목록 출력 (`.claude/agents/` + 기본) |
| `pick-template.mjs` | 유저 답변 → domain-expert / business-role / tech-specialist 템플릿 선택 |
| `render-persona.mjs` | 초안 렌더링 → `.claude/agents/{name}.md` 저장 |

**`/harness:migrate <sub>` — `skills/migrate/scripts/` (git-style dispatch)**

| 스크립트 | 역할 |
|---|---|
| `dispatch.mjs` | 첫 인자(init/analyze/extract-spec/gen-test) → 라우팅 |
| `init.mjs` | `.harness/` scaffold (기존 구조 보존) + config 자동 생성 |
| `analyze.mjs` | 코드 → 기능 역추출 · 의존성 그래프 · 우선순위 제안 |
| `extract-spec.mjs` | 기존 코드·test → Spec 초안 생성 (AC 역변환) |
| `gen-test.mjs` | Spec AC 중 test 없는 항목 → test 자동 생성 |
| `detect-stack.mjs` | 기존 프로젝트 스택 감지 (package.json · go.mod · pom.xml · requirements.txt 등). migrate 전용 |
| `scaffold-harness.mjs` | (공용) `.harness/` 구조 생성 — init.mjs와 공유 |

---

### 5.3 호출 시점 매트릭스

| 시점 | Hook 이벤트 | 호출되는 스크립트 |
|---|---|---|
| **SessionStart** | `SessionStart` | `state/load-state.mjs`, `state/compact-recovery.mjs` (snapshot 불일치 감지 시에만 실행), `hooks/session-start-context.mjs` (스킬 카탈로그·워크플로우 요약 주입), `workflow/determine-mode.mjs` (mode=auto) |
| **유저 프롬프트 입력** | `UserPromptSubmit` | `gates/gate-engine.mjs`, `prompt/quality-check.mjs`, `prompt/auto-transform.mjs`, `state/route-hint.mjs` (워크플로우 기반 다음 스킬 힌트) |
| **Bash 실행 전** | `PreToolUse (Bash)` | `guardrails/block-destructive.mjs`, `guardrails/block-force-push.mjs` |
| **파일 편집 전** | `PreToolUse (Edit\|Write)` | `guardrails/protect-harness.mjs` |
| **Bash 실행 후** | `PostToolUse (Bash)` | `guardrails/track-bash-files.mjs` (파일 생성/수정 감지 → 경고) |
| **파일 편집 후** | `PostToolUse (Edit\|Write)` | `validators/check-side-effects.mjs` |
| **스킬 진입** | (Skill 내부) | `skills/{name}/scripts/gate-check.mjs`, `workflow/determine-size.mjs` |
| **스킬 완료** | `Stop` | `state/update-workflow.mjs` |
| **QA 단계** | (qa Skill 내부) | `qa/stack-runner.mjs` → `qa/mock-ratio.mjs` → `qa/attribution.mjs` → `qa/coverage-trend.mjs` |
| **자동 판단 이벤트 emit** | (공용) | `state/audit-append.mjs` (flock + rotate) |

---

### 5.4 원칙

1. **LLM 의존 금지** — 모든 스크립트는 순수 JS/Node.js 로직. 토큰 비용 0, 결정론적.
2. **단일 책임** — 한 스크립트 = 한 결정 (예: `gate-check.mjs`는 Gate만, audit은 공용 emitter 호출).
3. **공용 emitter 경유** — audit 이벤트는 반드시 `state/audit-append.mjs` 를 통해 기록 (flock · rotate · PII redact 일관성).
4. **cross-platform** — 모든 `.mjs`는 Node ≥ 20, macOS/Linux/WSL 호환 (02-architecture.md §2.5 참조).
5. **skill-local vs 공용** — 특정 스킬 전용은 `skills/{name}/scripts/`, 여러 스킬·Hook 공용은 `scripts/` 루트. `check-side-effects.mjs` 처럼 중복되는 경우는 skill-local이 공용을 래핑.

---

## 6. 에러 & 트러블슈팅

| 증상 | 원인 | 대응 |
|---|---|---|
| `exit 2: Spec이 없습니다` | G1 실패 | `/harness:spec <domain>/<feature>` 선행 |
| `exit 2: Plan이 없습니다` | G2 실패 | `/harness:plan <domain>/<feature>` 선행 |
| `exit 2: Test가 없습니다` | G3 실패 | `/harness:implement`에서 Test-First 진행 |
| `exit 2: QA 미통과` | G4 실패 | `/harness:qa` 재실행 + FAIL 항목 해결 |
| `exit 2: deploy blocked — prototype mode` | Prototype 모드 Deploy 차단 | `/harness:sync --promote` 로 Standard 승격 후 배포 |
| `exit 2: block_deploy — 필수 QA 누락` | `skip_required_policy: block_deploy` | 누락 유형 실행 또는 정책 완화 (config 수정) |
| `qa_attribution_warning emit됨` | 상위 테스트가 하위 mock 사용 | mock 제거 또는 `mock_guard.enforce: warn`로 완화 (03-workflow.md §1.3.1) |
| `audit.jsonl 커짐` | rotate_mb 초과 | 자동 회전됨 — `audit-{YYYY-MM}.jsonl` 아카이브 확인 |

---

## 7. 상세 문서 역참조

| 주제 | 참조 |
|---|---|
| 스킬 내부 에이전트 구성 | [04-agent-system.md §4](04-agent-system.md) |
| Gate 정의 (G1~G5) | [03-workflow.md §1.2](03-workflow.md) |
| QA 플래그 시나리오 표 | [03-workflow.md §1.3](03-workflow.md) |
| QA Stack 계층 · mock_guard | [03-workflow.md §1.3.1](03-workflow.md#131-qa-stack--계층-의존-순차-검증-bottom-up-sequential-verification) |
| Coverage 8축 framework | [03-workflow.md §4.4](03-workflow.md) |
| Right-Size 3축 판정 + 연구 근거 | [00-overview.md Glossary](00-overview.md#right-size--작업-규모에-맞는-ceremony) |
| Audit Log 13 이벤트 | [00-overview.md Glossary](00-overview.md#audit-log--자동-판단의-역추적-장치) |
| config 스키마 전체 | [05-project-structure.md §4](05-project-structure.md) |
| 네이밍 규칙 (git-style 서브커맨드) | [05-project-structure.md §2.0](05-project-structure.md) |
