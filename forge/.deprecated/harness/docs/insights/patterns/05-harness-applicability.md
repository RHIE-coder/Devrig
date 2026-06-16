# 하네스 아키텍처 관점 — 분산 상태 패턴 적용성

> **한 줄 요약:** 하네스는 **단일 사용자 CLI + Node.js + 파일시스템**이라는 제약 위에서 돌아간다. 분산 상태 패턴의 **프레임워크 도입은 거의 전부 과잉**이지만, **개념·어휘·구조 원칙의 차용**은 설계 명확성에 결정적 기여를 한다.

---

## 1. 전제 — 하네스의 런타임 특성

| 축 | 특성 | 영향 |
|---|------|------|
| 사용자 수 | **단일 유저** (로컬 프로젝트 단위) | 수평 확장 불필요 |
| 동시성 | 낮음 (병렬 worktree 3~5개 수준) | Cluster·Sharding 과함 |
| 저장소 | 파일시스템 (`.harness/state/*.json*`) | DB 없음. ES도 파일 기반으로 구현 |
| 통신 | 프로세스 내부 + Hook 스크립트 | Message Broker·Pub/Sub 없음 |
| 언어 | Node.js (`.mjs`) | JVM 프레임워크(Axon/Akka) 도입 불가 |
| 수명 | 세션 짧음·stateless, 상태는 파일 | "LLM은 stateless 처리기" 원칙과 일치 |

→ **"분산 시스템을 위해 만든 패턴들을 단일 유저 로컬 환경에 그대로 끌고 오면 과잉"** 이 기본 전제.

---

## 2. 하네스에 이미 있는 "유사 패턴"

하네스가 이미 이 패턴들과 닿아있는 지점.

### 2.1 Stateless FSM — Hook + workflow.json

```
Hook 프로세스  = stateless 처리기 (프로세스 시작 → 디스크 읽기 → 판단 → 종료)
workflow.json = FSM의 현재 상태 (phase, gates_passed, right_size)
```

**대응되는 외부 패턴:** Stateless 서비스 + 외부 상태 저장소. Aggregate의 개념에서 "Repository" 역할이 파일시스템.

### 2.2 Event Log 싹수 — `*.jsonl` 파일

```
.harness/state/qa-log.jsonl     ← append-only, 시간순
.harness/state/sprint-log.jsonl ← append-only
```

**대응되는 외부 패턴:** Event Sourcing의 Event Store (경량). 다만:
- 이벤트 스키마 `version` 필드 없음 → 진화 방어 없음
- Aggregate ID 기반 분리 없음 (feature별 스트림 분리 없음)
- 현재 상태는 별도 `workflow.json` (snapshot이 아닌 canonical)

### 2.3 Single Writer 모델 — `.harness/state/` 동시성

02-architecture.md §7.5에 Single Writer 패턴 명시:
```
여러 Hook/스크립트가 동시에 .harness/state/를 수정하지 않도록
→ 단일 writer 프로세스(또는 파일 락) 경유
```

**대응되는 외부 패턴:** Actor Model의 mailbox — "한 번에 한 메시지만 처리". Actor 전체 도입은 아니지만 **동시성 경계 원칙**은 동일.

### 2.4 Sprint Loop — (비)Saga

```
/harness:implement → /harness:review → /harness:qa → /harness:deploy
   ↓ 실패                ↓ NEEDS_CHANGE       ↓ FAIL
   implement로 복귀      implement로 복귀    implement로 복귀
```

**대응되는 외부 패턴:** Saga 구조와 닮음. 다만:
- 실제로는 **선형 FSM + retry**에 가깝고 진짜 Saga의 **보상(compensation)** 개념은 흐릿함
- 배포 후 장애 시 롤백 흐름은 미정의

### 2.5 CQRS-유사 구분 — `specs/` vs `state/`

- `.harness/specs/`, `.harness/plans/`, `.harness/decisions/` — **Command-side** (유저 의도, 규칙, 불변식)
- `.harness/state/` — 현재 상태 (빠른 읽기용, 사실상 캐시)
- `docs/`, `reviews/`, `bench/` — **Read-side 비슷** (projection·report)

**대응되는 외부 패턴:** CQRS의 읽기/쓰기 분리와 유사. 다만 **의도한 CQRS가 아니라 자연스러운 파일 분할**에 가까움.

---

## 3. 도입 후보 — 비용/편익 매트릭스

각 패턴에 대해 **코드 도입** · **개념 차용** 두 수준으로 평가.

