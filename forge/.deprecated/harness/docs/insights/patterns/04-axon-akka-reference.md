# Axon & Akka 실제 코드 — CQRS/ES/Actor 구현 레퍼런스

> **한 줄 요약:** Axon은 **애노테이션 기반 선언적** 스타일로, Akka는 **Actor 1급 + 명시적 behavior** 스타일로 같은 CQRS/ES/Actor 조합을 구현한다. JS/TS 생태계는 아직 이 조합의 "공식 표준"이 없고, 수제 구현이 일반적.

이 문서는 **패턴이 실제 코드로는 어떻게 보이는가**를 전달하려는 것. 도입 권고가 아님.

---

## 1. 공통 도메인 — 주문(Order) 예시

두 프레임워크를 같은 도메인으로 비교.

```
Commands:
  PlaceOrder(orderId, customerId, items)
  AddItem(orderId, sku, qty)
  ConfirmOrder(orderId)
  CancelOrder(orderId, reason)

Events:
  OrderPlaced(orderId, customerId, items, ts)
  ItemAdded(orderId, sku, qty, ts)
  OrderConfirmed(orderId, ts)
  OrderCancelled(orderId, reason, ts)

State machine:
  Draft → Confirmed
  Draft → Cancelled
  Confirmed → (terminal)
  Cancelled → (terminal)

Invariants:
  - Confirmed 이후 AddItem 불가
  - 이미 Confirmed 면 다시 Confirm 불가 (idempotent)
  - 아이템 1개 이상이어야 Confirm 가능
```

---

## 2. Axon Framework (Java/Kotlin)

### 2.1 철학

- **애노테이션 기반 DDD** — `@Aggregate`, `@CommandHandler`, `@EventSourcingHandler`, `@Saga`
- Command Bus / Event Bus / Query Bus가 **인프라 계층에 기본 탑재**
- 기본은 Event Sourcing, state-stored도 지원
- Spring Boot 통합이 매우 부드러움

### 2.2 Aggregate (Command + Event)

```java
@Aggregate
public class Order {

  @AggregateIdentifier
  private String orderId;

  private List<Item> items = new ArrayList<>();
  private OrderStatus status;

  // 기본 생성자 (프레임워크 요구)
  protected Order() {}

  // Creation Command Handler
  @CommandHandler
  public Order(PlaceOrderCommand cmd) {
    Assert.notEmpty(cmd.getItems(), "order must have items");
    AggregateLifecycle.apply(
      new OrderPlacedEvent(cmd.getOrderId(), cmd.getCustomerId(),
                           cmd.getItems(), Instant.now()));
  }

  // Command Handler
  @CommandHandler
  public void handle(AddItemCommand cmd) {
    if (status == OrderStatus.CONFIRMED) {
      throw new IllegalStateException("cannot modify confirmed order");
    }
    AggregateLifecycle.apply(
      new ItemAddedEvent(orderId, cmd.getSku(), cmd.getQty(), Instant.now()));
  }

  @CommandHandler
  public void handle(ConfirmOrderCommand cmd) {
    if (status == OrderStatus.CONFIRMED) return;  // idempotent
    if (items.isEmpty()) {
      throw new IllegalStateException("cannot confirm empty order");
    }
    AggregateLifecycle.apply(new OrderConfirmedEvent(orderId, Instant.now()));
  }

  @CommandHandler
  public void handle(CancelOrderCommand cmd) {
    if (status == OrderStatus.CANCELLED) return;
    AggregateLifecycle.apply(
      new OrderCancelledEvent(orderId, cmd.getReason(), Instant.now()));
  }

  // Event Sourcing Handlers — 이벤트 → 내부 상태 재구성
  @EventSourcingHandler
  public void on(OrderPlacedEvent e) {
    this.orderId = e.getOrderId();
    this.status = OrderStatus.DRAFT;
    this.items = new ArrayList<>(e.getItems());
  }

  @EventSourcingHandler
  public void on(ItemAddedEvent e) {
    this.items.add(new Item(e.getSku(), e.getQty()));
  }

  @EventSourcingHandler
  public void on(OrderConfirmedEvent e) {
    this.status = OrderStatus.CONFIRMED;
  }

  @EventSourcingHandler
  public void on(OrderCancelledEvent e) {
    this.status = OrderStatus.CANCELLED;
  }
}
```

