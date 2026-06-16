# DDD Aggregate ↔ Actor 매핑

> **한 줄 요약:** 두 모델은 *서로 다른 세계에서 같은 문제를 풀었다.* Aggregate는 "비즈니스 일관성 경계", Actor는 "동시성 격리 경계". 경계 기준이 맞물릴 때 **1 Aggregate = 1 Actor**가 자연스럽다.

---

## 1. Aggregate — 정의와 목적

### 1.1 정의 (Evans, DDD Blue Book)

> "An Aggregate is a cluster of associated objects that we treat as a unit for the purpose of data changes."

- **Aggregate Root**: 외부에서 접근 가능한 유일한 진입점 (하나의 Entity)
- **Internal Entities / Value Objects**: Root를 통해서만 접근·수정
- **Invariant (불변식)**: Aggregate 내부 상태가 항상 만족해야 하는 규칙
- **Consistency Boundary**: 하나의 트랜잭션으로 Aggregate 전체를 원자적으로 커밋

### 1.2 왜 필요한가

```
Without Aggregate:
  Order → OrderLine → Product → Category → ...
  객체 그래프가 끝없이 이어지고 "누가 Product를 수정할 책임이 있는가?"가 불명확.
  복수 경로로 같은 데이터가 수정되면 불변식 깨짐.

With Aggregate:
  [Order Aggregate] ─── has ──→ OrderLines (내부)
  [Product Aggregate] (독립)
  규칙: Order는 Product의 *ID만* 참조. 직접 객체 참조 금지.
  → 수정 경로가 Root로 일원화 → 불변식 강제 가능
```

### 1.3 4가지 핵심 규칙 (Vernon, Implementing DDD)

1. **작게 유지** — Aggregate가 크면 동시성 충돌↑
2. **ID로만 타 Aggregate 참조** — 객체 그래프 폭발 방지
3. **결과적 일관성(eventual consistency) 허용** — Aggregate 간에는 즉시 일관성 포기
4. **1 트랜잭션 = 1 Aggregate 수정** — 규모 커지면 이게 가장 자주 깨지는 규칙

---

## 2. Actor — 정의 (요약)

이전 정리의 재사용:

```
Actor = {
  state:    사설 메모리 (외부 직접 접근 불가)
  mailbox:  FIFO 메시지 큐
  behavior: receive(msg) → (newState, 다른 Actor에게 보낼 메시지들)
}

규칙:
  1. 공유 메모리 금지 — 메시지로만 통신
  2. 1 Actor는 한 번에 1 메시지만 처리 (직렬 실행)
  3. Actor는 Actor를 spawn
  4. 메시지는 비동기
```

핵심은 **"한 번에 1 메시지만 처리한다"** — 이것이 Aggregate의 트랜잭션 경계와 기가 막히게 맞아떨어진다.

---

## 3. 1 Aggregate = 1 Actor 매핑의 자연스러움

### 3.1 구조 매핑표

| DDD Aggregate | Actor Model | 매핑 이유 |
|---------------|-------------|----------|
| Aggregate Root | Actor 인스턴스 | 유일한 진입점 |
| Aggregate ID | Actor Address / PersistenceId | 외부 식별자 |
| Internal Entities · VO | Actor의 사설 state | 외부 접근 금지 |
| Command (도메인 명령) | Actor 메시지 | 요청 단위 |
| Command Handler (메서드) | Actor behavior | msg → state 전이 |
| Domain Event | 보내는 이벤트 메시지 | 결과 방출 |
| Invariant | behavior 내부 guard | 규칙 위반 시 reject |
| Repository | ActorSystem + PersistentRef | ID로 Actor 찾기 |
| Transaction 경계 | 1 메시지 처리 범위 | **동시성 1:1** |
| Eventual consistency 간 Aggregate | 타 Actor에게 비동기 메시지 | 트랜잭션 밖 |

### 3.2 동시성 모델이 같다

Aggregate의 "**1 트랜잭션 = 1 Aggregate 수정**" 규칙은 곧:

> "한 시점에 하나의 실행 흐름만 Aggregate 상태를 수정한다"

