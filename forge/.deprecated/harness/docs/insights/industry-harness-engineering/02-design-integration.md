# Design 문서별 반영안 — 구체 편집 제안

> [01-patterns-distilled.md](01-patterns-distilled.md) 의 재료를 design 문서의 **어느 파일 / 어느 섹션 / 어떤 문장**으로 옮길지 구체화.
>
> **원칙**: 이 문서는 "어디를 바꿀지"만 제안. 실제 편집은 설계 리뷰 후 별도 commit.

---

## 우선도 범례

| 표시 | 의미 |
|---|---|
| 🔴 높음 | 설계 일관성·근거 확보에 필요. 다음 편집 사이클에 반영 권장. |
| 🟡 중간 | 단단하게 만드는 보강. 여력 있을 때. |
| 🟢 낮음 | 옵션. 특정 프로젝트 성격에 따라 선택. |

---

## 00-overview.md

### 🔴 Philosophy 섹션에 "단순화 원칙" 명시

**위치**: `Core Philosophy` 또는 `Design Principles` 항목 하단

**삽입 문장 (예시)**:
> **구성요소는 모델 한계의 거울이다.** 하네스의 각 게이트·스크립트·매트릭스는 현재 모델이 자력으로 못 하는 것을 가정하고 만든 것이다. 모델이 발전하면 해당 가정은 **무효화 후보**가 된다. 가정을 명시하고(스크립트 헤더), 주기적으로 재검토(`audit.assumption_review`)하며, 무효해진 것은 `config.harness.retired_assumptions[]`에 기록한다.
>
> — Inspired by Rajasekaran (Anthropic, 2026): *"Every component in a harness encodes an assumption about what the model can't do on its own."*