**관찰:**
- Command Handler에서 `apply(event)`가 곧 persist + 내부 event handler 호출
- Invariant 검증은 Command Handler에 (apply 전)
- State 변경은 Event Handler에만 (이벤트 기반 replay 보장)
- 실패는 예외로 (프레임워크가 command side에 reply)

### 2.3 Query (Read Side — Projection)

```java
@Component
@ProcessingGroup("orderProjection")
public class OrderProjector {

  private final OrderReadRepository repo;  // 읽기용 별도 DB (Postgres·Elasticsearch 등)

  @EventHandler
  public void on(OrderPlacedEvent e) {
    repo.save(new OrderReadView(e.getOrderId(), e.getCustomerId(),
                                e.getItems().size(), "DRAFT"));
  }

  @EventHandler
  public void on(OrderConfirmedEvent e) {
    OrderReadView v = repo.findById(e.getOrderId()).orElseThrow();
    v.setStatus("CONFIRMED");
    repo.save(v);
  }

  @QueryHandler
  public List<OrderReadView> handle(FindOrdersByCustomer query) {
    return repo.findByCustomerId(query.getCustomerId());
  }
}
```

**관찰:**
- Read 모델은 **완전히 다른 DB·다른 스키마**
- Projector는 Event Bus 구독자 → 비동기 갱신 (eventual consistency)
- Query Handler는 Read DB만 조회 (Aggregate 안 건드림)

### 2.4 Saga (Orchestration)

```java
@Saga
public class OrderFulfillmentSaga {

  @Autowired private transient CommandGateway cmdGateway;
  private String orderId;

  @StartSaga
  @SagaEventHandler(associationProperty = "orderId")
  public void on(OrderConfirmedEvent e) {
    this.orderId = e.getOrderId();
    cmdGateway.send(new ReserveInventoryCommand(orderId, e.getItems()));
  }

  @SagaEventHandler(associationProperty = "orderId")
  public void on(InventoryReservedEvent e) {
    cmdGateway.send(new ChargePaymentCommand(orderId, e.getAmount()));
  }

  @SagaEventHandler(associationProperty = "orderId")
  public void on(PaymentFailedEvent e) {
    // 보상
    cmdGateway.send(new ReleaseInventoryCommand(orderId));
    cmdGateway.send(new CancelOrderCommand(orderId, "payment failed"));
  }

  @EndSaga
  @SagaEventHandler(associationProperty = "orderId")
  public void on(OrderFulfilledEvent e) {}  // 종료
}
```

**관찰:**
- `@StartSaga` / `@EndSaga` 로 수명 관리
- `associationProperty`로 이벤트-Saga 인스턴스 매칭
- 프레임워크가 Saga 인스턴스 상태를 자동 저장·복구

### 2.5 Upcaster

```java
@Component
public class OrderPlacedV1ToV2Upcaster extends SingleEventUpcaster {

  @Override
  protected boolean canUpcast(IntermediateEventRepresentation r) {
    return "OrderPlaced".equals(r.getType().getName())
        && "1".equals(r.getType().getRevision());
  }

  @Override
  protected IntermediateEventRepresentation doUpcast(IntermediateEventRepresentation r) {
    return r.upcastPayload(
      new SimpleSerializedType("OrderPlaced", "2"),
      JsonNode.class,
      node -> {
        ObjectNode n = (ObjectNode) node;
        n.put("currency", "USD");  // v2 추가 필드 기본값
        return n;
      });
  }
}
```

**자동 등록** — `@Component`만 붙여두면 Spring이 EventStore의 upcaster chain에 등록.

### 2.6 장단

| 장점 | 단점 |
|------|------|
| 애노테이션 선언적 → 보일러플레이트 적음 | **마법**이 많음 (디버깅 어려움) |
| Spring 생태계 통합 매끄러움 | Spring 없이 쓰기 불편 |
| Saga·Projection·Upcaster 1급 지원 | JVM 한정 |
| Axon Server (상용·무료 tier 있음) | Event Store 선택지 제약 |

---

## 3. Akka (Scala/Java)

### 3.1 철학

