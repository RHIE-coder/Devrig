# Agent System

> 역할 에이전트, 단계별 조합, 페르소나 시스템, 모델 티어링, 에스컬레이션.
>
> **반복 등장 용어:** `AC`(Acceptance Criteria — reviewer-spec이 충족 여부 검증), `Right-Size`(small/medium/large — review 깊이/병렬 reviewer 수 조절에 사용). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 1. 이중 구조 — 역할(내부) + 단계(인터페이스)

```
사용자가 보는 것 (단계 기반 — Skill):
  /harness:brainstorm → /harness:spec → /harness:architect → /harness:plan → /harness:implement → /harness:review → /harness:qa

내부에서 동작하는 것 (역할 기반 — Agent):
  explorer, implementer, reviewer-*, test-strategist, verifier, architect, ...
```

**사용자는 단계를 호출하고, 스킬이 내부적으로 역할 에이전트를 조합한다.**

예: `/harness:review` 호출 시
```
/harness:review Skill (Controller)
  ├── explorer → 변경 코드 읽기 + diff 분석
  ├── reviewer-security → 보안 관점 리뷰
  ├── reviewer-performance → 성능 관점 리뷰
  ├── reviewer-quality → 코드 품질 관점 리뷰
  └── reviewer-spec → Spec 준수 관점 리뷰
```

---

## 2. 기본 역할 에이전트 (Core Agents)

하네스에 내장된 역할 에이전트. `agents/core/`에 정의.

### 2.1 탐색/분석 계열

| 에이전트 | 모델 | 도구 | 격리 | 역할 |
|---------|:----:|------|:----:|------|
| **explorer** | haiku | Read, Grep, Glob | - | 코드/문서 탐색, 구조 파악. 읽기 전용 |
| **requirements-analyst** | sonnet | Read, Grep, Glob | - | Brainstorm 결과 → 구조화된 요구사항 추출 |
| **devils-advocate** | opus | Read, Grep | - | 모든 아이디어/spec/plan에 반론. 빈틈 공격 |

### 2.2 설계 계열

| 에이전트 | 모델 | 도구 | 격리 | 역할 |
|---------|:----:|------|:----:|------|
| **architect** | opus | 전체 | - | 아키텍처 결정, 시스템 설계, ADR 작성 |
| **test-strategist** | sonnet | Read, Grep, Bash(test) | - | Spec → test 전략 수립, test skeleton 검증 |

### 2.3 구현 계열

| 에이전트 | 모델 | 도구 | 격리 | 역할 |
|---------|:----:|------|:----:|------|
| **implementer** | sonnet | 전체 | **worktree** | Plan 따라 코드 구현. TDD 순서 준수 |
| **verifier** | haiku | Bash, Read, Grep | - | 테스트 실행, 커버리지 확인. 결과만 판단 |

### 2.4 리뷰/QA 계열

| 에이전트 | 모델 | 도구 | 격리 | 역할 |
|---------|:----:|------|:----:|------|
| **reviewer-security** | opus | Read, Grep, Glob | - | OWASP 기준 보안 취약점 검사 |
| **reviewer-performance** | sonnet | Read, Grep, Glob | - | N+1, 메모리 누수, 복잡도 검사 |
| **reviewer-quality** | sonnet | Read, Grep, Glob | - | 클린 코드, 패턴 준수, 중복 검사 |
| **reviewer-spec** | sonnet | Read, Grep, Glob | - | Spec acceptance criteria 충족 여부 검증 |
| **qa-engineer** | sonnet | Bash, Read, Grep | **worktree** | 도메인별 QA 실행 (unit/integration/e2e/regression) |

### 2.5 리뷰어 판단 기준 (Reviewer Judgment Criteria)

리뷰어가 **"느낌"이 아닌 구체적 기준**으로 판단하기 위한 참조 체계.

| 리뷰어 | 1차 기준 | 2차 기준 | 참조 파일 |
|--------|---------|---------|----------|
| **reviewer-security** | OWASP Top 10 (2021) | CWE Top 25 (2023) | `references/security-review.md` |
| **reviewer-performance** | Big-O 복잡도, N+1 감지 | 메모리 누수 패턴, 불필요 할당 | `references/performance-review.md` |
| **reviewer-quality** | SOLID 원칙, Clean Code | 언어별 관례 (eslint/golint 등) | `references/code-quality-review.md` |
| **reviewer-spec** | Spec AC 충족 여부 | Edge case 커버리지 | Spec 파일 자체 |

**구체적 기준 예시:**