Actor의 "**한 번에 1 메시지만 처리**" 규칙은 곧:

> "한 시점에 하나의 실행 흐름만 state를 수정한다"

→ **같은 문장이다.** Aggregate가 DB 락·낙관적 락으로 강제하던 것을 Actor는 **구조적으로** 강제한다.

### 3.3 불변식 강제가 자연스럽다

```scala
// Akka Typed — Order Aggregate
object Order {
  sealed trait Command
  case class PlaceItem(sku: String, qty: Int) extends Command
  case class Submit() extends Command

  sealed trait Event
  case class ItemPlaced(sku: String, qty: Int) extends Event
  case class Submitted() extends Event

  // State = Aggregate 내부
  case class State(items: List[Item], status: Status) {
    // Invariant: submitted 상태에서는 아이템 추가 불가
    def canPlace: Boolean = status == Draft
  }

  // behavior = Command Handler
  def onCommand(state: State, cmd: Command): Effect[Event, State] = cmd match {
    case PlaceItem(sku, qty) if state.canPlace =>
      Effect.persist(ItemPlaced(sku, qty))
    case PlaceItem(_, _) =>
      Effect.reply(sender)(Rejected("order already submitted"))  // 불변식 위반
    case Submit() =>
      Effect.persist(Submitted())
  }
}
```

Repository·DB 락 없이도 **Actor의 직렬 메시지 처리**가 Aggregate의 트랜잭션 의미를 제공.

---

## 4. 매핑이 깨지는 지점 (불일치)

### 4.1 Aggregate 경계 > Actor 경계 (Actor가 더 작을 때)

Aggregate는 일관성 규칙에 따라 **논리적**으로 경계 잡는다. Actor는 **물리적 격리** 단위라 성능·수명·공급 관점에서 다르게 자를 수 있다.

**예시:** Order Aggregate가 너무 크면 하나의 Order에 수십만 이벤트가 쌓여 Actor가 느려짐. 현실에서는 Order를 Shipment·Payment 하위 Aggregate로 쪼개 별도 Actor로 운영.

### 4.2 Aggregate 간 상호작용 = Saga 필요

Aggregate 룰: "1 트랜잭션 = 1 Aggregate". 여러 Aggregate를 걸치는 비즈니스 흐름(Order 생성 → 재고 차감 → 결제)은 **트랜잭션 분리 + 보상** 필요. 이때 [Saga](02-saga.md) 패턴이 들어감. Actor도 동일한 해법을 쓴다.

### 4.3 Read가 Aggregate를 통해 가면 병목

Aggregate는 **쓰기 일관성** 단위. 읽기를 모두 Aggregate 통해 하면 Actor 메일박스가 쿼리로 폭주. 해법: [CQRS](../../insights/agentic-framework-patterns.md) — 읽기는 별도 projection에서.

### 4.4 참조 vs ID 딜레마

DDD 규칙: "타 Aggregate는 ID로만". Actor 세계도 동일 (직접 state 공유 금지, ActorRef만 전달). 하지만 실무에서 JPA·Hibernate 같은 ORM은 객체 참조를 유도해서 이 규칙이 자주 깨짐 → Aggregate 경계가 흐려지고 Actor 매핑도 흐려짐.

### 4.5 트랜잭션 의미의 차이

| 축 | Aggregate (전통 DB) | Actor (ES 기반) |
|---|--------------------|----------------|
| 트랜잭션 | DB ACID | 이벤트 persist의 원자성 |
| 롤백 | DB rollback | 보상 이벤트 발행 |
| 격리 수준 | SERIALIZABLE 등 선택 | 항상 직렬(Actor는 1 msg씩) |
| 읽기 일관성 | snapshot / MVCC | projection 지연 허용 |

ACID 트랜잭션을 Actor로 온전히 재현하기 어려움 — "한 Actor 안"은 가능하지만 여러 Actor 걸치면 Saga.

---

## 5. 구현 패턴 5가지

### 5.1 Shard per Aggregate-ID

```
10만 개 Order Aggregate → Cluster Sharding으로 노드 분산
Actor는 "필요할 때 spawn, idle 시 passivate (상태는 event store에 flush)"
```
**Akka Cluster Sharding**, **Orleans Virtual Actors** 가 대표.

