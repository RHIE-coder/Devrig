# 08. Skill System — 스킬 아키텍처 & 카탈로그

> **반복 등장 용어:** `Skill`(하네스의 사용자 인터페이스 단위 — `/harness:*` 명령), `SKILL.md`(스킬의 LLM 오케스트레이션 지시문), `Script`(스킬 내부의 결정론적 `.mjs` 로직). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 1. 스킬이란

스킬은 하네스의 **사용자 인터페이스 단위**다. 유저가 `/harness:spec auth/login`을 입력하면 해당 스킬이 활성화되어 LLM 오케스트레이션 + 결정론적 스크립트 조합으로 작업을 수행한다.

```
유저 → /harness:implement auth/login
         │
         ├── Hook Layer (0t)     ← gate-engine, quality-check (07-hooks-system.md)
         │
         ├── Skill Layer (LLM)   ← SKILL.md 로드 → 오케스트레이션 지시
         │   ├── scripts/ 호출   ← 결정론적 로직 (09-script-system.md)
         │   └── Agent 스폰      ← explorer, implementer, verifier (04-agent-system.md)
         │
         └── Hook Layer (0t)     ← update-workflow (Stop)
```

**핵심 원칙:**

| 원칙 | 설명 | 근거 |
|------|------|------|
| **SKILL.md ≤ 200줄** | 오케스트레이션 지시만 담음. 결정론적 로직은 `scripts/`로 위임 | Script-First (01-philosophy.md P7) |
| **1 skill = 1 feature mutate** | 한 번의 스킬 호출 범위 내에서 하나의 feature만 변경 | Aggregate 트랜잭션 경계 (02-architecture.md §3.0) |
| **스킬은 제안, 게이트는 강제** | 스킬 선택은 Claude 판단 + 유저 확인. 게이트(G1~G5)만 구조적 강제 | 01-philosophy.md P3 |

---

## 2. 스킬 해부 — 디렉토리 구조

모든 스킬은 동일한 내부 구조를 따른다:

```
skills/{skill-name}/
├── SKILL.md              ← LLM 오케스트레이션 지시 (Claude가 읽는 문서)
├── skill.yaml            ← 메타데이터 (카탈로그 주입용)
├── scripts/              ← 결정론적 로직 (.mjs)
│   ├── gate-check.mjs    ← 게이트 전제조건 검증
│   ├── ...               ← 스킬별 고유 로직
│   └── (compound만) dispatch.mjs  ← 서브커맨드 라우팅
├── references/           ← 참조 문서 (선택)
│   └── *.md              ← 에이전트에게 제공할 도메인 지식
└── templates/            ← 산출물 템플릿 (선택)
    └── *.yaml, *.md      ← spec/plan/review 등 기본 골격
```

### 2.1 SKILL.md — 오케스트레이션 지시

SKILL.md는 Claude가 스킬 활성화 시 읽는 **LLM 지시문**이다. 코드가 아니라 **자연어 프롬프트**.

**포함해야 할 것:**
- 스킬의 목표와 완료 조건
- 에이전트 호출 순서 (어떤 에이전트를, 어떤 순서로, 어떤 입력으로)
- 스크립트 호출 지점 (어느 단계에서 어떤 `.mjs`를 실행)
- 산출물 형식과 저장 위치
- 에스컬레이션 조건 (BLOCKED 상황에서 유저에게 물어볼 것)

**포함하지 말아야 할 것:**
- 결정론적 검증 로직 → `scripts/`로 위임
- 게이트 검증 → Hook Layer에서 이미 처리 (07-hooks-system.md)
- 도메인 지식 → `references/`로 분리
- 프롬프트 템플릿 → `templates/`로 분리

**크기 제약:** ~200줄 이하 목표. 초과 시 결정론적 로직이 SKILL.md에 침투했다는 신호 → 스크립트 분리 검토.

### 2.2 skill.yaml — 스킬 메타데이터

skill.yaml은 `session-start-context.mjs`가 세션 시작 시 읽어 카탈로그를 구성하는 메타데이터 파일이다.

```yaml
# skills/implement/skill.yaml
name: implement
description: "Spec과 Plan을 기반으로 Test-First 방식의 코드 구현. worktree 격리 환경에서 실행."
when: "spec과 plan이 작성된 후, 코드 구현이 필요할 때"
gate_prerequisites:
  - "G1: spec 존재"
  - "G2: plan 존재"
mode:
  standard: true
  prototype: true       # prototype에서도 실행 가능 (게이트만 skip)
  explore: false        # explore에서는 비활성
disable-model-invocation: false   # true면 Claude 자동 호출 차단 (수동 전용)
```

