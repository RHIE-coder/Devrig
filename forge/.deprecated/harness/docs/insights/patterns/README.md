# Distributed State Patterns — 심층 분석

> Event Sourcing / CQRS / Actor / DDD Aggregate / Saga 상세와 하네스 아키텍처 적용성 검토.
>
> **성격:** 연구 노트 (design/이 아니라 insights/). 특정 패턴 채택 여부는 `docs/design/`에서 별도 결정.
>
> **전제 독자:** FSM/Stateless와 ES/CQRS/Actor 개론을 이미 이해함.
>   - 개론: 대화 로그 또는 [00-overview.md §용어집](../../design/00-overview.md#용어집-glossary)
>   - 기존 insights: [agentic-framework-patterns](../agentic-framework-patterns.md), [claude-platform-blueprint](../claude-platform-blueprint.md)

---

## 문서 구성

| # | 문서 | 다루는 질문 |
|---|------|------------|
| 01 | [ddd-aggregate-actor.md](01-ddd-aggregate-actor.md) | DDD Aggregate와 Actor는 왜 자연스럽게 1:1 매핑되는가? 어디서 불일치하는가? |
| 02 | [saga.md](02-saga.md) | 2PC가 실패한 자리에 왜 Saga가 들어왔는가? 보상·Idempotency·Outbox는 어떻게 맞물리는가? |
| 03 | [event-sourcing-evolution.md](03-event-sourcing-evolution.md) | 이벤트가 불변이라면 스키마 변경은? Upcaster·Weak/Strong 스키마·스냅샷 버전. |
| 04 | [axon-akka-reference.md](04-axon-akka-reference.md) | 실제 프레임워크(Axon/Akka)에서 ES+CQRS+Actor는 어떻게 코딩되는가? JS/TS 생태계는? |
| 05 | [harness-applicability.md](05-harness-applicability.md) | 하네스는 어디에 이미 유사 패턴이 있고, 어디에 도입할 가치가 있는가? |

---

## 읽는 순서 추천

- **전부 처음 읽는 경우:** 01 → 02 → 03 → 04 → 05 (쌓기 순)
- **하네스 적용만 궁금하면:** 05 먼저 → 궁금한 주제(01~04)로 역방향
- **코드부터 보고 싶으면:** 04 → 01~03 역방향 (개념 채움)

## 이 문서가 **답하지 않는** 질문

- "하네스에 Event Sourcing을 도입하자" 같은 **결정** — 결정은 design/ 또는 ADR에서
- 각 패턴의 **모든 변형** — 이 문서는 "우리가 판단하는 데 필요한 만큼"만 다룸
- 패턴 개론 — 이미 안다고 가정. 모르면 대화 로그 또는 Kleppmann, DDIA 11장 먼저

## 참고 자료

- **Evans**, *Domain-Driven Design* (2003) — Aggregate의 원전
- **Vernon**, *Implementing DDD* (2013) — 실무 관점 Aggregate·Bounded Context
- **Kleppmann**, *Designing Data-Intensive Applications* 11장 — Stream Processing·Event Log
- **Greg Young**, CQRS Documents (2010) — CQRS 개념 정립
- **Akka** 공식 문서 — Actor · Persistence
- **Axon Framework** Reference Guide — JVM CQRS/ES의 사실상 표준
- **Pat Helland**, *Life Beyond Distributed Transactions* (2007) — Saga·Idempotency 이론 배경
