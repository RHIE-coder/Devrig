# 업계 패턴 — 본 하네스에 재사용 가능한 것만 추림

> Anthropic·OpenAI 원문의 **모든 주장**을 다루지 않는다. "우리 설계에 **실제로 녹일 수 있는** 재료"만 선별.

---

## A. 단순화 원칙 (Anthropic 핵심 공리)

> *"Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing."*

### 의미

우리 설계의 구성요소 **각각을** "이건 모델의 어떤 한계 때문에 존재하는가?" 로 라벨링 가능해야 함.

### 본 프로젝트 요소의 가정 맵

| 구성요소 | 가정된 모델 한계 | 불필요해질 시점 |
|---|---|---|
| `gate-check.mjs` (spec→plan→impl 순서 강제) | 모델이 spec 없이 구현을 시도함 | 모델이 스스로 "spec 먼저"를 고집할 때 |
| `qa-attribution.json` bottom-up 귀인 | evaluator가 자기 범위 밖 실패를 잘못 짚음 | evaluator가 stack 전체를 이해해서 정확히 귀인할 때 |
| `mock_guard.enforce: strict_lower_real` | 모델이 쉬운 mock에 편향됨 | 모델이 real vs mock의 coverage 의미를 균형있게 판단할 때 |
| Sprint 단위 작업 분해 | 모델의 long-context coherence 부족 | context window 내 전체 feature 완주 가능 시 |
| Right-Size 매트릭스 | 모델이 작업 규모를 과대/과소 평가 | 모델이 자체 scope 판단을 신뢰할 수 있을 때 |
| Escape Hatch `--bypass-*` | 모델이 긴급 상황에서도 규칙을 고수해 deadlock | 모델이 상황 판단해 자가 bypass 가능할 때 |

### 운영 함의

- **각 스크립트 헤더 주석에 가정을 1줄로 명시** → 주기 재검토 시 "이 가정이 아직 유효한가" 판단 가능
- **`audit.assumption_review`** 이벤트 — 분기별 수동 실행, 무효해진 가정을 `config.harness.retired_assumptions[]`에 기록

---

## B. Generator-Evaluator 분리 (GAN 영감)

> *"Tuning a standalone evaluator to be skeptical turns out to be far more tractable."* — Rajasekaran

### 본 프로젝트와의 대조

| 측면 | Anthropic | 본 프로젝트 |
|---|---|---|
| 분리 | Planner / Generator / Evaluator 3-agent | implementer / reviewer-* 분리 (04-agent-system) |
| Evaluator tools | Playwright MCP (실행중 앱 자동 클릭) | `scripts/qa/*.mjs` + 도메인별 reviewer |
| Hard thresholds | 각 grading 축별 컷오프 | Coverage 8축 threshold + mock_guard + attribution |
| Self-evaluation 방지 | 명시적 분리 | reviewer ≠ implementer 강제 |

→ **이미 채택되어 있다.** 단, Anthropic은 **"evaluator를 회의적으로 튜닝"** 을 명시 — 우리는 reviewer 프롬프트에 "skeptical by default"를 명시해야 함.

### 추가 반영 포인트

- reviewer-* 페르소나 프롬프트에 `stance: skeptical` 명시
- QA가 PASS를 냈는데 실제로 버그가 남은 사례를 `.harness/state/false_pass.jsonl` 로 적재 → evaluator 재튜닝 신호

---

## C. Sprint Contract — "done"의 사전 협상 (Anthropic)

### 핵심

Generator가 구현 **전에** "이 sprint의 성공 조건은 이렇고, 이렇게 검증한다"를 Evaluator에게 제시 → 합의 후 구현 시작.

### 본 프로젝트와의 대응

우리는 Spec의 **Acceptance Criteria (Testable·Atomic·Binary·User-visible)** 로 이 역할을 수행함. 그러나:

| 항목 | Anthropic Sprint Contract | 본 프로젝트 AC |
|---|---|---|
| 작성 시점 | implement 직전 (evaluator와 협상) | spec 단계 (implement보다 훨씬 이전) |
| 협상 대상 | evaluator (QA agent) | 유저 |
| 검증 방법 명시 | 포함 ("Playwright로 클릭해 X 확인") | 미포함 (AC는 상태 조건만) |

### 반영안 (옵션)

- **`spec.yaml` 에 `verification_method` 필드 추가** — "Playwright 클릭 / API 호출 / unit assert" 같이 *검증 방법*까지 함께 명시
- `/harness:plan` 시 reviewer-qa가 verification_method를 검토 → 합의되면 plan 승인 (현재 plan은 유저 승인만)

