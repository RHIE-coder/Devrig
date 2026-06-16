# Workflow

> 세 가지 도메인의 워크플로우, 게이트, Sprint 루프 상세.
>
> **반복 등장 용어:** `AC`(Acceptance Criteria — Spec의 testable 조건, coverage.json이 AC↔step↔test 추적), `Right-Size`(AC·파일 수로 small/medium/large 판정 → ceremony 깊이 조절). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 0. Intent → Skill 라우팅

유저의 자연어 입력을 어느 `/harness:*` 스킬로 연결할지 결정하는 레이어.

### 0.1 세 가지 호출 경로

| # | 경로 | 동작 | 우선순위 |
|---|------|------|---------|
| **A** | 유저 명시 호출 | 유저가 `/harness:spec auth/login` 직접 입력 | 최우선. 항상 이 경로가 채택됨 |
| **B** | Claude 자동 호출 | Claude Code가 skill description 매칭으로 자율 호출 | A가 없을 때. skill description 품질에 의존 |
| **C** | Router 제안 | 하네스 Router가 "지금 /harness:plan 단계가 맞아 보인다"고 확인 프롬프트 | B가 실패/모호할 때 + mode != explore 일 때 |

### 0.2 Router 동작 (경로 C 상세)

Router는 별도 에이전트가 아니라 **SessionStart hook이 주입하는 상태 기반 라우팅 규칙**이다:

```
SessionStart → scripts/state/route-hint.mjs
  │
  ├── workflow.json 읽기: 현재 phase, 통과한 gate
  │
  ├── 다음 단계 추론:
  │   ├── spec 통과, plan 미통과 → "다음: /harness:plan"
  │   ├── plan 통과, implement 미통과 → "다음: /harness:implement"
  │   ├── implement 통과, review 미통과 → "다음: /harness:review"
  │   └── ...
  │
  └── additionalContext로 힌트 주입:
      "현재 워크플로우 상태로는 /harness:plan 단계입니다.
       다른 작업을 원하시면 무시하세요."
```

**Router가 강제하지 않는 이유:**
- 유저가 진짜 원하는 게 항상 "다음 단계"는 아님 (이전 단계 재작업, 새 feature 시작 등)
- 힌트는 additionalContext로 주입 → Claude가 문맥 따라 활용/무시 판단
- Iron Laws는 여전히 Gate로 강제되므로 Router가 실패해도 안전

### 0.3 mode별 라우팅 동작

| mode | A (명시) | B (Claude 자동) | C (Router 힌트) |
|------|:-------:|:--------------:|:---------------:|
| `standard` | ✅ | ✅ | ✅ |
| `prototype` | ✅ | ✅ | 제한적 (Implement만 힌트) |
| `explore` | ✅ | ❌ (description 로드 안 됨) | ❌ |

Explore 모드에서는 스킬 description을 아예 로드하지 않아 Claude가 자동 호출하지 않는다 (토큰 절감 + QnA 마찰 최소화).

### 0.4 Mode 설정 방식

> mode는 **유저가 명시적으로 결정**하는 것이 기본이다.
> 자동 감지(auto)는 opt-in으로 제공되지만, 적용 범위가 엄격히 제한된다.

#### 0.4.1 mode 확정 경로 — 3가지

| 경로 | 시점 | 동작 | 비고 |
|------|------|------|------|
| **수동 지정 (기본)** | `/harness:init --mode <x>` 또는 config.yaml 직접 편집 | 유저가 명시 지정 | 가장 안전. 권장 |
| **대화형 질문** | `/harness:init` 에서 mode 미지정 | 대화형 질문으로 유저에게 물어서 결정 | init 단계에서만 |
| **Auto-Detect (opt-in)** | config.yaml: `workflow.mode: auto` | 아래 §0.4.2 참조 | 제한적 자동 판정 |

#### 0.4.2 Auto-Detect 동작 범위 (opt-in)

`config.workflow.mode: auto` 설정 시에만 동작. **유효 실행 경로는 단 하나:**

```
조건: config.workflow.mode == "auto"
      AND workflow.json에 session.mode가 아직 확정되지 않음 (첫 세션)

실행: SessionStart → determine-mode.mjs
  ├── 신호 수집 (브랜치명, spec 유무, config 힌트)
  ├── 결정론적 규칙 평가 (위→아래 첫 매치):
  │   RULE-MODE-EXPLORE-001: spec 없음 + 브랜치가 main/develop
  │   RULE-MODE-PROTOTYPE-001: 실험 브랜치 + spec 부재
  │   RULE-MODE-STANDARD-DEFAULT: fallthrough (가장 엄격)
  ├── 결과를 workflow.json에 기록
  └── audit: mode_auto_detected emit

이후 세션: workflow.json에 mode가 이미 확정 → determine-mode.mjs는 no-op
```

**왜 이 범위인가:**
- `narrow_only`: standard에서 아래로 자동 전환 → **금지** (게이트가 조용히 풀림)
- `promotion_requires_user`: 아래에서 standard로 승격 → **`/harness:sync --promote` 또는 `/harness:mode set` 만 가능**
- `session_start_only`: 세션 중간 재분류 → **금지** (진행 중 워크플로우 파손)

이 3규칙을 모두 적용하면, **auto가 작동하는 시점은 "아직 mode가 확정되지 않은 최초 세션"뿐**이다. 이것이 의도된 설계다.

> **기존 "SessionStart에서 프롬프트 분석 → 제안"은 삭제.** SessionStart 시점에는 유저 입력이 없으므로 프롬프트 분석 불가. 프롬프트 기반 감지(텍스트 패턴 매칭)는 오판 위험이 높아 제거. 대신 브랜치명·spec 유무 등 **파일시스템 신호만** 사용.

#### 0.4.3 mode 불일치 경고

```
[UserPromptSubmit Hook — gate-engine.mjs 내부]
  현재 mode: prototype
  프롬프트: "/harness:deploy"

  → 출력 (additionalContext):
    "현재 mode=prototype 입니다. Deploy는 Standard 모드에서만 가능합니다.
     /harness:sync --promote 로 Standard 승격 후 deploy하세요."
```

이것은 **자동 전환이 아닌 차단 + 안내**다. mode 변경은 항상 유저가 명시적으로 수행.

#### 0.4.4 설계 근거

- **상태 일관성**: mode 전환은 gate / quality pipeline / orchestration을 모두 바꾼다. 자동 전환은 진행 중 워크플로우를 파손할 수 있음
- **Iron Law 원칙**: "강제는 명시적으로, 편의는 제안으로" — mode 변경은 워크플로우 자체에 대한 결정이므로 명시적이어야 함
- **auto가 복잡하다면 수동이 낫다**: auto의 유효 경로가 "최초 세션 1회"뿐이므로, 대부분의 프로젝트에서는 init 시 수동 지정이 더 명확하다. auto는 mode 결정을 미루고 싶은 유저를 위한 편의 기능일 뿐

---

## 1. 도메인 B — 하네스 기반 개발 (메인 워크플로우)

### 1.0 세 설계 단계의 역할 분리 (Spec / Architect / Plan)

세 단계 모두 "설계"에 속하지만 **다루는 질문과 산출물이 다르다.** 섞이면 리뷰 단위·재사용성·회고 가능성이 무너진다.

| 단계 | 질문 | 관점 | 다루지 않는 것 | 산출물 | 게이트 |
|------|------|------|----------------|--------|--------|
| **Spec** (Phase 2) | **WHAT** — 무엇을 만드는가 | 사용자·제품 | 기술 스택·스키마·API 경로 | `specs/{domain}/{feature}.spec.yaml` (AC 리스트) | 모든 AC testable |
| **Architect** (Phase 3) | **HOW-system** — 시스템으로 어떻게 | 아키텍처·장기 유지보수 | 개별 함수·step 분해 | `decisions/{nnn}-{title}.md` (ADR) | medium+ 필수. SOLID·OWASP·유저 선호 |
| **Plan** (Phase 5) | **HOW-task** — 태스크로 어떻게 | 구현자·단기 실행 | "왜 필요한가"·"이 패턴이 옳은가" | `plans/{domain}/{feature}.plan.md` (step 리스트) | 모든 AC ↔ step 매핑 |

**데이터 흐름:**

```
Spec (AC) ──→ Architect (ADR) ──→ Plan (steps)
  │                ↑ medium+ 필수             │
  │                                           ↓
  └─────────→ Test Strategy (Phase 4) ──→ Code (TDD, Phase 6)
```

**예시 — `auth/login` 기능:**

```yaml
# Spec (WHAT) — 유저 관점
AC-001: "이메일+비밀번호 일치 시 JWT 발급"
AC-003: "5회 연속 실패 시 계정 30분 잠김"
```

```markdown
# Architect (HOW-system) — 003-auth-strategy.md
결정: 세션 대신 JWT(Access 15m + Refresh 7d) 사용.
이유: Stateless 확장성, 모바일 친화성. OWASP ASVS V3 준수.
대안 검토: 세션(Redis) — DB 의존성↑, 기각.
```

```markdown
# Plan (HOW-task) — login.plan.md
Step 1: POST /login 핸들러 스켈레톤 (tests/auth/login.test.ts AC-001)
Step 2: bcrypt 검증 + JWT 서명 (AC-001)
Step 3: rate-limit 미들웨어 + lockout 카운터 (AC-003)
```

**자주 하는 혼동:**

| 패턴 | 문제 | 바른 위치 |
|------|------|----------|
| Plan에 "JWT vs 세션" 판단 쓰기 | ADR 부재 → 회고·재사용 불가 | Architect |
| Spec에 `POST /api/v1/login` 쓰기 | 구현 강제, Architect 여지 상실 | Architect or Plan |
| medium 이상에서 Architect 건너뛰기 | Plan 간 일관성 붕괴 | Architect 강제 (Right-Size=medium+) |
| 하나의 문서에 AC·ADR·step 몰기 | 변경 범위 분리 불가, 리뷰 비대화 | 세 파일로 분리 |

> **핵심:** Spec은 *유저가 만족하는가*, Architect는 *시스템으로 지속 가능한가*, Plan은 *실제로 만들어지는가* — 세 번의 독립된 증명.

### 1.1 전체 흐름

```
Phase 0: Init ──────────────────────────────────────────────────
  /harness:init
  프로젝트 초기 구성.
  ├── .harness/ 생성, config 설정, 페르소나 세팅
  ├── .claude/rules/ 자동 생성 (하네스 규칙)
  ├── .claude/agents/ 페르소나 생성 (유저 선택 기반)
  └── CLAUDE.md 스킬 카탈로그 추가 (Compact 방어)
  ※ 프로젝트당 1회. 이후 반복하지 않음.
  ※ workflow.mode 선택: standard(기본) | prototype

Phase 1: Discovery (선택) ──────────────────────────────────────
  /harness:brainstorm
  아이디어 탐색, 문제 구체화, 해결점 명확화.
  기본 + 유저 페르소나 참여. 복수 관점에서 검토.
  ※ 이미 요구사항이 명확하면 건너뛸 수 있음.

Phase 2: Specification (필수 — 여기서부터 게이트 강제) ──────────
  /harness:spec
  기능 명세 + acceptance criteria + 필요 에이전트 식별.
  ├── Requirements Analyst: brainstorm 결과 → 구조화
  ├── Domain Expert (유저 생성): 도메인 특화 검증
  ├── Test Strategist: 모든 criteria가 testable한지 검증
  └── Devil's Advocate: Spec 빈틈 공격

  Output: .harness/specs/{domain}/{feature}.spec.yaml
  Gate: 모든 acceptance criteria가 testable → 승인

Phase 3: Design (Right-Size) ──────────────────────────────────
  /harness:architect — 소프트웨어 아키텍처
  /harness:ux — UI/UX 설계 (해당 시)
  ├── 하네스 범용 기준 적용 (SOLID, OWASP, 성능 원칙)
  ├── 유저 선호 적용 (config.yaml의 architecture/ux 섹션)
  └── 유저가 모르면 Best Practice 프리셋 제안

  Output: .harness/decisions/{nnn}-{title}.md
  ※ small 규모에서는 생략 가능 (Right-Size)

Phase 4: Test Strategy (필수) ──────────────────────────────────
  /harness:spec의 일부로 실행되거나 독립 단계
  ├── 각 acceptance criteria → test case 매핑
  ├── Edge case 식별
  ├── 커버리지 전략 (line/branch/condition 목표)
  ├── 테스트 유형 결정 (unit/integration/e2e)
  └── 테스트 유효성 전략 (빈 assert 금지, mutation 개념)

  Output: Spec 파일 내 test_strategy 섹션 또는 별도 문서
  Gate: 모든 acceptance criteria에 test case 매핑 완료

Phase 5: Planning (필수) ───────────────────────────────────────
  /harness:plan
  ├── Spec + Architecture → 태스크 분해
  ├── 각 태스크의 입력/출력/검증 기준 명시
  ├── 의존성 순서 정리
  ├── 각 단계가 "주니어가 따를 수 있을 만큼" 구체적
  └── Knowledge Layer 참조: 유사 문제 해결책 자동 인용

  Output: .harness/plans/{domain}/{feature}.plan.md
  Gate: Spec의 모든 acceptance criteria가 Plan에 매핑

Phase 6: Sprint (반복 — Agile Loop) ───────────────────────────
  /harness:implement → /harness:review → /harness:qa (반복)
  ※ 아래 §1.3 Sprint 상세 참조

Phase 7: Release ───────────────────────────────────────────────
  /harness:deploy
  ├── QA PASS 상태 확인 (Gate)
  ├── 배포 절차 실행
  └── 운영/유지보수 가이드 자동 생성

Phase 8: Sync (필요 시) ────────────────────────────────────────
  /harness:sync
  유저가 코드를 직접 수정한 경우 문서 재동기화.
  ├── git diff로 마지막 하네스 관리 커밋 이후 변경 감지
  ├── 변경 코드 ↔ 기존 spec 비교 → 괴리 리포트
  ├── Spec 자동 업데이트 제안 (유저 확인 후 적용)
  └── Test 갱신 필요 시 안내
  ※ SessionStart Hook이 코드 변경 감지 시 자동 안내

Phase 9: Iterate ───────────────────────────────────────────────
  Phase 1로 복귀.
  기존 Spec/Knowledge 기반으로 개선/확장.
  기존 기능의 Test는 Regression으로 보호.
```

