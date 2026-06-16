# Agentic Framework Patterns

> Superpowers · bkit · Compound Engineering — 3개 프레임워크 교차 분석

---

## 0. 프로젝트 스냅샷

| | Superpowers | bkit | Compound Engineering |
|---|:---:|:---:|:---:|
| Stars | 142K | 485 | 13.7K |
| Skills | 14 | 38 | 42 |
| Agents | Named (재사용) | 36 | 51+ |
| Platforms | 6 | 1 (Claude Code) | 10 |
| Runtime | Bash (zero-dep) | Node.js | TypeScript/Bun |
| State | Stateless | FSM (607 함수) | Stateless (docs-based) |
| Lang | English | 8 languages | English |
| Tests | Headless + Pressure | 4,028 TC / 12 categories | 48 files / 7 categories |

---

## 1. 수렴 패턴 — 2개 이상이 독립적으로 도달한 해법

### C1. 불신 기반 리뷰 (Distrust-Based Review)

**구현한 사람이 검증하면 안 된다.**

| 프로젝트 | 메커니즘 |
|----------|----------|
| Superpowers | 2-Stage Review — Spec Compliance (불신 기반) → Code Quality (분리) |
| bkit | Phase-based Team Recomposition — Do 팀 → Check 팀 전환 |
| CE | Persona-Based Parallel Review — 17 reviewer, 오케스트레이터 판단 선택 |

**수렴점**: 3/3 모두 "구현자 ≠ 검증자"를 구조적으로 강제.
**차이**: SP는 2단계 순차, bkit은 팀 교체, CE는 persona 병렬 dispatch.

### C2. 모델 선택 전략 (Model Tiering)

| 프로젝트 | 전략 |
|----------|------|
| Superpowers | 태스크 복잡도별 — mechanical/integration/architecture |
| bkit | 역할별 — 12 opus : 22 sonnet : 2 haiku |
| CE | 상속 기본 — `model: inherit`, 필요시 tiering |

**수렴점**: 3/3 모두 "모든 작업에 최고 모델" 거부. 역할/복잡도로 분배.

### C3. Controller + Workers 아키텍처

| 프로젝트 | 패턴 |
|----------|------|
| Superpowers | Controller(컨텍스트 큐레이션) + Workers(격리 실행) |
| bkit | CTO(opus, 50 turns) + 5 orchestration patterns (leader/council/swarm/pipeline/watchdog) |
| CE | Orchestrator + Sub-Agent dispatch (compact return으로 context 보호) |

**수렴점**: Controller/Orchestrator가 컨텍스트를 구성하여 전달. 서브에이전트에게 자율 탐색을 맡기지 않음.

### C4. 에스컬레이션 프로토콜

| 프로젝트 | 메커니즘 |
|----------|----------|
| Superpowers | DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED + "Bad work > no work" |
| bkit | Guard fail → retry / escalate + Emergency stop → L1 강제 |
| CE | Confidence < 0.60 → suppress, P0 exception at 0.50+ |

**수렴점**: 서브에이전트가 확실하지 않을 때 무리하지 않는 메커니즘.

### C5. Skill/Prompt 테스트

| 프로젝트 | 방법 |
|----------|------|
| Superpowers | 3-Layer (Triggering + Compliance + Integration), Pressure Testing |
| bkit | Skill Evals (30 definitions) + Model Parity Test (85% → deprecation) |
| CE | Contract Tests on Prose (SKILL.md 문자열 검증) |

**수렴점**: 3/3 모두 "스킬도 테스트 가능한 코드"로 취급.
**차이**: SP는 행동 검증(headless), bkit은 품질 평가(eval), CE는 산문 계약(contract).

### C6. 작업 규모별 조절 (Scope Matching)

| 프로젝트 | 메커니즘 |
|----------|----------|
| Superpowers | 7-Stage Pipeline — skip 불가, 전 단계 강제 |
| bkit | L0-L4 Progressive Automation — 실적 기반 자동화 레벨 조절 |
| CE | Right-Size Ceremony — Lightweight/Standard/Deep 스킬별 독립 판단 |

