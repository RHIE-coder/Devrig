# Spec Writing Guide

## 좋은 Spec의 조건

1. **WHAT만 담는다** — 기술 스택, API 경로, DB 스키마는 Spec에 넣지 않는다
2. **모든 AC는 testable** — "사용하기 쉽다"가 아니라 "3번 이내 클릭으로 결제 완료"
3. **AC는 독립적** — AC 간 순서 의존성 없음
4. **우선순위 명시** — must / should / could

## AC 작성 패턴

- **Given-When-Then**: 상태 → 행위 → 결과
- **Boundary**: 경계값 테스트 (0, 1, max, max+1)
- **Error Path**: 실패 시나리오 명시