```
reviewer-security가 검사하는 것:
  OWASP Top 10:
    A01 — Broken Access Control: 인가 우회 가능성
    A02 — Cryptographic Failures: 평문 저장, 약한 알고리즘
    A03 — Injection: SQL/NoSQL/OS/LDAP injection
    A07 — XSS: 사용자 입력이 HTML/JS에 직접 삽입되는가
    ...

  CWE Top 25:
    CWE-79  — Improper Neutralization of Input (XSS)
    CWE-89  — SQL Injection
    CWE-787 — Out-of-bounds Write
    CWE-862 — Missing Authorization
    ...

reviewer-quality가 검사하는 것:
  SOLID:
    S — 클래스/함수가 단일 책임인가
    O — 확장에 열려있고 수정에 닫혀있는가
    L — 하위 타입이 상위 타입을 대체 가능한가
    I — 불필요한 인터페이스 의존이 없는가
    D — 고수준 모듈이 저수준 모듈에 직접 의존하지 않는가

  Clean Code:
    함수 길이 (권장 20줄 이하)
    매개변수 수 (권장 3개 이하)
    네이밍 명확성 (약어 사용, 의미 불명확 변수)
    중복 코드 (3회 이상 반복)
```

각 리뷰어의 `references/` 파일에 기준의 전체 목록과 판단 가이드가 포함된다.
리뷰어는 발견 사항을 기준 ID와 함께 보고한다 (예: "A03 위반 — user input이 SQL 쿼리에 직접 삽입됨").

---

## 3. Agent × Phase 매트릭스

각 SDLC Phase에서 어느 에이전트가 어떤 역할로 참여하는가. 한 화면에서 전체 관계를 파악하기 위한 요약 매트릭스.

- **P** = Primary (해당 Phase의 주 실행자)
- **S** = Support (보조 참여)
- **·** = 미참여

| 에이전트 \\ Phase | brainstorm | spec | architect | plan | implement | review | qa | refactor ⟲ |
|------------------|:---:|:----:|:---------:|:----:|:---------:|:------:|:--:|:---:|
| explorer | · | S | S | S | S | S | · | S |
| requirements-analyst | S | **P** | · | · | · | · | · | · |
| devils-advocate | S | S | S | · | · | · | · | · |
| domain-expert *(user persona)* | S | S | S | · | · | S | · | · |
| architect | · | · | **P** | S | · | · | · | S *(large)* |
| test-strategist | · | S | · | · | **P** (Test-First) | · | S | S *(medium)* |
| implementer | · | · | · | · | **P** | · | · | **P** *(mode: refactor)* |
| verifier | · | · | · | · | S | · | S | S |
| reviewer-security | · | · | · | · | · | **P** | S | · |
| reviewer-performance | · | · | · | · | · | **P** | S | **P** |
| reviewer-quality | · | · | · | · | · | **P** | · | **P** |
| reviewer-spec | · | S | · | · | · | **P** | S | · *(spec 불변 — script로 보증)* |
| qa-engineer | · | · | · | · | · | · | **P** | · |

**읽는 법:**
- 한 **Phase**의 세로열을 보면 그 Phase에서 동작하는 에이전트 전체가 나옴
- 한 **에이전트**의 가로행을 보면 그 에이전트가 참여하는 Phase 분포가 나옴
- `구현자 ≠ 검증자` 규칙(IL-5) 확인: implementer 행과 reviewer-* 행이 겹치지 않음
- ⟲ = SDLC 선형 흐름 바깥의 유지보수 루프 (`/harness:refactor`, §4 참조). strategist는 Right-Size로 분기 (small=implementer 직접 / medium=test-strategist / large=architect).

상세한 호출 순서/입출력은 §4 단계별 조합 참조.

---

## 4. 단계별 에이전트 조합

각 Skill(단계)이 어떤 에이전트를 어떤 순서로 조합하는가.

### /harness:brainstorm

```
Controller (brainstorm Skill)
  │
  ├── 1. 기본 페르소나 로드
  │   ├── devils-advocate → 반론 관점
  │   ├── requirements-analyst → 구조화 관점
  │   └── (내장 페르소나: User Empathy, Technical Feasibility, Scope Guardian)
  │
  ├── 2. 유저 페르소나 로드 (.claude/agents/*.md)
  │   └── 유저가 정의한 도메인 전문가들
  │
  ├── 3. 각 페르소나가 독립 서브에이전트로 의견 제시
  │   └── 병렬 실행, 각자 독립 컨텍스트
  │
  └── 4. Controller가 종합
      ├── 합의점 정리
      ├── 쟁점/미결 정리
      └── Output: brainstorm 결과 문서
```

### /harness:spec

