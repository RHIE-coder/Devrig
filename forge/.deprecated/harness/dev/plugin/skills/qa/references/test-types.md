# Test Types Reference

## 유형별 정의

| 유형 | 범위 | 깊이 | 트리거 |
|------|------|------|--------|
| **Unit** | 단일 함수/모듈 | 깊음 | 코드 변경 시 항상 |
| **Integration** | 2+ 모듈 연동 | 중간 | 모듈 간 계약 변경 |
| **E2E** | 전체 시스템 | 얕음 | 릴리스 전 |
| **Smoke** | 핵심 경로 | 얕음 | 빌드/배포 직후 |
| **Sanity** | 수정 부위 | 얕음 | 버그 수정 직후 |
| **Regression** | 기존 기능 전체 | 중간 | 기능 추가 후 |
| **Load** | 부하 | 깊음 | 성능 요구 있을 때 |
| **Security** | 보안 취약점 | 깊음 | 보안 관련 변경 |

## Right-Size별 필수 유형

| Size | 필수 | 선택 |
|------|------|------|
| small | unit, smoke | - |
| medium | unit, integration, smoke, regression | e2e |
| large | unit, integration, e2e, smoke, regression | load, security |

## QA Stack 레이어와 테스트 유형 매핑

| Layer | 주요 테스트 유형 |
|-------|----------------|
| Infra (L0) | unit (env), smoke (connectivity) |
| DB (L1) | integration (migration), unit (query) |
| API (L2) | integration (contract), e2e (auth flow), security |
| UI (L3) | e2e (visual), regression (a11y), smoke |
