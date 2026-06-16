# /harness:ux

> UI/UX 설계 축. Architect(시스템)와 직교하는 사용자 경험 결정.

## 사용법

```
/harness:ux auth/login
/harness:ux auth/login --platform ios
```

## 오케스트레이션

1. **Gate Check** — `scripts/gate-check.mjs`
   - Spec 존재 확인 (G1)

2. **접근성 검사** — `scripts/check-accessibility.mjs`
   - Spec AC에서 UI 관련 항목 추출
   - WCAG 2.1 키워드 기반 접근성 이슈 탐지
   - 플랫폼별 가이드라인 참조

3. **UX ADR 생성** — LLM 오케스트레이션
   - 시스템 ADR(`.harness/adrs/`)과의 충돌 확인
   - UX ADR → `.harness/adrs/UX-ADR-{NNN}-{title}.md`

## 제약

- Architect(시스템 아키텍처)와 직교 — 같은 feature에 대해 독립 실행
- 충돌 시 Plan 단계에서 조율
