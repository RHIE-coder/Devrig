# Saga 상세

> **한 줄 요약:** Saga는 "여러 서비스를 걸친 트랜잭션"을 **로컬 트랜잭션의 시퀀스 + 실패 시 보상(compensation)** 으로 다시 정의한 패턴. 2PC의 대안이자 Event Sourcing 시대의 트랜잭션.

---

## 1. 왜 Saga인가 — 2PC의 한계

### 1.1 2PC (Two-Phase Commit)

```
Coordinator:
  Phase 1 (Prepare):  모든 참가자에게 "준비됐나?" → 모두 YES면 다음
  Phase 2 (Commit):   모두에게 "커밋해라" → 완료
```

**작동 조건:**
- 참가자들이 **한 트랜잭션 매니저**에 종속 (XA, JTA)
- Prepare 후 Commit 사이에 참가자가 **잠금 유지**
- Coordinator가 항상 살아있어야 함

### 1.2 왜 분산 시스템에서 실패하는가

| 문제 | 상세 |
|------|------|
| **Blocking** | Prepare 후 Commit 대기 중 참가자는 잠금 보유 → 처리량 급감 |
| **Coordinator SPOF** | Coordinator 죽으면 참가자들이 영구 pending |
| **Heterogeneity** | 외부 API (Stripe, 이메일 발송)는 XA 참여 불가 |
| **Latency** | 네트워크 round-trip 2회 × 참가자 수 |
| **Scalability** | 수십 개 마이크로서비스 × TPS = 비현실적 |

**Kleppmann (DDIA)**: "분산 트랜잭션의 부정적 영향을 실제 현업에서 감당할 수 있는 시스템은 극히 드물다."

### 1.3 Saga의 전환

```
"여러 서비스에 걸친 ACID 트랜잭션"    →  포기
"각자 로컬 ACID + 전체 시퀀스로 일관성" →  채택
```

**대가:** 격리(Isolation)를 잃는다. 중간 상태가 외부에서 보인다. → 이것을 **운영 규칙**으로 메꾸는 게 Saga 설계.

---

## 2. Saga의 구조

### 2.1 기본 정의

```
Saga = T1 → T2 → T3 → ... → Tn
   각 Ti = 로컬 ACID 트랜잭션
   Ti 실패 시: 이미 성공한 T1..Ti-1 을 역순으로 보상
   C1 ← C2 ← ... ← Ci-1

Ci (보상 트랜잭션):
   Ti가 만든 변경을 의미적으로 되돌리는 다른 트랜잭션
   Ti의 rollback이 아님 (이미 커밋됨) — 별개의 트랜잭션
```

### 2.2 예시 — 주문 Saga

```
T1: OrderService.createOrder(orderId)           → DRAFT
T2: InventoryService.reserve(orderId, items)    → 재고 예약
T3: PaymentService.charge(orderId, amount)      → 결제
T4: ShipmentService.schedule(orderId)           → 배송 예약
T5: OrderService.confirm(orderId)               → CONFIRMED

T3 실패 시 보상 시퀀스:
  C2: InventoryService.release(orderId)         → 예약 해제
  C1: OrderService.cancel(orderId, reason)      → 취소 처리
```

**주의:** "Rollback"이 아니라 "Cancel" / "Release" — **도메인 이벤트**. 실무에서는 고객에게 취소 알림, 환불, 재고 반영 등 부수 효과가 따라붙는다.

---

## 3. 두 가지 조정 방식

### 3.1 Orchestration (중앙 조정)

```
          ┌──────────────────┐
          │  Saga Orchestrator│  ← 흐름을 아는 주체
          └───┬──────┬──────┬┘
              │      │      │
        createOrder reserve charge
              ▼      ▼      ▼
          Order   Inventory Payment
          Svc     Svc        Svc
```

- **Orchestrator**가 `Send(createOrder) → wait reply → Send(reserve) → ...` 수순 관리
- 실패 감지 시 Orchestrator가 **보상 명령**을 역순 dispatch
- 구현: **Saga Actor** (Akka·Temporal), **State Machine** (AWS Step Functions, Camunda)

**장점:** 흐름이 한곳에 모여 가시성·디버깅 쉬움.
**단점:** Orchestrator가 결합 중심점이 됨. 한 Orchestrator가 여러 도메인 지식을 가짐.

### 3.2 Choreography (분산 이벤트 기반)

