# Event Sourcing 스키마 진화

> **한 줄 요약:** 이벤트가 불변이라면 "스키마가 바뀌면 어떻게?" — 답은 **과거 이벤트를 건드리지 않고, 읽을 때 변환**한다. Upcaster · Versioned Event · Weak/Strong Schema가 이 문제의 세 축.

---

## 1. 문제의 본질

### 1.1 Event Sourcing의 딜레마

```
원칙: "이벤트는 불변이다" (append-only, never edit, never delete)

현실: 비즈니스 요구는 변한다
  - 새 필드 추가
  - 필드명 변경
  - 필드 의미 변경
  - 이벤트 타입 분할 / 병합
```

일반 DB라면 `ALTER TABLE`로 끝. Event Store는 **5년 전 이벤트가 지금 이벤트와 공존**한다. 마이그레이션할 수가 없다(해도 안 되고).

### 1.2 전통 DB vs Event Store의 스키마 문제

| 축 | 전통 DB | Event Store |
|---|---------|-------------|
| 데이터 수명 | 최신 값만 | 모든 이벤트 영구 |
| 스키마 변경 | `ALTER TABLE` | ❌ 금지 |
| 이전 데이터 호환 | migration | **읽기 시 변환** |
| 버전 혼재 | 없음 | 항상 존재 |

**핵심 전환:** "**Schema on Write**" → "**Schema on Read**"

---

## 2. 스키마 변경 유형과 난이도

| 변경 | 유형 | 난이도 |
|------|------|--------|
| 필드 **추가** (nullable) | Additive | ⭐ 쉬움 |
| 필드 **기본값으로 추가** (non-null) | Additive + default | ⭐ 쉬움 |
| 필드 **이름 변경** | Rename | ⭐⭐ upcaster |
| 필드 **타입 변경** (int → long) | Widening | ⭐⭐ upcaster |
| 필드 **삭제** | Removal | ⭐⭐⭐ 주의 (소비자 확인) |
| 필드 **의미 변경** | Semantic | ⭐⭐⭐⭐ 새 이벤트 타입 권장 |
| 이벤트 **분할** (1개 → 2개) | Split | ⭐⭐⭐⭐ upcaster |
| 이벤트 **병합** (2개 → 1개) | Merge | ⭐⭐⭐⭐ upcaster + 조합 |
| 이벤트 **삭제** | Delete | ⭐⭐⭐⭐⭐ 거의 불가 (의미 유지만 가능) |

**원칙:** 가능한 한 **Additive**로 해결. 불가피할 때만 Upcaster.

---

## 3. Versioned Event — 명시적 버전 필드

```json
{
  "type": "OrderPlaced",
  "version": 2,
  "orderId": "abc",
  "customerId": "c1",
  "items": [...],
  "currency": "USD",        // v2에 추가된 필드
  "ts": "2026-04-13T..."
}
```

**규칙:**
- 이벤트마다 `version` 필드 **필수**
- 저장 시 항상 최신 버전으로 기록 (구버전으로 쓰기 금지)
- 읽을 때 `version`을 보고 분기 또는 upcaster 체인

**네이밍 변형:**
- `OrderPlaced_v2` 같이 **타입 이름에 버전** 포함 (Axon 권장)
- 별도 `schemaVersion` 필드 (Akka 스타일)

어느 쪽이든 **단일 일관 전략**을 택하고 고수해야 함.

---

## 4. Upcaster — 읽을 때 최신 스키마로 변환

### 4.1 개념

```
Event Store:
  [OrderPlaced v1 (old)] [OrderPlaced v1 (old)] [OrderPlaced v2 (new)] ...

읽기 파이프라인:
  raw event → [Upcaster Chain] → 최신 v2 형태 → Aggregate replay
```

**Upcaster = 구버전을 한 단계 올리는 순수 함수.**

### 4.2 체인 구조 — 점진적 변환

```
v1 --[upcaster 1→2]--> v2 --[upcaster 2→3]--> v3
```

각 upcaster는 **한 버전씩만** 올린다. N버전 직접 점프 금지 — 체인으로 이어야 유지보수 가능.

### 4.3 코드 예시 (Axon)

```java
public class OrderPlacedV1toV2Upcaster extends SingleEventUpcaster {

  @Override
  protected boolean canUpcast(IntermediateEventRepresentation repr) {
    return repr.getType().getName().equals("OrderPlaced")
        && repr.getType().getRevision().equals("1");
  }

  @Override
  protected IntermediateEventRepresentation doUpcast(IntermediateEventRepresentation repr) {
    return repr.upcastPayload(
      new SimpleSerializedType("OrderPlaced", "2"),
      JsonNode.class,
      node -> {
        ObjectNode on = (ObjectNode) node;
        on.put("currency", "USD");  // v2의 필수 필드: 기본값 주입
        return on;
      }
    );
  }
}
```

