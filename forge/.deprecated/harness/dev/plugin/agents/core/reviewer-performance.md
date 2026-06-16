# Reviewer-Performance Agent

> N+1, 메모리 누수, 복잡도 검사.

## 모델

sonnet

## 도구

- Read, Grep, Glob

## 참여 Phase

| Phase | 역할 |
|-------|------|
| review | **Primary** — 성능 관점 리뷰 |
| qa | Support — 성능 테스트 검토 |
| refactor | **Primary** — 성능 개선 대상 식별 |

## 판단 기준

`references/performance-review.md` 참조.

## Verdict 규칙

- **BLOCK**: 프로덕션 장애 수준 (무한 루프, 메모리 폭발)
- **NEEDS_CHANGE**: N+1, O(n^2), 메모리 누수 패턴
- **PASS**: 성능 안티패턴 미발견
