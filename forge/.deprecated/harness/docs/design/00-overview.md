# Harness Design Overview

> Robust · Stable · Reliable · High Quality · Well-engineered · Battle-tested

---

## Mission

하네스는 **높은 수준의 소프트웨어를 체계적으로 만들어내는 에이전틱 엔지니어링 시스템**이다.

- 치명적 버그 없이 정확히 동작하고
- 보안과 성능에서 높은 퍼포먼스를 보이며
- 프로젝트 전체 라이프사이클을 관통하는

소프트웨어를 구축하기 위한 **워크플로우, 에이전트, 가드레일, 품질 파이프라인**을 제공한다.

---

## 핵심 키워드

| 키워드 | 의미 |
|--------|------|
| **Spec-Driven** | 코드는 blackbox. Spec이 곧 기준. 기능은 Spec에서 시작하고 Spec으로 검증 |
| **Test-Driven** | 테스트가 구현보다 먼저. 높은 커버리지 + side-effect 감지 |
| **Distrust by Structure** | 구현한 사람이 검증하면 안 된다. 구조적으로 분리 |
| **Iron Laws** | 설정으로도 끌 수 없는 절대 규칙. Safety는 협상 대상이 아님 |
| **Standard / Prototype / Explore** | 3개 모드. Standard는 배포 가능 제품 개발, Prototype은 실험(배포 차단), Explore는 QnA·학습(오케스트레이션 off). 승격은 /harness:sync. `mode: auto` opt-in 시 classifier가 세션 시작 1회 판별 (§Mode Auto-Detect) |
| **User Sovereignty** | 하네스는 강하게 강제하되 유저의 취향(패턴, 구조, 에이전트)은 존중 |

---

## 설계 메타원칙 — 구성요소는 모델 한계의 거울

> **"Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing."**
> — Rajasekaran (Anthropic, 2026-03, *Harness Design for Long-Running Apps*)

하네스의 **모든 구성요소**(게이트·스크립트·매트릭스·attribution·mock_guard·Right-Size·Escape Hatch)는 *현재 모델이 자력으로 못 하는 것*에 대한 가정 위에 세워져 있다. 모델이 발전하면 해당 가정은 **무효화 후보**가 된다.

| 항목 | 의무 |
|---|---|
| **가정 명시** | 각 스크립트·게이트의 헤더에 "어떤 모델 한계를 보완하는가"를 1줄로 기록 |
| **주기 재검토** | `audit.assumption_review` 이벤트로 분기별 점검. 무효해진 가정은 `config.harness.retired_assumptions[]` 에 누적 |
| **단순화 경로** | 하네스는 성장뿐 아니라 *축소*도 설계한다 — 모델이 특정 한계를 벗어나면 해당 구성요소를 `minimal_mode`로 내리는 경로 보유 |

→ 상세: [01-philosophy.md](01-philosophy.md) · [insights/industry-harness-engineering/](../insights/industry-harness-engineering/)

---

## 플러그인 & 네임스페이스

- **플러그인 이름:** `harness` (배포 시 마켓플레이스에서 리네이밍 가능)
- **슬래시 명령 호출 형식:** `/harness:<skill>` — 모든 하네스 스킬은 네임스페이스 prefix로 호출
- **Claude Code 빌트인 충돌 회피:** `/init`, `/review` 등 빌트인과 이름이 겹치므로 `/harness:` prefix를 항상 사용

예: `/harness:init`, `/harness:spec`, `/harness:implement`, `/harness:migrate init`

---

## 세 가지 도메인

하네스는 세 가지 영역에서 동작한다:

| 도메인 | 설명 | 핵심 차이 |
|--------|------|----------|
| **A. 하네스 자체 개발** | 하네스 플러그인/스킬/에이전트를 만들고 검증하는 개발 방법론. 배포 전 단계 | 대상이 하네스 자신. Self-test 능력 |
| **B. 하네스 기반 개발** | 하네스를 사용해 새 프로젝트를 처음부터 구축 | 전체 SDLC. Spec→Test→Plan→Code 풀 파이프라인 |
| **C. 마이그레이션** | 기존 프로젝트를 하네스 시스템에 도입 | 역방향: Code→Spec 역추출, 점진적 래핑+리팩토링 |