### 5.2 Command → Event → State 패턴

```
Command (요청) ──→ Actor behavior
                      ├── 규칙 검증
                      ├── Event 방출 (persist)
                      └── State 업데이트 (apply)
```
모든 상태 변화는 Event를 거친다 → 자연스럽게 Event Sourcing과 결합.

### 5.3 Reference-by-ID between Aggregates

```
Order.customerId: CustomerId  ← 객체 참조 X, ID O
Order.itemSkus: List[Sku]      ← 다른 Aggregate의 ID
```
Actor 간에도 `ActorRef` 직접 보유보다 **Address(이름)** 기반 조회 선호.

### 5.4 Saga / Process Manager

여러 Aggregate 걸치는 흐름은 **별도 Saga Actor**로 오케스트레이션. ([02-saga.md](02-saga.md) 참조)

### 5.5 Read Model projection

Aggregate가 방출한 Event를 구독하는 **projection Actor**가 별도 read DB 갱신. CQRS의 Read 측.

---

## 6. 하네스 관점 — workflow state를 이 모델로 본다면?

**사고 실험:** `workflow.json`을 Aggregate + Actor로 모델링한다면?

```
WorkflowAggregate {
  id: FeatureId  (예: auth/login)

  state: {
    phase: Phase,          // Draft | Spec | Architect | Plan | Implement | Review | QA | Done
    gates_passed: Set[GateId],
    right_size: Size
  }

  Commands:
    SubmitSpec, PassGate(G1), StartImplement, PassQA, ...

  Events:
    SpecSubmitted, GatePassed(G1), ImplementStarted, QAPassed, ...

  Invariants:
    "phase=Implement 이전에 G1·G2 pass 필요"
    "QA pass 이전에 Deploy 불가"

  Aggregate Boundary:
    1 feature = 1 WorkflowAggregate
    feature 간에는 독립 (Saga 필요 없음)
}
```

**지금 하네스의 실제 구조와 차이:**

| 측면 | 하네스 현재 | Aggregate/Actor 모델 적용 시 |
|-----|-----------|--------------------------|
| State 저장 | `.harness/state/workflow.json` (current-state) | Event log + snapshot |
| 변경 주체 | Hook 스크립트 (Single Writer) | Aggregate Actor |
| 불변식 강제 | Hook 내부 로직 | behavior guard |
| 동시성 | 파일 락 | Actor 직렬화 |
| Audit | 별도 qa-log.jsonl | Event log 자체 |

**평가:**
- **개념 차용은 강하게 권장** — "1 feature = 1 Aggregate" 관점은 하네스 설계 명확화에 도움
- **구조 도입은 과함** — Node·Hook 기반에 Actor 런타임(Akka 등)은 부적합. Aggregate 경계 사고법만 이식하면 충분

→ 구체 제안은 [05-harness-applicability.md](05-harness-applicability.md) §Actor 섹션 참조.

---

## 7. 자주 하는 혼동

| 혼동 | 실제 |
|------|------|
| "Aggregate = 클래스 하나" | Root는 1개지만 **여러 Entity·VO 집합** |
| "Actor = OOP의 객체" | 객체는 동기 호출, Actor는 **비동기 메시지**. 메서드 호출 ≠ 메시지 전송 |
| "Actor는 무조건 분산" | 로컬 Actor도 가능. 분산은 추가 축 (Cluster) |
| "Aggregate = Microservice" | 한 서비스에 **여러 Aggregate** 가능. 1:1 매핑은 지나친 단순화 |
| "DDD 쓰면 Actor 필수" | DDD는 모델링 철학, Actor는 런타임 모델. 함께 쓰면 시너지지만 필수 아님 |

---

## 8. 한 줄 정리

> **Aggregate**는 *비즈니스 규칙이 깨지지 않는 최소 단위*, **Actor**는 *동시성 충돌이 일어날 수 없는 최소 단위* — 같은 경계를 서로 다른 각도에서 자른 것이기에, 맞으면 곧바로 1:1 매핑되고 안 맞으면 Saga로 이어진다.