**수렴점**: "작은 작업에 과도한 프로세스를 강제하면 안 된다."
**차이**: SP는 강제(skip 불가), bkit은 신뢰 기반(Trust Score), CE는 자율 판단(scope matching).

### C7. Session Bootstrap

| 프로젝트 | 메커니즘 |
|----------|----------|
| Superpowers | SessionStart hook → `using-superpowers` 전문 주입 |
| bkit | SessionStart hook → 대시보드 + 상태 복원 |
| CE | `!` command pre-population (hook 미사용) |

**수렴점**: 2/3이 SessionStart hook 활용, CE는 다른 경로로 동일 목표.
**핵심**: 세션 시작 시 에이전트에게 "지금 뭘 해야 하는지" 주입하는 것은 전제조건.

### C8. 파괴적 작업 차단

| 프로젝트 | 메커니즘 |
|----------|----------|
| Superpowers | Iron Laws — "위반 불가능한 절대 규칙" |
| bkit | Guardrail-as-Code — 8 rules (G-001~G-008), PreToolUse 차단 |
| CE | allowed-tools whitelist (약한 형태) |

**수렴점**: 2/3이 명시적 차단. CE는 화이트리스트만 (guardrail 부재).

### C9. Plan = Self-Contained Contract

| 프로젝트 | 메커니즘 |
|----------|----------|
| Superpowers | 2-5분 태스크, 실제 코드, placeholder 절대 금지, "주니어가 따를 수 있어야" |
| CE | R-ID tracing (요구사항 ID → plan 체크박스), origin 필드로 brainstorm ↔ plan 연결 |

**수렴점**: 계획이 자기완결적이어야 서브에이전트가 자율 실행 가능.

### C10. Multi-Platform 지원

| 프로젝트 | 구현 |
|----------|------|
| Superpowers | Tool mapping table + platform별 manifest + fallback |
| CE | Universal IR → converter CLI → 10 targets |
| bkit | ❌ Claude Code only |

**수렴점**: 2/3이 multi-platform. 스킬 하나 → 플랫폼별 변환 + fallback.

---

## 2. 고유 혁신 — 한 프로젝트만 구현한 패턴

### Superpowers Only

| 패턴 | 핵심 | 왜 중요한가 |
|------|------|-------------|
| **합리화 방어** (E) | Red Flags 테이블 + 합리화 테이블 + 루프홀 차단 + "문자 위반 = 정신 위반" | LLM의 프로세스 건너뛰기를 선제적으로 차단. **다른 두 프로젝트 모두 Gap으로 인식**. |
| **Persuasion Principles** (G) | N=28,000 연구 기반, Authority/Commitment/Scarcity/Social Proof | 학술적 근거가 있는 프롬프트 설계 원칙 |
| **TDD for Everything** (O) | 코드/스킬/계획/완료 주장까지 모두 RED-GREEN-REFACTOR | 검증 범위를 코드 너머로 확장 |
| **Zero-Dependency** (K) | 순수 bash, 외부 런타임 없음 | 진입 장벽 최소화. 142K stars의 근본 원인 중 하나 |

### bkit Only

| 패턴 | 핵심 | 왜 중요한가 |
|------|------|-------------|
| **Declarative FSM** (A) | 25 transitions + 11 guards + 17 actions = 전체 워크플로우 | 전이 규칙이 곧 문서. 행 추가만으로 확장 |
| **Progressive Automation L0-L4** (D) | Trust Score 0-100, 성공 +3~5, 실패 -5~15 | 신뢰를 실적으로 획득. 유일한 신뢰 기반 자동화 |
| **Guard/Gate 2단** (B) | Guard(가능한가? Boolean) ≠ Gate(충분한가? Score) | 같은 결과도 L2에서는 확인, L3에서는 자동 진행 |
| **Context Compaction Defense** (P) | PreCompact → 스냅샷, PostCompact → 무결성 검증 → 복원 | 긴 세션에서 상태 손실 방지 |
| **Audit Trail 2종** (Q) | Action Log (무엇을) + Decision Trace (왜) | 3-level explanation (brief/normal/detailed) |
| **Skill Lifecycle** (K+S) | Workflow/Capability 분류 + Model Parity 85% → deprecation | 스킬의 수명 관리를 자동화 |

