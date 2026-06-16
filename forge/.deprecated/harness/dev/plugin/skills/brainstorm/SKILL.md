# /harness:brainstorm

> Spec 작성 전 다각적 관점 탐색. 페르소나 기반 병렬 아이디어 검토.

## 사용법

```
/harness:brainstorm "사용자 인증 시스템"
/harness:brainstorm "결제 흐름" --personas "결제전문가,보안전문가"
```

## 오케스트레이션

1. **페르소나 로드** — `scripts/load-personas.mjs`
   - `.claude/agents/*.md` 스캔하여 사용 가능한 페르소나 목록 로드
   - `--personas` 플래그로 특정 페르소나 지정 가능
   - 페르소나 없으면 기본 내장 관점 사용 (devils-advocate, requirements-analyst)

2. **페르소나 제안** — `scripts/suggest-personas.mjs`
   - 주제 분석 → 관련 도메인 추출 → 적합한 페르소나 추천
   - 사용자가 선택/확인

3. **병렬 탐색** — LLM 오케스트레이션
   - 각 페르소나 관점에서 아이디어/리스크/요구사항 도출
   - devils-advocate: 약점 공격
   - requirements-analyst: 구조화된 요구사항 정리
   - 사용자 페르소나: 도메인/비즈니스/기술 관점

4. **종합** — 결과를 `/harness:spec --from-brainstorm`으로 전달 가능한 형태로 정리

## 제약

- .harness/ 초기화 필요
- 결과는 권고 — 최종 결정은 사용자
