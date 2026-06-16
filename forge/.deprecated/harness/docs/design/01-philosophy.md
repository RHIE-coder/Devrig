# Design Philosophy

> 하네스의 모든 설계 결정은 이 원칙들로부터 도출된다.

---

## 1. 설계 원칙 (10가지)

3개 프레임워크(Superpowers 142K★, bkit 485★, Compound Engineering 13.7K★) 교차 분석에서 도출.

> **표기법 — `N/M` 수렴도**
> 각 원칙의 "근거"에 등장하는 `3/3`, `2/3` 등은 **분석한 3개 프레임워크 중 해당 원칙을 독립적으로 채택한 프레임워크 수**를 뜻한다.
> - `3/3` = Superpowers · bkit · Compound Engineering 모두 동일 결론 (가장 강한 수렴 신호)
> - `2/3` = 3개 중 2개가 채택 (중간 수렴, 나머지 1개는 Gap 또는 다른 접근)
> - 원칙별 근거 라인에 채택 프레임워크 이름이 명시된다.


### P1. Safety First — 안전이 먼저, 기능은 그 다음

> 근거: Superpowers(Iron Laws) · bkit(Guardrail-as-Code) — 2/3이 파괴적 작업 차단을 최우선으로 구현. CE는 이것이 Gap.

**의미:**
- Guardrail과 Iron Laws를 먼저 구축하고, 그 위에 기능을 쌓는다.
- Safety Layer는 Config으로도 비활성화할 수 없다.
- 파괴적 작업(rm -rf, force push, 프로덕션 배포)은 구조적으로 차단한다.

**하네스 적용:**
- Layer ①(Safety)은 모든 레이어의 기반이자 최우선 실행 대상
- PreToolUse Hook으로 결정론적 차단 (LLM 판단에 의존하지 않음)
- 사용자가 "끄겠다"고 해도 Safety Hook은 끌 수 없음

### P2. Distrust by Structure — 구현과 검증의 구조적 분리

> 근거: Superpowers · bkit · CE — **3/3 독립적으로 동일 결론** 도달. 가장 강한 수렴 패턴.

**의미:**
- 구현한 에이전트가 자신의 결과를 검증하면 안 된다.
- 리뷰는 별도의 에이전트가, 별도의 관점(보안/성능/품질/Spec 준수)에서 수행한다.
- 이것은 원칙이 아니라 **구조**다 — 같은 에이전트가 두 역할을 맡는 것이 물리적으로 불가능해야 한다.

**하네스 적용:**
- implementer 에이전트와 reviewer 에이전트는 별도 정의, 별도 컨텍스트
- /harness:review 스킬은 /harness:implement와 다른 에이전트 풀을 사용
- 복수 reviewer가 독립적으로 판단 후 Controller가 종합

### P3. Spec is the Source of Truth — 코드는 blackbox, Spec이 기준

> 근거: 사용자 요구사항. CE(R-ID tracing) 패턴으로 추적성 보장.

**의미:**
- 기능의 정의, 검증 기준, 완성 판단은 모두 Spec에서 나온다.
- 코드가 "돌아가는지"가 아니라 "Spec을 충족하는지"가 판단 기준.
- Spec이 없으면 Test도, Plan도, Code도 존재할 이유가 없다.

**하네스 적용:**
- Spec 없이 /harness:implement 불가 (Gate 강제)
- 모든 acceptance criteria는 testable해야 함 (Spec 승인 조건)
- QA는 Spec의 acceptance criteria를 전수 검증

### P4. Test Before Code — 테스트가 구현보다 먼저

> 근거: Superpowers(TDD for Everything) — 코드/스킬/계획/완료 주장까지 모두 RED-GREEN-REFACTOR. 사용자 요구의 핵심.

**의미:**
- 구현 전에 Spec에서 Test를 도출한다.
- Test가 FAIL하는 상태에서 시작하여 구현으로 PASS시킨다.
- "테스트가 있다"와 "테스트가 신뢰할 수 있다"는 다르다 — 테스트 유효성도 검증한다.