| 패턴 | 영역 | 도입 편익 | 도입 비용 | 평가 | 권장 수준 |
|------|------|----------|----------|------|----------|
| **Event Sourcing (full)** | state/ 전면 이벤트 로그 전환 | 완전 audit · time-travel · rebuild 가능 | 복잡도 폭증 · 성능 이슈 | ❌ | 코드 X |
| **ES 경량 — Upcaster** | `*.jsonl` 스키마 진화 방어 | 하네스 버전 업그레이드 시 구 프로젝트 자동 호환 | 낮음 (Node 함수) | ⭐⭐⭐ | **코드 O** |
| **ES 경량 — Event Log 정착** | qa-log·sprint-log를 명시 "event stream"으로 | 회고·장애분석 명확 | 낮음 | ⭐⭐⭐ | **코드 O** |
| **CQRS (full)** | state/ 읽기 전용 projection DB | 읽기 성능 · 유연한 쿼리 | 인프라 과함 | ❌ | 코드 X |
| **CQRS-유사 구분 명시** | "command-side / read-side" 문서에 언어화 | 구조 이해도 ↑ | 0 | ⭐⭐ | **개념 O** |
| **Actor (full — Akka/Pekko)** | 병렬 worktree 오케스트레이션 | 동시성 격리 | 런타임 불일치 | ❌ | 코드 X |
| **Actor 원칙 — Single Writer** | state/ 쓰기 주체 일원화 | 경쟁 조건 원천 봉쇄 | 이미 02-architecture.md §7.5에 있음 | ⭐⭐⭐ | **개념 O (이미 적용)** |
| **Saga (full — Temporal)** | Sprint Loop 재구성 | 복잡 실패 처리 · retry 정책 1급 | 외부 의존성 과함 | ❌ | 코드 X |
| **Saga 어휘 — compensation / pivot / idempotency key** | Sprint Loop 실패 설계 | 실패 시나리오 빠짐없이 설계 | 0 (언어만) | ⭐⭐⭐⭐ | **개념 O** |
| **DDD Aggregate — 경계 사고법** | feature 단위를 "Aggregate"로 명명 | 일관성 경계 명확 | 0 | ⭐⭐⭐⭐ | **개념 O** |
| **Outbox Pattern** | Hook이 state 쓰기 + Bash 명령을 원자화 | 하네스에서 실제 필요성 낮음 | 복잡도 | ⚠️ | 필요 시 |

**요약 그래프:**
```
  도입 가치 (편익 - 비용)
    ↑
    │  ⭐⭐⭐⭐  Saga 어휘 / Aggregate 경계 사고
    │  ⭐⭐⭐   Upcaster / Event Log 정착 / Single Writer
    │  ⭐⭐    CQRS-유사 구분 명시
    │  ⚠️     Outbox (조건부)
    │  ❌     ES full / CQRS full / Actor full / Saga full
    └────────────────────────→ 도입 수준 (개념 → 코드)
```

---

## 4. 구체 적용안 — "Top 5"

도입 수준 ⭐⭐⭐ 이상 5개를 구체 제안.

### 4.1 [⭐⭐⭐⭐] Aggregate 경계 사고법 — "1 Feature = 1 Aggregate"

**현재:** Spec·Plan·State·Coverage가 `.harness/` 안에서 어떻게 분리되는지 **명시 규칙 없음**.

**적용:**
- 문서화 어휘 도입 — "하네스의 Aggregate 단위는 **feature**" (예: `auth/login`)
- 규칙 형식화:
  - 한 feature의 state 변경은 단일 지점(Hook 또는 skill 단일 호출)을 통과
  - feature 간 참조는 **ID로만** (spec 파일에서 다른 feature는 경로 문자열로만)
  - Cross-feature 일관성은 **eventual** 허용 (coverage.json 갱신 지연 OK)

**문서 반영:** 02-architecture.md에 `§3.x Feature as Aggregate` 신설.

**코드 변경:** 0 (이미 자연스럽게 그렇게 됨. **명시화**가 목적)

### 4.2 [⭐⭐⭐⭐] Saga 어휘로 Sprint Loop 재설계

**현재:** Sprint Loop 실패 처리가 "재진입" 수준에서 모호. Deploy 실패·롤백 흐름 미정의.

**적용 — 어휘 도입:**

| Saga 개념 | 하네스 적용 |
|-----------|------------|
| Compensation | "QA FAIL 시 → feedback 정리 + implement 복귀" = 재진입이 아니라 **명시적 보상 이벤트** |
| Pivot Transaction | `/harness:deploy` = pivot. 이후는 retry만 가능 |
| Idempotency Key | `(feature, iteration, step)` 키로 중복 실행 방지 |
| Saga Log | `.harness/state/sprint-log.jsonl` 정착 (아래 §4.4와 결합) |

**문서 반영:** 03-workflow.md §1.3 Sprint 상세에 Saga 어휘 삽입. 실패 시나리오 표 추가.

**코드 변경:** 최소 — sprint-log 기록 형식 표준화, idempotency key 검증 Hook 추가.

### 4.3 [⭐⭐⭐] Event Log 정착 — `*.jsonl`을 공식 event stream으로

**현재:** `qa-log.jsonl` 등이 있을 수도·없을 수도, 형식도 ad-hoc.

**적용:**

