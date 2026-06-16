# /harness:migrate

> 기존 프로젝트에 하네스를 도입. 3단계 점진적 마이그레이션.

## 사용법

```
/harness:migrate init              # .harness/ 구조 생성 (기존 코드 미변경)
/harness:migrate analyze           # 스택 감지 + 구조 파악
/harness:migrate extract-spec      # 코드 → Spec 역추출 (LLM 의존)
/harness:migrate gen-test          # 테스트 없는 코드 → 테스트 생성 (LLM 의존)
```

## 오케스트레이션

### init

1. `scripts/dispatch.mjs` → `init` 서브커맨드 라우팅
2. `scripts/scaffold-harness.mjs` 실행
   - .harness/ 디렉토리 구조 생성
   - config.yaml 생성 (prototype 모드)
   - 기존 코드 일체 수정 금지

### analyze

1. `scripts/detect-stack.mjs` 실행
   - package.json / requirements.txt / go.mod 등으로 언어/프레임워크 감지
   - 디렉토리 구조 분류 (src, tests, config, docs)
2. 결과 → `.harness/state/analysis.json`

### extract-spec (LLM 의존)

- LLM이 소스 코드를 읽고 기능별 AC를 도출
- 결정론적 스크립트 없음 — SKILL.md 지시로 LLM 오케스트레이션
- 결과: `.harness/specs/{feature}.spec.yaml`

### gen-test (LLM 의존)

- LLM이 코드를 읽고 테스트를 생성
- 결정론적 스크립트 없음 — SKILL.md 지시로 LLM 오케스트레이션
- 결과: `tests/{feature}.test.mjs`

## 마이그레이션 레벨

| Level | 이름 | 설명 |
|-------|------|------|
| Lv1 | Planning | init + analyze → .harness/ 생성 |
| Lv2 | Wrapping | + extract-spec + gen-test → Spec/Test 존재 |
| Lv3 | Refactoring | + /harness:refactor → 코드 구조 개선 |

## 정방향 합류

마이그레이션 완료 후 `/harness:implement` 정상 실행 가능.
(.harness/ 구조가 도메인 B와 호환)

## 제약

- init은 기존 코드를 절대 수정하지 않음
- extract-spec, gen-test는 LLM 의존 — eval로 검증