```
Controller (spec Skill)
  │
  ├── 1. requirements-analyst
  │   └── Brainstorm 결과(있으면) → 구조화된 요구사항 추출
  │
  ├── 2. 유저 Domain Expert (있으면)
  │   └── 도메인 특화 검증 ("이 Bounded Context가 맞는가?")
  │
  ├── 3. test-strategist
  │   └── 모든 acceptance criteria가 testable한지 검증
  │   └── 테스트 유형 제안 (unit/integration/e2e)
  │
  ├── 4. devils-advocate
  │   └── Spec 빈틈 공격 ("이 edge case는?", "실패 시나리오는?")
  │
  └── 5. Controller가 종합
      ├── scripts/spec/validate-spec.mjs → 형식 검증
      ├── scripts/spec/check-testability.mjs → testability 확인
      └── Output: .harness/specs/{domain}/{feature}.spec.yaml
```

### /harness:architect

```
Controller (architect Skill)
  │
  ├── 1. explorer
  │   └── 기존 코드/아키텍처 탐색
  │
  ├── 2. architect
  │   ├── Spec + Config(architecture 섹션) 읽기
  │   ├── 하네스 범용 기준 적용 (SOLID, OWASP, 성능)
  │   ├── 유저 선호 적용 (clean-architecture, hexagonal 등)
  │   └── 아키텍처 결정 + 근거 문서화
  │
  ├── 3. devils-advocate
  │   └── 아키텍처 약점 공격
  │
  └── 4. Output: .harness/decisions/{nnn}-{title}.md
```

### /harness:plan

```
Controller (plan Skill)
  │
  ├── 1. explorer
  │   └── Spec, Architecture Decision, Knowledge(유사 해결책) 읽기
  │
  ├── 2. architect (또는 implementer)
  │   ├── Spec → 태스크 분해
  │   ├── 각 태스크: 입력/출력/검증 기준 명시
  │   ├── 의존성 순서 정리
  │   └── Spec AC ↔ Plan Step ↔ Test 매핑 테이블 작성
  │
  ├── 3. scripts/plan/validate-plan.mjs
  │   └── 모든 Spec AC가 Plan에 매핑되었는지 확인
  │
  └── 4. Output: .harness/plans/{domain}/{feature}.plan.md
```

### /harness:implement

```
Controller (implement Skill)
  │
  ├── 1. explorer → Spec, Plan, Config, 기존 코드 읽기
  │
  ├── 2. test-strategist → Test skeleton 생성 + 검증
  │   └── 각 AC → test code (모두 FAIL 상태)
  │
  ├── 3. implementer (worktree 격리)
  │   ├── Plan step 순서대로 구현
  │   ├── 각 step 후 test 실행 (GREEN 확인)
  │   └── Side-effect 발생 시 즉시 수정
  │
  ├── 4. verifier → 전체 test suite 실행 + 커버리지 확인
  │
  └── 5. Output: 구현 완료된 코드 + 모든 test PASS
```

### /harness:review

```
Controller (review Skill)
  │
  ├── 1. explorer → diff 분석 (변경 범위 파악)
  │
  ├── 2. 병렬 리뷰 dispatch (Right-Size에 따라 수 조절)
  │   ├── reviewer-security
  │   ├── reviewer-performance
  │   ├── reviewer-quality
  │   └── reviewer-spec
  │
  ├── 3. scripts/review/collect-verdicts.mjs → 종합
  │
  └── 4. Output: 리뷰 결과 + PASS/NEEDS_CHANGE/BLOCK
```

### /harness:qa

```
Controller (qa Skill)
  │
  ├── 1. qa-engineer (worktree 격리)
  │   ├── Unit/Integration QA
  │   ├── API QA (해당 시)
  │   ├── UI/UX QA (해당 시)
  │   ├── DB QA (해당 시)
  │   └── Infra QA (해당 시)
  │
  ├── 2. verifier → Regression test (전체 suite)
  │
  ├── 3. verifier → Smoke test (핵심 경로)
  │
  └── 4. Output: QA 보고서 + PASS/FAIL
```

### /harness:refactor ⟲ (유지보수 루프)

**스코프:** 이미 커밋된 코드의 **구조 개선 (behavior-preserving)**. 메인 SDLC 루프의 바깥이며, `/harness:migrate`·`/harness:sync`와 같은 계열.

**TDD의 REFACTOR 스텝과의 경계:**
| | `implement` 내 REFACTOR | `/harness:refactor` |
|---|---|---|
| 스코프 | **방금 구현한 코드** (이번 feature) | **이미 커밋된 코드** (cross-cutting) |
| Trigger | TDD 사이클 내부 | 유저 명시 호출 |
| 진입 gate | 없음 (이번 AC의 test GREEN) | 커버리지 임계값 |