```
OrderCreated → (pub/sub) → InventoryService → InventoryReserved
                                              → (pub/sub) → PaymentService → PaymentCharged
                                              → (pub/sub) → ShipmentService → ...
```

- 각 서비스가 **이벤트 구독**하고 자기 할 일만 함
- 실패: `PaymentFailed` 이벤트 방출 → Inventory가 구독하고 보상(release) 실행

**장점:** 느슨한 결합. 서비스 추가 쉬움.
**단점:** 전체 흐름이 **코드에 안 보인다**. 디버깅·장애 분석 어려움.

### 3.3 선택 기준

| 상황 | 추천 |
|------|------|
| 흐름이 복잡·장기(며칠) | Orchestration (Temporal/Camunda) |
| 흐름이 짧고 참여자 <= 3 | Choreography |
| 보상 로직이 복잡 | Orchestration (중앙 상태머신이 명시적) |
| 팀이 이미 event-driven | Choreography 자연스러움 |

하이브리드도 흔함 — 큰 단위는 Orchestration, 각 단계 내부는 Choreography.

---

## 4. 실패 시나리오와 방어

### 4.1 타임아웃

**문제:** 메시지 소실·참가자 응답 지연.
**방어:** Saga에 `timeout`·`retry policy` 명시. `Temporal`이 대표적으로 이걸 1급으로 다룸.

```
T3 (payment) timeout 30s → retry 3회 → 실패 시 보상 시퀀스
```

### 4.2 보상 실패 (Compensation failure)

**문제:** C2(재고 해제)가 실패. → **무한 루프 위험.**
**방어:**
- 보상은 **반드시 idempotent**하게 (재시도해도 안전)
- 최종 실패 시 **Dead Letter / 수동 개입 큐**로 escalate
- 회계·재고처럼 **반드시 일관성** 필요한 도메인은 **거래 로그 + 수동 보정 프로세스** 병행

### 4.3 중복 메시지

**문제:** At-least-once 전달이 표준. 같은 명령이 2번 도착 가능.
**방어:** **Idempotency Key** 필수.

```
chargePayment(orderId=42, idempotencyKey="abc-123")
  → 서비스는 idempotencyKey를 저장. 같은 키 재수신 시 같은 결과 반환 (중복 처결제 X)
```

Stripe·AWS API가 `Idempotency-Key` 헤더로 이걸 표준화. Saga 내부 명령도 같은 원리.

### 4.4 Semantic Lock

**문제:** T1 후 T3 전까지 **다른 Saga가 같은 리소스**를 수정하면?
**방어:** 중간 상태를 **도메인에 반영** — `ORDER.status = PENDING_PAYMENT`로 두고 다른 흐름이 이 상태의 주문을 건드리지 않도록.

### 4.5 Pivot Transaction

Saga 중 "**이 시점 이후로는 보상 불가**"인 단계가 있다. (예: 이메일 발송, 외부 API 확정 호출)

- 이 단계는 **Pivot**이라 부름
- Pivot 이후 실패는 **retry only**, 보상 불가
- 설계: Pivot은 최대한 뒤로, 그 전에 **가역적 단계**들을 배치

---

## 5. 필수 반려자들 — Idempotency · Saga Log · Outbox

### 5.1 Idempotency

이미 다뤘듯 모든 Saga 단계·보상은 idempotent여야 함. 구현 방법:

| 기법 | 설명 |
|------|------|
| **Idempotency key table** | `(key, result)` 저장. 재수신 시 저장된 result 반환 |
| **Natural key + upsert** | `INSERT ... ON CONFLICT DO NOTHING` |
| **Event de-dup** | 이벤트 스토어가 `(producerId, seqNo)`로 중복 검출 |

### 5.2 Saga Log

Saga Orchestrator의 상태 저장소. 각 단계의 상태(`STARTED`, `COMPLETED`, `FAILED`, `COMPENSATING`, `COMPENSATED`)를 **append-only 로그**에 기록.

- 용도: 장애 후 복구 시 "어디까지 진행됐는지" 복원
- Event Sourcing과 자연스럽게 겹침 — Saga 자체를 ES로 구현 가능

### 5.3 Outbox Pattern

**문제:** Service가 DB 커밋 + Message Broker publish를 원자적으로 해야 함. 어느 한쪽만 성공하면 상태 불일치.