### 1.2 게이트 (Gate) 정의

**Iron Law Gates — 설정으로 끌 수 없음:**

| Gate | 조건 | 차단 시 메시지 |
|------|------|-------------|
| G1: Spec → Implement | `.harness/specs/` 에 대상 spec 존재 | "Spec이 없습니다. `/harness:spec`으로 먼저 명세를 작성하세요." |
| G2: Plan → Implement | `.harness/plans/` 에 대상 plan 존재 | "Plan이 없습니다. `/harness:plan`으로 먼저 구현 계획을 작성하세요." |
| G3: Test → QA | `tests/` 에 spec과 매핑된 test 존재 | "Test가 없습니다. `/harness:implement`에서 Test-First로 진행하세요." |
| G4: QA → Deploy | `state/workflow.json` 에 qa.passed=true | "QA를 통과하지 못했습니다. `/harness:qa`를 먼저 실행하세요." |
| G5: 구현자 ≠ 검증자 | review 에이전트 ≠ implement 에이전트 | 구조적으로 다른 에이전트 사용 (위반 불가) |

**Configurable Gates — Right-Size에 따라 조절:**

| Gate | 기본값 | small | medium | large |
|------|--------|-------|--------|-------|
| Brainstorm 필수 | 선택 | 생략 | 생략 | 권장 |
| Architect 필수 | medium+ | 생략 | 필수 | 필수 |
| UX 필수 | UI 프로젝트만 | 생략 | 해당 시 | 해당 시 |
| Review 깊이 | standard | light | standard | deep |
| **Review PASS → QA** | 필수 | 필수 | 필수 | 필수 |
| **QA 테스트 매트릭스** (아래 상세) | standard | smoke+unit+sanity | +integration+regression | +e2e+load+stress+recovery |

> **Review PASS → QA:** 모든 규모에서 기본 필수이나 Iron Law가 아님 — `--bypass-review --reason "..."` 으로 우회 가능 (§1.9 Escape Hatch). Pair programming 등 대안 검증이 완료된 경우를 위한 설계. Iron Law Gates(G1~G5)와 달리 **구조적 강제가 아닌 정책 강제**.

**QA 테스트 매트릭스 — Right-Size별 필수/권장:**

| 테스트 유형 | 목적 (한 줄) | small | medium | large | 예시 상황 |
|------------|-------------|:-----:|:------:|:-----:|----------|
| **Unit** | 함수·클래스 단위 로직 검증 | ✅ 필수 | ✅ 필수 | ✅ 필수 | `bcrypt.compare()` 반환 검증 |
| **Sanity** | 수정 부위가 "최소한 기동"하는지 국소 검증 | ✅ 필수 | ✅ 필수 | ✅ 필수 | 버그 수정 후 해당 함수만 호출 |
| **Smoke** | 핵심 경로 E2E 스파이크 — "연기 나는가" | ✅ 필수 | ✅ 필수 | ✅ 필수 | 로그인 → 메인 → 로그아웃 |
| **Integration** | 모듈·외부 의존성(DB/API) 결합 검증 | ⚠️ 선택 | ✅ 필수 | ✅ 필수 | AuthService + DB + Redis |
| **Regression** | 기존 기능 비파괴 확인 | ⚠️ 선택 | ✅ 필수 | ✅ 필수 | 전체 test suite 재실행 |
| **E2E** | 유저 시나리오 전 구간 검증 (UI 포함) | ⛔ 생략 | ⚠️ 선택 | ✅ 필수 | 가입 → 로그인 → 결제 → 로그아웃 |
| **Load** | 기대 부하에서 성능·안정성 | ⛔ 생략 | ⚠️ 선택 | ✅ 필수 | 1000 RPS 1분, p95 < 200ms |
| **Stress** | 한계 초과 시 실패 양상 (failure mode) | ⛔ 생략 | ⛔ 생략 | ✅ 필수 | 10000 RPS → graceful degrade 확인 |
| **Recovery** | 장애 후 복구 능력 (DB down / OOM / crash) | ⛔ 생략 | ⛔ 생략 | ✅ 필수 | DB kill → failover → 30s 내 복구 |

