# builder

`forge/`에 저장된 레시피를 파일로 찍어내는 엔진. DevRig 게이트웨이가 자동 인식합니다.

```bash
devrig                                   # 메뉴에서 builder 선택 → 인터랙티브(레시피·동사 고르기)
devrig run builder list                  # 모든 레시피 나열
devrig run builder get  <name>           # 내용을 stdout으로 (그냥 꺼내기)
devrig run builder add  <name> [target]  # 기존 위치에 설치
devrig run builder new  <name> <dir>     # 새 프로젝트 생성 (stage 3, 미구현)

# 설치 없이:
cd toolkit/builder && go run . list
```

> 인자 없이(터미널) 실행하면 인터랙티브 선택 모드입니다 — `devrig` 게이트웨이 메뉴가
> 도구를 인자 없이 띄우기 때문에, 메뉴에서 builder를 고르면 이 모드로 들어갑니다.
> (sysman이 TUI로 바로 뜨는 것과 같은 흐름)

## 설계

- 레시피 = `forge/<domain>/<recipe>/forge.yaml` + payload. "종류"가 아니라 **매니페스트 필드**가 동작을 정함. (스키마: [`forge/README.md`](../../forge/README.md))
- forge 위치 탐색: `$DEVRIG_FORGE` → `$DEVRIG_ROOT`의 형제 `forge/` → cwd에서 위로 탐색.
- 도구는 독립 go 모듈이라 `toolkit/internal`을 못 빌려 씀 → forge 탐색을 자체 구현.

## 구현 현황

| 동사 | 상태 |
|------|------|
| `list` / `get` / `add`(파일 복사) | ✅ stage 1 |
| `add`의 `patch`(설정 배선) | ⏳ stage 2 — 현재는 수동 안내만 출력 |
| `new`(`vars`/`dest:new`/`post`) | ⏳ stage 3 |
