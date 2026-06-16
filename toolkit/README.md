# DevRig Toolkit

> 유틸리티 도구 모음 + 단일 진입점 게이트웨이

`toolkit/` 는 DevRig의 개별 도구들이 모이는 곳입니다. 도구가 늘어나도 **각 도구를 어떻게 실행/셋팅하는지 외울 필요가 없도록**, `devrig` 게이트웨이 명령이 모든 도구를 자동으로 인식해 실행·빌드·점검을 한 곳에서 처리합니다.

## 설치 (권장)

어디서든 `devrig` 명령으로 쓰려면 한 번 설치하세요. 설치 시 toolkit 루트 경로가 바이너리에 baking되어, 다른 프로젝트 디렉토리에서도 동작합니다.

```bash
# macOS / Linux
toolkit/install.sh
# Windows (PowerShell)
toolkit\install.ps1
```

설치 후 (`$GOBIN` 또는 `~/go/bin` 이 PATH에 있어야 함):

```bash
devrig                       # 인터랙티브 메뉴로 골라 실행
devrig list                  # 모든 도구 나열
devrig run sysman            # 도구 실행 (TUI도 그대로 동작)
devrig run sysman --json ps  # 도구로 인자 전달 (run <name> 뒤의 인자는 그대로 forwarding)
devrig build sysman          # 도구 빌드
devrig doctor [name]         # 전제조건(런타임) 설치 여부 점검
```

설치 없이 바로 쓰려면 `cd toolkit && go run . <명령>` 으로도 동일하게 동작합니다.

> **루트 자동탐지 우선순위**: `DEVRIG_ROOT` 환경변수 → 현재 디렉토리에서 위로 올라가며 `*/tool.yaml`이 있는 곳(저장소 루트에선 하위 `toolkit/`도 확인) → 설치 시 baking된 경로. 그래서 체크아웃 안에서는 그 체크아웃을, 밖에서는 설치된 루트를 사용합니다.

## 새 도구 추가하기

1. `toolkit/<name>/` 디렉토리에 도구를 만듭니다.
2. 그 안에 `tool.yaml` 매니페스트를 둡니다 — **이것만으로 게이트웨이가 자동 인식**합니다. 중앙 목록을 수정할 필요가 없습니다.

```yaml
# toolkit/<name>/tool.yaml
name: <name>                 # 고유 이름 (devrig run <name> 에 사용)
description: 한 줄 설명
lang: go                     # go | rust | python | node | ...
run: go run .                # 실행 명령 (도구 디렉토리에서 sh -c 로 실행)
build: go build -o <name> .  # 빌드 명령
requires:                    # 필요한 런타임 (PATH 존재 여부를 doctor가 점검)
  - go
```

`run`/`build` 은 해당 도구 디렉토리에서 `sh -c` 로 실행되며, 터미널 입출력을 그대로 물려받아 TUI 도구도 정상 동작합니다.

## 현재 도구

| 이름 | 언어 | 설명 |
|------|------|------|
| [`sysman`](./sysman) | Go | OS 상태 모니터링/제어 TUI (포트 점유·프로세스) |

## 구조

```
toolkit/
├── main.go                      게이트웨이 진입점 (devrig: list/run/build/doctor)
├── internal/
│   ├── manifest/manifest.go     tool.yaml 탐색·파싱 + 루트 탐지
│   └── runner/runner.go         실행·빌드·전제조건 점검
└── sysman/                      개별 도구 (자체 go.mod 모듈)
    ├── tool.yaml                ← 게이트웨이가 읽는 매니페스트
    └── ...
```

게이트웨이와 각 도구는 **독립된 Go 모듈**입니다. 게이트웨이는 도구를 import 하지 않고 하위 프로세스로 실행하므로, 도구가 어떤 언어든(Rust/Python/Node 등) 매니페스트만 있으면 동일하게 다룰 수 있습니다.