```
Controller (refactor Skill)
  │
  ├── 1. Pre-gate (script-first)
  │   ├── scripts/refactor/snapshot.mjs → spec/test 베이스라인 해시
  │   └── verifier → 커버리지 ≥ config.refactor.min_coverage (기본 70%)
  │       부족 시 BLOCK: "characterization test 먼저 보강"
  │       (migrate Lv3 호출 시 임계값 완화 — config override)
  │
  ├── 2. explorer → 대상 코드 + 의존 그래프
  │
  ├── 3. Strategist dispatch (Right-Size)
  │   ├── small  → implementer 직접 (Fowler 단순 move: Extract/Inline/Rename)
  │   ├── medium → test-strategist (characterization test gap 분석 + move 시퀀스)
  │   └── large  → architect (경계 재설계 동반, ADR 작성)
  │   Output: refactor plan (move 시퀀스)
  │
  ├── 4. implementer (worktree, mode: refactor)
  │   ├── 각 move 수행 후 전체 test GREEN 확인 (AC invariant)
  │   └── 하나라도 RED → 즉시 중단, 직전 move 되돌리기
  │
  ├── 5. Post-gate (script-first, AC invariant 증거)
  │   ├── scripts/refactor/verify-spec-unchanged.mjs → spec 파일 hash diff = 0
  │   └── scripts/refactor/verify-tests-identical.mjs → test 파일 집합 + AC 매핑 전/후 동일
  │       어느 한 쪽 실패 → BLOCKED (spec/test가 리팩토링 중 바뀜)
  │
  ├── 6. 병렬 리뷰 dispatch
  │   ├── reviewer-quality → 리팩토링 가치 (SOLID, 중복 제거, 명명 개선)
  │   └── reviewer-performance → 회귀 없음 확인
  │   ※ reviewer-spec은 호출하지 않음 — spec 불변은 5의 script가 이미 보증 (IL-5 중복 회피)
  │
  ├── 7. verifier → 전체 regression + 커버리지 전/후 비교
  │
  └── 8. Output: refactor 보고서 (적용된 move 시퀀스 + AC 동일성 증거)
```

**왜 전담 에이전트를 만들지 않는가:**
- 실행 자체는 "코드 편집" → implementer 재사용. 새 executor 에이전트는 경계 중복만 만든다.
- 전략 수립도 기존 strategist 3계층(implementer/test-strategist/architect)이 Right-Size별로 커버한다.
- AC invariant 보증은 script 두 개로 결정론적 — LLM 재검증 불필요 (Script-First 원칙).
- 결과: **새 에이전트 0개**, 새 스킬 1개 + script 2개 + implementer mode 플래그만 추가.

---

## 5. 페르소나 시스템

### 5.1 기본 페르소나 vs 유저 페르소나

| 구분 | 제공 | 저장 위치 | 생성 시점 |
|------|------|----------|----------|
| **기본 페르소나** | 하네스 내장 | `agents/core/` (플러그인 내부) | 하네스 설치 시 |
| **유저 페르소나** | 유저 생성 | `.claude/agents/` (Claude Code 표준 경로) | /harness:init 또는 수동 |

> **왜 `.claude/agents/`인가?** Claude Code는 `.claude/agents/*.md`를 네이티브로 탐색한다.
> 별도 경로(`.claude/agents/`)를 만들면 동적 변환이 필요하지만,
> 표준 경로를 사용하면 Claude Code가 자동으로 인식하며 추가 오버헤드가 없다.

### 5.2 기본 페르소나 (Brainstorm용)

| 페르소나 | 관점 | 핵심 질문 |
|---------|------|----------|
| **Devil's Advocate** | 반론 | "이게 실패하는 시나리오는?" |
| **User Empathy** | 최종 사용자 | "사용자가 정말 이걸 원하나? 어떻게 느끼나?" |
| **Technical Feasibility** | 기술적 현실 | "이 스택으로 가능한가? 시간/비용은?" |
| **Scope Guardian** | 범위 통제 | "MVP에 꼭 필요한가? 빼면 안 되나?" |

### 5.3 유저 페르소나 생성

**방법 1: /harness:init에서 자동 제안**
```
/harness:init 실행 →
  project.type: webapp 감지 →
  "다음 페르소나를 추천합니다:
   - UX Designer: 사용자 경험 관점
   - Frontend Architect: 프론트엔드 구조 관점
   - DevOps Engineer: 배포/운영 관점
   생성하시겠습니까?"
```