**하네스 적용:**
- /harness:implement의 첫 단계는 Test skeleton 생성 (모두 FAIL 상태)
- Test Strategist 에이전트가 테스트 유효성 검증 (빈 assert 금지, edge case 커버)
- 각 구현 step 후 해당 test + 기존 test 모두 실행 (side-effect 감지)

### P5. Controller Curates — 서브에이전트에게 탐색을 시키지 않는다

> 근거: Superpowers · bkit · CE — **3/3 수렴**. 서브에이전트에게 자율 탐색을 맡기는 프로젝트 = 0.

**의미:**
- Controller(스킬)가 컨텍스트를 구성하여 서브에이전트에게 전달한다.
- 서브에이전트는 주어진 컨텍스트 안에서 전문 역할만 수행한다.
- "알아서 찾아서 해라"는 금지.

**하네스 적용:**
- 각 Skill이 Controller 역할 — Spec/Plan/Config을 읽고 에이전트에게 전달
- 에이전트는 도구 제한 + 컨텍스트 범위 제한을 받음
- explorer만 탐색 권한을 가지며, 그 결과를 Controller가 가공하여 다른 에이전트에 전달

### P6. Earn, Don't Assume — 자동화는 실적으로 획득

> 근거: bkit(Progressive Automation L0-L4) — 유일한 신뢰 기반 자동화.

**의미:**
- 처음에는 모든 것을 강제하고 확인한다.
- 반복적으로 성공이 증명된 패턴만 점진적으로 자동화한다.
- 기본값은 항상 "수동 확인".

**하네스 적용:**
- 기본 Right-Size는 `large` (전 단계 필수)
- 프로젝트가 성숙하면 Config에서 절차 완화 가능
- 하지만 Iron Laws(P1)는 성숙도와 무관하게 영구 강제

### P7. Token Budget is Real — 프롬프트 비대화 방지

> 근거: CE(Script-First, 65% 절감) · Superpowers(200단어 기준, 실제 7.8배 초과).

**의미:**
- 토큰 예산은 실제 비용이고 품질에 직결된다.
- 복잡한 로직은 스크립트로 위임한다 (Script-First).
- 합리화 방어 같은 필수 방어는 Lazy Loading으로 필요 시에만 로드한다.

**하네스 적용:**
- Skill SKILL.md는 오케스트레이션 지시만 (~200줄 이하 목표)
- 결정론적 검증은 scripts/로 위임 (Hook command 타입, 토큰 0)
- 에이전트에게 전달하는 컨텍스트는 Controller가 가공하여 최소화

### P8. Right-Size Everything — 작업 규모에 맞는 ceremony

> **용어:** Right-Size = AC 수·파일 수로 small/medium/large를 판정하여 ceremony 깊이를 조절. Mode(on/off)와 직교. 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).
>
> 근거: CE(Right-Size Ceremony) · Superpowers(7-Stage 강제의 마찰) — 둘 다 맞지만 상충.

**의미:**
- 작은 작업에 과도한 프로세스를 강제하면 마찰이 된다.
- 하지만 프로세스를 건너뛰면 LLM이 합리화한다.
- 해결: **Iron Laws는 강제 + 절차 수준은 규모에 따라 조절**.

**하네스 적용:**
- Config의 `workflow.right_size` 설정으로 small/medium/large 절차 차등
- 단, Spec→Test→Plan 순서와 구현자≠검증자는 규모와 무관하게 강제
- 자동 규모 판단: 변경 파일 수, 영향 범위, 기능 복잡도

### P9. Escalate, Don't Struggle — 무리하지 않는 메커니즘

> 근거: Superpowers · bkit · CE — 3/3 수렴. DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED 프로토콜.

