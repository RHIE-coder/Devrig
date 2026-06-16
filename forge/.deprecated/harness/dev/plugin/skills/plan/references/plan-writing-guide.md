# Plan Writing Guide

## Plan의 역할

Plan은 "HOW-task" — 구현자가 따라할 step 리스트.

## 규칙

1. **모든 step은 최소 1 AC에 매핑** — 매핑 없는 step은 불필요한 작업
2. **모든 AC가 최소 1 step에 매핑** — 매핑 없는 AC는 구현 누락
3. **step 순서는 의존성 반영** — 독립 step은 병렬 표시
4. **각 step에 테스트 명시** — TDD 실행의 기반

## 좋은 Step의 조건

- 하나의 명확한 산출물
- 성공/실패 판단 가능
- 30분~2시간 이내 완료 가능