- **Actor가 1급.** Aggregate도 Actor.
- 명시적 `behavior` 함수 — 애노테이션 안 씀. 함수형 접근.
- **Typed Actor API** (`Akka Typed`) — 메시지 타입 안전.
- **Akka Persistence Typed**가 Event Sourcing 구현체.
- **Akka Cluster Sharding** 으로 수십만 Aggregate 분산.

### 3.2 Aggregate (EventSourcedBehavior)

```scala
import akka.persistence.typed.scaladsl._

object Order {
  // Messages
  sealed trait Command
  final case class PlaceOrder(customerId: String, items: List[Item],
                              replyTo: ActorRef[StatusReply[Done]]) extends Command
  final case class AddItem(sku: String, qty: Int,
                           replyTo: ActorRef[StatusReply[Done]]) extends Command
  final case class Confirm(replyTo: ActorRef[StatusReply[Done]]) extends Command
  final case class Cancel(reason: String,
                          replyTo: ActorRef[StatusReply[Done]]) extends Command

  // Events
  sealed trait Event
  final case class OrderPlaced(customerId: String, items: List[Item], ts: Instant) extends Event
  final case class ItemAdded(sku: String, qty: Int, ts: Instant) extends Event
  final case class OrderConfirmed(ts: Instant) extends Event
  final case class OrderCancelled(reason: String, ts: Instant) extends Event

  // State
  sealed trait State
  case object Empty extends State
  final case class Draft(items: List[Item], customerId: String) extends State
  final case class Confirmed(items: List[Item]) extends State
  case object Cancelled extends State

  def apply(orderId: String): Behavior[Command] =
    EventSourcedBehavior[Command, Event, State](
      persistenceId = PersistenceId("Order", orderId),
      emptyState    = Empty,
      commandHandler = (state, cmd) => commandHandler(state, cmd),
      eventHandler   = (state, evt) => eventHandler(state, evt)
    )

  // 상태별 Command Handler (함수형 패턴 매칭)
  private def commandHandler(state: State, cmd: Command): Effect[Event, State] =
    (state, cmd) match {
      case (Empty, PlaceOrder(cid, items, replyTo)) if items.nonEmpty =>
        Effect
          .persist(OrderPlaced(cid, items, Instant.now))
          .thenReply(replyTo)(_ => StatusReply.Ack)

      case (Draft(_, _), AddItem(sku, qty, replyTo)) =>
        Effect
          .persist(ItemAdded(sku, qty, Instant.now))
          .thenReply(replyTo)(_ => StatusReply.Ack)

      case (Draft(items, _), Confirm(replyTo)) if items.nonEmpty =>
        Effect
          .persist(OrderConfirmed(Instant.now))
          .thenReply(replyTo)(_ => StatusReply.Ack)

      case (Confirmed(_), Confirm(replyTo)) =>  // idempotent
        Effect.reply(replyTo)(StatusReply.Ack)

      case (_: Draft, Cancel(reason, replyTo)) =>
        Effect
          .persist(OrderCancelled(reason, Instant.now))
          .thenReply(replyTo)(_ => StatusReply.Ack)

      case (_, c: Command) =>
        Effect.reply(c.replyTo)(StatusReply.Error(s"invalid command in state $state"))
    }

  // Event Handler — 이벤트 → 상태 전이
  private def eventHandler(state: State, evt: Event): State =
    (state, evt) match {
      case (Empty, OrderPlaced(cid, items, _))  => Draft(items, cid)
      case (d: Draft, ItemAdded(sku, qty, _))   => d.copy(items = d.items :+ Item(sku, qty))
      case (d: Draft, OrderConfirmed(_))        => Confirmed(d.items)
      case (_: Draft, OrderCancelled(_, _))     => Cancelled
      case (s, _)                               => s
    }
}
```

**관찰:**
- **State가 타입으로 분기** (Empty / Draft / Confirmed / Cancelled) → FSM이 **타입 시스템**에 인코딩됨
- 같은 Command도 상태별로 다른 처리 (`(Empty, PlaceOrder)` vs `(Draft, AddItem)`)
- Persist → Reply 체인이 명시적 (`.persist(...).thenReply(...)`)

### 3.3 Cluster Sharding — 수십만 Aggregate 분산