**방법 2: 직접 생성 (Claude Code 표준 Agent 포맷)**
```markdown
# .claude/agents/ddd-expert.md
---
name: DDD Expert
description: Domain-Driven Design 관점에서 설계/아키텍처 검토
model: sonnet
tools: Read, Grep, Glob
---

## 역할
Domain-Driven Design 전문가. 모든 설계를 Bounded Context, Aggregate,
Value Object 관점에서 판단한다.

## 관점
- 도메인 언어(Ubiquitous Language)의 일관성을 최우선으로 검증
- 기술적 편의보다 도메인 모델의 정확성을 중시
- Bounded Context 경계가 명확한지 확인

## 우선순위
1. domain-model-accuracy
2. bounded-context-clarity
3. ubiquitous-language-consistency

## 참여 단계
brainstorm, spec, architect, review
```

**방법 3: 템플릿 기반 생성**

하네스가 제공하는 템플릿 (`agents/personas/templates/`):

| 템플릿 | 대상 | 예시 |
|--------|------|------|
| `domain-expert.template.md` | 기술 도메인 전문가 | Java Expert, React Expert 등 |
| `business-role.template.md` | 비즈니스 역할 | CTO, Product Manager, Marketing 등 |
| `tech-specialist.template.md` | 특화 기술자 | Security Specialist, DB Admin 등 |

템플릿 사용 시 `.claude/agents/`에 `.md` 파일로 생성된다.

**방법 4: /harness:persona create 스킬 (Persona Maker)**

대화형으로 페르소나를 생성하는 전용 스킬. 유저가 페르소나 작성 포맷을 모를 때, 또는 템플릿만으로 부족할 때 사용.

```
/harness:persona create

  1. 유저 질문 단계:
     - 어느 도메인/역할입니까? (예: "React 성능", "SaaS 과금 전문가")
     - 주요 관점은 무엇입니까? (3-5개)
     - 어느 단계에 참여해야 합니까? (brainstorm/spec/architect/review)
     - 참고할 표준/문서가 있습니까? (OWASP, Clean Code, DDD 등)
     - 모델 선호: haiku | sonnet | opus (기본 sonnet)

  2. 하네스 동작:
     - 답변을 기반으로 가장 적합한 템플릿 선택
     - 템플릿 + 답변 → 페르소나 .md 초안 생성
     - 유저에게 초안 제시 → 수정 또는 승인
     - 승인 시 .claude/agents/{name}.md 저장
     - Spec의 required_personas 자동 연동 제안

  3. 출력:
     .claude/agents/{name}.md (Claude Code 표준 포맷)
     + 생성 리포트 (어느 템플릿 기반인지, 튜닝 포인트)
```

**왜 별도 스킬인가:**
- 페르소나 포맷을 모르는 유저에게 "가이드를 읽어라"는 마찰 큼
- 페르소나 품질은 브레인스토밍/리뷰 품질에 직결 → 자동화 가치 높음
- `/harness:spec`의 `required_personas`가 "이 페르소나가 필요하다"고 명시한 경우 → Persona Maker로 바로 링크 가능 (§8.2 참조)

### 5.4 페르소나 로드 방식

```
.claude/agents/ddd-expert.md    ← Claude Code 표준 경로
  │
  └── /harness:brainstorm 호출 시:
      → Skill이 .claude/agents/ 스캔
      → 참여 단계 확인 (frontmatter 또는 "참여 단계" 섹션)
      → 해당 단계면 서브에이전트로 스폰
      → 독립 컨텍스트에서 의견 제시
      → 결과를 Controller에 반환
```

Claude Code 표준 Agent `.md` 포맷을 사용하므로 별도 변환이 필요 없다.
Skill이 하는 일은 **필터링**(어느 단계에 참여하는가)과 **컨텍스트 주입**뿐이다:

```
Controller:
  "현재 논의 대상: {Spec/Plan/아키텍처 결정 등}
   당신의 관점에서 의견을 제시하세요."
  → .claude/agents/ddd-expert.md 를 Agent로 스폰
```

---

## 6. 모델 티어링

### 6.1 티어링 원칙 — "Cost of Miss" 기반 할당

각 역할의 **실수 비용(cost of miss)** 과 **결정론적 검증 가능성** 을 기준으로 모델을 배치한다.

| 원칙 | 의미 |
|------|------|
| High cost of miss + 1회성 판단 | **opus** — 재검증이 어려운 판단. architect, reviewer-security, devils-advocate |
| Medium cost + 구조적 검증 존재 | **sonnet** — Test gate/AC 매핑으로 실수 감지 가능 |
| Low cost + 기계적 패턴 | **haiku** — 읽기/실행/매칭. LLM 판단 최소 |

### 6.2 역할별 기본 모델 + 근거

