# AGENTS.md 실증 — 본 설계로의 반영

> 원문 리뷰: [`docs/review/harness-engineering/03-gloaguen-agentsmd.md`](../../../../../docs/review/harness-engineering/03-gloaguen-agentsmd.md)
> Gloaguen et al. (ETH Zürich, 2026-02) — **AGENTS.md / CLAUDE.md 의 효용에 대한 첫 체계적 실증 연구**.
>
> **성격:** 이 문서는 논문 요약 재탕이 아니라, "이 실증이 본 설계의 어느 문장·config·스크립트에 어떤 힘을 실어주거나 바꾸게 하는가"만 다룸.

---

## 가장 중요한 한 줄

> **본 설계가 이미 내린 결정(`CLAUDE.md` 자동 생성 금지 · 유저 소유 · SessionStart hook 주입)은 이 논문의 실증과 정확히 일치한다.**
>
> 설계는 업계 권장(Anthropic · OpenAI · QwenLM)을 **역행**해 왔는데, 이 논문이 그 역행에 **외부 실증 근거**를 제공한다. → 01-patterns-distilled.md §I 의 논지 강화.

---

## 논문이 제공하는 실증 숫자 (설계 근거로 인용 가능)

| 측정 | 값 | 본 설계 함의 |
|---|---:|---|
| LLMCtx 성공률 변화 | **−2~3%** | `/harness:init` 이 CLAUDE.md 를 자동 생성했다면 하네스 도입 자체가 순효과가 음일 수 있었음 |
| LLMCtx 비용 증가 | **+23%** | 업계 권장대로 했다면 매 세션 ~20% 비용 패널티 |
| DevCtx 성공률 변화 | **+4%** | 유저가 직접 작성할 경우 소폭 이득 — `examples/CLAUDE.md.example` 의 **존재 의의** 유지 |
| DevCtx 비용 증가 | **+19%** | 유저 소유도 "비용이 있다" — **최소화 원칙** 필요 |
| Reasoning 토큰 증가 | **+10~22%** | 컨텍스트 파일의 제약이 agent의 **연쇄 판단 비용**까지 올림 — token budget 표에서 경고 필요 |
| 추가 테스트 실행 | **+15~40%** | 과도한 검증 루프로 이어짐 — mock_guard/coverage 와 별개 축의 부담 |

---

## 설계에 추가로 반영할 3가지

### ① `CLAUDE.md.example` 의 "최소화 원칙" 명시

**문제**: 현재 `skills/init/examples/CLAUDE.md.example` 의 내용 지침이 불분명. 유저가 장황한 README-유사 파일을 복사하면 논문이 보여준 **+19% 비용, +4% 성공**이 **+19% 비용, 0% 또는 -** 로 무너진다.

**제안**:
- `05-project-structure.md §6.1` 의 "선택: cp ... CLAUDE.md.example" 안내 밑에 1줄 추가:
  > **주의:** README 를 복사해 넣지 말 것. **비자명한 레포-특화 제약만** 적는다 (특이 빌드 명령, 정책 금지사항, 숨은 환경 요구). 자명한 아키텍처·관습을 적으면 성공률은 오르지 않고 비용만 +19%~23% 증가 (Gloaguen 2026).
- `examples/CLAUDE.md.example` 파일 자체를 2026 논문 기준으로 리라이트 — "절대 적지 말 것 / 적어도 되는 것" 두 섹션으로 구성.

### ② `SessionStart hook` 주입량 자체에 상한 (self-budget)

**논문 함의**: "파일 기반 진입점이 성공률에 도움 안 됨" — **본 설계의 SessionStart hook 주입도 같은 덫에 빠질 수 있다.** 현재 `02-architecture.md §8.3` 은 `SessionStart context ~1,800t` 예산을 명시하지만, **내용이 README와 중복되지 않는지** 감사 기준이 없다.

