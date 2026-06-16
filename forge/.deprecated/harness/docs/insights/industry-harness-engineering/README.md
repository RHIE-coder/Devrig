# 업계 Harness Engineering 자료 — 설계 반영용 인사이트

> Anthropic(Rajasekaran, 2026-03) · OpenAI(Lopopolo, 2026-02) · ETH Zürich(Gloaguen et al., 2026-02 AGENTbench) 세 출처에서 **본 하네스 설계에 실제로 반영할 만한** 패턴·원칙·공백을 추출.
>
> **성격:** 설계 보조 노트. 원문 요약은 [`/docs/review/harness-engineering/`](../../../../../docs/review/harness-engineering/) 에 있음 — 본 문서는 **요약 재탕 금지**, 오직 "우리 design에 어떻게 쓸 것인가"만 다룸.
>
> **전제 독자:** 본 프로젝트 `docs/design/` 6개 문서 및 `insights/patterns/` 를 이미 이해.

---

## 문서 구성

| # | 문서 | 다루는 질문 |
|---|------|------------|
| 01 | [patterns-distilled.md](01-patterns-distilled.md) | Anthropic·OpenAI 두 출처에서 뽑아낸 "우리가 따라 쓸 수 있는 재사용 가능한 패턴"은? |
| 02 | [design-integration.md](02-design-integration.md) | 각 design 문서에 어떤 문장·섹션·config 키를 추가·변경해야 하는가? |
| 03 | [agentsmd-empirical.md](03-agentsmd-empirical.md) | Gloaguen 2026 (AGENTbench) 실증 데이터는 본 설계의 어느 문장·config·스크립트에 힘을 실어주거나 바꾸게 하는가? |

---

## 4대 상위 takeaway

### ① "Every component encodes an assumption about what the model can't do" (Anthropic)
우리 설계의 **거의 모든 구성요소**(게이트·attribution·mock_guard·Sprint·Right-Size)는 현재 모델 한계 가정 위에 있음. 모델 진화 시 **단순화 경로**가 명시돼야 함 → **`config.harness.minimal_mode`** + **주기 재검토 트리거** (현재 없음).

### ② "Entropy Management 주기 스윕" (OpenAI)
우리 `/harness:sync`는 **on-demand**. OpenAI는 **일/주/이벤트 기반 정기 실행**. 문서 일관성·제약 위반·패턴 강제·의존성 감사를 주기적으로 수행 → **`/harness:sync --schedule`** + **`audit.entropy_sweep_*`** 이벤트 필요.

### ③ "팀 크기 축"은 mode와 별개 (OpenAI Level 1~3)
우리는 `mode: explore | prototype | standard` 로 단계를 나눔. OpenAI는 **개인 · 소규모팀 · 대규모 조직**으로 harness 농도를 나눔. 두 축은 **직교** → **`project.scale: solo | team | org`** 추가 여지.

### ④ "컨텍스트 파일은 벤더 권장에 반해 성능을 낮춘다" (ETH Zürich · AGENTbench)
LLM 자동 생성 `AGENTS.md`/`CLAUDE.md`는 **성공률 −3%, 비용 +23%**. 개발자 수기 작성도 **+4% 대가로 +19% 비용**. "entry-point" 가설도 기각 → 본 설계의 **`CLAUDE.md` 자동 생성 금지 + SessionStart hook 단일화**에 실증 근거 확보. 상세: [03-agentsmd-empirical.md](03-agentsmd-empirical.md).

---

## 우리 설계가 업계 대비 **이미 앞서있는 지점**

1. **결정론적 attribution** — QA Stack bottom-up 귀인(`qa-attribution.json`). Anthropic hard thresholds보다 한 단계 더.
2. **mock 편향의 정량화** — `integration_ratio` + `mock_guard.enforce: strict_lower_real`. 두 출처 모두 mock 문제를 **언급조차 안 함**.
3. **Audit 이벤트 스키마** — 14개 이벤트 각각 emitter·schema·redact·rotate 명시. OpenAI는 "관찰성" 수준에서 멈춤.
4. **Escape Hatch 3중 구조** — `--bypass-*` + reason + audit + sticky + budgets. 두 출처 모두 "gate 우회"의 구조적 설계 없음.

→ 업계에 **역으로 기여할 만한 재료**. (향후 공개 가능성.)

---

## 우리 설계가 업계 대비 **빠진 지점**

| 공백 | 출처 | 긴급도 |
|---|---|---|
| 모델 진화에 따른 **단순화 경로** 명시 | Anthropic | 중 |
| **주기 엔트로피 스윕** 메커니즘 | OpenAI | 중 |
| **Sprint Contract** — 구현 전 "done"의 정의 협상 | Anthropic | 중-저 |
| **디자인 Grading criteria** (UI/UX evaluator) | Anthropic | 저 (UI 중심 프로젝트에서만) |
| **팀 크기 축** (solo/team/org) | OpenAI | 저 |
| **Context Reset** (compaction보다 강한 상태 전승) | Anthropic | 저 (이미 compact-recovery 있음) |

상세 반영안은 [02-design-integration.md](02-design-integration.md) 참조.

---

## 이 문서가 **답하지 않는** 질문

- 업계 원문 요약 — [`/docs/review/harness-engineering/`](../../../../../docs/review/harness-engineering/) 참조
- 구체 패치 PR — 본 문서는 "어디를 바꿀지"만 제안. 실제 편집은 design 문서 수정 시 결정.
- 특정 모델(Opus 4.5 vs 4.6)별 세부 — 본 프로젝트는 모델 agnostic이 목표.

---

## 참고

- 원문: [`/docs/review/harness-engineering/README.md`](../../../../../docs/review/harness-engineering/README.md)
- Anthropic: https://www.anthropic.com/engineering/harness-design-long-running-apps
- OpenAI: https://openai.com/index/harness-engineering/ (원문 403 · 2차 출처)