**의미:**
- 에이전트가 확신 없이 진행하는 것이 가장 위험하다.
- 모르면 멈추고 에스컬레이션한다.
- "나쁜 결과물 > 결과물 없음"이 아니라, "정직한 에스컬레이션 > 불확실한 결과물".

**하네스 적용:**
- 모든 에이전트에 4-Status 에스컬레이션 프로토콜 내장
- Confidence < 임계값이면 자동 에스컬레이션
- Controller가 에스컬레이션을 받아 재배분 또는 사용자 질문

### P10. Start Simple, Grow Proven — 복잡도는 필요 증명 후에만

> 근거: bkit(FSM 607함수, 485★) vs Superpowers(Stateless, 142K★) — 복잡도는 채택의 적.

**의미:**
- 단순한 구현에서 시작하고, 복잡도는 필요가 증명된 후에만 추가한다.
- Stateless에서 시작하여 필요 시 상태 관리를 도입한다.
- 하네스 자체의 아키텍처도 이 원칙을 따른다.

**하네스 적용:**
- 초기: 파일 기반 상태 관리 (.harness/state/)
- 성숙 시: 필요 증명되면 FSM 요소 점진 도입
- 모든 새 기능은 가장 단순한 형태로 먼저 구현

---

## 1.5 상위 렌즈 — 구성요소는 모델 한계의 거울 (2026-Q1 업계 수렴)

> *"Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing."*
> — Hari Rajasekaran, Anthropic (2026-03)

P1–P10 은 3개 프레임워크(Superpowers · bkit · CE) 수렴에서 도출된 **내부** 원칙이다. 2026-Q1 Anthropic·OpenAI 공개 글은 여기에 **외부 수렴 신호**를 더한다: **"하네스의 구성요소 각각은 모델의 어떤 한계를 가정하고 있다"** 는 진술이 양사에서 독립 도출됐다. 이 관점은 P1–P10 위에 얹히는 **메타 렌즈**다.

### 1.5.1 의미

하네스의 모든 스크립트·hook·ceremony 는 **"모델이 이걸 혼자 잘 못 하니까"** 라는 묵시적 가정 위에 서 있다. 그 가정이 유효한 동안에만 존재 가치가 있다. 모델이 성숙해 가정이 깨지면 **구성요소는 제거되어야 한다** — 남겨두면 모델의 판단력을 짓누르는 bloat 이 된다.

### 1.5.2 본 프로젝트 가정 맵 (요약)