```
도메인 A (forge/harness/dev/)
  하네스 소프트웨어 개발 → 검증(bench/) → 배포 산출물(marketplace/)

도메인 B (사용자 프로젝트 — Standard 모드)
  /harness:init → /harness:brainstorm → /harness:spec → /harness:architect → /harness:plan
  → [/harness:implement → /harness:review → /harness:qa] (sprint, 병렬 가능) → /harness:deploy → iterate
  ※ 유저가 코드를 직접 수정하면 /harness:sync로 문서 재동기화

도메인 B (사용자 프로젝트 — Prototype 모드)
  /harness:init → /harness:implement (게이트 생략) → 빠른 실험
  → Standard 전환 시: /harness:sync → spec 역추출 → test 생성 → /harness:review → /harness:qa → /harness:deploy

도메인 B (사용자 프로젝트 — Explore 모드)
  /harness:init (mode: explore) → 자유로운 Claude Code QnA
  ※ 모든 Gate/Quality pipeline off, Safety만 유지. 오케스트레이션 없음.

도메인 C (기존 프로젝트)
  /harness:migrate init → /harness:migrate analyze → /harness:migrate extract-spec
  → /harness:migrate gen-test → 정방향 워크플로우 합류
```

---

## 레이어 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   User Interface                     │
│  /harness:brainstorm  /harness:spec  /harness:architect       │
│  /harness:plan  /harness:implement  /harness:review           │
│  /harness:qa  /harness:deploy  /harness:migrate  /harness:init │
├─────────────────────────────────────────────────────┤
│  ⑥ Config Layer          ②~⑤ 조절. ①은 건드릴 수 없음 │
├─────────────────────────────────────────────────────┤
│  ⑤ Workflow Layer         SDLC 오케스트레이션, 게이트   │
├─────────────────────────────────────────────────────┤
│  ④ Quality Layer          프롬프트 향상, 불신 기반 리뷰  │
├─────────────────────────────────────────────────────┤
│  ③ Agent Layer            역할별 에이전트, 모델 티어링   │
├─────────────────────────────────────────────────────┤
│  ② Knowledge Layer        지식 축적, Spec↔Test 추적    │
├─────────────────────────────────────────────────────┤
│  ① Safety Layer           Iron Laws. Config로도 불가   │
├─────────────────────────────────────────────────────┤
│  Claude Code Platform     Skills/Agents/Hooks/MCP     │
└─────────────────────────────────────────────────────┘
```

→ 상세: [02-architecture.md](02-architecture.md)

---

## Spec / Architecture / Test / Plan / Code 관계

```
Spec (무엇을 만드는가 — Source of Truth)
 │     + acceptance criteria (testable)
 │
 ├──→ Architecture (어떻게 설계하는가 — medium+ 규모에서 필수)
 │     /harness:architect. ADR(Architecture Decision Record).
 │     유저 선호 + 범용 기준(SOLID, OWASP…) 적용.
 │
 ├──→ Test Strategy (어떻게 검증할 것인가)
 │     /harness:spec의 일부 또는 독립 Phase 4.
 │     Spec AC → test case 매핑 + 커버리지/edge case 전략.
 │
 └──→ Plan (어떻게 만들 것인가)
       /harness:plan. Spec + Architecture + Test Strategy 통합.
       태스크 분해 / 의존성 / step ↔ test 매핑.