**제안**:
- `config.harness.session_start_context.max_tokens` 기본 1,800 유지
- 신규 `scripts/qa/context-redundancy.mjs` — SessionStart 주입 내용 vs `README.md` jaccard 유사도 > 0.4 시 경고
- 신규 audit 이벤트 `context_redundancy_warn`

**우선도**: 🟡 — 긴급하지 않으나, 본 설계가 논문을 실증적으로 **회피하는지** 자체 검증하는 장치.

### ③ Trace 기반 평가 — 본 설계 `audit.jsonl` 을 AGENTbench 수준으로 승격

**논문 주장**: "성공률 + 비용 + trace 행동" 삼각 측정이 올바른 agent harness 평가.

**본 설계 현황**: 14개 audit 이벤트는 **결정론적 감사**용이며 **agent 행동 profile** 은 간접적으로만 포착.

**제안 (🟢 옵션)**:
- 논문의 10개 intent cluster (git · model lifecycle · env/deps · build · quality · test · execution · search · file ops · system utilities) 를 `audit.tool_intent` 필드로 추가
- `/harness:sync` 출력에 intent distribution 포함 → 세션별 "에이전트가 실제로 뭘 했나" 가시화
- 내부 benchmark 도입 시 AGENTbench 포맷 차용 (138 instances · 12 repos 형식)

**비고**: 비용 대비 효과는 장기 관점에서만 명확. 당장 우선 아님.

---

## 설계에 **반영하지 않을** 것들 (명시적 거부)

| 논문이 언급하지만 본 설계에 안 맞음 | 이유 |
|---|---|
| "LLM 생성 완전 금지" | 본 설계는 이미 자동 생성을 하지 않음. 더 강하게 할 것이 없음. |
| "`AGENTS.md` 명칭 채택" | 본 설계는 Claude Code 플랫폼 중심 → `CLAUDE.md` 로 충분. 다중 벤더 지원은 범위 밖. |
| "Python 특수성 회피 권고" | 본 설계는 언어 agnostic — stack detection 으로 처리 중 (`detect-stack.mjs`). |

---

## 01-patterns-distilled.md · 02-design-integration.md 와의 관계

- **01 §I**(AGENTS.md / CLAUDE.md 유저 소유) → 본 문서가 **실증 근거로 격상**
- **02 §05-project-structure 리팩터**(🔴) → 본 문서의 ① 반영 포인트에서 실증 숫자(-3%, +23%) 를 **인용 문구**로 추가 가능
- **02 §02-architecture SessionStart 단일화**(🔴) → 논문의 "entry-point 가설 기각" 으로 **보강**

기존 두 문서는 유지. 본 문서는 **실증 레이어** 로 나란히 존재.

---

## 01-patterns-distilled.md "업계 선례와 부합" 문구 보강 제안

현재 (`01 §I`):
> 우리가 제안한 "CLAUDE.md·rules 유저 소유" 방향은 업계 선례와 부합.

**제안 변경**:
> 우리가 제안한 "CLAUDE.md·rules 유저 소유" 방향은 업계 선례와 부합하며, 2026-02 Gloaguen et al. 의 AGENTbench 실험(138 인스턴스 · 12 레포)에서 **LLM 자동 생성 컨텍스트 파일이 성공률을 -3% 낮추고 비용을 +23% 증가시킴**이 확인됨.

→ 약한 "선례와 부합" 을 강한 "실증 근거" 로 격상.

---

## 향후 재검토 트리거

본 논문의 결론은 2026-02 모델 세대 기준. 다음 조건 중 하나라도 충족 시 본 문서 재검토:

1. 차세대 모델(예: Opus 5, GPT-6)에서 AGENTbench 재실험 결과 발표
2. 본 설계에 **자동 context 생성 기능**이 도입될 제안이 생겼을 때
3. `examples/CLAUDE.md.example` 가 README 재탕으로 드리프트했다는 피드백 발생 시
