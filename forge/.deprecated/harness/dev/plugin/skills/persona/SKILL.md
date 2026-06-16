# /harness:persona

> 페르소나 생명주기 관리. `.claude/agents/*.md` 파일로 관리.

## 사용법

```
/harness:persona create --name "보안전문가" --type tech-specialist --domain security
/harness:persona list
/harness:persona delete 보안전문가
```

## 오케스트레이션

### create

1. `scripts/dispatch.mjs` → `create` 서브커맨드 라우팅
2. `scripts/create.mjs` 실행
   - HARNESS_PERSONA_NAME, HARNESS_PERSONA_TYPE, HARNESS_PERSONA_DOMAIN 읽기
   - type별 템플릿 적용 (domain-expert / business-role / tech-specialist)
   - `.claude/agents/{name}.md` 생성
   - 이미 존재하면 덮어쓰지 않음

### list

1. `scripts/list.mjs` 실행
   - `.claude/agents/*.md` 스캔
   - 이름, 타입, 도메인 추출하여 JSON 출력

### delete

1. `scripts/delete.mjs` 실행
   - HARNESS_PERSONA_NAME으로 대상 파일 확인
   - 파일 삭제
   - 미존재 시 경고

## 페르소나 타입

| 타입 | 설명 | 예시 |
|------|------|------|
| domain-expert | 특정 도메인 깊은 지식 | DB 최적화 전문가, 결제 도메인 전문가 |
| business-role | 비즈니스 이해관계자 관점 | PM, 디자이너, 마케터 |
| tech-specialist | 기술 전문 분야 | 보안 전문가, 성능 전문가, DevOps |

## 제약

- 페르소나 파일은 Claude Code 표준 Agent `.md` 포맷
- 파일명은 페르소나 이름 기반 (slugify)
- brainstorm 스킬에서 페르소나를 로드하여 병렬 탐색에 사용
