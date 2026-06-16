# /harness:init

프로젝트에 하네스를 초기 구성하는 스킬.

## 목표

1. `.harness/` 디렉토리 구조를 생성한다
2. 유저의 프로젝트 정보를 수집하여 `config.yaml`을 생성한다
3. 유저 동의 시 example 파일을 프로젝트에 복사한다

## 실행 순서

### Step 1: scaffold

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/scaffold-harness.mjs
```

`.harness/` 디렉토리와 하위 구조를 생성한다. 이미 존재하면 skip.

### Step 2: config 생성

유저에게 다음을 질문한다:
- **mode**: standard / prototype / explore (CLI 인자 `--mode`로 지정 가능)
- **프로젝트 언어/스택** (자동 감지 결과 확인)

수집한 정보를 기반으로:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/gen-config.mjs
```

### Step 3: example 복사 (유저 동의 시)

유저에게 "example 파일을 복사하시겠습니까?" 질문 후 동의하면:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/init/scripts/copy-examples.mjs
```

## 완료 조건

- `.harness/config.yaml` 존재
- `.harness/state/` 디렉토리 존재
- `.harness/specs/`, `.harness/plans/` 디렉토리 존재
- config.yaml에 유효한 mode 설정

## 에스컬레이션

- 이미 `.harness/`가 존재하면 유저에게 덮어쓸지 확인
- config.yaml 생성 실패 시 BLOCKED 리포트