**필드 명세:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `name` | string | ✅ | 스킬 식별자 (디렉토리명과 동일) |
| `description` | string | ✅ | 스킬 목적 요약. `session-start-context.mjs`가 카탈로그에 주입. Claude가 자동 호출 판단에 사용 |
| `when` | string | ✅ | 이 스킬을 사용해야 하는 상황 설명. Claude의 스킬 선택 정확도에 직접 영향 |
| `gate_prerequisites` | string[] | ❌ | 이 스킬 실행에 필요한 게이트 전제조건 (정보 제공용, 실제 강제는 `gate-engine.mjs`) |
| `mode` | object | ❌ | 모드별 활성화 여부. 미지정 시 모든 모드에서 활성 |
| `disable-model-invocation` | boolean | ❌ | `true`면 Claude가 description 매칭으로 자동 호출하지 못함. 유저 명시 호출(`/harness:*`)만 가능. 카탈로그에서 description 비용 0 |

**`description`과 `when`의 품질이 스킬 라우팅 정확도를 결정한다.** "엉뚱한 스킬이 실행됐다" 문제의 해결책은 이 두 필드를 편집하는 것 (03-workflow.md §1.10.4).

---

## 3. 스킬 유형

### 3.1 단일 스킬 (Simple Skill)

하나의 동작을 수행하는 스킬. 대부분의 하네스 스킬이 이 유형.

```
/harness:spec auth/login
  → SKILL.md 로드
  → scripts/ 실행
  → 산출물 생성
  → 완료
```

**해당 스킬:** init, brainstorm, spec, architect, ux, plan, implement, review, qa, deploy, sync, mode, refactor

### 3.2 복합 스킬 (Compound Skill / Git-Style Group)

여러 서브커맨드를 가진 스킬. Claude Code 플러그인이 다단계 콜론(`/harness:migrate:init`)을 지원하지 않으므로 **git-style 서브커맨드 패턴**을 사용한다.

```
/harness:persona create
  → SKILL.md: 첫 인자 확인 → "create"
  → scripts/dispatch.mjs: "create" → scripts/create.mjs 라우팅
  → create.mjs 실행
  → 완료
```

**해당 스킬:** persona (`create|list|edit|delete`), migrate (`init|analyze|extract-spec|gen-test`)

**dispatch.mjs 패턴:**

```javascript
// scripts/dispatch.mjs — git-style 서브커맨드 라우터
import { argv } from 'node:process';

const sub = argv[2]; // 첫 번째 인자 = 서브커맨드
const valid = ['create', 'list', 'edit', 'delete'];

if (!valid.includes(sub)) {
  console.error(`Unknown subcommand: ${sub}. Valid: ${valid.join(', ')}`);
  process.exit(2);
}

// 동적 import → 해당 서브커맨드 스크립트 실행
const handler = await import(`./${sub}.mjs`);
await handler.default();
```

**확장:** 새 서브커맨드 추가 = `scripts/{sub}.mjs` 파일 추가 + `valid` 배열에 등록. SKILL.md 수정 최소화.

---

## 4. 스킬 카탈로그 & 주입

### 4.1 카탈로그 구성

세션 시작 시 `session-start-context.mjs`가 모든 `skills/*/skill.yaml`을 읽어 카탈로그를 구성한다:

```
SessionStart
  → session-start-context.mjs
    → skills/*/skill.yaml 순회
    → mode 필터링 (현재 mode에서 비활성인 스킬 제외)
    → disable-model-invocation 필터링 (수동 전용 스킬의 description 제외)
    → additionalContext로 카탈로그 주입
```

**주입 내용 (additionalContext):**
```
[하네스 스킬 카탈로그]
- /harness:spec: Spec 작성 — when: 기능 요구사항을 명세할 때
- /harness:plan: 구현 계획 — when: spec 작성 후, 구현 전
- /harness:implement: 코드 구현 — when: spec과 plan이 있을 때
- ...

[현재 워크플로우 상태]
- mode: standard
- phase: implement (spec ✓ plan ✓ implement ...)
- 다음 추천: /harness:implement auth/login
```

**토큰 예산:** `config.harness.session_start_context.max_tokens` (기본 1,800). 이 한도를 넘으면 카탈로그를 축약.