Code = Plan을 따라 TDD로 구현 → Test로 검증 → Spec 충족 증명
```

**필수 규칙:**
- Spec이 존재하면 Test Strategy와 Plan이 반드시 존재해야 한다. 빈 문서 금지.
- Architecture는 Right-Size가 medium 이상일 때 필수 (small은 생략 허용, 03-workflow.md §1.2 참조).
- Plan의 각 step은 최소 1개 이상의 test에 매핑된다 (coverage.json 자동 추적).

### 세 가지 "설계" 단계 — Spec / Architect / Plan

Spec · Architect · Plan 은 모두 "설계"에 해당하지만 **다루는 질문**이 다르다. 셋을 섞으면 대부분의 설계 실패가 발생한다.

| 단계 | 질문 | 관점 | 핵심 산출물 | 책임 에이전트 |
|------|------|------|-------------|--------------|
| **Spec** | **무엇을** 만드는가 (WHAT) | 사용자·제품 | `.harness/specs/{domain}/{feature}.spec.yaml` — AC 리스트 | requirements-analyst, test-strategist, devils-advocate |
| **Architect** | **시스템으로 어떻게** 구성할까 (HOW — system) | 아키텍처·장기 유지보수 | `.harness/decisions/{nnn}-{title}.md` — ADR | architect, reviewer-security |
| **Plan** | **태스크로 어떻게** 만들까 (HOW — task) | 구현자·단기 실행 | `.harness/plans/{domain}/{feature}.plan.md` — step 리스트 | explorer, architect (또는 implementer) |

**각 단계가 다루지 않는 것:**
- **Spec:** 기술 스택·DB 스키마·파일 경로·API 시그니처 (이건 Architect/Plan의 몫)
- **Architect:** 개별 함수명·구현 순서·step 분해 (이건 Plan의 몫)
- **Plan:** "이 기능이 왜 필요한가" "이 패턴이 옳은가" (이건 Spec/Architect의 몫)

**흐름:**
```
Spec (WHAT, AC) ──→ Architect (HOW-system, ADR) ──→ Plan (HOW-task, steps)
                         ↑ medium+ 필수, small 생략 가능              ↓
                                                                  Code (TDD)
```

**자주 하는 혼동:**

| 패턴 | 문제 |
|------|------|
| Plan에 아키텍처 판단 섞기 | ADR 없이 내린 기술 결정은 재사용·회고 불가 |
| Spec에 API 경로/스키마 쓰기 | Spec이 구현을 강제하여 Architect 판단 여지 상실 |
| medium 이상에서 Architect 건너뛰기 | Plan 간 일관성 붕괴, 레거시 양산 |
| 셋을 한 문서에 몰기 | 변경 시 범위 분리 불가, 리뷰 단위 비대화 |

**한 줄 요약:** Spec은 *유저가 만족하는가*, Architect는 *시스템으로 지속 가능한가*, Plan은 *실제로 만들어지는가* 를 각각 증명한다.

→ 상세: [03-workflow.md](03-workflow.md)

---

## 강제 메커니즘

```
Hook (결정론적, LLM 없음, 토큰 0)
 ├── Safety: 파괴적 작업 차단 (PreToolUse)
 ├── Gate: 워크플로우 전제조건 검증 (UserPromptSubmit)
 ├── Quality: 프롬프트 변환 + 출력 검증 (UserPromptSubmit, PostToolUse)
 ├── State: 워크플로우 상태 복원 + 갱신 (SessionStart, Stop)
 └── Context: 스킬 카탈로그·모드·라우터 힌트 주입 (SessionStart)

Skill (LLM 오케스트레이션)
 ├── 단계별 진입점 (/harness:spec, /harness:implement, /harness:review...)
 ├── 에이전트 조합 및 위임
 └── 단계 완료 조건 검증

Agent (역할별 실행)
 ├── 전문 역할 (explorer, implementer, reviewer...)
 ├── 모델 티어링 (haiku/sonnet/opus)
 └── 에스컬레이션 프로토콜