→ 다만 **AC 자체가 이미 testable**을 강제하고 있어서 이중 부담 우려. **medium/large size에서만 verification_method 필수**로 제한하는 게 균형.

---

## D. Context Reset vs Compaction (Anthropic)

### 차이

| 방식 | 기법 | 한계 |
|---|---|---|
| Compaction | 초반 대화를 요약, 같은 에이전트 계속 | Context anxiety 여전 |
| Context Reset | 컨텍스트 완전 초기화 + **구조화된 handoff artifact** 로 상태 전승 | 구현 부담 |

### 본 프로젝트와의 대응

우리는 `scripts/state/compact-recovery.mjs` 가 있음 — compact 후 `.harness/state/` 재로드. 이건 compaction 쪽.

Context Reset은 "세션을 새로 시작하되 handoff artifact로 이어간다" — 우리에게 이미 있는 재료:
- `.harness/state/workflow.json` — 현재 상태
- `.harness/specs/`, `plans/`, `reviews/` — 산출물 전부
- `.harness/state/events/**/*.jsonl` — 이벤트 기록

→ **"세션 재시작 = Context Reset의 자연적 구현"** 이 이미 됨. Opus 4.6에선 compaction으로 충분하다는 Anthropic 결론과 일치.

### 반영안 (옵션)

- `/harness:reset-context` 명령 — 현재 세션 종료 + 다음 세션 시작 시 자동 state 재주입 (SessionStart hook 활용)
- 긴 sprint 중간에 context 포화 시 유저에게 reset 제안 (hook이 토큰 잔량 감지)

---

## E. Entropy Management — 주기 스윕 (OpenAI)

> 구성: 문서 일관성 에이전트 / 제약조건 위반 스캐너 / 패턴 강제 에이전트 / 의존성 감사자 — **일·주·이벤트 기반 실행**.

### 본 프로젝트와의 대조

우리 `/harness:sync`는 on-demand만 제공. **정기 실행 메커니즘 없음**.

### 반영안 (구체)

1. **`/harness:sync --schedule`** — cron 등록 (`@daily`, `@weekly` 등)
2. **주기별 대상 분할**:
   - **Daily**: drift 감지(`detect-drift.mjs`), audit 회전
   - **Weekly**: 문서 일관성(spec↔plan↔impl), 의존성 그래프 검증, `bypass_budgets` 잔량 리포트
   - **Event-based**: plugin.json 변경 시 스킬 카탈로그 재생성, config 변경 시 rules 재렌더 (if 유저가 hook 기반 택함)
3. **`audit.entropy_sweep_started` / `entropy_sweep_completed`** 이벤트 추가
4. `.harness/state/entropy-report.jsonl` — 주간 스윕 결과 누적

### OpenAI의 구체 하위 항목 (재사용)

| 항목 | 본 프로젝트 대응 |
|---|---|
| 문서 일관성 에이전트 | `/harness:sync` 확장 — spec↔code↔plan 삼각 검증 |
| 제약조건 위반 스캐너 | `scripts/qa/*` 재사용 + `.harness/config.yaml.architecture` 기반 검사 |
| 패턴 강제 에이전트 | reviewer-architecture 페르소나가 이미 유사 역할 |
| 의존성 감사자 | `scripts/qa/dep-graph.mjs` (신규) — Types→Config→Repo→Service→Runtime→UI 흐름 검증 |

---

## F. 의존성 계층화 (OpenAI)

```
Types → Config → Repo → Service → Runtime → UI
```

### 본 프로젝트와의 대조

`03-workflow.md §1.3.1 QA Stack`에 이미 **Infra→DB→API→UI** 가 있음. 하지만:
- QA 실패 귀인용으로 쓰이고 있음 (bottom-up attribution)
- **편집 시점의 계층 위반 방지**는 없음

### 반영안

- `config.architecture.layering: [types, config, repo, service, runtime, ui]` 명시
- **`reviewer-architecture`** 가 이 계층에서 상위→하위 import를 허용 안 함
- `scripts/qa/layer-check.mjs` (신규) — import 방향 위반 자동 감지

---

## G. 팀 크기 축 (OpenAI Level 1~3)

| Level | 규모 | 특징 | 본 프로젝트 매핑 |
|---|---|---|---|
| 1 | 개인 | CLAUDE.md + pre-commit + 테스트 | `mode: prototype` + 최소 gate |
| 2 | 소규모팀 | AGENTS.md + CI 제약 + 공유 프롬프트 | `mode: standard` + 팀용 reviewer 페르소나 |
| 3 | 대규모 조직 | 미들웨어 + 관찰성 + 엔트로피 에이전트 + 대시보드 | `mode: standard` + 엔트로피 스윕 + audit 집계 |

### 반영안