**중복 금지:** README와 텍스트 중복 금지 — Gloaguen 2026 실증상 redundant context가 성공률 −3% · 비용 +23%의 주 원인.

### 4.2 스킬 선택 경로 (Intent → Skill)

유저의 입력이 스킬로 연결되는 3가지 경로:

| # | 경로 | 설명 | 우선순위 |
|---|------|------|---------|
| **A** | 명시 호출 | 유저가 `/harness:spec auth/login` 직접 입력 | 최우선 |
| **B** | Claude 자동 호출 | Claude가 카탈로그의 `description` + `when` 매칭으로 자율 판단 | A 없을 때 |
| **C** | Router 힌트 | `route-hint.mjs`가 워크플로우 상태 기반 다음 단계 제안 | B 실패/모호 시 |

**mode별 경로 활성화:**

| mode | A (명시) | B (자동) | C (힌트) |
|------|:-------:|:-------:|:-------:|
| `standard` | ✅ | ✅ | ✅ |
| `prototype` | ✅ | ✅ | 제한적 (implement만) |
| `explore` | ✅ | ❌ (description 미로드) | ❌ |

Explore 모드에서는 스킬 카탈로그를 아예 로드하지 않아 Claude가 자동 호출하지 않는다 (토큰 절감 + QnA 마찰 최소화).

→ 상세: [03-workflow.md §0](03-workflow.md) Intent → Skill 라우팅

---

## 5. Skill → Agent 오케스트레이션

스킬의 SKILL.md는 작업을 **에이전트**에게 위임한다. 이 오케스트레이션은 스킬마다 다르지만, 공통 패턴이 있다.

### 5.1 오케스트레이션 흐름

```
SKILL.md 로드
  │
  ├── 1. 컨텍스트 수집 (explorer)
  │   → spec, plan, config, 기존 코드 읽기
  │   → Controller가 결과 정리 → 최소 컨텍스트로 가공
  │
  ├── 2. 전략 수립 (strategist / architect)
  │   → 스킬에 따라: test-strategist, architect 등
  │   → 스크립트 보조: decompose.mjs, gen-test-skeleton.mjs 등
  │
  ├── 3. 실행 (implementer / qa-engineer)
  │   → worktree 격리 (implement, qa)
  │   → Plan step별 반복 실행
  │   → PostToolUse Hook이 side-effect 감시
  │
  └── 4. 검증 (verifier / reviewer-*)
      → 전체 test suite 실행
      → 병렬 리뷰 dispatch (Right-Size에 따라 reviewer 수 조절)
      → 결과 → Controller → workflow.json 갱신
```

### 5.2 스킬별 에이전트 조합

| 스킬 | 에이전트 | 핵심 패턴 |
|------|---------|----------|
| `/harness:brainstorm` | devils-advocate | 적대적 사고로 아이디어 검증 |
| `/harness:spec` | explorer | 기존 코드/요구사항 탐색 → spec 초안 |
| `/harness:architect` | architect | ADR 생성, 제약 검증 |
| `/harness:plan` | explorer → test-strategist | spec 분석 → 태스크 분해 |
| `/harness:implement` | explorer → test-strategist → implementer → verifier | TDD: test skeleton → 구현 → 검증 |
| `/harness:review` | explorer → reviewer-{security,performance,quality,spec} | 병렬 4종 리뷰 (Right-Size로 조절) |
| `/harness:qa` | qa-engineer | QA Stack bottom-up 실행 |
| `/harness:refactor` | explorer → implementer → reviewer-{quality,performance} | invariant(AC 동일성) 보존 검증 |

→ 상세: [04-agent-system.md](04-agent-system.md) Agent×Phase 매트릭스, 모델 티어링, 에스컬레이션

### 5.3 에이전트 호출 규약

SKILL.md에서 에이전트를 호출할 때의 규약:

| 규약 | 설명 |
|------|------|
| **역할 명시** | "explorer로서 다음을 읽어라", "implementer로서 worktree에서 구현해라" |
| **컨텍스트 최소화** | Controller가 가공한 최소 정보만 전달. 불필요한 파일 전체 읽기 금지 |
| **격리 명시** | worktree가 필요한 에이전트(implementer, qa-engineer)에게 격리 환경 지시 |
| **에스컬레이션 경로** | BLOCKED 상태 시 유저에게 에스컬레이트하도록 명시 (04-agent-system.md §4 참조) |
| **구현자 ≠ 검증자** | Iron Law IL-5. implementer가 직접 리뷰하지 않도록 SKILL.md에서 분리 |

---