### CE Only

| 패턴 | 핵심 | 왜 중요한가 |
|------|------|-------------|
| **Knowledge Compounding** (A) | solutions/ → learnings-researcher → 다음 plan에 자동 인용 | 유일한 지식 복리 축적 메커니즘 |
| **Script-First** (C) | 복잡한 로직을 scripts/로 위임 → 65% 토큰 절감 | 토큰 효율의 유일한 정량적 해법 |
| **Confidence Calibration** (G) | 0.00-1.00 스케일, 0.60 suppress, cross-reviewer boost | per-finding 신뢰도로 false positive 억제 |
| **Contract Tests on Prose** (R) | SKILL.md 산문을 자동 테스트 (string contains/ordering) | 프롬프트 drift 방지의 독창적 해법 |
| **4-Way Autofix** (T) | safe_auto / gated_auto / manual / advisory | 자동 수정 범위를 구조적으로 분류 |
| **Two-Track Solution Schema** (Q) | Bug track vs Knowledge track, 13 types × 17 components | 구조화된 검색 가능 KB |
| **Compound Refresh** (S) | 5 outcomes: Keep/Update/Consolidate/Replace/Delete | 지식 유지보수 메커니즘까지 내장 |

---

## 3. 모순 지도 — 프로젝트 간 접근이 충돌하는 영역

### M1. 상태 관리 — FSM vs Stateless

| | bkit | SP / CE |
|---|------|---------|
| 접근 | Declarative FSM (25 transitions, 607 함수) | Stateless (SP: 상태 없음, CE: docs가 곧 상태) |
| 장점 | 전이 규칙 명시적, 복원 가능, guard/gate 분리 | 단순, git-friendly, 학습 곡선 낮음 |
| 대가 | 607 함수 복잡도, 485 stars | 긴 세션에서 상태 손실 가능 (CE Gap) |

**판정**: CE가 "stateless docs-based도 충분히 작동한다"를 13.7K stars로 증명. bkit의 FSM은 정교하지만 복잡도-채택 역설.
**하네스 방향**: Stateless 시작 → 필요 증명 시 FSM 요소 점진 도입.

### M2. 프로세스 강제 — Skip 불가 vs 자율 조절

| | Superpowers | CE |
|---|-------------|-----|
| 접근 | 7-Stage Pipeline, skip 불가, 1% 규칙 | Right-Size Ceremony, 스킬이 scope를 자율 판단 |
| 근거 | LLM은 규칙을 회피하므로 강제 필요 | 작은 작업에 과도한 프로세스는 마찰 |

**판정**: 둘 다 맞다. SP는 "왜 강제해야 하는가"를, CE는 "언제 완화해야 하는가"를 증명.
**하네스 방향**: Iron Laws (절대 규칙)는 강제 + scope matching (절차 수준)은 자율 조절.

### M3. 스킬 크기 — Token Efficiency vs Rationalization Defense

| | SP 목표 | SP 실제 |
|---|---------|---------|
| 기준 | frequently-loaded <200 words | brainstorming 1,553w (**7.8x**), TDD 1,496w (**7.5x**) |
| 원인 | 합리화 방어 (Red Flags, 합리화 테이블, 루프홀 차단)를 넣으면 단어 폭증 |

CE의 해법: Script-First (65% 절감) — 복잡한 로직을 스크립트로 위임.

