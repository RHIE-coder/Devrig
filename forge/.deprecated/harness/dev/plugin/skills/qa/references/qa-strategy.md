# QA Strategy Reference

## QA Stack 4-Layer Architecture

| Layer | Position | Concern | 테스트 대상 |
|-------|----------|---------|-----------|
| Layer 0 | Infra | 환경, 시크릿, CORS/CSP | 환경변수 검증, 시크릿 주입, 네트워크 |
| Layer 1 | DB | 마이그레이션, 인덱스, 쿼리 플랜 | 마이그레이션 안전성, 쿼리 최적화 |
| Layer 2 | API | 컨트랙트, 에러 응답, 인증 | 엔드포인트 검증, JWT, rate limiting |
| Layer 3 | UI | 시각 회귀, a11y, 반응형 | 렌더링, WCAG 2.1 AA, 모바일 |

## 실행 모드

### parallel (기본, 빠름)
- 4개 레이어 동시 실행
- 장점: 빠름
- 단점: 실패 귀인 약함

### sequential_bottom_up (엄격, 느림, 고신뢰)
- Infra → DB → API → UI 순서
- 하위 FAIL → 상위 skip + `qa_layer_halted` audit
- 장점: 순수 계층 귀인 가능 ("pure_api_issue")
- 단점: 2-4x 느림

## Right-Size별 모드

| Size | 권장 모드 |
|------|----------|
| small | parallel |
| medium | parallel (기본), sequential_bottom_up (cross-layer 의심 시) |
| large | sequential_bottom_up |

## mock_guard 정책

| 정책 | 동작 |
|------|------|
| strict_lower_real | 하위 레이어 mock 감지 → G4 BLOCK |
| warn | mock 감지 → 경고, confidence=low |
| off | 검사 안 함 |