**규칙:**
- ✅ = Gate에서 통과 조건. 미실행 시 QA FAIL.
- ⚠️ = config로 on/off 가능 (`testing.scope` 명시). 기본값은 표의 선택/생략.
- ⛔ = 해당 규모에서는 실행하지 않음 (리소스·시간 낭비 방지).
- **각 테스트 유형의 정의·차이**: [부록 A — 테스팅 방법 정리](#부록-a--테스팅-방법-정리) 참조.
- 프로젝트의 **QA Concern별 추가 QA**(API·UI/UX·DB·Infra 등)는 이와 **직교**로 구성됨 — §1.3 QA 섹션 참조.
- 용어 구분: **Feature Domain**(`auth`, `billing` — 비즈니스 영역, spec 경로의 `{domain}`) ≠ **QA Concern**(Unit+Integration · API · UI · DB · Infra — 품질 관심사의 축). 두 축은 서로 직교이며, 이전 문서의 "도메인별 QA"라는 표현은 **QA Concern별**을 의미.

**Escalation 허용:** large 규모라도 유저가 `/harness:qa --skip load,stress,recovery` 로 일시 생략 가능하나, `.harness/state/qa-log.jsonl` 에 skip 사유와 다음 마감일 기록 **필수** (기술부채 가시화).

**`/harness:qa` CLI 플래그 — on-demand 실행 전체 스펙:**

Right-Size 매트릭스는 기본값일 뿐, 유저는 매 호출마다 아래 플래그로 실행 집합을 조정할 수 있다. 모든 호출은 `audit.jsonl`에 `qa_invoked` 이벤트로 기록된다.

| 플래그 | 의미 | 예시 | 매트릭스와의 관계 |
|---|---|---|---|
| (없음) | `config.testing.scope.mode`를 따름 (기본 `auto` → Right-Size 매트릭스) | `/harness:qa` | 기본 동작 |
| `--all` | 정의된 **모든 유형** 실행 (9종 중 `testing.commands.*`에 커맨드가 있는 것 전부) | `/harness:qa --all` | 매트릭스 무시, 전체 실행 |
| `--only <types>` | 지정한 유형**만** 실행 | `/harness:qa --only unit,load` | 매트릭스 무시, 지정 집합만 |
| `--exclude <types>` | 기본 집합에서 제외 | `/harness:qa --exclude load,stress` | 매트릭스 기준 − 제외 |
| `--skip <types>` | `--exclude`의 별칭 (기존 문서 호환) | `/harness:qa --skip load` | 동일 |
| `--force-size <size>` | **이번 호출 1회만** right-size를 지정 — config나 workflow.json은 건드리지 않음 | `/harness:qa --force-size large` | 매트릭스 자체를 바꿈 (one-shot) |
| `--reason "..."` | 필수/권장 유형을 skip할 때 사유 기록 | `/harness:qa --exclude load --reason "infra 점검 중"` | audit + qa-log에 사유 저장 |

**우선순위 (충돌 시):** `--only` > `--all` > `--exclude`/`--skip` > (기본값). `--force-size`는 매트릭스 계산 자체에 영향.

**Gate (G4: QA → Deploy)와의 상호작용 — `config.testing.skip_required_policy`:**

| 정책 값 | 동작 | 언제 선택 |
|---|---|---|
| `block_deploy` (기본) | 유저가 Right-Size 매트릭스의 ✅ 필수 유형을 `--only`/`--exclude`로 뺐으면 **테스트는 실행되나 G4 통과 불가**. deploy 차단. | 안전 기본값 — 필수 테스트 누락으로 배포되는 것 방지 |
| `warn` | audit에 기록만, G4는 통과시킴 | 실험/학습용 프로젝트 |
| `allow` | 완전 무시 (dangerously) | 개인용 스크래치 — 프로덕션 금지 |

**의도와 방어가 공존하는 설계:**
- 유저 자유도 ↑ — 매번 config 바꾸지 않고 플래그로 one-shot 실행
- 안전 기본값 유지 — 필수 유형 skip은 **실행은 되되 deploy gate는 통과 못함** (감사 경로는 열려있음)
- Raw shell (`pnpm test:load`) 호출은 하네스 관여 없음 — 순수 개발자 도구 호출로 남겨둠 (하네스 없이도 당연히 돌아야 함)

**Audit 기록 (매 호출):**
```json
{
  "event": "qa_invoked",
  "decision": { "types_executed": ["unit","sanity","smoke","load"] },
  "signals": {
    "flag_only": ["unit","sanity","smoke","load"],
    "right_size_matrix": ["unit","sanity","smoke"],
    "right_size": "small",
    "force_size": null,
    "reason": null,
    "skipped_required": []
  },
  "rule_id": "QA-ONLY-OVERRIDE",
  "reversible": true,
  "source": "skill:/harness:qa"
}
```
매트릭스와 실제 실행 집합이 다르면 추가로 `qa_scope_overridden` 이벤트도 emit.

**예시 시나리오:**

| 상황 | 명령 | 결과 |
|---|---|---|
| small 기능인데 대규모 리팩토링 뒤 전체 돌려보고 싶다 | `/harness:qa --all --reason "post-refactor full sweep"` | 9종 전부 실행, audit에 reason 기록, G4는 정상 통과 (필수 누락 없음) |
| small 기능인데 임시로 large 매트릭스 체감하고 싶다 | `/harness:qa --force-size large` | 이번만 large 매트릭스 → E2E/Load/Stress/Recovery 포함 실행. workflow.json 불변 |
| large 기능인데 load는 인프라 문제로 잠시 skip | `/harness:qa --skip load --reason "infra maint, due 2026-04-20"` | load 제외 실행. G4는 `block_deploy` 정책상 **Deploy 차단**. audit + qa-log에 마감 기록 |
| 단일 테스트 유형만 빠르게 검증 | `/harness:qa --only smoke` | smoke만 실행. small이 아니면 필수 유형 누락 → G4 차단 (`block_deploy`) |
| 개발자가 하네스 없이 직접 부하 테스트 | `pnpm test:load` | 하네스 미관여. audit 기록 없음. G4 상태도 불변 |

### 1.3 Sprint 상세

> **설계 어휘:** Sprint Loop는 **Saga 패턴의 어휘**를 차용하여 실패 흐름을 명시한다. 프레임워크(Temporal 등) 도입은 없고 **개념·언어만 채택.** 배경: [patterns/02-saga.md](../../insights/patterns/02-saga.md), 적용 근거: [patterns/05-harness-applicability.md §4.2](../../insights/patterns/05-harness-applicability.md#42--saga-어휘로-sprint-loop-재설계).

**Saga 어휘 ↔ Sprint Loop 매핑:**

| Saga 개념 | Sprint Loop 적용 | 구현 지점 |
|----------|-----------------|-----------|
| **Compensation** (보상) | QA FAIL → 단순 재진입 아니라 **명시적 보상**: feedback 기록 → implement 복귀 | `.harness/reviews/{feature}-qa-{iter}.md` 생성 + implement 재호출 |
| **Pivot Transaction** (되돌릴 수 없는 단계) | `/harness:deploy` = pivot. 이후 실패는 **retry만** 가능 (보상 불가) | deploy 이전 모든 가역 단계 통과가 구조적 전제 |
| **Idempotency Key** | `(feature, iteration, step)` 키로 중복 실행 방지 | worktree 생성·state 갱신 전 키 검증 |
| **Saga Log** | `.harness/state/events/{feature}/sprint.jsonl` — 각 단계 상태 append-only | 장애 후 "어디까지 진행됐나" 복원 가능 (§1.7, 05-project-structure.md 참조) |
| **보상 실패 처리** | 보상(재시도·롤백)도 실패 시 → `escalation` 상태로 전환, 유저 개입 요청 | `.harness/state/escalations.jsonl` 기록 |

**실패 시나리오 표 (Saga 관점):**

| 실패 지점 | 상태 | 보상 흐름 | Idempotency |
|----------|------|----------|-------------|
| Implement step N FAIL | RED | 해당 step만 재구현 (이전 step 유지) | (feature, iter, step) 키 |
| Review NEEDS_CHANGE | AMBER | feedback 정리 → implement 재진입 | (feature, iter) 키로 재진입 |
| Review BLOCK | RED | 심각 문제 해결 우선 → 전체 iter 재시작 | 새 iteration 번호 부여 |
| QA FAIL | RED | qa 보고서 생성 → implement 복귀 (동일 iter) | (feature, iter) 키 |
| Deploy FAIL (pivot 이후) | 🔥 | **보상 불가** — 운영 롤백 + incident 기록 | `.harness/state/incidents/*.md` |

---

#### Sprint Loop 실행 흐름:

```
Sprint Loop
│
├─── /harness:implement ────────────────────────────────────
│    │
│    ├── 0. 환경 확인
│    │   ├── config.yaml → project.stack 읽기
│    │   ├── 적합한 에이전트 확인/생성
│    │   │   (예: config에 "Java + DDD" → DDD 전문 implementer 필요)
│    │   └── Worktree 생성 (메인 브랜치 보호)
│    │
│    ├── 1. 컨텍스트 수집 (explorer)
│    │   ├── Spec 읽기: acceptance criteria 전체
│    │   ├── Plan 읽기: 태스크 분해 + 순서
│    │   ├── 기존 코드 읽기: 영향 범위 파악
│    │   └── Knowledge 참조: 유사 해결책 확인
│    │
│    ├── 2. Test-First (test-strategist)
│    │   ├── Spec의 각 acceptance criteria → test code skeleton
│    │   ├── Edge case → 추가 test case
│    │   ├── 모든 test는 처음에 FAIL 상태 (RED)
│    │   └── 검증: "이 test가 실제로 spec을 검증하는가?"
│    │       ├── 빈 assert 금지
│    │       ├── Happy path + Failure path 모두 존재
│    │       └── Mock이 실제 동작과 괴리 없는지
│    │
│    ├── 3. 단계별 구현 (implementer, worktree)
│    │   ├── Plan step 1:
│    │   │   ├── 코드 구현
│    │   │   ├── [PostToolUse Hook] side-effect 검사
│    │   │   │   → 기존 test 실행 → 깨지면 즉시 경고
│    │   │   └── 해당 step의 test 실행 → PASS 확인 (GREEN)
│    │   ├── Plan step 2:
│    │   │   ├── 코드 구현
│    │   │   ├── [PostToolUse Hook] side-effect 검사
│    │   │   │   → step 1 test + step 2 test 모두 실행
│    │   │   └── 깨지면 수정 후 재실행
│    │   └── ... (반복)
│    │
│    └── 4. 최종 검증 (verifier)
│        ├── 전체 test suite 실행
│        ├── 커버리지 리포트 생성
│        ├── 커버리지 임계값 확인 (config 기준)
│        └── PASS → implement 완료 / FAIL → 수정 루프
│
├─── /harness:review ───────────────────────────────────────
│    │
│    ├── 0. 변경 범위 분석
│    │   └── scripts/review/diff-analyzer.mjs
│    │       → 변경 파일 수, 영향 모듈, 복잡도 산출
│    │
│    ├── 1. 도메인별 Reviewer 병렬 dispatch
│    │   ├── reviewer-security
│    │   │   ├── OWASP top 10 대응 확인
│    │   │   ├── Injection 취약점 (SQL, XSS, Command)
│    │   │   ├── 인증/인가 로직 검증
│    │   │   └── 민감 데이터 노출 여부
│    │   │
│    │   ├── reviewer-performance
│    │   │   ├── N+1 쿼리 패턴
│    │   │   ├── 메모리 누수 가능성
│    │   │   ├── 시간 복잡도 (불필요한 O(n²) 등)
│    │   │   └── 인덱스/캐시 전략
│    │   │
│    │   ├── reviewer-quality
│    │   │   ├── 클린 코드 원칙 준수
│    │   │   ├── 아키텍처 패턴 준수 (config 기반)
│    │   │   ├── 네이밍, 응집도, 결합도
│    │   │   └── 중복 코드, 불필요한 복잡도
│    │   │
│    │   └── reviewer-spec
│    │       ├── 코드가 Spec을 충족하는가?
│    │       ├── 누락된 acceptance criteria 없는가?
│    │       └── Edge case가 처리되는가?
│    │
│    ├── 2. 각 reviewer 독립 판단
│    │   └── PASS / NEEDS_CHANGE(구체 피드백) / BLOCK(심각)
│    │
│    └── 3. Controller 종합
│        └── scripts/review/collect-verdicts.mjs
│            ├── 1개라도 BLOCK → 전체 BLOCK → 심각 문제 먼저 해결
│            ├── NEEDS_CHANGE 있으면 → 피드백 정리 → /harness:implement 복귀
│            └── 모두 PASS → /harness:qa 진행 가능
│
└─── /harness:qa ───────────────────────────────────────────
     │
     ├── 0. 테스트 환경 준비
     │   └── Worktree에서 클린 환경 구성 (권장)
     │
     ├── 1. QA Concern별 실행 (품질 관심사 축별 — Feature Domain과 직교)
     │   │   ※ 실행 순서는 `testing.qa_stack.mode` 에 따라 달라짐:
     │   │     - parallel (기본, 빠름) — 아래 항목을 병렬 실행
     │   │     - sequential_bottom_up (엄격) — Infra → DB → API → UI 순차, 하위
     │   │       FAIL 시 상위 skip + 자동 귀인 (§1.3.1 QA Stack 참조)
     │   │
     │   ├── Unit/Integration QA
     │   │   ├── 전체 unit test 재실행
     │   │   ├── Integration test 실행 (실제 의존성)
     │   │   └── 커버리지 리포트 최종 확인
     │   │
     │   ├── Infra QA (해당 시) — Layer 0 (가장 하위)
     │   │   ├── 환경 설정 일관성
     │   │   ├── 환경변수 누락 확인
     │   │   └── 보안 설정 (CORS, CSP 등)
     │   │
     │   ├── DB QA (해당 시) — Layer 1 (Infra 의존)
     │   │   ├── 마이그레이션 안전성 (롤백 가능?)
     │   │   ├── 인덱스 적정성
     │   │   └── 쿼리 성능 (실행 계획 확인)
     │   │
     │   ├── API QA (해당 시) — Layer 2 (DB 의존)
     │   │   ├── 엔드포인트별 계약 테스트
     │   │   ├── 에러 응답 형식 검증
     │   │   ├── Rate limiting / Timeout 검증
     │   │   └── 인증 시나리오 (유효/만료/미인증)
     │   │
     │   └── UI/UX QA (해당 시) — Layer 3 (API 의존, 최상위)
     │       ├── 비주얼 회귀 테스트
     │       ├── 접근성 (WCAG 2.1 AA)
     │       ├── 반응형 (모바일/태블릿/데스크톱)
     │       └── 브라우저 호환성
     │
     ├── 2. Regression Test
     │   ├── 기존 기능 전체 test 재실행
     │   ├── 새 코드가 기존 기능을 깨뜨렸는지 확인
     │   └── 깨진 test → side-effect 보고서 생성
     │
     ├── 3. Smoke Test
     │   └── 핵심 경로만 빠르게 검증 (로그인 → 메인 기능 → 로그아웃)
     │
     └── 4. 결과 판정
         ├── 모든 QA Concern PASS → qa.passed=true → /harness:deploy 가능
         ├── FAIL 항목 있음 → Feedback 보고서 생성
         │   ├── 어떤 QA Concern에서 실패했는가
         │   ├── 어떤 test가 실패했는가
         │   ├── 원인 추정
         │   └── → /harness:implement로 복귀 (Sprint Loop)
         └── QA 보고서 → .harness/reviews/{feature}-qa-{iteration}.md
```

#### 1.3.1 QA Stack — 계층 의존 순차 검증 (Bottom-Up Sequential Verification)

**문제 인식:** QA Concern을 **병렬**로 돌리면 빠르지만, UI 테스트가 실패했을 때 그 원인이 "UI 버그"인지 "API 버그가 UI에 번진 것"인지 **구분이 안 된다.** 결과적으로 디버깅이 계층을 거슬러 내려가야 하고, 시간이 배 이상 든다.

**해법:** QA Concern에는 자연스러운 **의존 계층**이 있다. 아래에서 위로 **하나씩** 검증하면, 상위 실패는 **반드시 상위 계층의 문제**로 귀인된다.

```
Layer 3 — UI      (의존: API) ── 비주얼·a11y·반응형·브라우저
   │
Layer 2 — API     (의존: DB)  ── 엔드포인트 계약·에러·인증
   │
Layer 1 — DB      (의존: Infra) ── 마이그레이션·인덱스·쿼리 플랜
   │
Layer 0 — Infra   (의존: 없음) ── 환경변수·CORS/CSP·secret·네트워크
```

**실행 모드 (config.testing.qa_stack.mode):**

| 모드 | 동작 | 장점 | 단점 |
|------|------|------|------|
| `parallel` (기본) | QA Concern 동시 실행 | 빠름 · 현 하네스 기본값 | 실패 귀인 약함 — "UI 실패, 원인 불명" |
| `sequential_bottom_up` | Infra → DB → API → UI 순차, 하위 FAIL 시 상위 skip | **완고한 소프트웨어 구축** · 자동 귀인 · fail-fast | 느림 (직렬) · 하위 테스트 기반 필요 |
| `custom` | `custom_order` 배열 순서 | 프로젝트별 특수 스택 (예: MQ 중심) | DAG 검증 책임 유저에게 |

**Sequential Bottom-Up 실행 흐름:**

```
scripts/qa/stack-runner.mjs
  │
  ├── 0. DAG 검증: layers[].depends_on 이 순환이면 exit 2
  │
  ├── 1. topological 순 실행 (Infra → DB → API → UI)
  │   │
  │   ├── Layer 실행 전 mock_guard 검사 (scripts/qa/mock-ratio.mjs)
  │   │   └── 상위 계층 테스트가 하위 계층 mock 사용?
  │   │       ├── enforce=strict_lower_real → G4 BLOCK (귀인 무효)
  │   │       ├── enforce=warn               → qa_attribution_warning emit, 계속
  │   │       └── enforce=off                → 생략
  │   │
  │   ├── 해당 layer.tests[] 실행 (config.testing.commands.*)
  │   │
  │   └── 결과 판정:
  │       ├── PASS → 다음 layer 진행
  │       ├── FAIL + fail_policy=halt_upstream
  │       │   → 상위 layer들 모두 skip
  │       │   → emit qa_layer_halted
  │       │       { layer: "api", reason: "contract_test_failed",
  │       │         halted: ["ui"], failed_tests: [...] }
  │       ├── FAIL + fail_policy=continue → 계속
  │       └── FAIL + fail_policy=warn → 로그만 남기고 계속
  │
  └── 2. Attribution 생성 (scripts/qa/attribution.mjs)
      ├── 실패 layer 식별
      ├── 하위 layer 전부 PASS인지 확인
      └── verdict 결정:
          ├── 모든 layer PASS → verdict: "all_green"
          ├── 최하위 실패 → verdict: "pure_{layer}_issue" (예: pure_ui_issue)
          └── 다중 실패 → verdict: "multi_layer: {infra, db, ...}"
      → .harness/state/qa-attribution.json
      → emit qa_attribution_report
```

**예시 시나리오 (유저 요청 재현):**

> "API 검증/버그픽스 완료 후 UI/UX 검증 → UI에서 버그 발생 시 API는 문제 없으니 순수 UI 문제임."

```
[Sprint iteration 5]
  /harness:qa (qa_stack.mode: sequential_bottom_up)
  │
  ├── Layer 0 (Infra) ──→ PASS
  ├── Layer 1 (DB)    ──→ PASS
  ├── Layer 2 (API)   ──→ PASS  ← 이 줄이 결정적. API 계약·에러·인증 전부 통과.
  ├── Layer 3 (UI)    ──→ FAIL  (login-button.test.ts: 클릭 후 라우팅 안 됨)
  │
  └── attribution.mjs 결론:
      {
        "failed_layer": "ui",
        "passed_layers": ["infra", "db", "api"],
        "verdict": "pure_ui_issue",
        "evidence": {
          "api_contract_match": true,
          "failed_tests": ["ui/login-button.test.ts#click-routes-to-dashboard"],
          "confidence": "high"         // mock_guard=strict_lower_real 이었음
        }
      }
      → /harness:implement 재진입 시 "UI 코드만 의심" 문맥 자동 주입.
```

**귀인 신뢰성의 전제 조건 — `mock_guard`:**

상위 계층 테스트가 하위 계층을 **mock** 하면, "하위 PASS"라는 전제가 깨진다. (UI가 API를 mock하면 실제 API 상태와 무관하게 UI 테스트가 성립해 버린다 → 귀인 무효.) 하네스는 세 수준으로 방어:

| `mock_guard.enforce` | 동작 |
|---|---|
| `strict_lower_real` (기본, sequential_bottom_up일 때) | 하위 계층 mock 감지 시 G4 BLOCK. 귀인 신뢰도 > 실행 편의 |
| `warn` | `qa_attribution_warning` emit만 하고 진행 — 귀인 confidence가 "low"로 표기 |
| `off` | 검사 없음 (legacy 프로젝트 호환용, 비권장) |

**Right-Size별 기본 권고:**

| 규모 | 권장 모드 | 이유 |
|---|---|---|
| small | `parallel` | 계층 분리 가치 < 속도. 대부분 단일 파일/모듈 수정 |
| medium | `parallel` 기본, 계층 이슈 의심 시 `sequential_bottom_up` 전환 | 상황 적응적 |
| large | **`sequential_bottom_up` 강력 권고** | 다계층 변경 → 귀인 비용 > 실행 시간 비용. **단, 직렬 실행이므로 parallel 대비 2~4배 시간 소요** (4계층 기준 total ≈ sum(infra+db+api+ui) vs max(infra,db,api,ui)). 귀인 정확도와 실행 시간의 트레이드오프를 인지하고 선택할 것 |

**실패 시 Sprint Loop 복귀:**

- `qa-attribution.json` 의 `failed_layer` 가 **implement 재진입 시 컨텍스트로 주입**됨 → implementer/explorer 가 해당 계층 코드만 탐색.
- `halted` 배열은 "아직 검증 안 된 계층"을 의미 → 다음 iteration 에서 자동으로 재실행 대상.

**한 줄 정리:**

> **"Parallel은 '동시에' 테스트하고, Sequential은 '순서대로' 책임을 분리한다."** 완고한 소프트웨어(robust) 구축에는 후자가 필요하다.

#### 1.3.2 업계 대비 우위 — Bottom-Up Attribution · strict_lower_real

2026-Q1 공개된 Anthropic·OpenAI 하네스 엔지니어링 글([insights](../insights/industry-harness-engineering/)) 과의 비교에서, **QA Stack 설계는 본 하네스의 강점 영역**으로 드러난다:

| 측면 | Anthropic (Rajasekaran 2026-03) | OpenAI (Lopopolo 2026-02) | 본 하네스 |
|---|---|---|---|
| Evaluator 분리 | Planner / Generator / **Evaluator** 3-agent | 명시 없음 (주로 단일 agent + human) | reviewer-* × 4 병렬 + QA Stack |
| 실패 귀인 | Evaluator 판정 (agent judgment) | Human triage | **bottom-up 자동 귀인** (`qa-attribution.json` · `failed_layer`) |
| Mock 경계 | 언급 없음 | 언급 없음 | `mock_guard.strict_lower_real` — 상위가 하위 mock 시 G4 BLOCK |
| 계층 건너뜀 차단 | 암묵적 (evaluator 판단) | 없음 | `qa_layer_halted` + `sequential_bottom_up` 구조적 강제 |

**핵심 gap — 양사 모두 "evaluator 의 판단 신뢰성" 을 evaluator 자체를 skeptical 하게 튜닝하는 방식으로 해결한다. 이는 여전히 LLM 판단에 의존한다.**

본 하네스는 한 단계 더 내려간다:

1. **귀인의 결정론화** — `failed_layer` 는 `stack-runner.mjs` 가 **계층별 종료 코드** 로 판정한다. LLM 판단 0%. Lopopolo 의 "harness 는 결정론 영역을 최대화하라" 원칙의 직접 구현.
2. **귀인 신뢰 전제의 구조적 방어** — `mock_guard.strict_lower_real` 가 없으면 "하위 PASS" 전제가 소리 없이 깨진다. 이건 **evaluator 가 아무리 skeptical 해도 감지 불가** — 계층 간 실제 호출 여부는 실행 시점 관측 대상이다.
3. **Layer halt 의 명시적 audit 화** — `qa_layer_halted` 이벤트가 "이 계층은 아직 검증 안 됐다" 를 영구 기록. Anthropic 의 암묵적 evaluator 판단을 **관측 가능한 상태** 로 승격.

**역방향 교훈 — 우리가 업계로부터 가져올 것:**

- Anthropic 의 "evaluator = skeptical by default" 프롬프트 명시 → 우리 reviewer-* 페르소나에 `stance: skeptical` 명시 (`01-patterns-distilled.md §B` 에서 이미 도출됨)
- OpenAI 의 "harness 가정의 entropy 주기 스윕" → `/harness:sync --schedule weekly` 로 `mock_guard` 정책의 retired 여부 점검

→ 요약: **"LLM 판단을 관측 가능한 상태로 끌어내린다"** 는 점이 본 하네스의 QA Stack 이 업계보다 한 발 앞선 지점이다.

---

### 1.4 Spec 파일 구조

```yaml
# .harness/specs/auth/login.spec.yaml
---
id: SPEC-AUTH-001
title: 사용자 로그인
status: approved                          # draft → review → approved
created: 2026-04-11
domain: auth

# brainstorm 결과 참조 (있으면)
origin:
  brainstorm_session: 2026-04-11-session-abc

# 요구사항
requirements:
  - id: REQ-001
    description: "이메일과 비밀번호로 로그인할 수 있다"
    priority: must
    acceptance_criteria:
      - id: AC-001
        condition: "유효한 이메일+비밀번호 → JWT 토큰 반환"
        testable: "POST /login {valid email, valid pw} → 200 + body.token 존재"
        test_type: unit
      - id: AC-002
        condition: "잘못된 비밀번호 → 401 에러 + 명확한 메시지"
        testable: "POST /login {valid email, wrong pw} → 401 + body.error 존재"
        test_type: unit
      - id: AC-003
        condition: "5회 연속 실패 → 계정 잠금 30분"
        testable: "POST /login 5회 실패 후 6번째 → 429 + retry_after=1800"
        test_type: integration

  - id: REQ-002
    description: "JWT 토큰은 1시간 후 만료된다"
    priority: must
    acceptance_criteria:
      - id: AC-004
        condition: "만료된 토큰으로 요청 → 401 반환"
        testable: "GET /protected + expired JWT → 401"
        test_type: unit
      - id: AC-005
        condition: "만료 10분 전 refresh 가능"
        testable: "POST /auth/refresh + 만료 10분전 JWT → 200 + body.token 존재"
        test_type: integration

# edge cases
edge_cases:
  - "SQL injection 시도 → 안전하게 차단"
  - "빈 이메일/비밀번호 → 400 에러"
  - "존재하지 않는 이메일 → 401 (이메일 존재 여부 노출 금지)"

# 테스트 전략
test_strategy:
  coverage_target:
    line: 85
    branch: 75
  test_types:
    - unit: "각 acceptance criteria 개별 검증"
    - integration: "계정 잠금, refresh 등 상태 의존 검증"
    - e2e: "로그인 → 토큰 사용 → 만료 → refresh 전체 플로우"

# 필요 에이전트/페르소나
required_personas:
  - "보안 전문가: 인증 로직 검증"
  - "API 설계자: REST 계약 검증"
---
```

**Spec YAML 정규 필드 정의:**

| 필드 | 필수 | 설명 | 검증 스크립트 |
|---|:---:|---|---|
| `id` | ✅ | `SPEC-{DOMAIN}-{NNN}` 형식 | `validate-spec.mjs` |
| `title` | ✅ | 기능 제목 | `validate-spec.mjs` |
| `status` | ✅ | `draft` → `review` → `approved` | `validate-spec.mjs` |
| `created` | ✅ | ISO 날짜 | `validate-spec.mjs` |
| `domain` | ✅ | Feature Domain (경로의 `{domain}` 부분) | `validate-spec.mjs` |
| `origin` | ❌ | brainstorm 세션 참조 | — |
| `requirements[].id` | ✅ | `REQ-{NNN}` 형식 | `validate-spec.mjs` |
| `requirements[].description` | ✅ | 요구사항 설명 (사용자 관점) | `validate-spec.mjs` |
| `requirements[].priority` | ✅ | `must` / `should` / `could` | `validate-spec.mjs` |
| `requirements[].acceptance_criteria[].id` | ✅ | `AC-{NNN}` 형식, 전체 spec 내 유일 | `validate-spec.mjs` |
| `requirements[].acceptance_criteria[].condition` | ✅ | AC 조건 (사용자 관점) | `validate-spec.mjs` |
| `requirements[].acceptance_criteria[].testable` | ✅ | **자동 검증 가능한 구체 시나리오** — 없으면 exit 2 | `check-testability.mjs` |
| `requirements[].acceptance_criteria[].test_type` | ✅ | `unit` / `integration` / `e2e` | `validate-spec.mjs` |
| `edge_cases[]` | ✅ | 경계 조건 목록 (최소 1개) | `validate-spec.mjs` |
| `test_strategy` | ✅ | 커버리지 목표 + 테스트 유형 전략 | `validate-spec.mjs` |
| `required_personas[]` | ❌ | 필요 페르소나 (있으면 Gate 역할) | `/harness:spec` Skill |

> **`testable` 필드가 핵심이다.** `condition`은 사용자 언어로 쓴 "무엇"이고, `testable`은 자동 검증 가능한 "어떻게 확인할 것인가"다. `check-testability.mjs`는 이 필드의 존재와 검증 가능성을 강제한다 (없으면 exit 2).

### 1.5 Plan 파일 구조

```markdown
# Plan: 사용자 로그인

> Spec: SPEC-AUTH-001
> Status: approved
> Created: 2026-04-11

## Spec 매핑

| Spec AC | Plan Step | Test |
|---------|-----------|------|
| AC-001 | Step 2 | tests/auth/login.test.ts#valid-credentials |
| AC-002 | Step 2 | tests/auth/login.test.ts#invalid-password |
| AC-003 | Step 3 | tests/auth/login-lockout.test.ts |
| AC-004 | Step 4 | tests/auth/token-expiry.test.ts |
| AC-005 | Step 4 | tests/auth/token-refresh.test.ts |

## 구현 단계

### Step 1: 데이터 모델 (의존성 없음)

**입력:** Spec REQ-001, REQ-002
**출력:** User 엔티티, LoginAttempt 엔티티
**검증:** 모델 단위 테스트 통과

- User 엔티티 생성 (email, hashedPassword, lockedUntil)
- LoginAttempt 엔티티 생성 (userId, attemptedAt, success)
- 마이그레이션 파일 생성

### Step 2: 인증 서비스 (Step 1 의존)

**입력:** Step 1 모델, Spec AC-001, AC-002
**출력:** AuthService.login() 메서드
**검증:** AC-001, AC-002 test 통과

- AuthService 클래스 생성
- login(email, password) → JWT 반환 또는 에러
- bcrypt 비밀번호 검증
- JWT 생성 (1시간 만료, HS256)

### Step 3: 계정 잠금 (Step 2 의존)

**입력:** Step 2 서비스, Spec AC-003
**출력:** 잠금 로직 추가
**검증:** AC-003 test 통과

- LoginAttempt 기록 로직
- 5회 연속 실패 감지
- lockedUntil 설정 (현재 + 30분)
- 잠금 상태에서 로그인 시도 → 적절한 에러

### Step 4: 토큰 만료/갱신 (Step 2 의존)

**입력:** Step 2 서비스, Spec AC-004, AC-005
**출력:** 토큰 검증 미들웨어, refresh 엔드포인트
**검증:** AC-004, AC-005 test 통과

- JWT 검증 미들웨어
- 만료 토큰 → 401 반환
- POST /auth/refresh → 만료 10분 전이면 새 토큰 발급

### Step 5: API 엔드포인트 (Step 2, 3, 4 의존)

**입력:** 전체 서비스, Spec edge_cases
**출력:** REST 엔드포인트
**검증:** 전체 test suite + edge case test 통과

- POST /auth/login
- POST /auth/refresh
- 입력 검증 (빈 값, SQL injection 방어)
- 에러 응답 형식 통일
```

### 1.6 Prototype 모드 워크플로우

빠른 실험을 위한 제어된 탈출구. `config.yaml: workflow.mode: prototype`

```
Phase 0: Init (mode: prototype) ──────────────────────────────
  /harness:init → workflow.mode: prototype 선택

Phase 1-5: 생략 가능 ─────────────────────────────────────────
  Spec, Plan, Test Strategy 없이 바로 구현 가능

Phase 6: 자유 구현 ───────────────────────────────────────────
  /harness:implement (게이트 생략)
  ├── Safety Layer는 유지 (rm -rf, force push 차단)
  ├── Test-First 강제하지 않음
  └── 결과물에 [PROTOTYPE] 상태 기록

Phase 7: Deploy 차단 ─────────────────────────────────────────
  /harness:deploy → BLOCKED
  "Prototype 코드는 배포할 수 없습니다."

※ Prototype → Standard 승격 (아래 §1.7)
```

### 1.7 Prototype → Standard 전환 (승격)

```
/harness:sync --promote 실행
  │
  ├── Phase 1: 승격 준비 (Promotion Context — Gate 미적용)
  │   ※ 이 단계는 Spec/Plan/Test가 아직 없는 상태에서 실행되므로
  │     Standard 게이트(G1~G4)를 적용하지 않는다.
  │     sync --promote 자체의 Gate 전제조건은 "없음" (06-cli-reference.md 참조).
  │
  │   ├── Prototype 코드 분석 (migrate:extract-spec과 동일 로직)
  │   ├── 코드에서 Spec 역추출 → "초안(draft)" 상태로 생성
  │   │   ├── 함수/API 시그니처 → acceptance criteria 초안
  │   │   ├── 기존 test 있으면 → AC로 역변환
  │   │   └── test 없는 기능 → "테스트 누락" 경고
  │   │   ⚠️ 역추출 결과는 LLM 추론이므로 불완전할 수 있다.
  │   │      코드에 드러나지 않는 요구사항(잠금 정책, rate limiting 등)은
  │   │      누락된다. 반드시 유저 검토 후 승인해야 유효한 Spec이 된다.
  │   ├── Spec에서 Test skeleton 생성
  │   └── Plan 생성 (리팩토링 계획)
  │
  ├── Phase 2: 유저 검토 + 승인
  │   ├── 역추출된 Spec·Test·Plan 초안을 유저에게 제시
  │   ├── 유저가 수정/보완 후 승인
  │   └── 승인 시 config.yaml: workflow.mode → standard 변경
  │
  └── Phase 3: 정상 워크플로우 합류 (Standard 게이트 적용 시작)
      ├── 이 시점부터 G1~G4 Gate 정상 동작
      └── /harness:implement (리팩토링) → /harness:review → /harness:qa → /harness:deploy
```

**핵심 원칙:**
- Prototype은 "실험"이고, Standard를 거쳐야 "제품"이 된다. `/harness:sync --promote`가 그 다리 역할.
- **순환 의존 회피:** sync --promote는 Spec/Plan/Test를 *생성하는* 과정이므로, 이들의 존재를 요구하는 Gate(G1~G4)는 Phase 1에서 적용하지 않는다. Phase 3에서 Standard로 전환된 이후부터 Gate가 적용된다.
- **역추출 ≠ Source of Truth:** 역추출된 Spec은 "초안(draft)"이다. 유저 승인 전까지 Gate 판정에 사용하지 않는다 (P3 Spec-Driven 원칙 유지).

### 1.8 Sprint 병렬 실행

Plan의 태스크 의존성 그래프를 분석하여 병렬 가능 구간을 자동 식별:

```
Plan 분석:
  Step 1 → Step 2 (순차: 의존)
  Step 3 (독립)
  Step 4 (독립)

실행:
  ┌── 순차 구간 ──────────────────────────┐
  │ implementer-1: Step 1 → Step 2         │
  ├── 병렬 구간 (자동 worktree 분기) ──────┤
  │ worktree-A: implementer-2 → Step 3     │
  │ worktree-B: implementer-3 → Step 4     │
  ├── 병합 ────────────────────────────────┤
  │ 변경 사항 merge                         │
  │ 충돌 → Controller 해결 또는 에스컬레이션 │
  │ 전체 test suite 실행 (side-effect 확인) │
  └────────────────────────────────────────┘
```

병렬 설정: `config.yaml` → `execution.parallel` (02-architecture.md §7.3 참조)

---

### 1.9 Escape Hatch — 유저 의도 기반 우회

핫픽스·실험·데모처럼 **유저가 명시적으로** gate/review/qa를 우회해야 하는 상황을 1급 시민으로 지원. Claude Code의 `--dangerously-skip-permissions` 에 대응되나, 하네스는 **이름이 아닌 3중 구조**로 위험을 강제한다.

**설계 전제 — 우회는 있어야 한다**

- 현실: P0 incident 중 "qa 8분 돌릴 시간 없음" / "spec 없지만 3줄짜리 핫픽스" 같은 케이스는 실재
- 가짜 금지는 유저가 하네스를 우회하거나(`.harness/` 수동 편집 · gate 스크립트 비활성) 포기하게 만듦
- 따라서: **의도적·기록 가능·재현 가능**한 escape hatch를 제공. 우회 자체는 허용하되, **감사 가능성(auditability)** 은 포기하지 않음.

#### 1.9.1 두 경로

**경로 A — CLI 플래그 (명시적 의도)**

```bash
/harness:deploy production --bypass-qa --reason "P0 incident 2026-04-13-auth-outage"
/harness:implement scratch/idea --bypass-gates g1 --reason "프로토타입 전 검증"
/harness:qa auth/login --bypass-review --reason "pair programming, 구두 리뷰 완료"
```

플래그 계열: `--bypass-gates <g1,...>` · `--bypass-review` · `--bypass-qa` · `--bypass-deploy-gate`. 상세 스펙은 [06-cli-reference.md §3.1](06-cli-reference.md#31-escape-hatch----bypass--상세).

**경로 B — 자연어 의도 (Prompt Lexicon)**

`UserPromptSubmit` hook이 유저 자연어에서 의도 키워드를 감지하면 **자동 우회하지 않고** 확인 프롬프트를 띄운다.

| Lexicon (예시) | 매칭 의도 | 제안 플래그 |
|---|---|---|
| "긴급 배포", "hotfix 배포", "지금 바로 배포" | G4 우회 | `/harness:deploy ... --bypass-qa --reason` |
| "gate 건너뛰어", "게이트 무시", "spec 없이" | G1~G3 우회 | `/harness:implement ... --bypass-gates <g> --reason` |
| "리뷰 스킵", "리뷰 없이", "QA 바로" | review 우회 | `/harness:qa ... --bypass-review --reason` |
| "프로토타입으로 돌려봐", "실험 모드로" | mode 전환 | `/harness:mode set prototype` |

감지 시 동작:

```
(감지) "긴급 배포" 키워드 매칭
→ 제안: /harness:deploy staging --bypass-qa --reason "..."
→ 유저에게 확인: [y/N] + reason 입력 요구
→ 승인 시 CLI 경로와 동일한 3중 안전장치 적용
```

Lexicon 정의: `.harness/config.yaml` → `workflow.prompt_pipeline.escape_lexicon` (유저가 편집 가능, 프로젝트별 커스텀 용어 추가). 05-project-structure.md §4 참조.

#### 1.9.2 3중 안전장치

이름이 아닌 **구조**로 위험을 강제. 어느 경로로 오든 동일하게 적용.

**① `--reason "..." 필수**

`--bypass-*` 는 예외 없이 `--reason`을 동반해야 한다. 누락 시 exit 2 (BLOCK). 사유는:
- `audit.jsonl` → `gate_bypassed` 이벤트에 기록
- `qa-log.jsonl` (qa 계열 우회 시) 에 중복 기록
- `.harness/state/workflow.json.session.bypass_stack[]` 에 누적

**② `gate_bypassed` audit 이벤트**

```jsonl
{"ts":"2026-04-13T09:12:43Z","event":"gate_bypassed","skill":"deploy","bypassed":["g4","qa.passed"],"reason":"P0 incident 2026-04-13-auth-outage","session_id":"s-2026-04-13-abc","mode":"standard"}
```

- **불변**: `audit.jsonl` 은 append-only. 우회 기록은 삭제 불가.
- **관측 가능**: 팀 대시보드·주간 리뷰에서 `gate_bypassed` 빈도·사유 분석 가능.
- **post-mortem 재구성**: incident 발생 시 해당 세션의 bypass 체인 즉시 조회 가능.

**③ 세션 sticky warning**

해당 세션 내 후속 모든 skill 실행 시 stderr에 배너 출력:

```
⚠ 이 세션은 다음을 우회했습니다:
  - deploy --bypass-qa (reason: "P0 incident ...") at 09:12:43
  후속 작업은 unverified 상태임을 유의.
```

세션 종료 시 `workflow.json.session.bypass_stack[]` 는 자동 해제되지 않음 — 다음 세션의 `SessionStart` 에서 명시적으로 clear 하거나 `/harness:sync --promote` 로 상태 재정렬.

#### 1.9.3 우회 불가 영역 (Hard Safety)

`--bypass-*` 대상이 **아닌** 항목. 어떤 플래그로도 우회 불가:

| 대상 | 이유 | 대응 |
|---|---|---|
| 파괴적 bash 차단 (`rm -rf /`, `DROP TABLE` 등) | 데이터 손실 복구 불가 | 필요 시 shell 직접 실행 (하네스 경유 금지) |
| force-push 차단 | 팀 작업 파괴 | `git push --force-with-lease` 를 직접 실행 |
| `.harness/state/` 직접 편집 | 상태 무결성 파괴 | `/harness:sync` 경유 복구 |
| prototype mode 의 deploy | 설계 원칙 (prototype은 정의상 미검증) | `/harness:sync --promote` 후 deploy |

즉 `scripts/guardrails/*.mjs` 는 exit 2로 고정 차단되며, 하네스를 통한 우회 경로 자체가 없다.

#### 1.9.4 운영 지표

`gate_bypassed` 빈도는 프로세스 건강성 지표. 주간 합계가 다음을 초과하면 설계 재검토 시그널:

| 우회 유형 | 주간 권장 상한 | 초과 시 |
|---|---|---|
| `--bypass-qa` | 2회 | qa 시간·신뢰성 문제 — 테스트 구조 재설계 |
| `--bypass-gates g1` (spec 없음) | 5회 | spec 작성 비용 과도 — 템플릿 간소화 |
| `--bypass-review` | 3회 | review depth 조정 또는 pair programming 공식화 |

권장 상한은 `config.yaml` → `audit.bypass_budgets` 에서 팀별 조정.

#### 1.9.5 요약

> **우회는 있어야 한다. 단, 익명이면 안 된다.**
> `--bypass-*` = 의도 명시 + `--reason` 기록 + audit 불변 + 세션 경고 + 지표 집계.
> 이름이 `--unsafe-*` 나 `--dangerously-*` 가 아닌 이유: 위험은 **구조**가 강제한다.

### 1.10 설계상 경계 — "하드 보호 vs 소프트 유도"

하네스가 강제하는 경계는 모두 동등하지 않다. **구조적 hook**로 막는 영역과 **문서·주입**으로 유도하는 영역이 다르다. 혼동하면 "하네스를 믿고 맡겼는데 왜 안 막아주지?" 유형의 기대 불일치가 생긴다.

#### 1.10.1 하드 보호 영역 (구조적 강제)

다음은 **Claude가 협조하든 적대적이든** 하네스가 hook 레벨에서 차단한다:

| 보호 대상 | 방어 수단 | 우회 방법 |
|---|---|---|
| `.harness/state/` 직접 편집 | PreToolUse hook → Edit/Write/Bash 차단 | 유저가 직접 편집 (세션 밖) |
| `.harness/audit.jsonl` append-only | PreToolUse hook → 기존 라인 변경 차단 | 없음 (append 전용) |
| 파괴적 bash (`rm -rf`, `git push --force`) | PreToolUse hook → exit 2 | `--bypass-*` + `--reason` |
| G1~G4 게이트 우회 | `scripts/guardrails/*.mjs` 검사 | `--bypass-*` + `--reason` |

핵심: **"Claude의 선의"를 가정하지 않는다**. 모델이 프롬프트 인젝션으로 오염되어도 구조가 막는다.

#### 1.10.2 소프트 유도 영역 (규약·주입)

반면 다음은 **하네스가 막지 않는다**. 유저 규약과 SessionStart hook 주입으로만 유도한다:

| 유도 대상 | 유도 수단 | 이유 |
|---|---|---|
| `src/**` 편집 스타일 | `.claude/rules/*.md` (유저 소유) | 도메인 코드 편집은 유저 권한 영역 |
| 스킬·워크플로우 선택 | `scripts/hooks/session-start-context.mjs` 카탈로그 주입 | 강제 아닌 제안 — Claude 판단 여지 필요 |
| 테스트 작성 스타일 | `examples/rules/testing.md.example` | 팀별 취향 차이 존중 |
| 커밋 메시지 형식 | `CLAUDE.md.example` | 관습이지 규약 아님 |

핵심: **`.harness/` 밖은 "오염(contamination)이 아닌 drift(표류)" 영역**. 오염은 복구 불가능이지만 drift는 `/harness:sync`·`/harness:migrate`로 회복 가능하다.

#### 1.10.3 설계 의도

> 하네스는 **Claude가 협조적**이라고 가정하고 유도한다.
> 적대적이어도 하드 경계는 버틴다. 그러나 소프트 영역은 **일부러 안 막는다** — 막으면 Claude의 도메인 판단력을 잃는다.

이 경계는 [01 §A 단순화 원칙](../insights/industry-harness-engineering/01-patterns-distilled.md#a-단순화-원칙-anthropic-핵심-공리)과 직결된다: Anthropic Rajasekaran의 "harness 구성요소는 **모델의 한계를 드러내는 거울**"이라는 명제는, 거꾸로 말하면 **모델이 할 수 있는 일은 harness가 하지 말아야** 한다는 뜻이다. 하네스가 유저 코드 스타일까지 강제하면 모델의 맥락 판단을 짓누른다.

#### 1.10.4 기대 불일치 해소 예시

| 유저 기대 | 실제 동작 | 해소 |
|---|---|---|
| "왜 `src/api/auth.ts` 가 .claude/rules 무시하고 편집됐지?" | rules 는 주입·참조 대상이지 hook 차단 대상이 아님 | `/harness:sync --schedule weekly` 로 drift 주기 점검 |
| "왜 CLAUDE.md 에 `never use any` 썼는데 any 가 들어왔지?" | CLAUDE.md 는 Claude 에게 읽히는 컨텍스트이지 린터 아님 | QA Stack G3 (typecheck) 로 검증 — CLAUDE.md 는 지침 |
| "왜 엉뚱한 스킬이 실행됐지?" | 카탈로그는 주입되지만 선택은 모델 | `skills/*/skill.yaml` 의 `description`·`when` 필드 직접 편집 → 다음 세션에 `session-start-context.mjs` 가 갱신된 카탈로그 주입 |

---

### 1.11 Refactor Loop — behavior-preserving 유지보수

선형 SDLC(brainstorm → deploy)가 **새 기능을 만드는 루프**라면, `/harness:refactor`는 **이미 커밋된 코드의 구조를 개선하는 루프**다. `/harness:migrate`·`/harness:sync`와 같은 유지보수 계열.

#### 1.11.1 왜 독립 스킬인가

리팩토링은 일반 구현과 **검증 방향이 반대**다:

| 축 | 일반 `implement` | `/harness:refactor` |
|---|---|---|
| 진입 조건 | Spec + Plan | **Spec 불변** + 커버리지 임계값 |
| 성공 기준 | 새 test RED → GREEN | **전·후 test suite 동일 + 모두 GREEN** |
| 분해 단위 | AC 단위 | Fowler 카탈로그의 **refactoring move 단위** |
| 리뷰어 | security·performance·quality·spec | **quality + performance** (spec은 script로 증명) |

`mode: refactor` 플래그 하나로 implementer를 재활용하되, 단계 자체는 분리해 **"구조 개선 의도"** 를 1급 시민으로 둔다.

#### 1.11.2 전체 흐름

```
Phase 0: Entry ─────────────────────────────────────────────────
  /harness:refactor <domain>/<feature>
    [--size small|medium|large]
    [--bypass-coverage --reason "..."]

Phase 1: Pre-gate (script-first) ───────────────────────────────
  ├── scripts/refactor/snapshot.mjs
  │   └── spec 파일 + test 파일 집합 hash → 베이스라인 저장
  └── verifier → 커버리지 측정
      ├── ≥ config.refactor.min_coverage (기본 70%) → PASS
      └── < 임계값 → BLOCK
          "characterization test 먼저 보강하세요. (gen-test 또는 수동)
           또는 --bypass-coverage --reason \"...\" 으로 진행"

Phase 2: Strategist dispatch (Right-Size) ──────────────────────
  ├── small  → implementer 직접 (Fowler 단순 move)
  ├── medium → test-strategist (gap 분석 + move 시퀀스 plan)
  └── large  → architect (경계 재설계, ADR 작성)
  Output: refactor plan — 순차 move 시퀀스

Phase 3: Execute (worktree 격리) ───────────────────────────────
  implementer (mode: refactor)
  ├── 각 move 수행
  ├── 매 move 후 전체 test 실행
  │   ├── GREEN → 다음 move
  │   └── RED  → 즉시 롤백 + CONCERNS 에스컬레이션
  └── 모든 move 완료 시 다음 단계

Phase 4: Post-gate (AC invariant 증명) ─────────────────────────
  ├── scripts/refactor/verify-spec-unchanged.mjs
  │   └── spec 파일 hash 재계산 → 베이스라인과 diff = 0 ?
  └── scripts/refactor/verify-tests-identical.mjs
      └── test 파일 집합 + AC ↔ test 매핑 전/후 동일 ?
  둘 중 하나라도 실패 → BLOCKED (spec/test가 리팩토링 중 오염됨)

Phase 5: Review (병렬) ─────────────────────────────────────────
  ├── reviewer-quality     → 리팩토링 가치 판정 (SOLID, 중복, 명명)
  └── reviewer-performance → 회귀 없음 검증
  ※ reviewer-spec 생략 — Phase 4 script가 이미 결정론적 보증

Phase 6: Verify ────────────────────────────────────────────────
  verifier → 전체 regression + 커버리지 전/후 비교
  커버리지 하락 시 CONCERNS (일부 경로 추출 후 미커버 가능)

Phase 7: Output ────────────────────────────────────────────────
  refactor 보고서 + 4-Status
  ├── 적용된 move 시퀀스
  ├── AC 동일성 증거 (hash diff, test 집합 동일)
  └── 커버리지 델타
```

#### 1.11.3 TDD의 REFACTOR 스텝과의 경계

01-philosophy.md의 **RED-GREEN-REFACTOR**는 원칙 그대로다. 혼동 방지용 경계표:

| | `implement` 내 REFACTOR 스텝 | `/harness:refactor` 스킬 |
|---|---|---|
| 스코프 | **방금 구현한 코드** (이번 feature) | **이미 커밋된 코드** (cross-cutting) |
| Trigger | TDD 사이클 내부 (자동) | 유저 명시 호출 |
| 진입 gate | 없음 — 직전 GREEN이 곧 조건 | 커버리지 임계값 |
| 중단 정책 | 자유 (같은 루프로 복귀) | Phase별 Gate |
| 산출물 | 같은 커밋 내 마무리 | refactor 보고서 + move 로그 |

짧게: **"방금 작업 중인 코드의 청소"는 implement 안에서, "과거 코드의 구조 개선"은 `/harness:refactor`.**

#### 1.11.4 마이그레이션 Lv3와의 관계

[§2 마이그레이션](03-workflow.md#2-도메인-c--마이그레이션-워크플로우)의 Lv3(리팩토링 수준)는 `/harness:refactor`를 **내부 호출**한다:

```
/harness:migrate (strategy=refactor|mixed, 해당 feature 목표 Lv3)
  → Phase 4 합류 후 의존성 역순으로 /harness:refactor 연쇄 호출
  → migrate 컨텍스트에선 config.refactor.min_coverage 를
    migration.lv3_coverage_relaxation 만큼 완화 (마이그레이션 초기엔 커버리지가 낮음)
```

Lv1(관측)·Lv2(래핑)는 `/harness:refactor`를 호출하지 않는다 — 각각 분석·spec/test 축적 단계이고 기존 코드 구조를 변경하지 않으므로. 레벨 정의는 §2.3 참조.

#### 1.11.5 Escape Hatch 재활용

§1.9의 bypass 체계를 그대로 재활용:

| 상황 | 플래그 | audit |
|---|---|---|
| 커버리지 부족하지만 긴급 리팩토링 | `--bypass-coverage --reason "..."` | `gate_bypassed` (bypassed=[coverage]) |
| Post-gate script 실패하지만 수동 검증 완료 | `--bypass-invariant --reason "..."` | `gate_bypassed` (bypassed=[spec_unchanged]) |

`--bypass-invariant`는 **위험 등급 최상** — spec/test가 함께 변경된 경우에만 허용하며, `/harness:spec` 명시 호출을 동반해야 함 (prompt lexicon이 유도).

---

## 2. 도메인 C — 마이그레이션 워크플로우

기존 프로젝트를 하네스 시스템에 도입하는 역방향 워크플로우. **핵심 원칙: 기존 코드를 legacy 폴더로 이동시키거나 entrypoint를 교체하지 않는다.** 기존 디렉토리 구조(`src/`, `app/`, `pkg/` 등) 위에 `.harness/` 레이어를 **추가**하고, 필요한 모듈만 골라 점진적으로 spec/test를 역추출·보강하는 **in-place 축적** 방식이다. 구조 개선이 필요한 모듈은 Lv3 단계에서 worktree 격리로 안전하게 처리한다(§2.3 Lv3, §2.4 롤백).

### 2.0 전체 흐름

```
Phase 0: 마이그레이션 초기화 ────────────────────────────────────
  /harness:migrate init [--strategy wrap|refactor|mixed]
  ├── 기존 프로젝트 분석
  │   ├── 스택 감지 (package.json, go.mod, pom.xml 등)
  │   ├── 기존 테스트 탐지 + 커버리지 측정
  │   ├── 코드 규모/복잡도 산출
  │   └── 기존 문서/설정 탐지
  ├── .harness/ 디렉토리 생성 (기존 구조 건드리지 않음)
  ├── config.yaml 생성 (감지된 스택 + strategy 기록)
  └── 마이그레이션 계획 제안
      "47개 모듈 중 테스트 커버리지 15%.
       핵심 모듈 5개부터 spec 역추출 권장."

Phase 1: 분석 ──────────────────────────────────────────────────
  /harness:migrate analyze
  ├── 코드 → 기능 역추출
  │   └── explorer가 코드를 읽고 기능 목록 생성
  ├── 기존 테스트 → 암묵적 spec 추출
  │   └── test가 있으면 → 무엇을 검증하는지 분석
  ├── 의존성 그래프 생성
  └── 마이그레이션 우선순위 제안

Phase 2: Spec 역추출 ───────────────────────────────────────────
  /harness:migrate extract-spec
  ├── 기존 코드에서 Spec 초안 생성
  ├── 기존 test에서 acceptance criteria 역추출
  ├── 빈틈 식별: "이 기능은 test 없음"
  ├── 유저 검토 + 승인
  └── Output: .harness/specs/ (역추출된 spec)

Phase 3: Test 보강 ─────────────────────────────────────────────
  /harness:migrate gen-test
  ├── Spec의 acceptance criteria 중 test 없는 것 식별
  ├── 누락 test 생성 (기존 코드 기반)
  ├── 기존 test와 신규 test 통합
  └── 커버리지 리포트 생성

Phase 4: 정방향 합류 ───────────────────────────────────────────
  이제 정상 워크플로우를 따를 수 있음:
  ├── 기존 기능 개선 → /harness:spec(수정) → /harness:plan → /harness:implement → /harness:review → /harness:qa
  └── 새 기능 추가 → 일반 도메인 B 워크플로우

  strategy=refactor|mixed 이면 모듈별로 §2.3 Lv3 루프 진입.
```

### 2.1 전략 축 — `--strategy <wrap|refactor|mixed>`

`init`에서 고르는 **마이그레이션 최종 형태**. 기존 코드에 손대는 범위를 결정한다. `.harness/config.yaml`의 `migration.strategy` 에 기록되어 이후 서브커맨드·Lv 라우팅에 영향.

| 전략 | 기존 `src/` 에 손대는가 | 목표 종착점 | 선택 기준 |
|---|:---:|---|---|
| `wrap` | ❌ — spec/test만 `.harness/` 에 덮음 | Lv2 완료 | 테스트 커버리지는 낮지만 코드 품질은 납득 가능, 당장 구조 개선 우선순위 낮음 |
| `refactor` | ⭕ — Lv3로 전 모듈 구조 개선 | Lv3 완료 | 레거시 코드 품질이 유지보수 병목, 재작성 비용을 감당할 수 있는 소규모 코드베이스 |
| `mixed` | ⭕ (선택 모듈만) | 모듈별 Lv2/Lv3 혼합 | **대부분 실무 케이스.** 핵심 모듈만 Lv3, 나머지는 Lv2로 유지 |

**in-place 원칙.** 세 전략 모두 "기존 구조를 legacy/ 폴더로 이동시킨 뒤 새 entrypoint를 지정하는" blue-green 재작성을 **수행하지 않는다**. 기존 import path, 배포 산출물 경로, 빌드 스크립트가 그대로 유지된다. Lv3 리팩토링조차 worktree 격리 내에서 동일 경로에 대한 **Fowler move 시퀀스**로 이뤄지지, 파일 트리 통째로 이동하지 않는다.

이 결정의 이유: blue-green 재작성은 팀이 레거시와 신규를 병행 유지하는 기간 동안 **양쪽 모두에 변경이 발생**해 sync 부담이 기하급수적으로 커진다. 하네스는 "한 경로만 존재, 그 경로의 품질을 점진적으로 올린다"는 축적(accretive) 모델을 택한다.

### 2.2 디렉토리 토폴로지

마이그레이션 시작 후·종료 후 파일 트리가 어떻게 변하는지.

```
migrate init 전:              migrate init 후:              Lv2 완료 후 (wrap):
project/                      project/                      project/
├── src/                      ├── src/          ← 불변      ├── src/          ← 불변
├── tests/                    ├── tests/        ← 불변      ├── tests/        ← 기존 + gen-test 산출물
└── package.json              ├── package.json              ├── package.json
                              └── .harness/     ← 추가      └── .harness/
                                  ├── config.yaml               ├── specs/    ← 역추출
                                  └── migration/                ├── state/
                                      └── analysis.md           └── migration/
```

**불변 규칙**

| 경로 | init | analyze | extract-spec | gen-test | Lv3 refactor |
|---|:---:|:---:|:---:|:---:|:---:|
| 기존 `src/**` | 불변 | 불변 | 불변 | 불변 | **변경** (worktree 내부) |
| 기존 `tests/**` | 불변 | 불변 | 불변 | 추가 | 불변 (hash 동일 유지) |
| 기존 `package.json`·빌드 설정 | 불변 | 불변 | 불변 | 불변 | 불변 |
| `.harness/**` | 생성 | 쓰기 | 쓰기 | 쓰기 | 쓰기 |

**legacy/ 폴더는 만들지 않는다.** 구 코드는 원래 자리에 남고, 새 코드는 같은 자리에서 리팩토링된다. `entrypoint`(서버 기동 파일, CLI bin 등)도 교체하지 않는다 — 기존 `package.json` 의 `main`/`bin` 필드, Dockerfile CMD, CI 파이프라인이 수정 없이 계속 동작해야 한다는 것이 종료 조건의 하나(§2.5).

### 2.3 마이그레이션 레벨 — Lv1 / Lv2 / Lv3

`init`의 `--strategy` 는 **종착점**을 고르고, 실제 진행은 Phase별로 Lv이 올라간다.

| 레벨 | 도달 조건 | 기존 코드 변경 | 내부 동작 | 중단 가능 |
|---|---|:---:|---|:---:|
| **Lv1 — Observe** | Phase 0~1 (`init` → `analyze`) | ❌ | `.harness/migration/analysis.md` 생성, `state/workflow.json` 에 feature 목록 등록 | ✅ 언제든 |
| **Lv2 — Wrap** | Phase 2~3 (`extract-spec` → `gen-test`) | ❌ | `.harness/specs/**` 생성, `tests/**` 보강, 커버리지가 `config.migration.wrap_min_coverage` (기본 60%) 도달 | ✅ feature 단위 |
| **Lv3 — Refactor** | Phase 4 진입 후 모듈별 `/harness:refactor` 내부 호출 | ⭕ | §1.11 Refactor Loop 그대로, `config.refactor.min_coverage` 임계값을 `migration.lv3_coverage_relaxation` 만큼 차감하여 완화 (기본: 70 − 50 = **실효 20%**) | ✅ move 단위 롤백 |

**레벨 상승 규칙**

- `strategy=wrap` 이면 Lv2에서 정지. Phase 4 합류는 하되 `/harness:refactor` 내부 호출은 발생하지 않는다.
- `strategy=refactor` 이면 모든 feature가 Lv3 목표. Phase 4 합류 직후 의존성 그래프 역순으로 `/harness:refactor` 연쇄.
- `strategy=mixed` 이면 `analyze` 가 제안한 우선순위(복잡도·변경 빈도·버그 이력)에 따라 **feature별 목표 레벨**을 결정. `.harness/migration/plan.md` 에 `{feature: target_level}` 테이블로 기록.

**왜 Lv1을 분리했는가.** analyze까지만 끝내고 마이그레이션을 접는 선택은 합법적이다 — "현재 상태 감사 리포트"로만 하네스를 활용하는 팀. Phase 2 이상으로 넘어가면 `.harness/specs/` 가 진실 소스(Source of Truth)가 되므로 역추출 전에 한 번 멈춰 유저 승인을 받을 경계선이 필요.

### 2.4 롤백 — 각 레벨별 복구 경로

마이그레이션은 "기존 구조 위에 축적"이므로 기본 롤백 비용이 낮다. 레벨별 차이는 있다.

| 상황 | 복구 방법 | 유실 범위 |
|---|---|---|
| Lv1에서 중단 | `.harness/` 디렉토리 삭제 | `analysis.md` 만 — 기존 코드 0 영향 |
| Lv2에서 잘못 역추출된 spec | `/harness:sync` 또는 `migrate extract-spec <path>` 재실행 (`--approve-all` 없이) | 해당 feature의 spec 초안만 재생성 |
| Lv2에서 gen-test가 false-positive 테스트 생성 | 해당 테스트 파일 삭제 + 커버리지 재측정 | 생성된 테스트만 |
| Lv3 refactor 도중 RED | §1.11 Phase 3 규칙 그대로 — **즉시 move 롤백, worktree 유지**, `refactor_rolled_back` audit | 직전 move 이전 상태로 복귀 |
| Lv3 refactor 완료 후 회귀 발견 | `git revert <refactor-commit>` — 기존 `src/**` 로 원복 | refactor 커밋 전체 |

**worktree 사용 이유.** Lv3 는 §1.11 Refactor Loop를 그대로 쓰므로 worktree에서 move 시퀀스를 진행한다. 메인 브랜치의 `src/**` 는 refactor 완료·post-gate 통과 후에만 병합된다. 따라서 **마이그레이션 중 서비스 운영 브랜치는 항상 원본**이며, 실패한 Lv3 는 worktree 폐기만으로 정리된다.

**전략 전환.** 중간에 `strategy=mixed` → `wrap` 축소는 자유 (`.harness/config.yaml` 수정 후 잔여 Lv3 작업 중단). 반대 방향(`wrap` → `refactor`)은 `/harness:migrate init --strategy refactor` 재실행으로 plan만 갱신 — 기존 `.harness/specs/**` 는 보존.

### 2.5 종료 조건과 `/harness:sync` 인수인계

"마이그레이션이 끝났다"의 형식적 정의:

| 전략 | 종료 조건 |
|---|---|
| `wrap` | 모든 우선순위 feature가 Lv2 도달 + 전체 커버리지 ≥ `config.migration.wrap_min_coverage` + `analysis.md` 의 `unwrapped_features[]` 가 빔 |
| `refactor` | 모든 feature가 Lv3 도달 + `/harness:refactor` 완료 + `refactor-log.jsonl` 의 미완 move 없음 |
| `mixed` | `plan.md` 의 각 feature가 자기 목표 레벨 도달 |

**종료 시 전환되는 것**

- `.harness/state/workflow.json.migration.completed=true`
- `migration.*` audit 이벤트 중단, 이후는 도메인 B audit 정상 스트림
- `/harness:sync --schedule weekly` 등록 권장 — 마이그레이션 중 쌓인 bypass·drift·retired_assumptions 를 엔트로피 스윕이 주기 회수 (06-cli-reference.md §/harness:sync)

**불변이어야 하는 것 (§2.2 토폴로지 원칙 재확인)**

- 기존 `package.json`·`Dockerfile`·CI 설정의 entrypoint 필드 (`main`, `bin`, `scripts.start`, `CMD`) — 종료 시 **init 전과 동일**해야 한다. 바뀌었다면 그건 마이그레이션이 아니라 blue-green 재작성이다.
- 기존 import path — 외부 패키지가 import하던 경로가 보존돼야 한다.

이 두 불변이 깨지면 `/harness:migrate` 의 범위를 벗어난 것이므로 별도 의사결정(ADR)을 요구한다.

---

## 3. 도메인 A — 하네스 자체 개발

하네스 자체를 개발하는 방법론. **배포 전 단계**이며 marketplace에 포함되지 않음.

```
forge/harness/
├── docs/
│   ├── insights/                ← 리서치 (완료)
│   └── design/                  ← 설계 문서 (현재)
├── dev/                         ← 하네스 개발 작업 공간
│   ├── specs/                   ← 하네스 스킬/에이전트의 spec
│   ├── plans/                   ← 구현 계획
│   └── tests/                   ← 하네스 자체 테스트
├── bench/                       ← 하네스 검증/벤치마크
│   ├── evals/                   ← 스킬 평가 (headless, eval)
│   ├── pressure/                ← 압력 테스트 (3+ 조합)
│   └── regression/              ← 스킬 회귀 테스트
└── marketplace/                 ← 배포 산출물
    └── plugins/
        └── harness/             ← 배포 준비 완료된 플러그인
```

**자체 개발 워크플로우:**

```
1. 설계 (현재 단계)
   → docs/design/ 에 아키텍처/워크플로우 문서화

2. Spec 작성 (dev/specs/)
   → 각 스킬/에이전트의 기대 동작 명세

3. Test 작성 (dev/tests/)
   → Spec 기반 테스트 시나리오
   → Headless 테스트 (-p 모드 활용)
   → Eval 기반 품질 평가

4. 구현 (marketplace/plugins/harness/)
   → Spec과 Test를 충족하는 스킬/에이전트/스크립트 구현

5. 검증 (bench/)
   → 스킬 평가: 동일 입력에 일관된 출력?
   → 압력 테스트: 극단 조건에서도 동작?
   → 회귀 테스트: 변경이 기존 동작을 깨뜨리지 않는가?

6. 배포
   → marketplace/ 에 최종 산출물 배치
   → 버전 태깅
```

#### 3.1 Harness Spec 형식 (`dev/specs/`)

하네스 스킬/에이전트 spec은 사용자 프로젝트 spec(§1.4)과 동일한 YAML 구조를 따르되, 대상이 하네스 컴포넌트.

```yaml
# dev/specs/skill-implement.spec.yaml
id: HSPEC-skill-implement
domain: skills/implement
title: "/harness:implement 스킬"
acceptance_criteria:
  - id: HAC-001
    condition: "spec + plan 없이 호출 시 exit 2 반환"
    testable: "claude -p '/harness:implement auth/login' (spec/plan 미생성 상태) → exit 2 + 'G2: plan 필요' 메시지"
    test_type: eval
  - id: HAC-002
    condition: "Test skeleton을 코드 구현보다 먼저 생성"
    testable: "audit.jsonl 이벤트 순서: test_skeleton_created < code_implementation_started"
    test_type: eval
  - id: HAC-003
    condition: "worktree 격리 환경에서 구현 실행"
    testable: "audit.jsonl 에 worktree_created 이벤트 존재 + 메인 브랜치 변경 없음"
    test_type: eval
```

**스크립트 spec** (`scripts/` 대상):
```yaml
# dev/specs/script-gate-engine.spec.yaml
id: HSPEC-gate-engine
domain: scripts/gates
title: "gate-engine.mjs"
acceptance_criteria:
  - id: HAC-010
    condition: "G1~G5 각 게이트별 exit 2 반환"
    testable: "각 게이트 조건 미충족 시나리오 5개 × exit code 확인"
    test_type: unit    # .mjs 단위 테스트 — eval 불필요
  - id: HAC-011
    condition: "bypass 플래그 시 게이트 통과 + audit 기록"
    testable: "--bypass-spec --reason 'test' → exit 0 + audit.jsonl 에 gate_bypassed 이벤트"
    test_type: unit
```

#### 3.2 테스트 계층 (`dev/tests/` + `bench/`)

| 계층 | 위치 | 대상 | 실행 방식 | 판정 기준 |
|------|------|------|----------|----------|
| **Unit** | `dev/tests/unit/` | 개별 `.mjs` 스크립트 | Node.js 직접 실행 | exit code + stdout/stderr 검증 |
| **Eval** | `bench/evals/` | 스킬 E2E (headless) | `claude -p` + 시나리오 입력 | audit.jsonl 이벤트 순서 + 산출물 존재 여부 |
| **Pressure** | `bench/pressure/` | 스킬 조합 (3+ 연쇄) | 복수 시나리오 순차 실행 | 전체 성공률 ≥ 임계값 (초기 80%, 점진적 상향) |
| **Regression** | `bench/regression/` | 변경 전후 비교 | 변경 전 baseline snapshot 대비 | 기존 eval 결과 동일 (허용 오차: config) |

**Eval 시나리오 형식** (`bench/evals/`):
```yaml
# bench/evals/implement-happy-path.eval.yaml
id: EVAL-implement-001
skill: /harness:implement
setup:
  - create_spec: "dev/fixtures/auth-login.spec.yaml"
  - create_plan: "dev/fixtures/auth-login.plan.yaml"
input: "/harness:implement auth/login"
mode: headless              # claude -p
assertions:
  - type: audit_event_order
    events: [gate_passed, test_skeleton_created, code_implementation_started, implementation_completed]
  - type: file_exists
    paths: ["src/api/auth.ts", "tests/api/auth.test.ts"]
  - type: exit_code
    value: 0
timeout: 300s
```

#### 3.3 부트스트래핑 전략

하네스가 아직 없으므로 **초기에는 수동**, 성숙도에 따라 점진적으로 자기 적용:

| 단계 | 성숙도 | 개발 방식 | 검증 방식 |
|------|--------|----------|----------|
| **Phase 0** (현재) | 설계 문서만 존재 | 수동 구현 + 수동 리뷰 | `dev/tests/unit/` 수동 실행 |
| **Phase 1** | Safety Layer + Gate Engine 동작 | Gate Engine으로 자체 게이트 강제 | Unit + 수동 Eval |
| **Phase 2** | Workflow + Agent 동작 | `/harness:spec` → `/harness:implement` 로 자체 스킬 개발 | Unit + Eval 자동화 |
| **Phase 3** | 전체 파이프라인 동작 | 풀 하네스로 자기 자신을 개발 (재귀적 적용) | Unit + Eval + Pressure + Regression |

> **핵심 원칙:** 각 Phase 전환은 "이전 Phase에서 만든 도구로 다음 Phase를 만든다." Phase 1의 Gate Engine이 Phase 2 개발을 보호하고, Phase 2의 워크플로우가 Phase 3 개발을 구조화한다. 자기 참조 순환이 아닌 **층위별 점진적 자기 적용**.

---

## 4. 테스트 신뢰성 전략

"테스트가 있다"와 "테스트가 신뢰할 수 있다"는 다르다.

### 4.1 테스트 유효성 검증

| 검증 항목 | 방법 | 시점 |
|----------|------|------|
| **빈 assert 금지** | 스크립트로 test 파일 스캔 → assert 없는 test 탐지 | /harness:implement Test-First 단계 |
| **Happy + Failure 모두 존재** | Test Strategist가 spec의 성공/실패 케이스 매핑 확인 | /harness:implement Test-First 단계 |
| **Mock ↔ 실제 괴리** | Integration test에서 실제 의존성 사용 | /harness:qa Integration QA |
| **Mutation 개념** | "코드를 일부러 망가뜨려도 test가 잡는가?" (향후 자동화) | /harness:qa 또는 bench/ |
| **커버리지 임계값** | line/branch 목표 도달 확인 | /harness:implement 최종 검증 |

### 4.2 Side-Effect 감지

```
매 코드 변경 후 (PostToolUse Hook):
  1. 변경된 파일 감지
  2. 해당 파일에 영향받는 test 식별
  3. 영향 test + 기존 전체 test 실행
  4. 깨진 test 있으면:
     → "Side-effect 감지: {test_name}이 실패했습니다.
        변경 전에는 통과했던 테스트입니다.
        원인을 확인하고 수정하세요."
```

### 4.3 Regression 방지

- 버그 수정 시 → **반드시 해당 버그를 재현하는 test 추가** (하네스 강제)
- 기존 test 삭제/수정 시 → 경고 + 사유 기록 강제
- /harness:qa의 Regression Test = 전체 test suite 실행 (새 코드와 무관한 test 포함)

### 4.4 Coverage 전략 — 다축 신뢰도 (Multi-Axis Coverage)

**문제 인식:** Line coverage 100%여도 테스트가 완벽하지 않다. `if (x > 0) return 1` 을 `if (x >= 0) return 1` 로 바꿔도 line은 100%, branch도 통과하는 경우가 흔하다. 하네스는 **단일 정량 수치를 coverage의 증명으로 인정하지 않는다.**

**3범주 × 8축 Coverage Framework:**

| 범주 | 축 | 질문 | 측정 주체 | 도구/주체 예 |
|---|---|---|---|---|
| **정량 (Quantitative)** | line | 라인이 실행됐는가? | coverage runner | Vitest/Jest/pytest-cov |
| 정량 | branch | 분기가 실행됐는가? | coverage runner | 동일 |
| 정량 | **mutation score** | 코드를 일부러 변이시켰을 때 테스트가 감지하는가? | mutation tool | Stryker(JS/TS), PIT(Java), mutmut(Py), cargo-mutants(Rust) |
| 정량 | **AC coverage** | 각 AC가 최소 1개 test에 매핑되고 PASS인가? | `coverage.json` (하네스 내장) | 하네스 자동 추적 |
| **정성 (Qualitative)** | **boundary coverage** | off-by-one / null / empty / max / min / overflow 포함? | test-strategist 에이전트 | 산출물에 명시 체크리스트 |
| 정성 | **error path coverage** | 예외·실패 분기가 테스트되는가? | reviewer-quality 에이전트 | G3 리뷰 체크 |
| 정성 | **integration_ratio** | 실제 의존성 대비 mock-only 테스트 비율은? | 정적 분석 + 에이전트 판단 | 하네스 내장 분석기 |
| **트렌드 (Trend)** | **coverage delta** | 이번 iteration/PR에서 coverage가 감소했나? | `coverage-trend.json` | 하네스 자동 |

**옵션 (Advanced):**

| 축 | 의미 | 도구 |
|---|---|---|
| property-based | 랜덤 입력으로 불변식 검증 | fast-check(JS/TS), Hypothesis(Py), jqwik(Java) |
| contract testing | 서비스 간 스키마·응답 계약 검증 | Pact, Spring Cloud Contract |
| fuzz testing | 예측 불가 입력으로 crash 탐지 | go-fuzz, libFuzzer, atheris |

#### Gate G4 판정 규칙 (다축 AND)

단일 수치가 아닌 **모든 필수 축 충족**이 G4 통과 조건:

```
G4 PASS  ⇔
    line  ≥ config.coverage.line.min
  ∧ branch ≥ config.coverage.branch.min
  ∧ mutation ≥ config.coverage.mutation.min       (선택: tool 설정 시)
  ∧ ac_coverage == 100%                            (모든 AC가 매핑 + PASS)
  ∧ boundary_checklist: all_checked                (정성 체크 — test-strategist)
  ∧ error_path_checklist: all_checked              (정성 — reviewer-quality)
  ∧ integration_ratio ≥ config.coverage.integration_ratio.min
  ∧ delta: no_regression (or exempted with reason)
```

#### Right-Size별 적용 강도

| 축 | small | medium | large |
|---|:---:|:---:|:---:|
| line | ✅ 필수 | ✅ 필수 | ✅ 필수 |
| branch | ✅ 필수 | ✅ 필수 | ✅ 필수 |
| ac_coverage | ✅ 필수 | ✅ 필수 | ✅ 필수 |
| boundary 체크 | ⚠️ 선택 | ✅ 필수 | ✅ 필수 |
| error_path 체크 | ⚠️ 선택 | ✅ 필수 | ✅ 필수 |
| integration_ratio | ⛔ 생략 | ⚠️ 선택 | ✅ 필수 |
| mutation score | ⛔ 생략 | ⚠️ 선택 | ✅ 필수 |
| delta (비감소) | ✅ 필수 | ✅ 필수 | ✅ 필수 |

#### 측정·리포트 파이프라인

```
/harness:qa 진입
  ├── 1. 정량 축 실행
  │   ├── coverage runner → line / branch
  │   ├── (optional) mutation tool → mutation_score
  │   └── scripts/state/check-coverage.mjs → ac_coverage
  │
  ├── 2. 정성 축 수집
  │   ├── test-strategist 산출물 → boundary_checklist
  │   ├── reviewer-quality 산출물 → error_path_checklist
  │   └── scripts/qa/mock-ratio.mjs → integration_ratio
  │
  ├── 3. 트렌드 축 계산
  │   └── scripts/qa/coverage-trend.mjs
  │       ├── 이전 iteration의 각 축 값 로드
  │       ├── 현재 값과 델타 계산
  │       └── 회귀 있으면 reason 필드 강제 (없으면 G4 BLOCK)
  │
  ├── 4. 통합 레포트 생성
  │   └── .harness/reviews/{feature}-qa-{iteration}.md
  │       + .harness/state/coverage-report.json (구조화)
  │
  └── 5. Audit emit: coverage_evaluated
      { axes: {...}, required: {...}, passed: bool, gaps: [...] }
```

#### 한 줄 정리

> **"Coverage는 수치가 아니라 확신의 근거다."** Line 100%는 시작일 뿐, **mutation · boundary · error path · AC · delta**까지 교차 검증해야 "테스트가 실제로 버그를 잡는다"는 주장이 성립한다.

#### 안티패턴 (G4가 잡는 것)

| 패턴 | 증상 | 하네스 대응 |
|---|---|---|
| Line 100% but assertion 없음 | 실행만 하고 검증 안 함 | mutation score로 감지 |
| Mock-only integration | 실제 DB/API 안 찌름 | integration_ratio 하한 |
| AC 하나 빼먹고 다른 것만 테스트 | AC-003 누락 | ac_coverage < 100% → BLOCK |
| Happy path만 있음 | 500/401/timeout 미검증 | error_path_checklist 미체크 |
| Coverage 수치 유지 위해 테스트 삭제 | 교묘한 퇴행 | coverage delta 모니터링 |
| Flaky test를 skip으로 감추기 | skip 늘고 pass는 유지 | skip 수치도 delta 추적 |

---

## 부록 A — 테스팅 방법 정리

하네스 QA 파이프라인이 참조하는 **9가지 테스트 유형**의 표준 정의. 개념이 혼동되는 케이스가 많으므로 **"무엇을 묻는 테스트인가"** 를 기준으로 분리한다. Right-Size별 적용 매트릭스는 §1.2 참조.

### A.1 한눈 비교

| 유형 | 질문 | 범위 | 트리거 | 속도 | 환경 |
|------|------|------|--------|:----:|------|
| **Unit** | "이 함수가 맞게 동작하는가?" | 단일 함수/클래스 | 코드 변경마다 | 초 이내 | mock 허용 |
| **Sanity** | "수정한 부분이 최소한 돌아가는가?" | 변경 부위 국소 | 수정 직후 | 초 이내 | 실제/유사 |
| **Smoke** | "빌드가 망가지지 않았는가?" (연기 테스트) | 핵심 경로 E2E 슬라이스 | 빌드/배포 직전 | 수 분 | staging 유사 |
| **Integration** | "모듈들이 함께 동작하는가?" | 2+ 모듈 결합 (DB/API 포함) | PR / CI | 분 단위 | 실제 의존성 |
| **Regression** | "예전에 되던 게 아직도 되는가?" | 전체 기능 (비파괴 검증) | 변경 후 QA | 수십 분 | 실제 의존성 |
| **E2E** | "유저 시나리오가 끝까지 동작하는가?" | UI → 백엔드 → DB 전 구간 | nightly / 배포 전 | 분~시간 | 실제 환경 |
| **Load** | "기대 부하에서 성능·안정성이 나오는가?" | 시스템 전체 | 주기적 / 배포 전 | 수 분~수십 분 | 프로덕션 유사 |
| **Stress** | "한계를 넘으면 어떻게 실패하는가?" | 시스템 전체 (초과 부하) | 릴리스 마일스톤 | 수십 분 | 프로덕션 유사 |
| **Recovery** | "장애 후 복구되는가?" | 전체 시스템 + 인프라 | 릴리스 마일스톤 | 시간 단위 | 프로덕션 유사 |

### A.2 각 테스트 정의

**Unit Test (단위 테스트)**
- **정의:** 하나의 함수·클래스·모듈의 **행동 계약**을 독립적으로 검증. 외부 의존성은 원칙적으로 mock/stub.
- **통과 기준:** 입력 → 예상 출력. 순수성 높을수록 좋음.
- **실수 포인트:** "Unit = 1 테스트당 assert 1개"는 오해. 1 단위의 1 행동을 검증하는 게 핵심.
- **하네스 예:** `tests/auth/login.test.ts#valid-credentials` — `AuthService.login()` 단일 호출 검증.

**Sanity Test (제정신 테스트)**
- **정의:** 변경된 기능/수정된 부분이 **최소한 "말이 되는가"** 를 국소 확인. 좁고 얕음 (narrow + shallow).
- **Smoke와 차이:** Smoke는 **넓고 얕게** (핵심 경로 전체), Sanity는 **좁고 얕게** (수정 부위만).
- **트리거:** 버그 수정·핫픽스 직후. "일단 깨진 곳은 붙었는가?"
- **하네스 예:** lockout 버그 수정 → 해당 함수만 호출해 결과가 숫자인지 0이 아닌지 확인.

**Smoke Test (연기 테스트)**
- **정의:** "불을 켜니 연기가 나는가" — 빌드/배포 직후 **핵심 경로**만 빠르게 종단 검증. **넓지만 얕음** (broad + shallow).
- **통과 기준:** 로그인/결제/메인 기능 같은 business-critical flow 1~2개가 end-to-end로 돌아감.
- **Sanity와 차이:** Smoke는 전체 시스템이 "최소 구동 가능한가", Sanity는 특정 수정이 "말이 되는가".
- **하네스 예:** `/harness:qa` §3 Smoke Test — 로그인 → 메인 → 로그아웃 스크립트 1회 통과.

**Integration Test (통합 테스트)**
- **정의:** 2개 이상의 모듈이 **실제 의존성**(DB, 외부 API, 메시지 큐)과 함께 연동 시 올바르게 동작하는가.
- **Unit과 차이:** Unit은 mock으로 고립, Integration은 실제(or 컨테이너) 의존성 사용.
- **통과 기준:** 모듈 간 계약·트랜잭션·타이밍 검증.
- **하네스 예:** `AuthService + PostgreSQL + Redis` 컨테이너 — 로그인 5회 실패 후 Redis lockout 카운터 반영.

**Regression Test (회귀 테스트)**
- **정의:** 새 변경이 **기존에 통과하던 기능**을 깨뜨리지 않았는지 확인. 별도 테스트 케이스를 작성하는 게 아니라 **전체 기존 test suite 재실행**으로 성립.
- **원칙:** 버그 수정 시 **그 버그를 재현하는 test**를 먼저 추가 → 이후 suite의 일부가 되어 영구 회귀 방어.
- **하네스 강제:** §4.3 — 기존 test 삭제/수정 시 경고 + 사유 기록.
- **하네스 예:** PR마다 CI에서 전체 suite 실행. PostToolUse Hook도 side-effect 검출에 사용.

**E2E Test (End-to-End 테스트)**
- **정의:** 실제 유저 관점으로 **UI → 백엔드 → DB → 외부 시스템** 전 구간을 시나리오 단위로 검증. Smoke보다 **깊고 다양**.
- **Smoke와 차이:** Smoke = 최소 핵심 경로 1개, E2E = 다양한 시나리오 + edge case 포함.
- **도구:** Playwright / Cypress / Selenium (05-project-structure.md `testing.e2e_tool` 설정).
- **하네스 예:** 가입 → 이메일 인증 → 로그인 → 상품 결제 → 환불 → 로그아웃 전체 플로우.

**Load Test (부하 테스트)**
- **정의:** **기대 부하**(expected production load)에서 시스템이 목표 성능 SLA를 지키는지 검증.
- **통과 기준:** 정의된 RPS/동시접속에서 p50/p95/p99 latency, 에러율, 리소스 사용량이 임계 이내.
- **Stress와 차이:** Load = "평소 수준에서 괜찮은가", Stress = "한계 넘기면 어떻게 망가지는가".
- **하네스 예:** `k6 run load.js` — 1000 RPS · 60s · error_rate < 0.1% · p95 < 200ms.

**Stress Test (스트레스 테스트)**
- **정의:** **기대 부하를 초과**하는 상황에서 시스템이 **어떻게 실패하는가**(failure mode)를 관찰. 목적은 "안 망가짐"이 아니라 "망가질 때 graceful한가".
- **통과 기준:** 요청 drop 시 명확한 에러 응답, 데이터 손상 없음, circuit breaker 동작, 부하 감소 시 자동 회복.
- **하네스 예:** 목표치의 10배까지 부하 증가 → OOM 없이 429 반환 → 부하 감소 시 30초 내 정상화.

**Recovery Test (복구 테스트)**
- **정의:** 장애 발생(DB down, 노드 crash, network partition, 디스크 full) **이후** 시스템이 자동/수동으로 정상 상태로 복귀하는지 검증.
- **Stress와 차이:** Stress는 한계까지 밀어붙이는 동안, Recovery는 **장애가 끝난 뒤**의 복귀 능력에 초점.
- **통과 기준:** RTO(복구 시간)·RPO(데이터 손실 허용치) SLA 달성. Data integrity 유지.
- **하네스 예:** Primary DB kill → 30초 내 replica failover → 기존 세션 유지 + 실패했던 write는 명확히 거절 (no silent loss).

### A.3 자주 하는 혼동 — 판별 플로우차트

```
변경 지점에 국한? ── Yes ──→ Sanity
       │ No
       ▼
mock으로 고립 가능? ── Yes ──→ Unit
       │ No
       ▼
핵심 경로 1~2개만? ── Yes ──→ Smoke
       │ No
       ▼
다양한 유저 시나리오 전 구간? ── Yes ──→ E2E
       │ No
       ▼
여러 모듈 + 실제 의존성? ── Yes ──→ Integration
       │ No
       ▼
기존 기능 비파괴 확인? ── Yes ──→ Regression
       │ No
       ▼
부하 상황 → 기대치 내? ── Yes ──→ Load
       │ No (한계 초과)
       ▼
한계 초과 시 실패 양상? ── Yes ──→ Stress
       │ No (장애 후)
       ▼
장애 후 복구 능력? ────────────→ Recovery
```

### A.4 테스트 피라미드 vs 트로피 (비율 가이드)

| 형태 | 비율 (Unit : Integration : E2E) | 적합한 프로젝트 |
|------|--------------------------------|----------------|
| **Pyramid** (전통) | 70 : 20 : 10 | 로직 복잡, 외부 의존성 적은 백엔드 |
| **Trophy** (Kent C. Dodds) | 20 : 60 : 15 (+ 5 static) | UI·BFF·통합 중심 서비스 |

- Load / Stress / Recovery는 **피라미드 외부**로 취급 (리소스·타이밍 독립). Smoke / Sanity / Regression은 수단이지 레이어가 아니므로 비율 대상이 아님.
- **하네스는 Pyramid/Trophy 비율을 직접 강제하지 않는다.** 실질적 품질 강제는 `integration_ratio`(mock-vs-real) + Coverage 8축이 담당. 잡아야 할 건 **layer 개수 비율**이 아닌 **mock-only 편향** — 전자는 업계 합의도 없고(Dodds Trophy 논쟁), 분류 규약 의존으로 결정론적 강제가 어렵지만, 후자는 `scripts/qa/mock-ratio.mjs` 로 결정론적으로 측정·차단 가능. Shape 선택은 팀 내부 소통·온보딩용 가이드로만 활용.

### A.5 하네스에서의 연결 관계

```
Spec AC ──→ Unit/Integration (AC 직접 검증)
   │
   └──→ Edge case ──→ Unit (방어 케이스)

Sprint Loop:
  implement 직후 → Unit + Sanity (PostToolUse Hook)
  review 통과 후 → Integration + Regression
  qa 단계        → + Smoke + E2E (규모 ≥ medium)
                 → + Load + Stress + Recovery (규모 = large)
  deploy 직전   → Smoke (프로덕션 환경 유사)
```

각 테스트 유형의 실행 명령은 `config.yaml → testing.commands.*` 에서 정의 (05-project-structure.md §6 참조).