### 4.4 여러 변환 패턴

**필드 추가 (기본값):**
```
v1: { orderId, items }
v2: { orderId, items, currency: "USD" }   // 구버전 읽을 때 "USD" 주입
```

**필드 이름 변경:**
```
v1: { customer: "c1" }
v2: { customerId: "c1" }                   // customer 값을 customerId로 복사
```

**이벤트 분할 (1 → 2):**
```
v1: OrderPlaced { orderId, items, paymentInfo }
v2: OrderPlaced { orderId, items } + PaymentInitiated { orderId, paymentInfo }

Upcaster: 1 이벤트를 2개로 방출 (EventMultiUpcaster)
  단, stream 순서·시점 의미가 흐트러지면 위험 → 신중히
```

**이벤트 병합 (2 → 1):** 사실상 불가능에 가까움. 두 이벤트가 항상 쌍으로 오는 보장이 없으므로 upcaster로는 안 풀림. **새 이벤트 타입 도입 + 과거 이벤트는 그대로 둠**이 현실적.

### 4.5 성능 영향

- Replay 시 모든 이벤트에 upcaster chain 통과 → **오래된 스트림일수록 느림**
- 완화: **Snapshot**에 최신 버전 상태 저장 → 일정 지점 이후만 replay
- 완화: **Backfill** — 주기적으로 구버전 이벤트를 새 스트림에 **정규화해 다시 쓰기** (원본은 보존)

---

## 5. Weak Schema vs Strong Schema

### 5.1 Weak Schema — JSON

```json
{ "type": "OrderPlaced", "orderId": "abc", "extras": {...} }
```

- **장점:** 자유도 높음. 필드 추가가 자연스러움.
- **단점:** 소비자가 없는 필드를 참조하면 런타임 에러. 계약이 **문서·합의**에만 의존.

### 5.2 Strong Schema — Protobuf / Avro

```protobuf
message OrderPlaced {
  string order_id = 1;
  string customer_id = 2;
  repeated Item items = 3;
  string currency = 4;  // 새로 추가 시 새 tag 번호
}
```

- **장점:** 타입 안전. 컴파일러가 호환성 체크.
- **단점:** 스키마 파일 관리·IDL 도입·빌드 파이프라인 필요.

### 5.3 호환성 규칙 (중요)

**Protobuf / Avro 공통 규칙:**
- ✅ 필드 **추가** (optional) OK
- ✅ 필드 **삭제** 시 tag 번호·이름은 **재사용 금지** (`reserved`)
- ❌ tag 번호 **재사용** (의미 깨짐)
- ❌ 필드 **타입 변경** (호환 보장 안 됨)
- ⚠️ enum 값 추가는 OK이되, 소비자가 unknown 처리 가능해야

**Avro의 강점:** 스키마를 이벤트와 함께 저장(Schema Registry)하여 reader/writer 스키마 쌍으로 호환 변환 가능 — Upcaster가 거의 자동.

### 5.4 선택 가이드

| 상황 | 추천 |
|------|------|
| 소규모 단일 팀, 빠른 진화 | JSON (+ JSON Schema 문서화) |
| 다수 팀·다수 언어 | Protobuf / Avro |
| 스키마 레지스트리 운영 가능 | Avro + Confluent Schema Registry |
| 고성능·저용량 필요 | Protobuf (binary, 작음) |

---

## 6. 스냅샷 버전 관리

### 6.1 스냅샷이란

```
Aggregate replay가 느려지는 문제:
  10,000개 이벤트 fold = 수 초
  → 매 500 이벤트마다 "현재 상태"를 스냅샷으로 저장
  → 로드 시 최근 스냅샷 + 그 이후 이벤트만 replay
```

### 6.2 스냅샷도 스키마가 있다

스냅샷 = **현재 상태의 직렬화** = 일반 DB row와 유사 → 동일한 스키마 문제 발생.

**규칙:**
- 스냅샷도 `version` 필드 필수
- 읽을 때 version이 오래됐으면 **버린다 (discard)** 후 full replay → 최신 스냅샷 재생성
- 중요 시스템은 스냅샷 upcaster도 구현. 다만 ROI 낮음 — replay 비용이 크지 않다면 버리는 게 단순