## 6. 전체 스킬 카탈로그

| 스킬 | 유형 | 모드 | 게이트 | 설명 |
|------|------|------|--------|------|
| `/harness:init` | simple | all | 없음 | 프로젝트 초기 구성 |
| `/harness:brainstorm` | simple | std, proto | 없음 | 아이디어 탐색 + 적대적 검증 |
| `/harness:spec` | simple | std, proto | 없음 | 기능 명세 (AC 정의) |
| `/harness:architect` | simple | std | spec | 시스템 아키텍처 (ADR) |
| `/harness:ux` | simple | std | spec | UI/UX 설계 (Architect와 직교) |
| `/harness:plan` | simple | std, proto | G1 (spec) | 구현 계획 (태스크 분해) |
| `/harness:implement` | simple | std, proto | G2 (plan) | 코드 구현 (TDD, worktree) |
| `/harness:review` | simple | std | implement | 코드 리뷰 (병렬 4종) |
| `/harness:qa` | simple | std | G3 (review) | 다축 Coverage + QA Stack |
| `/harness:deploy` | simple | std | G4 (qa) | 배포 (pivot transaction) |
| `/harness:refactor` | simple | std | coverage | 구조 개선 (behavior-preserving) |
| `/harness:sync` | simple | all | 없음 | 코드↔Spec 동기화 + 엔트로피 스윕 |
| `/harness:persona` | **compound** | all | 없음 | 페르소나 관리 (create/list/edit/delete) |
| `/harness:migrate` | **compound** | all | 없음 | 기존 프로젝트 도입 (init/analyze/extract-spec/gen-test) |
| `/harness:mode` | simple | all | 없음 | 세션 mode 조회/전환 |

→ 각 스킬의 인자·플래그·출력·예시 상세: [06-cli-reference.md](06-cli-reference.md)

---

## 7. 스킬 생명주기

### 7.1 스킬 로드

```
1. 유저 입력 (명시 or Claude 판단)
2. Hook Layer 실행 (gate-engine, quality-check)  ← 07-hooks-system.md
3. SKILL.md 로드 → LLM 컨텍스트에 주입
4. SKILL.md 지시에 따라 scripts/ 호출 + Agent 스폰
5. 작업 완료
6. Stop Hook → update-workflow.mjs → workflow.json 갱신
```

### 7.2 Compact 이후 복원

SKILL.md는 호출 시에만 LLM 컨텍스트에 로드된다. Compact 발생 시 미호출 스킬의 SKILL.md는 소실되지만, 카탈로그는 `session-start-context.mjs`가 매 SessionStart마다 재주입하므로 스킬 선택 능력은 유지된다 (02-architecture.md §8 Compact Defense).

### 7.3 스킬 비활성화

| 방법 | 효과 |
|------|------|
| `skill.yaml`에서 `mode.{current_mode}: false` | 해당 모드에서 카탈로그에서 제외 |
| `skill.yaml`에서 `disable-model-invocation: true` | Claude 자동 호출 차단. 유저 명시 호출만 가능 |
| `skills/` 디렉토리에서 제거 | 완전 제거 |

---

## 8. 새 스킬 추가 가이드

1. `skills/{name}/` 디렉토리 생성
2. `skill.yaml` 작성 — `description`과 `when`을 정확하게
3. `SKILL.md` 작성 — 오케스트레이션 지시만, ~200줄 이하
4. `scripts/` 에 결정론적 로직 배치 — exit code 프로토콜 준수 (09-script-system.md)
5. 게이트가 필요하면 `scripts/gate-check.mjs` 작성 + `gate-engine.mjs`에 등록
6. compound 스킬이면 `scripts/dispatch.mjs` 추가
7. 이 문서 §6 카탈로그 테이블 업데이트
8. 06-cli-reference.md에 CLI 참조 추가

---

## 참조

- [03-workflow.md §0](03-workflow.md) — Intent → Skill 라우팅, Mode Auto-Detection
- [04-agent-system.md](04-agent-system.md) — 에이전트 역할, Agent×Phase 매트릭스, 에스컬레이션
- [05-project-structure.md §2](05-project-structure.md) — 하네스 플러그인 디렉토리 구조
- [06-cli-reference.md](06-cli-reference.md) — 각 스킬의 인자·플래그·출력·예시
- [07-hooks-system.md](07-hooks-system.md) — Hook 이벤트 흐름, 게이트 실행
- [09-script-system.md](09-script-system.md) — .mjs 실행 모델, exit code 프로토콜