우리의 `mode` 축은 **"개발 단계"**(탐색→프로토타입→정식)이고, OpenAI의 Level은 **"팀 규모"**. 직교함. → **`project.scale: solo | team | org`** 추가:

```yaml
project:
  scale: solo        # Level 1
  # scale: team      # Level 2 — CI 제약·공유 페르소나 활성
  # scale: org       # Level 3 — 엔트로피 스윕·대시보드·주간 리포트
```

scale에 따라 default enabled 기능이 달라짐. (mode × scale 매트릭스.)

---

## H. LangChain Middleware 패턴 (OpenAI 인용)

```
Agent Request
  → LocalContextMiddleware (코드베이스 매핑)
  → LoopDetectionMiddleware (반복 방지)
  → ReasoningSandwichMiddleware (계산 최적화)
  → PreCompletionChecklistMiddleware (검증 강제)
  → Agent Response
```

### 본 프로젝트와의 대조

우리는 **Hook 기반 파이프라인**:
- SessionStart / UserPromptSubmit (전처리)
- PreToolUse / PostToolUse (도구 단위)
- Stop (후처리)

**미들웨어와 거의 동형**. 다만:
- **LoopDetection 없음** — 같은 편집을 반복하는지 감지하는 hook 미비
- **PreCompletion 검사 약함** — `/harness:implement` 완료 전 self-check가 스킬 내부 로직에만 의존

### 반영안 (우선도 낮음 — 현재 설계로 대부분 커버)

- `scripts/hooks/loop-detection.mjs` (PostToolUse) — 같은 파일·같은 위치 N회 이상 편집 감지 → audit emit
- `/harness:implement` Stop hook — "pre-completion checklist" 스크립트 실행

---

## I. `AGENTS.md` / `CLAUDE.md` 를 진입점으로 쓰는 것 (양측 공통)

### 의미

두 출처 모두 프로젝트 루트의 단일 파일(`AGENTS.md` 또는 `CLAUDE.md`)을 **AI 에이전트의 컨텍스트 진입점**으로 활용. "정적 컨텍스트의 중심 파일".

### 본 프로젝트와의 대조

우리 현재 설계는 **`/harness:init`이 CLAUDE.md 자동 생성**. 그러나 **이전 대화에서 나온 제안**: `CLAUDE.md`를 유저 영역으로 돌리고 프레임워크는 SessionStart hook으로 주입.

### 업계 선례와의 관계

- **Anthropic은 `CLAUDE.md`가 유저 소유라는 전제** — 본인들 글에서 CLAUDE.md를 "project context file"이라고만 지칭, 자동 생성 언급 없음
- **OpenAI는 `AGENTS.md`를 "정적 컨텍스트"로 분류** — 누가 쓰는지는 명시 안 함

→ **우리가 제안한 "CLAUDE.md·rules 유저 소유" 방향은 업계 선례와 부합.** 자동 생성은 오히려 업계 관행과 어긋남.

**반영**: `/harness:init`의 `gen-claude-md.mjs` 삭제, example 파일만 제공하는 방향 확정 근거로 본 문서 인용 가능.

---

## J. 수치의 정직한 해석 (OpenAI "5개월 1M LOC")

### 원 주장
5개월 · 100만 줄 production code · 인간 작성 0줄 · 1/10 시간.

### 우리가 믿어야 할 것과 아닐 것

| 항목 | 해석 |
|---|---|
| "1M LOC" | 생성량 지표. 품질·유지보수성 지표 아님. |
| "인간 0줄" | 코드 직접 타이핑 0줄. **프롬프트·리뷰·수락**은 인간 작업. |
| "1/10 시간" | 전통 개발 대비. 비교 기준·코드 성격 불명. |
| 실제 운영 상태 | 내부 사용자·알파 테스터. **외부 프로덕션 트래픽 아님.** |

### 반영

- 본 프로젝트 문서에 **수치 인용 시 "생성량 ≠ 품질" 주의 주석** 필수
- 우리의 coverage 8축은 **"생성량 아닌 품질"** 을 측정 → 업계와 차별화 포인트로 명시

---

## 본 문서의 결론

업계 자료에서 건진 **우리가 실제로 쓸 수 있는 재료는 10개 내외**. 그 중 설계 반영 우선순위는 [02-design-integration.md](02-design-integration.md) 참조.

**가장 중요한 것 3개**:
1. **단순화 원칙** (A) → `config.harness.retired_assumptions[]` + 분기 재검토
2. **엔트로피 스윕** (E) → `/harness:sync --schedule`
3. **업계 선례가 "CLAUDE.md·rules 유저 소유"** (I) → 우리 리팩터 방향의 외부 근거
