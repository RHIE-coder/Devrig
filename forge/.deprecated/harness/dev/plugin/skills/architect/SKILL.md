# /harness:architect

> 시스템 아키텍처 결정 기록 (ADR). medium+ 프로젝트 필수, small은 선택.

## 사용법

```
/harness:architect auth/login
/harness:architect auth/login --force-size    # small 프로젝트에서도 강제 실행
```

## 오케스트레이션

1. **Gate Check** — `scripts/gate-check.mjs`
   - Spec 존재 확인 (G1)
   - right-size >= medium 확인 (small이면 `--force-size` 필요)

2. **의존성 분석** — `scripts/dep-graph.mjs`
   - 프로젝트 소스 파일 import/require 분석
   - 순환 의존성(circular dependency) 탐지
   - 모듈간 의존 관계 그래프 JSON 출력

3. **제약 조건 수집** — `scripts/check-constraints.mjs`
   - Spec의 AC에서 기술 제약 추출 (성능/보안/호환성 키워드)
   - 기존 ADR과의 충돌 확인

4. **ADR 생성** — LLM 오케스트레이션
   - Agent: explorer → architect → devils-advocate
   - devils-advocate가 아키텍처 결정을 공격하여 약점 노출
   - 결과: `.harness/adrs/ADR-{NNN}-{title}.md`

## ADR 형식

```markdown
# ADR-001: {제목}

## 상태: proposed | accepted | deprecated

## 맥락
## 결정
## 근거
## 대안
## 결과
```

## 제약

- UX 결정과 직교 — `/harness:ux`가 UX 축 담당
- ADR 파일은 `.harness/adrs/`에 저장