```

→ 상세: [02-architecture.md](02-architecture.md) · [07-hooks-system.md](07-hooks-system.md) · [08-skill-system.md](08-skill-system.md) · [09-script-system.md](09-script-system.md)

---

## 페르소나 시스템

| 구분 | 제공자 | 예시 |
|------|--------|------|
| **기본 페르소나** | 하네스 내장 (`agents/core/`) | Devil's Advocate, Requirements Analyst, Test Strategist |
| **유저 페르소나** | 유저 생성 (`.claude/agents/`) | SaaS CTO, DDD Expert, Java Specialist |

유저가 페르소나를 모르면 → 프로젝트 타입에 맞는 Best Practice 세트를 `/harness:init`에서 자동 제안.

→ 상세: [04-agent-system.md](04-agent-system.md)

---

## 문서 인덱스

| 문서 | 내용 |
|------|------|
| [01-philosophy.md](01-philosophy.md) | 설계 원칙, Iron Laws, 트레이드오프 결정 |
| [02-architecture.md](02-architecture.md) | 6-레이어 아키텍처, 강제 메커니즘, Feature=Aggregate 경계 |
| [03-workflow.md](03-workflow.md) | 3개 도메인 워크플로우, 게이트, Sprint 루프 (Saga 어휘) |
| [04-agent-system.md](04-agent-system.md) | 에이전트 역할, 페르소나 시스템, 모델 티어링 |
| [05-project-structure.md](05-project-structure.md) | 디렉토리 구조, Config 스키마, Event Log + Upcaster |
| [06-cli-reference.md](06-cli-reference.md) | 모든 `/harness:*` 스킬의 인자·플래그·Gate·Output·Audit 이벤트 레퍼런스 |
| [07-hooks-system.md](07-hooks-system.md) | Hook 라이프사이클, 이벤트별 스크립트, 실행 모델, 분류 체계 |
| [08-skill-system.md](08-skill-system.md) | Skill 아키텍처, SKILL.md·skill.yaml 구조, 카탈로그·라우팅, Skill→Agent 오케스트레이션 |
| [09-script-system.md](09-script-system.md) | .mjs 스크립트 실행 모델, Exit Code 프로토콜, 9분류 체계, Audit Emit 계약 |
| [10-state-and-audit.md](10-state-and-audit.md) | Event Sourcing 상태 관리, Upcaster, Single Writer 동시성, Audit Log, Compact Recovery |

**연구 노트 (insights):**

| 문서 | 내용 |
|------|------|
| [insights/agentic-framework-patterns.md](../insights/agentic-framework-patterns.md) | 3개 에이전틱 프레임워크 교차 분석 |
| [insights/claude-platform-blueprint.md](../insights/claude-platform-blueprint.md) | Claude Code 플랫폼 역량 조사 |
| [insights/patterns/](../insights/patterns/) | 분산 상태 패턴 심층 — DDD Aggregate / Saga / Event Sourcing / Axon·Akka / 하네스 적용성 |

---

## 용어집 (Glossary)

문서 전반에서 반복되는 핵심 용어의 **표준 정의**. 다른 문서에서 처음 등장할 때 여기로 역참조한다.

### Feature Domain ↔ QA Concern — "도메인"이라는 단어의 두 축 (혼동 주의)

하네스에서 "도메인"은 **두 가지 서로 직교하는 축**을 부를 수 있다. 혼동하지 않도록 문서 전반에서 구분한다.

| 축 | 의미 | 예시 | 사용처 |
|---|---|---|---|
| **Feature Domain** | 비즈니스 영역·Aggregate 그룹 | `auth`, `billing`, `payment` | `specs/{domain}/{feature}.spec.yaml` 경로, `spec.yaml`의 `domain:` 필드, Aggregate 경계 (02-architecture.md §3.0) |
| **QA Concern** (QA Axis) | 품질 관심사 축 | Unit+Integration · API · UI/UX · DB · Infra | `/harness:qa` Sprint Loop §1.3의 QA 실행 단계 |

- **관계:** **직교.** 한 Feature Domain(`auth/login`)의 QA는 여러 QA Concern(API · Unit+Integration · UI)에서 각각 수행된다.
- **과거 표현 정정:** 이전 문서의 "도메인별 QA"는 **QA Concern별 QA**를 의미하며, `spec.yaml`의 `domain` 필드(Feature Domain)와는 관계없다.

### AC — Acceptance Criteria (인수 기준)

**Spec이 "완성됐다"고 선언할 수 있는 검증 가능한 조건 목록.** 테스트 가능한 체크리스트 형태.

- **역할:** Spec → Test → Plan → Code를 연결하는 핵심 ID. 모든 AC는 test case 1개 이상에 매핑되고, 모든 AC의 test가 PASS 되어야 feature가 done이 된다. `.harness/state/coverage.json`이 AC ↔ plan step ↔ test 3자 매핑을 자동 추적.
- **좋은 AC의 4조건:** Testable(자동 검증 가능) · Atomic(1 AC = 1 검증 대상) · Binary(pass/fail 명확) · User-visible(사용자 관점).
- **예시:**
  ```yaml
  acceptance_criteria:
    - id: AC-001
      desc: "이메일+비밀번호 일치 시 JWT 발급"
      testable: "POST /login → 200 + body.token 존재"
    - id: AC-003
      desc: "5회 연속 실패 시 계정 30분 잠김"
      testable: "6번째 호출 → 429 + retry_after=1800"
  ```
- **게이트 지점:** `/harness:spec` (AC testable 필드 필수) · `/harness:implement` G1 (Spec 존재) + G2 (Plan 존재) · `/harness:qa` G3 (Test 존재) · `/harness:deploy` G4 (QA PASS).
- **Right-Size 기준의 대리 지표:** "AC ≤ 3" 같은 규모 판정 기준에 등장.

### Right-Size — 작업 규모에 맞는 ceremony

**작업 규모(small / medium / large)에 따라 프로세스의 무게를 조절하는 메커니즘.** Iron Laws(Safety, Spec→Test→Plan 순서, 구현자≠검증자)는 규모와 무관하게 **영구 강제**, 그 외 "선택적 절차"만 규모에 따라 생략/완화/강화.

- **배경:** Superpowers(7-Stage 강제 = 합리화 차단, but 마찰) vs CE(Right-Size Ceremony = 유연, but 생략 위험) — 두 원칙이 상충. 하네스는 "Iron Laws 영구 강제 + 절차는 Right-Size 조절"로 양쪽 동시 해결 (01-philosophy.md §P8).

- **판정식 (결정론적, 3축 AND):** 세 축 중 **어느 하나라도 상위 밴드를 넘으면 상위로 승격**. 애매한 경우 없음.

  | 규모 | AC (인수기준 수) | 변경 파일 수 | 변경 LOC (added+changed) |
  |------|:----:|:----:|:----:|
  | small  | ≤ 3  [^1] | ≤ 4  [^2] | ≤ 100  [^3] |
  | medium | ≤ 7  [^4] | ≤ 10 [^5] | ≤ 400  [^6] |
  | large  | 그 외 — **split_required = true** (Architect 단계에서 분할 검토) |

  ```
  size =
    small   if  AC ≤ 3  ∧  files ≤ 4   ∧  LOC ≤ 100
    medium  elif AC ≤ 7  ∧  files ≤ 10  ∧  LOC ≤ 400
    large   otherwise
  ```

  [^1]: Miller 1956 *The Magical Number Seven, Plus or Minus Two* — working memory 하한 3±1 chunks.
  [^2]: SmartBear 2012 *Best Kept Secrets of Peer Code Review* (Cisco 인스펙션 10,000건) — 결함 검출률이 ≤4 파일에서 피크.
  [^3]: Google engineering practices — "small PR" 밴드 (≤100 LOC 권고).
  [^4]: Miller 1956 — 7±2 상한 (단기 기억 절대 한계).
  [^5]: Rigby & Bird 2013 *Convergent Contemporary Software Peer Review Practices* (MS + 5개 OSS 프로젝트) — PR 파일수 중앙값 ~11.
  [^6]: SmartBear 2012 — 리뷰 처리율 400 LOC/h 이상에서 검출률 급락; Google eng-practices 동일 수치 명시.

- **입력 측정(결정론적):**
  - AC: `spec.yaml > acceptance_criteria[]` 배열 길이
  - files: plan 단계에선 `plan.md`의 step별 `files_changed` uniq 카운트, implement 이후엔 `git diff --name-only` 실측
  - LOC: `git diff --numstat`의 `(added + changed)` 합. 제외 목록은 `config.workflow.right_size.loc_exclude` (기본: lock 파일, generated, snapshot, fixture)

- **명시된 갭 (판정식 밖으로 이관):**
  1. LOC는 언어 의존적이다 — TS 400 ≠ Go 400. 기본 수치는 Miller/SmartBear/Google이 사용한 OSS 혼합 샘플(Java/Python/JS) 기준. 언어별 보정은 `loc_multiplier` 오버라이드로 처리.
  2. Cyclomatic complexity, 보안 도메인(인증·PII·결제 등), 신규 vs 수정은 판정식에 포함하지 않는다. 이는 Architect 단계의 판단 영역이며 right-size를 **상향 고정**할 수는 있어도 **하향 고정**은 금지(`force_size: medium|large` only).
  3. 하네스 문맥(AI agent 생성물)은 인간 PR 리뷰와 피로 곡선이 다르다. 현 수치는 **인간 리뷰어 기준** — agent 리뷰 전용 배수는 데이터 축적 후 튜닝 (follow-up).
  4. AC 수치는 AC의 원자성(Atomic)에 의존. 1 AC가 사실상 3개면 판정이 흐려지므로 `/harness:spec`의 AC 분해 품질이 **선행 조건**.

- **절차 차등 (03-workflow.md §1.2):**

  | Gate | small | medium | large |
  |------|:------|:------|:------|
  | Brainstorm | 생략 | 생략 | 권장 |
  | Architect (ADR) | 생략 | **필수** | **필수** |
  | Review 깊이 | light (1 reviewer) | standard (2–3) | deep (4 병렬) |
  | QA 테스트 매트릭스 | Unit·Sanity·Smoke | + Integration·Regression | + E2E·Load·Stress·Recovery |

- **9가지 테스트 유형의 정의와 차이**: [03-workflow.md 부록 A](03-workflow.md#부록-a--테스팅-방법-정리) — Unit/Sanity/Smoke/Integration/Regression/E2E/Load/Stress/Recovery.

- **항상 강제되는 것(규모 무관):** Safety Layer · Spec→Test→Plan 순서(빈 문서 금지) · 구현자≠검증자(G5) · QA→Deploy(G4).
- **Mode와의 차이 (직교하는 두 축):**

  | 축 | 역할 |
  |---|------|
  | **Mode** (standard/prototype/explore) | 워크플로우 자체의 강도. 게이트 on/off |
  | **Right-Size** (small/medium/large) | Standard mode 내부에서 ceremony의 깊이. 게이트의 강도 |

- **Config:** `workflow.right_size: auto` (자동 판정) | `small` | `medium` | `large` (수동 고정).

### Coverage Strategy — 다축 신뢰도 (Multi-Axis Coverage)

**"Line 100%"는 coverage의 증명이 아니다.** 테스트가 실제로 버그를 잡는지 보장하려면 여러 축을 **교차 검증**해야 한다. 하네스는 **3범주 × 8축** Coverage Framework를 강제.

- **정량 (Quantitative):** `line` · `branch` · **`mutation_score`** (코드 변이 감지율) · **`ac_coverage`** (AC 매핑률).
- **정성 (Qualitative):** **`boundary`** (off-by-one/null/max/min) · **`error_path`** (예외·실패 분기) · **`integration_ratio`** (실제 의존성 비율).
- **트렌드 (Trend):** **`coverage_delta`** — iteration/PR 간 감소 시 block.
- **옵션:** property-based (fast-check/Hypothesis) · contract testing (Pact) · fuzz (go-fuzz/libFuzzer).

**G4 판정:** 단일 수치가 아닌 **모든 필수 축 충족** (Right-Size별 차등 — [03-workflow.md §4.4](03-workflow.md#44-coverage-전략--다축-신뢰도-multi-axis-coverage) 참조).

**8축 평가 — workflow 통합 (어느 단계에서 누가):**

| 축 | 평가 시점 | 평가 주체 | 메커니즘 |
|---|---|---|---|
| `line`, `branch` | `/harness:implement` 완료 | `coverage-report.mjs` (script) | 테스트 러너 출력 파싱 |
| `mutation_score` | `/harness:qa` | `coverage-threshold.mjs` (script) | mutation 도구 호출 (stryker 등) |
| `ac_coverage` | `/harness:implement` 완료 | `check-coverage.mjs` (script) | coverage.json AC↔test 매핑률 |
| `boundary` | `/harness:spec` + `/harness:review` | test-strategist (agent) + reviewer-quality (agent) | Spec AC에서 boundary case 도출 → review 시 확인 |
| `error_path` | `/harness:review` | reviewer-quality (agent) | 예외·실패 분기 테스트 존재 확인 |
| `integration_ratio` | `/harness:qa` | `mock-ratio.mjs` (script) | mock vs 실제 의존성 비율 계산 |
| `coverage_delta` | `/harness:qa` | `coverage-trend.mjs` (script) | iteration 간 각 축 변화량 |

**하네스가 잡는 안티패턴:** Line 100% but assertion 없음(mutation이 감지) · Mock-only integration(integration_ratio 하한) · AC 누락(ac_coverage 100% 강제) · Happy path 전용(error_path 체크) · 테스트 삭제로 수치 유지(delta 모니터링) · skip으로 flaky 감추기(skip 수 추적).

**Config:** `testing.coverage.{line,branch,mutation,ac,boundary,error_path,integration_ratio,delta}`. 보고서: `.harness/state/coverage-report.json` + 트렌드 `coverage-trend.json`. Audit 이벤트: `coverage_evaluated`.

### QA Stack — 계층 의존 순차 검증 (Bottom-Up Sequential Verification)

**UI · API · DB · Infra 는 의존 스택이다.** 하위 계층이 PASS된 상태에서 상위 계층이 FAIL 하면, 원인은 **반드시 그 상위 계층**에 있다. 하네스는 이 의존 관계를 `/harness:qa` 실행 순서에 반영해 **실패 귀인(attribution)** 을 자동화한다.

- **스택 (기본):** `Infra (L0) → DB (L1) → API (L2) → UI (L3)` — 아래로 갈수록 다른 계층이 의존.
- **실행 모드 (`testing.qa_stack.mode`):**
  - `parallel` (기본, 하위호환) — QA Concern 동시 실행. 빠르지만 귀인 약함.
  - `sequential_bottom_up` — 위 스택 순서로 직렬 실행. 하위 FAIL 시 상위 skip + 자동 귀인. **완고한 소프트웨어용**.
  - `custom` — 유저가 `custom_order` 로 정의.
- **귀인(Attribution) 엔진:** `scripts/qa/attribution.mjs` → `.harness/state/qa-attribution.json` 생성. 실패 시 `verdict: pure_{layer}_issue | multi_layer: […] | all_green`. Sprint Loop 재진입 시 implementer에게 해당 계층만 탐색하도록 컨텍스트 주입.
- **귀인 신뢰성의 전제 — `mock_guard`:** 상위 계층이 하위 계층을 mock 처리하면 "하위 PASS" 전제가 깨진다. `enforce: strict_lower_real` (기본, sequential_bottom_up) → 감지 시 G4 BLOCK. `warn` | `off` 로 완화 가능.
- **Right-Size 권고:** small=`parallel`, medium=상황 적응, large=`sequential_bottom_up` 강력 권고.
- **Audit 이벤트:** `qa_layer_halted`, `qa_attribution_report`, `qa_attribution_warning`.
- **상세:** [03-workflow.md §1.3.1](03-workflow.md#131-qa-stack--계층-의존-순차-검증-bottom-up-sequential-verification) · [05-project-structure.md Config Schema](05-project-structure.md).

### Mode Auto-Detect — 세션 시작 시 모드 자동 판별 (opt-in)

**`config.workflow.mode: auto` 일 때만 동작하는 opt-in 기능.** SessionStart 시점에 `scripts/workflow/determine-mode.mjs` 가 신호(브랜치·스펙 유무·첫 프롬프트 분류)를 읽고 세션의 mode를 **1회 확정**한다. 오판 시 게이트가 조용히 풀릴 위험이 크므로 **기본값은 항상 `standard` (manual)**.

- **왜 opt-in인가:** Mode는 게이트 on/off를 좌우한다. 자동 전환이 standard → explore로 가면 Iron Laws 외 모든 게이트가 풀린다. `dangerously-skip-permissions`와 유사하게, 편의를 위해 안전 장치를 약화시키는 결정은 **유저가 명시적으로 opt-in**해야 한다.
- **안전 3규칙 (config.workflow.auto_detect.safety):**

  | 규칙 | 의미 |
  |---|---|
  | `narrow_only` | standard → (prototype\|explore) 자동 **내림 금지**. 조용한 게이트 해제 방지 |
  | `promotion_requires_user` | prototype/explore → standard 승격은 `/harness:sync`만 가능 |
  | `session_start_only` | 분류는 세션 시작 1회만. 프롬프트마다 재분류 없음 |

- **판정 규칙 (결정론적, 위→아래 첫 매치):** `RULE-MODE-EXPLORE-001` (질문형 + 수정 의도 없음 + /harness:* 미호출) → `RULE-MODE-PROTOTYPE-001` (실험 브랜치 + 대상 spec 부재) → `RULE-MODE-STANDARD-DEFAULT` (fallthrough, 가장 엄격).
- **모든 전환은 Audit Log에 `mode_auto_detected` 이벤트로 기록** — rule_id, signals, decision 전부 포함.
- **상세:** [02-architecture.md §3 ⑤ Workflow Layer](02-architecture.md) · [05-project-structure.md Config Schema](05-project-structure.md).

### Audit Log — 자동 판단의 역추적 장치

**하네스가 "자동으로" 내린 모든 판단을 append-only JSONL로 기록.** 저장 위치: `.harness/state/audit.jsonl`. 목적은 두 가지 — (1) **Audit:** 왜 이 모드/크기로 확정됐는가, 왜 게이트가 skip됐는가를 사후 검증 (2) **Debug:** 자동 판단이 예상과 다를 때 입력 신호·적용 규칙을 역추적.

- **기록 대상 이벤트 (config.audit.events로 각각 on/off):**

  | Event | Emitter | 의미 |
  |---|---|---|
  | `mode_auto_detected` | SessionStart · determine-mode | auto mode가 확정한 session mode |
  | `right_size_determined` | 각 skill 진입 · determine-size | AC/files/LOC 3축 판정 결과 |
  | `force_size_applied` | Architect 단계 | 상향 override (upward_only) |
  | `prompt_transformed` | UserPromptSubmit · auto-transform | 프롬프트 자동변환 diff |
  | `model_tier_escalated` | Agent 호출 | haiku → sonnet → opus 승격 |
  | `gate_skipped` | gate-engine | explore/prototype에서 skip된 게이트 |
  | `agent_escalation` | Agent 종료 | DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED 전이 |
  | `qa_invoked` | /harness:qa 진입 | 실행 플래그(--all/--only/--exclude/--force-size/--reason) + 실행 집합 |
  | `qa_scope_overridden` | /harness:qa 진입 | Right-Size 매트릭스와 실제 집합이 다를 때 추가 emit |
  | `coverage_evaluated` | /harness:qa 완료 | 다축 Coverage 평가 — line/branch/mutation/ac/boundary/error_path/integration_ratio/delta + gaps |
  | `qa_layer_halted` | /harness:qa 계층 실행 · qa/stack-runner | `sequential_bottom_up` 모드에서 하위 계층 FAIL로 상위 계층 skip |
  | `qa_attribution_report` | /harness:qa 완료 · qa/attribution | 실패 귀인 리포트 — 하위 PASS + 상위 FAIL ⇒ `verdict: pure_{layer}_issue` |
  | `qa_attribution_warning` | /harness:qa 준비 · qa/mock-ratio | `mock_guard` 위반 — 상위가 하위를 mock → 귀인 신뢰성 저하 |
  | `gate_bypassed` | skill 진입 · gates/gate-engine · UserPromptSubmit lexicon | 유저 `--bypass-*` 로 gate/review/qa 우회 — `--reason` 필수 · 세션 sticky warning (03-workflow.md §1.9) |

- **공통 스키마:** `ts`, `session_id`, `event`, `decision: {from, to}`, `signals: {…}`, `rule_id`, `reversible`, `source`.
- **불변식 (Audit Iron Law):** append-only · flock 직렬화 · PII는 `redact_fields`로 hash 치환 · `audit.enabled: false`여도 자동 판단은 **정상 동작, 기록만 중단** (관찰 가능성 포기 옵션).
- **Config:** `audit.enabled`, `audit.path`, `audit.retention_days`, `audit.rotate_mb`, `audit.events.*`, `audit.redact_fields`.
- **상세:** [02-architecture.md ① Safety Layer](02-architecture.md) · [05-project-structure.md Config Schema](05-project-structure.md) · [10-state-and-audit.md](10-state-and-audit.md).
