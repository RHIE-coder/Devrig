# System Manager (`sysman`)

> DevRig toolkit · OS 상태를 보고 제어하는 터미널 UI

운영체제의 상태를 한 화면에서 관측하고 제어하는 TUI입니다. "포트가 이미 점유됨(address already in use)" 문제를 빠르게 푸는 **포트 점유 뷰**가 주력입니다.

## 현재 기능

- **Ports** (기본 탭) — TCP 리스닝 포트를 점유 중인 프로세스와 함께 표시: `PORT / PID / PROCESS / PROJECT / AGE / CPU% / MEM%`, 3초마다 자동 갱신
  - **PROJECT**: 프로세스의 작업 디렉토리(cwd)에서 프로젝트 루트(`.git`, `go.mod`, `package.json`, `Cargo.toml`, `pyproject.toml`, … 마커)를 찾아 그 이름을 표시. 어떤 프로젝트가 포트를 물고 있는지 한눈에 파악 — 특히 터미널 종속 없이 떠 있는 고아 서버를 찾는 데 유용
  - **AGE**: 프로세스가 떠 있은 시간을 일관된 형식으로 표시(예: `5d 10h 23m 12s`). 오래 떠 있는 잊힌 서버를 골라내는 데 유용. `t`를 누르면 **STARTED(절대 시작일시, 예 `2026-06-10 22:51`)** 와 토글됩니다. 선택 행 디테일 라인엔 둘 다 표시
  - 선택한 행의 전체 주소·시작시각·작업 디렉토리는 표 아래 디테일 라인에 표시 (너비에 맞춰 동적 축약, `~` 홈 치환)
  - `k` 종료(SIGTERM) · `K` 강제 종료(SIGKILL, SIGTERM 무시하는 데몬용) · `r` 즉시 갱신 · `/` 필터
- **Processes** — 실행 중인 전체 프로세스를 CPU 사용량 순으로 표시(PID/NAME/USER/STAT/AGE/CPU%/MEM%), 2초마다 자동 갱신, `k`로 종료, `/` 필터
- **System** *(macOS 전용)* — OS 유지보수 유틸리티. macOS에서만 탭이 나타나며 다른 OS에서는 숨겨집니다.
  - **Spotlight 색인 복구**: 전 볼륨(`mdutil -s -a`) 색인 상태를 보고, 손상 시 `[e]`로 erase & rebuild. `/`만 보면 "enabled"여도 앱이 사는 **Data 볼륨**이 `Error: unknown indexing state`로 깨져 있는 경우(앱이 있는데 Spotlight 검색에 안 잡히는 증상)를 잡아냅니다
  - **잠자기 방지 토글**: `pmset disablesleep` 값을 확인하고 `[s]`로 ON/OFF
  - 두 작업 모두 root 권한이 필요해 **osascript 네이티브 인증 대화상자**로 승격합니다(TUI가 비밀번호를 직접 받지 않음). 색인 재구성은 되돌릴 수 없는 작업이라 실행 전 `y/n` 확인을 받습니다

화면은 터미널 너비에 맞춰 컬럼(PROCESS/PROJECT/NAME)을 자동으로 늘이고 줄입니다.

## 키 바인딩

| 키 | 동작 |
|----|------|
| `tab` / `1` `2` `3` | 탭 전환 (1=Ports, 2=Processes, 3=System·macOS 전용) |
| `↑` / `↓` | 행 이동 |
| `/` | 필터(검색) 모드 — 입력 중 실시간 필터, `enter` 적용, `esc` 해제 |
| `t` | AGE 컬럼 토글: 경과시간 ⇄ 절대 시작일시(STARTED) |
| `r` | 즉시 새로고침 (System 탭에선 상태 다시 읽기) |
| `k` | 선택한 프로세스 종료 (SIGTERM) |
| `K` | 선택한 프로세스 강제 종료 (SIGKILL) |
| `e` *(System)* | Spotlight 색인 재구성 (확인 후 관리자 인증) |
| `s` *(System)* | 잠자기 방지(`disablesleep`) ON/OFF 토글 (관리자 인증) |
| `q` / `ctrl+c` | 종료 |

> 필터 입력 중에는 `q`·숫자 등 모든 키가 검색어로 들어가며 전역 단축키로 가로채지 않습니다.

## 빌드 & 실행

게이트웨이로 실행(권장):

```bash
devrig run sysman          # 또는 인터랙티브 메뉴: devrig
```

직접 실행/설치:

```bash
cd toolkit/sysman
go run .
go build -o sysman . && ./sysman
```