| 에이전트 | 모델 | 근거 (왜 이 모델인가) |
|---------|:----:|----------------------|
| **architect** | **opus** | 아키텍처 결정은 한 번 내리면 수개월을 좌우. 잘못된 경계 결정은 전체 리팩토링 유발. 최고 추론 필요 |
| **devils-advocate** | **opus** ⚑ | 적대적 사고(adversarial)는 깊은 reasoning의 대표 케이스. Spec/Plan의 빈틈을 찾아야 하며, 여기서 놓친 결함은 구현 후 재작업 비용이 크다 |
| **reviewer-security** | **opus** ⚑ | 보안 취약점 1건 누락 = 프로덕션 사고. OWASP/CWE 체크는 단순 패턴 매칭을 넘어 데이터 흐름 추론이 필요. recall 최우선 |
| **implementer** | **sonnet** | Test-First + Distrust by Structure로 **구조적 검증 장치**가 이미 존재. sonnet이 놓친 버그는 reviewer / verifier / qa-engineer가 포착. 구현은 병렬/반복 실행이 많아 opus는 비용 비효율. **`mode: refactor`** 플래그 시 프롬프트가 분기되어 AC invariant 검증(전/후 test 동일 GREEN)으로 목표 반전 — §4 `/harness:refactor` 참조 |
| **test-strategist** | sonnet | AC → test mapping은 체계적이지만 패턴화 가능. sonnet의 coverage reasoning이면 충분 |
| **reviewer-performance** | sonnet | N+1 / Big-O / 메모리 패턴은 잘 알려진 카탈로그. 패턴 인식 중심 |
| **reviewer-quality** | sonnet | SOLID / Clean Code는 코드 형태 기반 판단. 정적 분석 도구와 상보적 |
| **reviewer-spec** | sonnet | AC ↔ 코드 매핑은 체계적 비교 작업 |
| **qa-engineer** | sonnet | 테스트 실행 + 결과 분석. 실행은 Bash, 판단은 sonnet으로 충분 |
| **requirements-analyst** | sonnet | 사용자 언어 → 구조화된 AC 변환 |
| **verifier** | haiku | `pytest` / `coverage` 실행 후 결과 파싱. LLM 판단 거의 없음 |
| **explorer** | haiku | Glob/Grep/Read 후 요약. 기계적 탐색 |

⚑ = **opus 재할당** (이전: sonnet → 이번 리뷰에서 상향).

**왜 implementer는 opus가 아닌가 — 자주 받는 질문:**

1. **테스트 게이트가 방어선**. 구현 실수는 test가 잡는다. Test는 opus가 아니어도 쓸 수 있을 만큼 체계적으로 설계된다 (test-strategist 산출물). 이 구조가 "Distrust by Structure"의 핵심이다.
2. **실행 빈도 차이**. architect는 프로젝트당 수 회, implementer는 태스크당 수십 회. opus × 수십 회 = 비용 폭발. architect × 수 회 = 감당 가능.
3. **병렬성**. implementer는 worktree로 병렬 실행되는 경우가 많다. N개 worktree에 opus를 쓰면 N배 비용.
4. **해법은 오버라이드**. 보안·결제·커널 같은 critical path는 config로 `implementer.model: opus` 지정 가능 (6.3 참조).

### 6.3 유저 오버라이드

```yaml
# .harness/config.yaml
agents:
  # 프로젝트가 보안/결제/의료 등 고위험 도메인이면
  implementer:
    model: opus
  # 탐색도 더 정밀하게 하고 싶으면
  explorer:
    model: sonnet
  # 비용 절감이 더 중요하면
  devils-advocate:
    model: sonnet
```

### 6.4 Right-Size 자동 티어링 (선택)

```yaml
# .harness/config.yaml
agents:
  auto_tier_by_size: true   # Right-Size에 따라 자동 상향
  # small:  architect(opus) + implementer(sonnet) + 나머지(sonnet/haiku)
  # medium: 위와 동일
  # large:  implementer도 opus로 자동 상향
```

### 6.5 비용 최적화 전략

| 전략 | 구현 | 절감 |
|------|------|------|
| Script-First | 결정론적 검증을 scripts/로 위임 | 토큰 65% 절감 |
| Subagent 격리 | 작업 결과만 Controller에 반환 (~420t) | 메인 컨텍스트 보호 |
| MCP 인라인 | 서브에이전트 전용 MCP = 메인 비용 0 | MCP 비용 격리 |
| Hook command | 결정론적 검증은 Hook으로 (토큰 0) | 품질 검증 무비용 |
| disable-model-invocation | 수동 전용 스킬은 description 비용 0 | 카탈로그 절약 |