**Outbox 해법:**
```
Transaction {
  UPDATE order SET status='PAID'
  INSERT INTO outbox (topic, payload) VALUES (...)
}  -- 한 DB 트랜잭션

별도 Relay Process:
  outbox에서 미발행 row → Message Broker publish → outbox.published=true
```

- Saga의 각 단계가 이벤트를 내보낼 때 **반드시** Outbox 경유
- 없으면 "DB는 커밋됐는데 이벤트는 유실" 시나리오 발생 → 영구 불일치

**Debezium (CDC)** + Outbox가 실무 표준 조합.

### 5.4 세 가지의 관계

```
Saga 실행
  ├── 각 단계는 idempotent      (중복 방어)
  ├── 각 상태 전이는 Saga Log   (장애 복구)
  └── 각 이벤트 발행은 Outbox   (메시지 유실 방어)

→ 셋 다 빠지면 "보기에는 작동하는데 가끔 데이터가 틀어지는 Saga"가 된다.
```

---

## 6. 실전 도구

| 도구 | 특징 | 적합 상황 |
|------|------|----------|
| **Temporal** | Workflow-as-code. 보상·retry·타임아웃 1급 지원 | 복잡·장기 흐름. Go/Java/TS 지원 |
| **AWS Step Functions** | 상태머신 정의(JSON), serverless | AWS 생태계 |
| **Camunda** | BPMN 기반. 비즈니스 프로세스 모델링 | 금융·보험 |
| **Axon Framework (Saga)** | Java. ES/CQRS와 통합 | JVM·Aggregate 기반 |
| **MassTransit (Sagas)** | .NET Service Bus 기반 | .NET |
| **NestJS CQRS + 직접 구현** | Framework 미사용, 이벤트·핸들러 직접 작성 | Node·TS 단일 팀 |

---

## 7. 하네스 관점 — Sprint Loop를 Saga로 본다면?

**사고 실험:**

```
Sprint Saga:
  T1: /harness:implement
  T2: /harness:review
  T3: /harness:qa
  T4: /harness:deploy

실패 시 보상:
  T3 실패 (QA FAIL) → C2: review feedback 정리 → C1: implement 재진입
  T2 실패 (NEEDS_CHANGE) → C1: implement 재진입
  T4 실패 (deploy 에러) → C3: 배포 롤백 → alert 발송
```

**이게 정말 Saga인가?** — 엄밀히는 아니다.

| Saga 조건 | Sprint Loop |
|----------|-------------|
| 여러 서비스 걸침 | ❌ 한 프로젝트 안 |
| 원자성 포기 + 보상 필요 | ❌ 각 단계가 사실 선형 재시도 |
| 비동기 메시지 | ❌ 동기 skill 호출 |

→ Sprint Loop는 **선형 상태 머신(FSM) + retry**가 더 맞는 모델.

**그러나 Saga 개념 중 이식할 가치 있는 것:**

1. **Compensation ≠ Rollback** — "QA 실패" 시 단순 재시도가 아니라 **feedback 기록 + implement 복귀**라는 별개의 흐름. 이게 보상.
2. **Idempotency Key** — 같은 implement 재실행 시 worktree·state 중복 생성 방지. `.harness/state/sprint-log.jsonl`에 `(feature, iteration, step)` 키로 멱등성 보장하면 좋음.
3. **Saga Log** — `sprint-log.jsonl` (이미 유사한 게 있다면) 는 append-only로 "어디까지 진행됐나"를 재구성 가능하게 만들 수 있음.
4. **Pivot Transaction** — `/harness:deploy`는 pivot. 이후 보상은 불가 (트래픽 나감). → 배포 전 모든 가역 단계를 **반드시** 통과해야 한다는 설계 제약.

**평가:**
- **Saga 프레임워크 도입 X** (과함)
- **Saga 개념 어휘 차용 O** — "compensation", "pivot", "idempotency", "saga log"라는 언어로 Sprint Loop 재설명하면 실패·재시도 시나리오를 명확히 다룰 수 있음

구체 제안: [05-harness-applicability.md](05-harness-applicability.md) §Saga 섹션.

---

## 8. 한 줄 정리

> **2PC**는 *전체를 한 트랜잭션으로 묶어 일관성*을 지키려다 실패했고, **Saga**는 *로컬 트랜잭션 시퀀스 + 보상*으로 일관성을 **재정의**했다. 대가는 격리(isolation)의 손실 — 이것을 idempotency·outbox·pivot 설계로 메꾸는 것이 Saga 엔지니어링의 본질.
