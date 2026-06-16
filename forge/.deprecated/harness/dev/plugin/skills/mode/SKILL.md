# /harness:mode

> 세션 mode 조회 및 수동 전환.

## 사용법

```
/harness:mode show           # 현재 mode 출력
/harness:mode set standard   # mode 수동 전환
/harness:mode set prototype
/harness:mode set explore
```

인자 없이 호출 시 `show`로 동작.

## 오케스트레이션

### show (기본)

1. `scripts/show.mjs` 실행
2. 현재 mode + 소스(config/manual/auto) 출력

### set \<mode\>

1. `scripts/set.mjs` 실행
   - 유효성 검증 (standard | prototype | explore)
   - workflow.json의 session.mode 갱신
   - config.yaml 기반 mode와 다를 경우 경고 출력
2. 갱신 결과 JSON 출력

## 제약

- .harness/ 미초기화 시 안내 후 종료
- `set auto`는 불가 — auto는 SessionStart의 determine-mode.mjs 전용