---

## 7. 에스컬레이션 프로토콜

> **비유: 건설 현장의 작업 보고**
>
> 건설 현장에서 작업자(에이전트)가 현장 감독(Controller)에게 보고하는 것과 같다.
> - "벽체 완료" → **DONE**
> - "벽체 완료했는데 기초 균열이 좀 보입니다" → **CONCERNS**
> - "배관 도면이 없어서 배수구 위치를 모르겠습니다" → **NEEDS_CONTEXT**
> - "이 벽에 석면이 있어서 제가 작업하면 안 됩니다" → **BLOCKED**
>
> 핵심: **작업자가 모르는 채로 진행하는 것이 가장 위험하다.** 멈추고 보고하는 것이 낫다.

### 7.1 4-Status 프로토콜

모든 에이전트는 작업 완료 시 반드시 아래 4가지 중 하나를 반환:

| 상태 | 의미 | Controller 후속 처리 |
|------|------|---------------------|
| `DONE` | 작업 완료, 결과 신뢰 가능 | 결과 수용, 다음 단계 진행 |
| `CONCERNS` | 완료했으나 우려 존재 | 우려 항목 검토 후 판단 (진행/수정/사용자 질문) |
| `NEEDS_CONTEXT` | 추가 정보 없이 진행 불가 | 필요 정보 제공 또는 사용자 질문 |
| `BLOCKED` | 구조적으로 진행 불가 | 재배분 시도 → 실패 시 사용자 에스컬레이션 |

### 7.2 에스컬레이션 흐름

```
에이전트: BLOCKED 반환
  │
  ├── Controller: 다른 에이전트로 재배분 가능?
  │   ├── YES → 재배분 후 재시도
  │   └── NO → 사용자 에스컬레이션
  │
  └── 사용자 에스컬레이션:
      "implementer가 Step 3에서 차단되었습니다.
       원인: 외부 API 인증 방법이 Spec에 명시되지 않음.
       필요한 정보: API 키 발급 방법 또는 인증 프로토콜.
       → Spec을 보완하거나 정보를 제공해주세요."
```

### 7.3 Confidence 산정 기준 (Evidence-based Rubric)

> "LLM의 자가 신뢰도"는 신뢰할 수 없다. 하네스는 **증거 기반 체크리스트**로 confidence를 계산한다.
> 에이전트는 결과를 반환할 때 아래 5개 카테고리별 점수를 반드시 emit해야 하며, Controller가 가중합으로 최종 confidence를 산출한다.

#### 7.3.1 5-카테고리 루브릭

| 카테고리 | 가중치 | 0.0 | 0.5 | 1.0 |
|---------|:------:|-----|-----|-----|
| **E. Evidence** (직접 관측) | 0.30 | 추론만 | 패턴 유추 + 일부 확인 | 파일/코드/spec을 직접 읽어 증거 명시 |
| **C. Coverage** (범위) | 0.20 | AC 일부 미처리 | 주요 AC 처리, edge case 일부 | 모든 AC + 주요 edge case 처리 |
| **V. Verification** (검증 실행) | 0.30 | 미실행 | 정적 검증만 (type/lint) | 실제 test 실행 + PASS |
| **X. eXternal deps** (외부 의존 확인) | 0.10 | 미확인 | 문서 참조로 가정 | 실제 호출/버전/설정 확인 |
| **A. Assumption log** (가정 기록) | 0.10 | 가정 미기록 | 일부 기록 | 모든 가정 명시 + 검증 방법 제시 |

**최종 confidence = 0.30·E + 0.20·C + 0.30·V + 0.10·X + 0.10·A**

#### 7.3.2 상태 매핑

```
confidence ≥ 0.80  → DONE          (신뢰 가능, 결과 수용)
0.60 ≤ c < 0.80   → CONCERNS      (우려 항목 명시, 리뷰어가 재확인)
c < 0.60          → NEEDS_CONTEXT  (정보 부족, Controller에 질의)
구조적 불가       → BLOCKED        (Safety/Iron Law 위반 등, 진행 불가)
```

#### 7.3.3 반환 포맷 (강제)

모든 에이전트는 아래 JSON을 stdout의 마지막 줄에 emit (PostToolUse hook이 파싱):

```json
{
  "status": "DONE",
  "confidence": 0.82,
  "rubric": { "E": 1.0, "C": 0.8, "V": 1.0, "X": 0.5, "A": 0.7 },
  "evidence": ["src/auth/login.ts:42", "tests/auth/login.test.ts: 12 PASS"],
  "assumptions": ["session TTL은 config.yaml의 auth.session_ttl을 따른다고 가정"],
  "concerns": []
}
```