**판정**: SP 스스로 정한 기준을 14개 중 11개가 위반. 두 목표가 구조적으로 충돌.
**하네스 방향**: Script-First로 토큰 절감 + 합리화 방어는 lazy loading (위반 감지 시에만 로드).

### M4. Hook 의존도 — Full Utilization vs Zero Usage

| | bkit | CE |
|---|------|-----|
| Hook 사용 | 21 events 완전 활용 | ❌ 미사용 |
| 장점 | 자동화 극대화 | 플랫폼 독립 (10 targets) |
| 대가 | Claude Code 종속 | 자동 트리거 제한 |

**판정**: multi-platform이면 hook 의존 최소화가 유리. single-platform이면 hook 극대화가 효과적.
**하네스 방향**: 핵심 hook (SessionStart, PreToolUse) 활용 + 나머지는 선택적.

---

## 4. 공백 지도 — 3개 프로젝트 모두 부족한 영역

| Gap | 현황 | 왜 중요한가 |
|-----|------|-------------|
| **합리화 방어 + Token Efficiency 양립** | SP만 합리화 방어 구현했지만 token 기준 위반. CE는 token 절감했지만 합리화 방어 없음 | 둘 다 해결한 프로젝트 없음 |
| **Structured Rollback** | bkit만 checkpoint 있음, SP/CE는 git commit 수준 | 실행 중 실패 시 안전한 복원 |
| **Cost Observability** | SP만 비용 언급 ($0.07-0.09/agent). bkit/CE는 수치 없음 | 비용 최적화의 전제 |
| **Real-time Feedback Loop** | 3개 모두 사후 평가 위주. 실행 중 조기 차단/방향 전환 약함 | 비용 절감 + 품질 향상 |
| **User Preference Learning** | 3개 모두 정적 config. 사용자 행동 기반 자동 조절 없음 | 개인화된 에이전트 경험 |

---

## 5. 통합 우선순위 — 하네스 설계에 적용할 순서

### Tier 1 — 기반 (Foundation)

| # | 패턴 | 출처 | 근거 |
|---|------|:----:|------|
| 1 | **SessionStart Bootstrap** | SP·bkit | 세션 시작 시 규칙 주입. 모든 것의 전제. |
| 2 | **Guardrail-as-Code** | bkit·SP | 파괴적 작업 사전 차단. 안전의 기반. |
| 3 | **Controller + Workers** | SP·bkit·CE | 3/3 수렴. 에이전트 아키텍처의 핵심. |
| 4 | **불신 기반 리뷰** | SP·bkit·CE | 3/3 수렴. 구현자 ≠ 검증자 구조적 강제. |
| 5 | **Script-First Architecture** | CE | 65% 토큰 절감. SKILL.md 크기 제어. |
| 6 | **Self-Contained Skills** | CE·SP | 스킬 독립성. 의존성 제거. |
| 7 | **4-Status Escalation** | SP·bkit·CE | DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED. 서브에이전트 인터페이스. |

### Tier 2 — 품질 (Quality Layer)

| # | 패턴 | 출처 | 근거 |
|---|------|:----:|------|
| 8 | **합리화 방어** | SP | 유일한 구현이지만 **bkit·CE 모두 Gap으로 인식**. 필수. |
| 9 | **Confidence Calibration** | CE | per-finding 신뢰도. False positive 억제. |
| 10 | **Model Tiering** | SP·bkit·CE | 3/3 수렴. 비용 최적화. |
| 11 | **Knowledge Compounding** | CE | 유일한 지식 축적. 장기 차별화. |
| 12 | **Contract Tests on Prose** | CE | SKILL.md drift 방지. 프롬프트 품질 보장. |
| 13 | **Two-Tier Output** | CE | Full(disk) + Compact(memory). Context window 보호. |
| 14 | **Config-Driven Thresholds** | bkit | 임계값 하드코딩 금지. 환경별 유연성. |

### Tier 3 — 성숙 (Maturity Layer)