### 6.3 실무 주의

- 스냅샷은 **최적화**이지 **저장소 진실의 원천이 아니다.** 언제든 버리고 이벤트로 재생 가능해야 함.
- 스냅샷만 저장하고 이벤트는 지우는 순간 → **더 이상 Event Sourcing이 아니다.**

---

## 7. 이벤트 삭제 (정말 필요할 때)

### 7.1 왜 "불변"이 깨질 수밖에 없는가

- **GDPR / 개인정보보호법:** "잊혀질 권리"로 특정 사용자 데이터 삭제 의무
- **법적 요구:** 법원 명령에 의한 삭제

### 7.2 패턴

**Crypto-Shredding (권장):**
```
이벤트의 민감 필드는 사용자별 키로 암호화 저장
→ 사용자 삭제 요청 시 해당 키만 폐기
→ 이벤트는 남지만 민감 데이터는 복호화 불가 = 사실상 삭제
```

**Tombstone:**
```
원본 이벤트를 Redacted 이벤트로 교체 (적대적 불변 깨짐)
→ replay 결과는 해당 필드가 비어있음
→ ES 엄격함을 깨므로 최후 수단
```

---

## 8. 운영 체크리스트

이벤트 스키마를 변경할 때 매번 던질 질문:

- [ ] 기존 이벤트를 읽는 모든 소비자가 파악됐는가?
- [ ] 변경이 **additive**인가? 아니면 upcaster 필요한가?
- [ ] `version` 필드를 올렸는가?
- [ ] Upcaster 체인이 **점진적(1 step)**인가? 점프하지 않는가?
- [ ] 이벤트 분할/병합이면 **순서·시점 의미**가 보존되는가?
- [ ] 소비자 서비스들의 **배포 순서**는? (새 소비자가 구버전 이벤트를 먼저 받을 수 있는가?)
- [ ] 스냅샷 버전은 올렸는가? 오래된 스냅샷은 discard되는가?
- [ ] Schema Registry에 등록·호환성 체크됐는가? (사용 시)

---

## 9. 하네스 관점 — `.harness/state/` 의 스키마 진화

### 9.1 현재 구조

하네스의 state 파일들:
```
.harness/state/
  workflow.json       ← current-state 저장
  coverage.json       ← AC ↔ step ↔ test 3자 매핑
  qa-log.jsonl        ← append-only (ES 싹수)
  sprint-log.jsonl    ← append-only (ES 싹수)
```

대부분은 current-state이지만 `*-log.jsonl`은 **부분적 Event Sourcing** 성격.

### 9.2 스키마 진화가 필요한가

**Yes — 하네스도 버전 업 과정에서 필연.**

예상 변경:
- v1: `{ feature, step, status }`
- v2: `{ feature, step, status, duration_ms }` (성능 지표 추가)
- v3: `{ feature, step, status, duration_ms, agent_id }` (어느 에이전트가 실행했는지)

### 9.3 적용 전략

**권장 (Lightweight ES):**
1. 모든 `*-log.jsonl`에 `v` 필드 추가. 현재 버전으로 기록.
   ```json
   {"v": 2, "type": "StepCompleted", "feature": "auth/login", "step": 3, ...}
   ```
2. 하네스 스크립트에 **upcaster 모듈** (`scripts/state/upcaster.mjs`):
   ```
   export const upcasters = {
     StepCompleted: {
       1: e => ({ ...e, duration_ms: null }),   // v1 → v2
       2: e => ({ ...e, agent_id: "unknown" }), // v2 → v3
     }
   }
   ```
3. 로그 읽을 때 항상 upcaster 체인 통과 후 소비.
4. 스냅샷은 `workflow.json` 자체 — 현재 버전 불일치 시 **rebuild from log**로 자동 복구.

**적용성 평가:**
- 개념 도입 비용 낮음 (Node.js 함수 몇 개)
- 얻는 것: 하네스 버전 업그레이드 시 과거 프로젝트의 `.harness/state/`가 자동 호환
- **강력 권장** — [05-harness-applicability.md](05-harness-applicability.md) §ES 섹션에서 구체화

---

## 10. 한 줄 정리

> Event Sourcing의 스키마 진화는 **"쓸 때 완벽하게 정의"에서 "읽을 때 유연하게 변환"으로** 의 전환. Versioned Event + Upcaster Chain + 적절한 Schema 도구가 세 기둥이고, 모든 실무 사고는 이 셋이 빠졌을 때 일어난다.