## 스크립트 / AI 연동

UI 없이 JSON 스냅샷을 출력하는 헤드리스 모드가 있어 스크립트나 AI 에이전트가 소비할 수 있습니다.

```bash
devrig run sysman --json ports   # 리스닝 포트 (port/pid/process/project/cwd/cpu/mem/started/uptime_sec)
devrig run sysman --json ps      # 전체 프로세스 (CPU 내림차순; started/uptime_sec 포함)
```

> `started`는 RFC3339 시작시각, `uptime_sec`는 실행 경과 초입니다 — "며칠째 떠 있는 프로세스" 같은 질문에 바로 쓸 수 있습니다.

또한 실행 중인 TUI는 **현재 보고 있는 화면(탭·필터·목록)과 포커스한 행**을 이동/탭전환/필터/갱신할 때마다 상태 파일에 기록합니다. 이건 새로 스캔하는 `--json`과 달리 **지금 화면에 떠 있는 그대로**를 반영합니다:

```
${XDG_STATE_HOME:-$TMPDIR}/devrig/sysman.json   # 맥: 사용자 전용 프라이빗 임시 디렉토리
# { updated_at, view, filter, focused, visible }
#   focused = 지금 커서가 가리키는 행, visible = 화면에 나열된 행(필터 적용)
```

이 데이터는 휘발성이라 **per-user 임시 디렉토리**(`os.TempDir()`, 맥의 프라이빗 `$TMPDIR`)에 소유자 전용(디렉토리 0700·파일 0600)으로 쓰이고, **sysman 종료 시 삭제**됩니다. 즉 파일이 없으면 "sysman이 떠 있지 않다"는 뜻이고, `updated_at`으로 신선도를 확인할 수 있습니다. (`$XDG_STATE_HOME`를 설정하면 그 경로를 우선 사용합니다.)

저장소의 [`/devrig-toolkit`](../../.claude/commands/devrig-toolkit.md) 슬래시 커맨드가 이 둘을 사용해
"지금 가리키는 이 프로세스는 어느 프로젝트야? 죽여도 돼?", "CPU/MEM top10 알려줘" 같은 질문에 답합니다.
다른 프로젝트에서도 쓰려면 `~/.claude/commands/`로 복사하거나 심볼릭 링크하세요.

## 아키텍처

[Bubble Tea](https://github.com/charmbracelet/bubbletea)(Elm 아키텍처) 기반이며, 탭별 뷰를 서브모델로 분리합니다.

```
main.go                     진입점 (TUI / --json 헤드리스)
internal/
  app/      app.go          루트 모델: 탭 셸 + 전역 키 + 포커스 상태 기록
            tabs_*.go        탭 목록을 OS별로 정의 (System 탭은 darwin에서만)
  ports/    model.go        Ports 뷰: 리스너→프로세스→프로젝트 매핑 + 필터 + 종료
  process/  model.go        Processes 뷰: 전체 프로세스 테이블 + 필터 + 종료
  macos/    model.go,ops.go  System 뷰(macOS 전용): Spotlight 복구 + pmset 토글
  state/    state.go        현재 탭·포커스 항목을 JSON 상태 파일로 기록
```

- 포트/프로세스/시스템 정보: [`gopsutil`](https://github.com/shirou/gopsutil) (`net.Connections`, `process.Cwd` 등)
- 키 이벤트는 활성 탭에만(단, 그 탭이 필터 입력 중이면 전역 단축키를 양보), 그 외 메시지(갱신 틱·로드 결과)는 모든 뷰에 브로드캐스트해 어느 탭에서든 갱신 루프가 유지됩니다.
- 각 뷰의 데이터 수집은 `Gather()`로 분리되어 TUI와 `--json` 헤드리스 모드가 공유합니다.
- 새 뷰는 `internal/<view>/` 패키지로 추가하고 `app.Model`에 탭으로 연결합니다.

## 로드맵

- [x] 포트/프로세스 필터(`/`)
- [x] 너비 반응형 레이아웃
- [x] JSON 헤드리스 모드 + 포커스 상태 파일 (AI/스크립트 연동)
- [x] OS별 탭 (macOS 전용 System 탭: Spotlight 복구 · pmset disablesleep)
- [ ] 종료 전 확인 다이얼로그
- [ ] 정렬 기준 전환(CPU/MEM/PID/PROJECT)
- [ ] 시스템 요약(CPU/메모리/디스크) 헤더
- [ ] 네트워크 패킷 캡처/분석 뷰 (`gopacket` + libpcap; root/`cap_net_raw` 권한 필요)