> 전체 표: [insights/industry-harness-engineering/01 §A](../insights/industry-harness-engineering/01-patterns-distilled.md#a-단순화-원칙-anthropic-핵심-공리)

| 구성요소 | 가정된 모델 한계 | 불필요해질 시점 |
|---|---|---|
| `gate-check.mjs` (spec→plan→impl 순서 강제) | 모델이 spec 없이 구현을 시도함 | 모델이 스스로 "spec 먼저"를 고집할 때 |
| `qa-attribution.json` bottom-up 귀인 | evaluator 가 자기 범위 밖 실패를 잘못 짚음 | evaluator 가 stack 전체를 정확히 귀인할 때 |
| `mock_guard.strict_lower_real` | 모델이 쉬운 mock 에 편향됨 | 모델이 real vs mock 의 coverage 의미를 균형있게 판단할 때 |
| Right-Size 매트릭스 | 모델이 작업 규모를 과대/과소 평가 | 모델이 자체 scope 판단을 신뢰할 수 있을 때 |
| Escape Hatch `--bypass-*` | 모델이 긴급 상황에서도 규칙 고수로 deadlock | 모델이 상황 판단해 자가 bypass 가능할 때 |

### 1.5.3 설계·리뷰 의무

이 렌즈는 **설계 리뷰 체크리스트 항목**으로 승격된다:

1. **가정 명시** — 새 스크립트/hook/ceremony 를 추가할 때 **파일 헤더 주석 1줄**로 "이 구성요소가 가정하는 모델 한계" 를 명시한다. PR 리뷰 게이트.
2. **주기 재검토** — 분기별 `/harness:sync --schedule weekly` (→ audit 이벤트 `assumption_review`) 로 가정 목록을 훑어 retired 된 가정을 `config.harness.retired_assumptions[]` 에 기록한다.
3. **단순화 경로** — retired 가정에 연결된 구성요소는 **즉시 제거 후보**. "혹시 모르니 남기자" 를 허용하지 않는다 — bloat 은 모델 판단력 손실 비용이다.

### 1.5.4 P1–P10 과의 관계

| 원칙 | 메타 렌즈로 본 의미 |
|---|---|
| P1 Safety First | 가정: 모델이 파괴적 작업을 무분별 실행 가능 (모델 정렬 개선 전까지 유효) |
| P2 Distrust by Structure | 가정: 구현자가 자기 검증에서 bias (가장 오래 유효할 가정 — 구조적 근거) |
| P4 Test Before Code | 가정: 모델이 "done" 판단에서 낙관 편향 (TDD red-green 은 이를 강제) |
| P7 Token Budget | 가정: 프롬프트 비대화가 모델 출력 품질을 해침 (컨텍스트 창 확대로 완화 중) |
| P10 Start Simple | 가정: 초기 과다 설계는 되돌리기 어려움 (영원히 유효) |

→ 모든 원칙의 **"언제까지 유효한가"** 를 이 렌즈로 물을 수 있어야 한다. 영원한 원칙(P1, P2, P10)과 시한부 원칙(P7 등)을 구분하면 하네스가 자체 진화 가능한 시스템이 된다.

---

## 2. Iron Laws — 절대 규칙

Config, 사용자 요청, 어떤 수단으로도 비활성화할 수 없는 규칙.

| # | Iron Law | 근거 |
|---|----------|------|
| IL-1 | **Spec 없이 Implement 불가** | P3 (Spec is Source of Truth) |
| IL-2 | **Plan 없이 Implement 불가** | P3 + 방향 없는 구현은 품질 보장 불가 |
| IL-3 | **Test 없이 QA 불가** | P4 (Test Before Code) |
| IL-4 | **QA PASS 없이 Deploy 불가** | P1 (Safety First) |
| IL-5 | **구현자 ≠ 검증자** | P2 (Distrust by Structure) |
| IL-6 | **파괴적 작업 구조적 차단** | P1 (Safety First) |
| IL-7 | **빈 문서 금지** | Spec이 있으면 Test와 Plan도 실체가 있어야 함. **적용 범위: Standard 모드만.** Prototype/Explore에서는 Spec 자체가 없으므로 IL-7 조건이 성립하지 않는다. Prototype→Standard 승격 시 `/harness:sync --promote`가 Spec·Test·Plan을 동시에 생성하므로 "Spec만 있고 나머지 없음" 상태는 발생하지 않는다 |

---

## 3. 트레이드오프 결정

인사이트 분석에서 도출된 모순 지점과 하네스의 선택.

### T1. 프로세스 강제 vs 마찰 감소

| 선택지 | 대표 | 장점 | 단점 |
|--------|------|------|------|
| 전 단계 강제 | Superpowers | LLM 합리화 차단 | 작은 작업에 과도한 마찰 |
| 자율 조절 | CE | 유연, 마찰 적음 | 프로세스 건너뛰기 위험 |

**하네스 결정:** Iron Laws(P1)는 강제 + 절차 수준(P8)은 Right-Size 조절.
→ "무엇을 해야 하는가"는 강제, "얼마나 깊이 하는가"는 유연.

### T2. 토큰 효율 vs 합리화 방어

| 선택지 | 대표 | 장점 | 단점 |
|--------|------|------|------|
| 합리화 방어 (프롬프트에 Red Flag 테이블 등 삽입) | Superpowers | LLM 규칙 회피 차단 | 토큰 폭증 (7.8배 초과) |
| Script-First (로직을 스크립트로 위임) | CE | 65% 토큰 절감 | 합리화 방어 부재 |

**하네스 결정:** Script-First(P7)로 토큰 절감 + 합리화 방어는 Hook(결정론적)으로 구현.
→ LLM에게 "하지 마라"고 쓰는 대신, Hook으로 물리적으로 차단한다. LLM이 합리화할 기회 자체를 없앤다.

### T3. 상태 관리 — FSM vs Stateless

| 선택지 | 대표 | 장점 | 단점 |
|--------|------|------|------|
| Declarative FSM | bkit (607함수) | 전이 규칙 명시, 복원 가능 | 복잡도 → 채택 저조 |
| Stateless | SP/CE | 단순, git-friendly | 긴 세션 상태 손실 |

**하네스 결정:** Stateless 파일 기반(.harness/state/)에서 시작(P10). Gate 검증은 Hook의 파일 존재 확인으로 충분.
→ FSM이 필요해지는 시점이 증명되면 그때 도입.

### T4. Hook 의존도

| 선택지 | 대표 | 장점 | 단점 |
|--------|------|------|------|
| Hook 완전 활용 (21개 이벤트) | bkit | 자동화 극대화 | Claude Code 종속 |
| Hook 미사용 | CE | 플랫폼 독립 | 자동 트리거 제한 |

**하네스 결정:** 핵심 Hook 활용(SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) + 나머지 선택적.
→ 초기 타겟이 Claude Code이므로 Hook 활용이 합리적. 추후 멀티플랫폼 시 converter 레이어 도입(P10).

---

## 4. 유저 주권 (User Sovereignty)

하네스는 강하게 강제하되, 아래 영역은 유저 취향을 존중한다:

| 영역 | 하네스 강제 | 유저 자유 |
|------|-----------|---------|
| **워크플로우 순서** | Spec→Test→Plan→Code 순서 | 건너뛸 수 있는 단계(brainstorm, architect) |
| **코드 구조** | .harness/ 내부 구조 | src/, tests/ 등 코드 디렉토리 구조 |
| **디자인 패턴** | 없음 (하네스가 패턴을 강제하지 않음) | Clean Architecture, Hexagonal, 자유 선택 |
| **UI/UX 스타일** | 접근성 기본 원칙 | Material, Apple HIG, 커스텀 |
| **에이전트 선택** | 기본 역할 에이전트 제공 | 유저가 페르소나/전문가 에이전트 생성 |
| **모델 선택** | 역할별 기본 추천 | Config에서 오버라이드 가능 |
| **프롬프트 파이프라인** | 기본 활성 | 자동변환/피드백 개별 on/off |
| **Right-Size** | Iron Laws는 영구 | 절차 수준은 Config으로 조절 |

핵심: **"무엇을 해야 하는가"는 하네스가 결정하고, "어떻게 하는가"는 유저가 결정한다.**

---

## 5. 세 가지 모드 — Standard / Prototype / Explore

### 문제

Iron Laws는 품질을 보장하지만, 모든 상황이 "배포 가능한 제품 개발"은 아니다:

- **실험:** 아이디어 검증, 기술 탐색, PoC — 전체 SDLC가 과도한 마찰
- **탐색·QnA:** 코드 이해, 아키텍처 문의, 디버깅 조언 — 하네스 오케스트레이션이 전혀 필요 없음

### 해결: 3개 모드

```yaml
# .harness/config.yaml
workflow:
  mode: standard    # standard | prototype | explore
```

| 항목 | Standard | Prototype | Explore |
|------|:--------:|:---------:|:-------:|
| Spec 필수 | ✅ | ❌ | ❌ |
| Plan 필수 | ✅ | ❌ | ❌ |
| Test-First | ✅ | ❌ | ❌ |
| Review | ✅ | ❌ | ❌ |
| Gate 검증 (Spec/Plan 존재) | ✅ | ❌ | ❌ |
| Prompt Quality Pipeline | ✅ | ✅ | ❌ |
| Safety (rm -rf 차단 등) | ✅ | ✅ | ✅ |
| Code 수정 | ✅ | ✅ | ⚠️ 기본 read-only<sup>*</sup> |
| **Deploy 가능** | ✅ | ❌ | ❌ |

<sup>*</sup> Explore 모드에서 코드 수정이 필요하면 명시적으로 Prototype/Standard로 전환하거나 `allow_edit: true` 설정.

**모드별 용도:**

| 모드 | 용도 | 전형적 사용 |
|------|------|------------|
| `standard` | 배포 가능 제품 개발 | 기능 추가, 리팩토링, 프로덕션 릴리스 |
| `prototype` | 빠른 실험 | PoC, 기술 탐색, 아이디어 검증 |
| `explore` | QnA·학습·디버깅 조언 | "이 함수 설명해줘", "왜 이렇게 느릴까", 아키텍처 이해 |

**Explore 모드 상세:**
- UserPromptSubmit hook의 gate-engine과 quality-check는 **early-exit** (§아래 quality-check 설계 참조)
- `/harness:*` 스킬 호출 자체가 없으면 하네스는 거의 투명. Claude Code 본연의 QnA로 동작
- **"기본 read-only"의 강제 메커니즘:** Explore 모드에서는 `session-start-context.mjs`가 스킬 카탈로그를 주입하지 않으므로 Claude가 `/harness:implement` 등을 자율 호출하지 않는다. 다만 유저가 직접 Edit/Write를 요청하면 **하네스는 차단하지 않는다** — Explore의 read-only는 "오케스트레이션 미주입으로 인한 기본 동작"이지 "Hook에 의한 하드 차단"이 아니다. 코드 수정이 필요하면 mode 전환을 권장하되, `config.explore.allow_edit: true`로 명시 허용 가능
- 유저가 코드 편집을 시작하면 경고: "Explore 모드에서 편집은 권장되지 않습니다. `/harness:init` 또는 mode 전환 후 진행하세요."

### Prototype → Standard 전환 (승격)

Prototype 코드를 프로덕션으로 올리려면 반드시 Standard로 전환해야 한다:

```
/harness:sync --promote 실행:
  Phase 1 (Promotion Context — Gate 미적용):
   ├── Prototype 코드에서 Spec 역추출 (초안)
   ├── Spec에서 Test skeleton 생성
   └── Plan 생성 (리팩토링 계획)
  Phase 2: 유저 검토 + 승인 → mode: standard 전환
  Phase 3 (Gate 적용 시작):
   └── /harness:implement → /harness:review → /harness:qa → /harness:deploy
```

**핵심:** 빠르게 만드는 것은 허용하되, 배포 게이트만은 반드시 지킨다. Prototype은 "실험"이고, Standard를 거쳐야 "제품"이 된다. **순환 의존 회피:** sync --promote의 Phase 1은 Spec/Plan/Test를 *생성하는* 과정이므로 Gate를 적용하지 않는다. Phase 3에서 Standard 전환 후부터 Gate가 적용된다. 역추출된 Spec은 "초안"이며 유저 승인 전까지 유효하지 않다 (P3 유지).

### /harness:sync — 코드-문서 동기화

Prototype 전환뿐 아니라, Standard 모드에서도 유저가 코드를 직접 수정한 경우에 사용:

```
/harness:sync
├── git diff로 마지막 하네스 관리 커밋 이후 변경 감지
├── 변경된 코드 ↔ 기존 spec 비교
├── 괴리 항목 리포트:
│   "auth/login: 새 파라미터 remember_me 추가됨 → spec에 미반영"
│   "payment/checkout: 함수 삭제됨 → spec AC-003 더 이상 유효하지 않음"
├── Spec 자동 업데이트 제안 (유저 확인 후 적용)
└── Test 갱신 필요 시 안내
```

SessionStart Hook에서 코드 변경을 감지하여 `/harness:sync` 실행을 안내한다.
