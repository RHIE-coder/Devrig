# Code Quality Review Reference

## SOLID 원칙

| 원칙 | 검사 포인트 |
|------|-----------|
| **S** — Single Responsibility | 클래스/함수가 단일 책임인가 (변경 이유 1개) |
| **O** — Open/Closed | 확장에 열려있고 수정에 닫혀있는가 |
| **L** — Liskov Substitution | 하위 타입이 상위 타입 계약을 위반하지 않는가 |
| **I** — Interface Segregation | 불필요한 인터페이스 의존이 없는가 |
| **D** — Dependency Inversion | 고수준 모듈이 저수준 구현에 직접 의존하지 않는가 |

## Clean Code 메트릭

| 메트릭 | 권장 기준 |
|--------|----------|
| 함수 길이 | 20줄 이하 |
| 매개변수 수 | 3개 이하 |
| 들여쓰기 깊이 | 3단계 이하 |
| 중복 코드 | 3회 이상 반복 → 추출 |
| 네이밍 | 약어 금지, 의미 명확, 도메인 용어 사용 |

## 추가 검사

- 미사용 변수/임포트
- 빈 catch 블록 (에러 삼키기)
- 매직 넘버 (상수 추출 안 됨)
- 과도한 주석 (코드가 자체 설명하지 못하는 신호)
- 테스트 구조 (Arrange-Act-Assert 패턴)

## 판단 기준

- **BLOCK**: 없음 (품질은 차단 사유 아님)
- **NEEDS_CHANGE**: SOLID 위반, 과도한 중복, 읽기 어려운 코드
- **PASS**: Clean Code 기준 충족