| # | 패턴 | 출처 | 근거 |
|---|------|:----:|------|
| 15 | **Right-Size Ceremony** | CE | 스킬별 scope matching. 마찰 감소. |
| 16 | **4-Way Autofix Classification** | CE | 자동 수정 범위 구조화. |
| 17 | **Audit Trail** | bkit | Action log + Decision trace. 투명성. |
| 18 | **Skill Lifecycle Management** | bkit | Workflow/Capability 분류 + Parity Test. |
| 19 | **Context Compaction Defense** | bkit | PreCompact/PostCompact. 긴 세션 안정성. |
| 20 | **Progressive Automation** | bkit | L0-L4 단순화 (L0/L2/L4 3단계 시작). |
| 21 | **Pressure Testing** | SP | 스킬 성숙 후 3+ 압력 조합 검증. |
| 22 | **Multi-Platform Converter** | CE·SP | 초기 Claude Code 전용, 확장 시 converter IR. |
| 23 | **Beta Suffix Framework** | CE | 안전한 실험 + promotion. |
| 24 | **Persuasion Principles** | SP | 고급 프롬프트 설계 시 적용. |

---

## 6. 3개 프로젝트가 함께 증명한 것

| # | 명제 | 증거 |
|---|------|------|
| 1 | **LLM에게 프로세스를 강제할 수 있다** | SP 142K stars, CE 13.7K stars — 올바른 프롬프트 설계로 검증 |
| 2 | **구현자 ≠ 검증자는 보편 원칙이다** | 3/3 독립적으로 같은 결론에 도달 |
| 3 | **모든 작업에 최고 모델은 낭비다** | 3/3 모두 역할/복잡도별 모델 분배 구현 |
| 4 | **스킬도 테스트 가능한 코드다** | SP(headless), bkit(eval), CE(contract) — 방법은 다르지만 모두 구현 |
| 5 | **Controller가 컨텍스트를 큐레이션해야 한다** | 서브에이전트에게 자율 탐색을 시키는 프로젝트 = 0 |
| 6 | **세션 초기화가 전제조건이다** | SP/bkit: hook, CE: `!` command — 방법 다르지만 목표 동일 |
| 7 | **파괴적 작업 차단은 선택이 아니다** | SP(Iron Laws), bkit(Guardrail-as-Code) — CE는 이것이 Gap |
| 8 | **복잡도는 채택의 적이다** | bkit 4,028TC/485stars vs SP 3-Layer/142K stars |

---

## 7. 하네스 설계 원칙 (3개 프로젝트에서 도출)

| # | 원칙 | 근거 |
|---|------|------|
| 1 | **Safety First** | Guardrail + Iron Laws 먼저, 기능은 그 다음 (SP·bkit) |
| 2 | **Distrust by Structure** | 구현과 검증을 구조적으로 분리 (SP·bkit·CE) |
| 3 | **Earn, Don't Assume** | 자동화는 실적으로 획득, 기본값은 수동 (bkit) |
| 4 | **Compound Knowledge** | 해결한 문제를 축적하고 재투입 (CE) |
| 5 | **Token Budget is Real** | Script-First + Lazy Loading, 프롬프트 비대화 방지 (CE·SP) |
| 6 | **Test the Prose** | 프롬프트도 코드처럼 테스트 (SP·bkit·CE) |
| 7 | **Right-Size Everything** | 작업 규모에 맞는 ceremony. 과도한 프로세스 = 마찰 (CE) |
| 8 | **Controller Curates** | 서브에이전트에게 탐색을 시키지 않고 컨텍스트를 구성하여 전달 (SP·bkit·CE) |
| 9 | **Escalate, Don't Struggle** | 확실하지 않으면 무리하지 않는 메커니즘 (SP·bkit·CE) |
| 10 | **Start Simple, Grow Proven** | Stateless → FSM, 단순 → 정교, 필요 증명 시만 복잡도 추가 (bkit 역설) |