```scala
val sharding = ClusterSharding(system)

val TypeKey = EntityTypeKey[Order.Command]("Order")

sharding.init(Entity(TypeKey) { entityContext =>
  Order(entityContext.entityId)  // orderId = entityId
})

// 사용
val orderRef: EntityRef[Order.Command] = sharding.entityRefFor(TypeKey, "order-123")
orderRef ! Order.PlaceOrder("c1", items, replyTo)
```

- Cluster에서 entityId 기반으로 **자동 분산·재배치**
- **Passivation**: 일정 시간 메시지 없으면 Actor stop → 상태는 event store에, 다음 메시지 오면 rehydrate

### 3.4 Projection (Read Side)

```scala
import akka.projection.eventsourced.scaladsl.EventSourcedProvider

val sourceProvider = EventSourcedProvider
  .eventsByTag[Order.Event](system, readJournalPluginId = "akka.persistence.cassandra.query", tag = "order-0")

val projection = JdbcProjection
  .exactlyOnce(
    projectionId = ProjectionId("OrderProjection", "order-0"),
    sourceProvider,
    handler = () => new OrderProjectionHandler(jdbcSession))
```

```scala
class OrderProjectionHandler(session: JdbcSession) extends JdbcHandler[EventEnvelope[Order.Event]] {
  override def process(session: JdbcSession, envelope: EventEnvelope[Order.Event]): Unit =
    envelope.event match {
      case Order.OrderPlaced(cid, items, ts) =>
        session.execute("INSERT INTO order_view ... VALUES (...)")
      case Order.OrderConfirmed(ts) =>
        session.execute("UPDATE order_view SET status='CONFIRMED' WHERE ...")
      case _ =>
    }
}
```

**관찰:**
- Projection은 **별도 프로세스**로 돌아도 OK (Cluster Singleton 또는 분산)
- exactly-once 보장을 위해 offset tracking을 transaction에 포함
- Read model은 SQL / Elasticsearch / Redis 등 자유

### 3.5 Event Adapter (Upcaster 대응)

```scala
class OrderEventAdapter extends EventAdapter {
  override def manifest(event: Any): String = event match {
    case _: OrderPlacedV1 => "1"
    case _: OrderPlaced   => "2"
  }

  override def toJournal(event: Any): Any = event  // 저장은 최신으로

  override def fromJournal(event: Any, manifest: String): EventSeq = (event, manifest) match {
    case (v1: OrderPlacedV1, "1") =>
      EventSeq.single(OrderPlaced(v1.customerId, v1.items, currency = "USD", v1.ts))
    case (v2: OrderPlaced, "2") =>
      EventSeq.single(v2)
  }
}
```

`application.conf`에 등록:
```hocon
akka.persistence.journal.plugin = "akka.persistence.cassandra.journal"
akka.persistence.journal {
  cassandra {
    event-adapters {
      order-adapter = "com.example.OrderEventAdapter"
    }
    event-adapter-bindings {
      "com.example.OrderPlacedV1" = order-adapter
      "com.example.OrderPlaced"   = order-adapter
    }
  }
}
```

### 3.6 장단

| 장점 | 단점 |
|------|------|
| Actor 1급 → 분산·동시성이 자연 | 러닝커브 가파름 |
| Typed API로 메시지 타입 안전 | Scala 중심 (Java도 가능하나 장황) |
| Cluster Sharding · Projection이 견고 | 설정(HOCON)이 많음 |
| Lightbend 상용 지원 | Lightbend License (Akka 2.7+ BSL) 주의 |

> **라이선스 경고 (2026 기준):** Akka는 2.7부터 BSL(Business Source License)로 전환. 상업 이용 시 Lightbend 계약 필요. Apache 2.0 포크인 **Pekko**가 Apache 재단에 있음 — OSS 필요 시 Pekko 검토.

---

## 4. Axon vs Akka 요약 비교