**근거**: [01 §A](01-patterns-distilled.md#a-단순화-원칙-anthropic-핵심-공리)

---

### 🟡 Glossary에 "assumption"·"retired_assumption" 용어 추가

각 게이트/스크립트가 가정하는 모델 한계를 설명하는 용어 통일.

---

## 02-architecture.md

### 🔴 Compact 방어 섹션 (§6) — 유저 영역 분리 제안 반영

**현재**: CLAUDE.md + SessionStart hook 이중 방어
**제안 후**: SessionStart hook 단일 방어. CLAUDE.md는 유저 소유.

**근거**: [01 §I](01-patterns-distilled.md#i-agentsmd--claudemd-를-진입점으로-쓰는-것-양측-공통) — 업계 선례가 유저 소유를 전제로 함.

**편집 영역**:
- §6 표에서 `CLAUDE.md 카탈로그` 행 삭제 또는 "유저가 선택적으로 추가"로 수정
- §8.3 토큰 예산에서 `CLAUDE.md ~1,800t`을 `SessionStart context ~1,800t`으로 치환

---

### 🟡 Entropy 스윕 아키텍처 섹션 신설 (§6 바로 뒤)

**신규 §6.5 "Entropy Management"**:
- 주기(daily/weekly) vs 이벤트 기반 트리거
- 대상(문서 일관성·제약 위반·의존성 감사)
- 기존 `/harness:sync`와의 관계 (on-demand vs scheduled)
- 신규 audit 이벤트 2개: `entropy_sweep_started`, `entropy_sweep_completed`

**근거**: [01 §E](01-patterns-distilled.md#e-entropy-management--주기-스윕-openai)

---

### 🟡 의존성 계층화 강화 (§9 또는 신규 §10)

- `config.architecture.layering: [types, config, repo, service, runtime, ui]` 예시
- `scripts/qa/layer-check.mjs` (신규) — import 방향 위반 검출
- `reviewer-architecture` 페르소나 프롬프트에 layering 규칙 주입

**근거**: [01 §F](01-patterns-distilled.md#f-의존성-계층화-openai) — 기존 QA Stack(Infra→DB→API→UI)은 귀인용이고, **편집 시점 위반 방지**는 빠져 있음.

---

## 03-workflow.md

### 🔴 §1.9 Escape Hatch 뒤에 §1.10 "설계상 경계" 신설

**내용**:
- 하네스가 **하드로 보호하는 것**: `.harness/state/`, 파괴적 bash
- 하네스가 **소프트로 유도하는 것**: 유저 코드(`src/**`) 편집은 유저 규약·SessionStart hook 주입으로만 유도 (현재) / 유저 소유 rules (제안 후)
- `.harness/` 밖은 **"오염이 아닌 drift"** 영역. `/harness:sync`·`/harness:migrate`가 복구 경로.
- 이 경계는 설계 의도 — "하네스는 Claude가 협조적이라고 가정. 적대적이면 막지 않음."

**근거**: 본 대화(세션) 내 논의 결과를 문서화. [01 §A](01-patterns-distilled.md#a-단순화-원칙-anthropic-핵심-공리)의 "가정 명시" 원칙과 동조.

---

### 🟡 §1.3 게이트 설명에 "evaluator의 skeptical stance" 명시

**추가 문장 (예시, §1.3.2 부근)**:
> Reviewer·QA 에이전트는 **기본 태도를 회의적(skeptical)** 으로 고정한다. 자기 확신 있는 PASS보다 "미확인" 을 선호. Generator가 제출한 증거를 반박 가능한지 검토하는 것이 evaluator의 역할이다.

**근거**: [01 §B](01-patterns-distilled.md#b-generator-evaluator-분리-gan-영감) — Anthropic 원문: *"Tuning a standalone evaluator to be skeptical turns out to be far more tractable."*

---

### 🟢 §1.3 또는 §4 — Sprint Contract 옵션 언급

**추가 (optional)**: "medium/large right-size에 한해 `spec.yaml`에 `verification_method` 필드 요구. `/harness:plan` 시 reviewer-qa 검토."

**근거**: [01 §C](01-patterns-distilled.md#c-sprint-contract--done의-사전-협상-anthropic). **우선도 낮음** — 현재 AC testable 강제가 대부분 커버.

---

### 🟡 Appendix A.4 (Pyramid/Trophy) 부연

이미 shape 필드 제거됨. 부연 문단 추가:
> 업계 선례도 동일 — Anthropic은 pyramid 비율을 명시하지 않고 **grading criteria**(Design/Originality/Craft/Functionality)로 질을 평가. OpenAI는 **mock이 아닌 real-backed test**를 구조적으로 강제. 본 프로젝트의 `integration_ratio` + `mock_guard`는 이 두 접근과 같은 방향.

---

## 04-agent-system.md

### 🔴 Reviewer 페르소나 프롬프트 템플릿에 `stance: skeptical` 명시

**예시 (현재 → 제안)**:
```yaml
reviewer-security:
  stance: skeptical           # ← 신규
  pass_criteria_strict: true  # ← 신규 (기본 PASS 금지)
  ...
```

**근거**: [01 §B](01-patterns-distilled.md#b-generator-evaluator-분리-gan-영감)

---

### 🟢 UI/UX 중심 프로젝트용 grading criteria 템플릿 (선택적)

**reviewer-ux 페르소나에 4축 추가 (선택)**:
- Design Quality (coherent whole)
- Originality (not template default)
- Craft (typography·spacing·contrast)
- Functionality (discoverable actions)

**근거**: [01 §B 참조 — Anthropic Frontend Design 사례](01-patterns-distilled.md). **우선도 낮음** — 백엔드·CLI 중심 프로젝트에선 불필요.

---

### 🟡 False-pass 피드백 루프

**추가 섹션 (예시)**:
- `/harness:deploy` 이후 버그 재현되면 `.harness/state/false_pass.jsonl` 에 `{reviewer, feature, timestamp, symptom}` 기록
- 주간 스윕이 이를 집계 → reviewer 프롬프트 튜닝 시그널

**근거**: [01 §B](01-patterns-distilled.md#b-generator-evaluator-분리-gan-영감) + Anthropic *"Out of the box, Claude is a poor QA agent. ... evaluator 로그 읽고 divergence 수정."*

---

## 05-project-structure.md

### 🔴 CLAUDE.md·rules 유저 영역 제안 반영 (전면 리팩터)

**변경 대상**:
- §2 디렉토리 트리 — `CLAUDE.md`·`.claude/rules/` 주석을 "유저 소유 (optional)" 로 수정
- §3 규칙표 — "CLAUDE.md는 /harness:init이 생성" 행 삭제 또는 "example 파일 제공"으로 변경
- §6.1 /harness:init flow — "4. CLAUDE.md 생성" 단계 삭제. "3. .claude/ 구성"에서 rules 자동 생성 삭제 → example 복사 안내
- `skills/init/scripts/gen-claude-md.mjs`·`gen-rules.mjs` 삭제
- `skills/init/templates/claude-md.tmpl`·`templates/rules/` 삭제
- **신규**: `scripts/hooks/session-start-context.mjs` — 스킬 카탈로그·워크플로우 요약·활성 feature·bypass_budgets 잔량을 SessionStart 주입

**근거**: [01 §I](01-patterns-distilled.md#i-agentsmd--claudemd-를-진입점으로-쓰는-것-양측-공통) + 본 대화 내 합의.

---

### 🟡 config.yaml 스키마 확장

**신규 필드**:

```yaml
project:
  scale: solo          # solo | team | org — 팀 크기 축 (OpenAI Level 1-3)

harness:
  retired_assumptions: []         # ["sprint_required", "mock_guard_strict"] 등
                                  # 무효해진 가정을 기록. audit.assumption_review 로 자동 append
  entropy_sweep:
    schedule: off                 # off | daily | weekly | "@cron"
    targets:
      - drift
      - doc_consistency
      - dependency_layering
      - bypass_budget
    report_path: .harness/state/entropy-report.jsonl

architecture:
  layering:                       # 의존성 방향 (상위→하위 import 금지)
    - types
    - config
    - repo
    - service
    - runtime
    - ui
```

**근거**: [01 §A, §E, §F, §G](01-patterns-distilled.md)

---

### 🟡 audit 이벤트 추가 (14 → 17)

| 신규 이벤트 | Emitter | 용도 |
|---|---|---|
| `assumption_review` | `/harness:sync` 또는 수동 | 가정 무효화 기록 |
| `entropy_sweep_started` | `/harness:sync --schedule` | 주기 스윕 시작 |
| `entropy_sweep_completed` | 동상 | 스윕 결과 요약 |

(선택) `false_pass_recorded` — `/harness:deploy` 후 버그 발견 시.

---

## 06-cli-reference.md

### 🔴 `/harness:sync` 확장 — `--schedule` 플래그

**기존**:
```
/harness:sync                  # on-demand drift 감지
```

**추가**:
```
/harness:sync --schedule <daily|weekly|cron>   # 주기 엔트로피 스윕 등록
/harness:sync --schedule off                   # 해제
```

**§2 스킬 상세**에 플래그 행 추가 + **§4 호출 시퀀스**에 주기 스윕 예시 1건.

**근거**: [01 §E](01-patterns-distilled.md#e-entropy-management--주기-스윕-openai)

---

### 🟡 `/harness:init` 출력 간소화

**변경 전 출력**: `.harness/` · `config.yaml` · `CLAUDE.md` · `.claude/rules/*.md`
**변경 후 출력**: `.harness/` · `config.yaml` · `.claude/settings.json`
**옵션 제공**: `example/claude.md.example`·`example/rules/*.md.example` 복사 안내 (유저 결정)

**근거**: CLAUDE.md·rules 유저 소유 제안.

---

### 🟢 `/harness:assumption-review` 신규 스킬 (선택)

**용도**: 분기별 수동 실행. 모든 스크립트의 가정을 나열 → 유저가 "여전히 유효" / "무효" 판단 → `retired_assumptions[]` 업데이트 + audit emit.

**근거**: [01 §A](01-patterns-distilled.md#a-단순화-원칙-anthropic-핵심-공리). **우선도 낮음** — 처음엔 `/harness:sync` 일부로 구현해도 됨.

---

## dashboard.html

### 🔴 CLAUDE.md·rules 유저 소유 반영

- "Compact 방어" 카드에서 `CLAUDE.md 카탈로그` 언급 삭제 또는 "선택적 유저 보강"으로 수정
- `/harness:init` 출력 칸에서 `CLAUDE.md` 삭제

### 🟡 Workflow 탭에 "설계상 경계" 다이어그램 추가

- 하드 보호 영역 (`.harness/`, 파괴 bash) vs 소프트 유도 영역 (src/, rules) 시각화
- drift vs contamination 구분 설명

### 🟡 Entropy 스윕 카드 추가

- 주기 스케줄·대상·결과 경로
- `/harness:sync --schedule` 예시

### 🟢 Audit 이벤트 표 업데이트 (14 → 17)

---

## 변경 적용 순서 제안

**Phase 1 (이번 세션의 논의 흐름 마무리 — 🔴 위주)**:
1. 05-project-structure.md 리팩터 (CLAUDE.md·rules 유저 소유)
2. 02-architecture.md §6 Compact 방어 갱신
3. 06-cli-reference.md `/harness:init` 출력 + `/harness:sync --schedule`
4. 00-overview.md Philosophy에 단순화 원칙 문장 삽입
5. 03-workflow.md §1.10 설계상 경계 신설
6. dashboard.html 동반 수정

**Phase 2 (🟡 보강)**:
7. Entropy 스윕 아키텍처 (02 §6.5)
8. 의존성 계층화 (02 §10)
9. Reviewer skeptical stance (04)
10. config.yaml 스키마 확장 (05)

**Phase 3 (🟢 옵션)**:
11. Sprint Contract (verification_method 필드)
12. UI grading criteria 템플릿
13. `/harness:assumption-review` 스킬 분리

---

## 변경 **안 할** 것 (근거)

| 업계 항목 | 반영 제외 근거 |
|---|---|
| Codex 직접 통합 | 본 프로젝트는 Claude Code 플러그인. 모델 agnostic 목표. |
| "1M LOC in 5 months" 수치 광고 | 생성량 ≠ 품질. 우리 측정 축(coverage 8축)이 더 엄격. |
| LangChain Middleware 문자 그대로 | 우리는 hook 기반이 이미 동형. 새 추상화 불필요. |
| Playwright MCP를 필수화 | 백엔드·CLI 프로젝트에 과잉. UI 중심 프로젝트 옵션으로만. |
| Full 3-agent(Planner/Generator/Evaluator) 패턴 | 우리의 implementer/reviewer-* 분리가 등가. 용어만 정렬 여지. |

---

## 결론

- **Phase 1 (6개 편집)** 은 본 세션의 논의(rules·CLAUDE.md 유저 소유 + 설계상 경계) 와 업계 근거를 동시에 반영 → 가장 효율적 묶음.
- Phase 2~3은 여력·프로젝트 성격에 따라 선별.
- 본 문서는 **"어디를 바꿀지"** 만 제안. 실제 편집은 별도 승인 후 진행.