표준 이벤트 레코드 스키마:
```json
{
  "v": 1,
  "ts": "2026-04-13T10:30:00.000Z",
  "stream": "auth/login",           // Aggregate ID (feature)
  "seq": 42,                        // stream 내 순번
  "type": "QAPassed",
  "payload": { ... },
  "producer": "harness:qa"
}
```

디렉토리 구조:
```
.harness/state/
  events/
    {feature}/
      {YYYY-MM}.jsonl               # 월별 샤드 (대용량 방지)
  snapshots/
    {feature}/
      workflow.json                 # 현재 상태 스냅샷 (fold 결과)
  index.json                        # stream 목록·최신 seq
```

규칙:
- 모든 상태 변경은 **먼저 event 쓰고**, 이후 snapshot 갱신
- snapshot 손상 시 events에서 fold로 rebuild

**얻는 것:** 회고·디버깅·버전 업그레이드 시 과거 추적 가능.

**코드 변경:** 중간. `scripts/state/event-log.mjs` 유틸 + 모든 Hook이 이걸 경유.

### 4.4 [⭐⭐⭐] Upcaster — 스키마 진화 방어

**문제:** 하네스 v2 출시 시 기존 프로젝트의 `workflow.json` / `qa-log.jsonl`이 새 스키마와 충돌.

**적용:**

`scripts/state/upcaster.mjs`:
```javascript
export const upcasters = {
  QAPassed: [
    // v1 → v2: duration_ms 필드 추가
    (e) => ({ ...e, v: 2, duration_ms: e.duration_ms ?? null }),
    // v2 → v3: agent_id 필드 추가
    (e) => ({ ...e, v: 3, agent_id: e.agent_id ?? "unknown" }),
  ],
  // ... 이벤트 타입별 체인
};

export function upcast(event) {
  const chain = upcasters[event.type] || [];
  let cur = event;
  for (let i = (cur.v ?? 1) - 1; i < chain.length; i++) {
    cur = chain[i](cur);
  }
  return cur;
}
```

사용:
```javascript
const rawEvents = readJsonl(logPath);
const events = rawEvents.map(upcast);  // 항상 최신 스키마로 변환
```

**얻는 것:** 하네스 업그레이드 시 "이전 프로젝트가 안 열림" 문제 근본 방어.

**문서 반영:** 05-project-structure.md에 "버전 관리 — Upcaster" 섹션 신설.

### 4.5 [⭐⭐⭐] Single Writer 재확인 — Actor 원칙의 명시화

**현재:** 02-architecture.md §7.5에 이미 있음.

**추가 적용:**
- Hook 체인에서 `.harness/state/` 쓰기가 **반드시** `scripts/state/writer.mjs` 단일 엔트리를 거치도록
- 동시 실행 방어: `flock` (POSIX) 또는 `proper-lockfile` (Node) 사용
- **위반 감지 검증** — devtime에 state 쓰기가 여러 경로에서 일어나면 경고

**얻는 것:** 파일 경쟁 원천 차단. Actor 모델의 mailbox 규칙을 파일 락으로 대체.

**코드 변경:** 낮음 (기존 의도의 강제화).

---

## 5. 권장 스탠스 (한 문단)

> 하네스는 **분산 시스템이 아니고 앞으로도 아닐 가능성이 높다.** 따라서 Axon·Akka·Temporal·EventStoreDB 같은 **프레임워크 도입은 거의 모두 과잉**이다. 그러나 이 패턴들은 **20년 분산 시스템 고통의 결정체**이므로, 그 **어휘(Aggregate, Saga, Compensation, Upcaster, Single Writer, Idempotency Key)**를 하네스 설계에 채택하면 **비용 없이** 시스템을 더 견고하게 설계할 수 있다. 대원칙: **"코드로 가져오지 말고, 이름으로 가져와라."**

---

## 6. 후속 할 일 (문서 반영 제안)

이 인사이트를 design/ 문서에 반영하려면:

| 대상 문서 | 변경 |
|----------|------|
| `02-architecture.md` | `§3.x Feature as Aggregate` 신설 (§4.1) |
| `02-architecture.md §7.5` | Single Writer → "Actor 원칙 차용"으로 명명 (§4.5) |
| `03-workflow.md §1.3` | Sprint Loop에 Saga 어휘 삽입 — compensation/pivot/idempotency (§4.2) |
| `05-project-structure.md` | `.harness/state/events/` + `snapshots/` 디렉토리 구조 반영 (§4.3) |
| `05-project-structure.md` | "버전 관리 — Upcaster" 섹션 (§4.4) |
| `dashboard.html` | Architecture 탭에 "Feature = Aggregate" 도식 추가 |

→ 도입은 **점진적**으로. 한 번에 반영하지 말고 1~2주 간격으로 한 개씩 검증하며 진행 권장.

---

## 7. 한 줄 정리

> 하네스에서 이 패턴들은 **"쓰는 것"이 아니라 "아는 것"이 더 중요**하다 — 그 이름으로 설계 단면을 들여다볼 수 있으면 충분하고, 코드를 갈아엎을 이유는 대부분 없다.