| 축 | Axon | Akka (Persistence Typed) |
|---|------|--------------------------|
| 스타일 | 애노테이션·선언적 | 함수형·명시적 behavior |
| 동시성 모델 | Aggregate lock (Spring tx) | Actor 직렬 메시지 |
| 분산 | Axon Server 필요 (권장) | Cluster Sharding 내장 |
| 언어 | Java/Kotlin | Scala/Java |
| 학습 진입 | 낮음 (Spring 친화) | 높음 (Actor 철학 이해 필요) |
| 프로젝션 | `@EventHandler` 구독 | Akka Projection 모듈 |
| Saga | `@Saga` 선언 | Orchestrator Actor 직접 작성 |
| 스키마 진화 | Upcaster 체인 | Event Adapter |
| 라이선스 | Apache 2.0 | BSL (2.7+) · Pekko는 Apache 2.0 |
| 적합 팀 | DDD·Spring 생태계 | 분산·동시성 heavy, Scala 허용 |

**결정 기준:**
- "Spring 쓴다 + Aggregate 중심" → **Axon**
- "수십만 entity × 동시성 극한 + 분산" → **Akka/Pekko**
- "OSS 엄격" → **Axon** 또는 **Pekko**

---

## 5. JS/TypeScript 생태계

공식 1급 프레임워크가 없음. 세 가지 현실적 선택:

### 5.1 NestJS CQRS

```typescript
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(private readonly publisher: EventPublisher) {}

  async execute(cmd: PlaceOrderCommand) {
    const order = this.publisher.mergeObjectContext(new Order(cmd.orderId));
    order.place(cmd.customerId, cmd.items);
    order.commit();  // 이벤트 발행
  }
}
```

- CQRS 버스·핸들러 지원. **Event Sourcing은 미탑재 — 직접 구현** 또는 EventStoreDB 통합
- Projection은 `@EventsHandler` 데코레이터

### 5.2 EventStoreDB + 수제 코드

- Kurrent(구 EventStore)의 이벤트 스토어
- 공식 TS/Node SDK 존재
- Aggregate / Command Bus / Projection은 본인이 작성

### 5.3 Temporal (Workflow-as-code)

Saga 부분만 필요하면 Temporal이 강력:

```typescript
export async function orderFulfillmentWorkflow(orderId: string): Promise<void> {
  try {
    await activities.reserveInventory(orderId);
    try {
      await activities.chargePayment(orderId);
    } catch (err) {
      await activities.releaseInventory(orderId);  // 보상
      throw err;
    }
    await activities.scheduleShipment(orderId);
  } catch (err) {
    await activities.cancelOrder(orderId, err.message);
  }
}
```

- Saga 전용. Event Sourcing·Aggregate는 없음
- 장기 실행 워크플로우에 최고. Go/Java/TS/Python 지원

### 5.4 요약

TS에서 "Axon급 통합"은 **기대하지 말 것.** 필요 부분만 조합:
- CQRS 뼈대 → NestJS CQRS
- Event Store → EventStoreDB
- Saga → Temporal
- Actor → 수제(큐 + 핸들러) 또는 WebWorker / Node Worker Threads

---

## 6. 하네스 관점 — 도입 가능성

| 프레임워크 | 하네스 도입 평가 |
|-----------|------------------|
| **Axon** | ❌ JVM 전용. 하네스(Node 생태계)와 불일치 |
| **Akka/Pekko** | ❌ 동일 이유 + BSL 라이선스 이슈 |
| **NestJS CQRS** | ⚠️ 과함 — 하네스는 단일 사용자 CLI 도구. CQRS 불필요 |
| **EventStoreDB** | ⚠️ 인프라 과함 — `.harness/state/*.jsonl` 자체가 경량 event log로 충분 |
| **Temporal** | ⚠️ Sprint Loop에 매력적이나 외부 의존성 과함 |

**결론:** 하네스는 **코드 도입 X, 개념 차용 O.** 가령 "Upcaster 패턴"은 `scripts/state/upcaster.mjs`로 구현 가능 (03 문서 §9 참조). Saga의 "compensation" 어휘는 Sprint Loop 실패 처리 설계에 적용 (02 문서 §7 참조).

→ 구체 적용안: [05-harness-applicability.md](05-harness-applicability.md)

---

## 7. 한 줄 정리

> Axon은 **"Spring DDD의 확장"**으로, Akka는 **"Actor 시스템의 확장"**으로 CQRS/ES를 완성한다. JS/TS 세계에는 동급의 단일 프레임워크가 없고 **조립이 기본**이므로, 도입 시에는 "무엇을 하지 않을 것인가"가 먼저 결정돼야 한다.