`confidence` 필드는 에이전트가 계산해 포함하지만, Controller가 `rubric` 값으로 **재검증** 한다 (LLM이 자가 점수를 부풀리는 것 방지).

#### 7.3.4 예시

| 시나리오 | E | C | V | X | A | conf | 상태 |
|---------|:-:|:-:|:-:|:-:|:-:|:----:|:----:|
| 모든 AC + test 통과, 가정 명시 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | **1.00** | DONE |
| 구현 + test 통과, edge case 1개 미처리 | 1.0 | 0.8 | 1.0 | 0.5 | 0.5 | **0.81** | DONE |
| 구현 완료, test 미실행 | 1.0 | 1.0 | 0.5 | 0.5 | 0.5 | **0.75** | CONCERNS |
| Spec 해석 불명확, 추론 기반 | 0.5 | 0.5 | 0.5 | 0.0 | 0.5 | **0.45** | NEEDS_CONTEXT |
| **refactor**: 모든 move 완료, 전/후 test 동일 GREEN, spec hash diff=0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | **1.00** | DONE |
| **refactor**: 계획된 move 중 1개 보류, 나머지 GREEN | 1.0 | 0.7 | 1.0 | 0.5 | 1.0 | **0.84** | DONE |

> **refactor 컨텍스트에서 C·V 의미 재정의:**
> - **C (Coverage)** = AC 대신 "계획된 move 시퀀스 완료율"
> - **V (Verification)** = "test PASS" 대신 "test suite 전/후 동일성 + 모두 GREEN"
> - E·X·A는 공통 정의 그대로.
>
> **phase 간 비교 주의:** refactor의 confidence 1.00과 implement의 1.00은 평가 기준이 다르다. audit 기록 시 `phase` 필드를 반드시 포함하여 사후 구분이 가능하도록 한다:
> ```json
> { "confidence": 1.00, "phase": "refactor", "rubric_context": "C=move_completeness, V=test_invariance" }
> ```

#### 7.3.5 Config 오버라이드

```yaml
# .harness/config.yaml
agents:
  confidence_threshold:
    done: 0.80       # 기본
    concerns: 0.60
  # 고위험 프로젝트는 임계값 상향
  # done: 0.90, concerns: 0.75
  rubric_weights:    # 도메인에 따라 가중치 조정 가능
    E: 0.30
    C: 0.20
    V: 0.30
    X: 0.10
    A: 0.10
```

### 7.4 왜 FSM이 아닌가

bkit은 607개 함수의 FSM(Finite State Machine)으로 워크플로우를 관리한다.
하네스는 이를 선택하지 않았다:

| | FSM 방식 (bkit) | 하네스 방식 |
|--|-----------------|-----------|
| 상태 관리 | 코드 내 상태 전이 함수 | `.harness/state/workflow.json` 파일 |
| 복잡도 | 상태 × 이벤트 조합 폭발 | 단계별 Gate 조건만 확인 |
| 디버깅 | 상태 전이 로그 추적 | 파일 읽으면 현재 상태 확인 |
| 확장성 | 새 상태 추가 시 전이 함수 수정 | 새 단계 + Gate 추가만 |

에스컬레이션도 FSM 없이 동작한다: 에이전트가 4-Status 중 하나를 반환하면
Controller가 해당 상태에 맞는 행동을 취한다. 상태 전이가 아니라 **응답 기반 분기**.

---

## 8. 필요 에이전트 동적 생성

### 8.1 Spec에서 에이전트 필요성 식별

```yaml
# spec 파일 내
required_personas:
  - "보안 전문가: 인증 로직 검증"
  - "API 설계자: REST 계약 검증"
  - "DDD 전문가: Aggregate 설계 검증"
```

### 8.2 /harness:spec 실행 시 처리

```
/harness:spec Skill:
  1. required_personas 읽기
  2. .claude/agents/ 에서 매칭 페르소나 검색
  3. 없으면:
     → "이 Spec에 'DDD 전문가' 페르소나가 필요합니다.
        a) 직접 생성하시겠습니까? (템플릿 제공)
        b) Best Practice 기본 페르소나를 생성할까요?"
  4. 있으면:
     → 해당 페르소나를 관련 단계(spec, architect, review)에 자동 참여
```

### 8.3 반강제 메커니즘

- Spec에 `required_personas`가 있으면 해당 페르소나 **없이는 진행 불가** (Gate)
- 유저가 "모르겠다" → Best Practice 페르소나 자동 생성 제안
- 유저가 거부하면 → 명시적 확인 후 진행 가능 (Iron Law는 아님, 강한 권장)
