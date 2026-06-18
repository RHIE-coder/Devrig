# System Manager (`sysman`)

> DevRig toolkit · OS 상태를 보고 제어하는 터미널 UI

운영체제의 상태를 한 화면에서 관측하고 제어하는 TUI입니다. 켜면 **System(디바이스 상태)** 탭이 먼저 뜨고, "포트가 이미 점유됨(address already in use)" 문제를 푸는 **Ports** 뷰가 그다음 주력입니다.

## 현재 기능

- **System** (기본 탭) — 디바이스의 하드웨어 구성과 라이브 상태를 한 화면에 모은 대시보드, 1초마다 자동 갱신. **전 OS 공통**(macOS/Linux/Windows). sysman을 켜면 가장 먼저 보이는 탭입니다.
  - **하드웨어 스펙(정적, 1회 수집)**: 호스트명 · 모델(예 `Mac14,9`) · 칩(`Apple M2 Pro`)과 코어 구성(Apple Silicon은 `10코어 (6P+4E)`, x86은 `(물리 N)`) · GPU 코어 수 · 클럭 · RAM · 루트 디스크 용량/타입 · OS/아키텍처
  - **가동/배터리**: 총 가동시간(`47d 11h …`) · 부팅 시각 · 배터리(노트북) 잔량/상태(`배터리 87% 방전 중`) + **수명**(`수명 86% (246회 · 정상)` = 최대용량%·충전 횟수·상태, macOS는 system_profiler, Linux는 sysfs). 데스크톱·VM 등 배터리 없으면 줄 생략
  - 처음 보는 용어는 **`h`** 를 눌러 도움말(각 항목 설명·보는 법)을 확인할 수 있습니다. 모든 항목은 흐릿한 회색이 아닌 또렷한 색으로 표시되고, 각 행은 왼쪽 컬러 레일로 구분됩니다
  - **CPU**: 총 사용량 게이지 + 코어별 스파크라인(`▁▂▃▄▅▆▇█`) + 로드 애버리지(1/5/15분) + 프로세스 수(running/blocked)
  - **메모리·스왑**: 사용/총량(`13.6 G / 16.0 G`)·가용량·사용률 게이지 + wired/active/inactive 브레이크다운. 스왑은 할당/사용량까지(없으면 "스왑 없음")
  - **네트워크**: **연결 품질**(온라인/오프라인 · 지연시간 ms · 등급 `아주 빠름/좋음/보통/느림` · 인터페이스·로컬 IP·서브넷마스크(`en0 192.168.0.5/24 (마스크 255.255.255.0)`)) + 초당 송수신 속도(↑업로드/↓다운로드) + 부팅 후 누적. 처리량 숫자만으로는 "좋다/나쁘다"를 알 수 없어(유휴 시 낮은 게 정상), 잘 알려진 호스트(1.1.1.1)로 TCP 연결을 맺어 **왕복 지연을 직접 측정**합니다(root 불필요). ⚠️ 이를 위해 sysman 실행 중 약 8초마다 해당 호스트로 짧은 연결을 1회 시도합니다(데이터 전송 없음).
  - **디스크**: 루트 볼륨 사용률 게이지 + 초당 읽기/쓰기 속도(R/W) + IOPS(읽기/쓰기 작업수)
  - **온도**: 하드웨어 센서를 `CPU/SoC · GPU · Battery · Storage` 그룹으로 묶어 **현재 평균**을 표시(그룹 색은 그룹 내 최고온 기준) + 지금 가장 뜨거운 센서(`최고온 …`). **상한이 아니라 실시간 값** — 부하 시 ~100°C까지 오를 수 있고, 60°/85°에서 색이 바뀝니다
    - `SoC`(System on Chip) = CPU·GPU가 한 칩에 통합된 형태(Apple Silicon·모바일 칩 등)를 가리키는 **일반 용어**(맥 전용 아님). CPU/GPU가 분리된 일반 데스크톱에서는 사실상 CPU 온도이며, 그래서 라벨을 `CPU/SoC`로 통일했습니다
    - **Apple Silicon**은 `IOHIDEventSystemClient`로 **sudo 없이** 다이/배터리/SSD 온도를 읽습니다(예: M2 Pro에서 die 11개 센서). Intel Mac은 SMC, Linux는 hwmon, Windows는 WMI를 통해 읽습니다
    - 센서가 없는 장비/VM에서는 에러 대신 "이 장비에서는 온도 센서를 읽을 수 없습니다"로 우아하게 폴백합니다
- **Ports** — TCP 리스닝 포트를 점유 중인 프로세스와 함께 표시: `PORT / PID / PROCESS / PROJECT / AGE / CPU% / MEM%`, 3초마다 자동 갱신
  - **PROJECT**: 프로세스의 작업 디렉토리(cwd)에서 프로젝트 루트(`.git`, `go.mod`, `package.json`, `Cargo.toml`, `pyproject.toml`, … 마커)를 찾아 그 이름을 표시. 어떤 프로젝트가 포트를 물고 있는지 한눈에 파악 — 특히 터미널 종속 없이 떠 있는 고아 서버를 찾는 데 유용
  - **AGE**: 프로세스가 떠 있은 시간을 일관된 형식으로 표시(예: `5d 10h 23m 12s`). 오래 떠 있는 잊힌 서버를 골라내는 데 유용. `t`를 누르면 **STARTED(절대 시작일시, 예 `2026-06-10 22:51`)** 와 토글됩니다. 선택 행 디테일 라인엔 둘 다 표시
  - 선택한 행의 전체 주소·시작시각·작업 디렉토리는 표 아래 디테일 라인에 표시 (너비에 맞춰 동적 축약, `~` 홈 치환)
  - `k` 종료(SIGTERM) · `K` 강제 종료(SIGKILL, SIGTERM 무시하는 데몬용) · `r` 즉시 갱신 · `/` 필터
- **Processes** — 실행 중인 전체 프로세스를 CPU 사용량 순으로 표시(PID/NAME/USER/STAT/AGE/CPU%/MEM%), 2초마다 자동 갱신, `k`로 종료, `/` 필터
  - **CPU%는 "지금" 사용량**입니다 — 갱신 구간(2초) 사이 CPU 시간 증가분을 차분해 계산한 *실시간* 값으로, 활성 상태 보기·`top`과 같은 의미입니다(프로세스 시작 이후 누적 평균이 아님). **100% = 코어 1개 풀가동**이라 멀티스레드 프로세스는 100%를 넘을 수 있고, 여러 프로세스 합이 100%를 넘는 것도 정상입니다(전체 예산 = 코어 수 × 100%). 갓 뜬 프로세스는 첫 1틱 동안 0%로 보이다 다음 갱신부터 정확해집니다
- **Maintenance (macOS)** *(macOS 전용)* — OS 유지보수 유틸리티. **macOS에서만 탭이 나타나며 Windows·Linux에서는 탭 자체가 숨겨집니다**(빌드 태그로 제외 — Spotlight·pmset·앱 제거가 macOS 전용이라). 즉 Windows 사용자에게는 `System / Ports / Processes` 3개 탭만 보입니다. 이 탭은 **2개의 하위 탭**으로 나뉘며 **`←`/`→`** 로 전환합니다(상위 탭은 `tab`·숫자키, 목록은 `↑`/`↓`이라 좌우 화살표가 안 겹칩니다).
  - **하위 탭 ① 유지보수**
    - **Spotlight 색인 복구**: 전 볼륨(`mdutil -s -a`) 색인 상태를 보고, 손상 시 `[e]`로 `mdutil -E /` (루트 erase & rebuild)를 실행. `/`만 보면 "enabled"여도 앱이 사는 **Data 볼륨**이 `Error: unknown indexing state`인 경우(앱이 있는데 Spotlight에 안 잡히는 증상)를 `-s -a`로 잡아냅니다.
      - erase는 `/`에만 적용합니다 — raw 마운트(`/System/Volumes/Data`·Preboot)에는 `-i`/`-E`가 root로도 "invalid operation"으로 거부됩니다.
      - **단, Data 볼륨이 unknown/invalid로 wedge된 경우 mdutil로는 재색인을 못 띄웁니다.** 이때는 **재부팅**(부팅 시 자동 재구성) 또는 **시스템 설정 > Spotlight 개인정보 보호에서 디스크 추가→제거**가 해결책 — UI가 손상 감지 시 이 안내를 표시합니다
    - **잠자기 방지 토글**: `pmset disablesleep` 값을 확인하고 `[s]`로 ON/OFF
    - 두 작업 모두 root 권한이 필요해 **osascript 네이티브 인증 대화상자**로 승격합니다(TUI가 비밀번호를 직접 받지 않음). 색인 재구성은 되돌릴 수 없는 작업이라 실행 전 `y/n` 확인을 받습니다
  - **하위 탭 ② 앱 제거** — 앱 본체뿐 아니라 macOS 곳곳에 남는 **잔재물(설정·캐시·로그·백그라운드 데몬)까지 한 번에** 정리합니다. Windows의 "프로그램 추가/제거"처럼, 앱을 `/Applications`에서 휴지통에 버린 뒤에도 남는 파일들을 찾아 함께 제거합니다.
    - **앱 목록** — `/Applications`·`/Applications/Utilities`·`~/Applications`의 `.app`을 나열(`/`로 검색, `↑`/`↓` 이동). SIP 보호 Apple 앱이 사는 `/System/Applications`는 **의도적으로 제외**합니다(제거 불가·불필요).
    - **`enter` 분석** — 선택한 앱의 `Info.plist`에서 **번들 ID**(`CFBundleIdentifier`, 예 `com.google.Chrome`)를 읽어, `~/Library`·`/Library`·`/var/db/receipts` 곳곳을 스캔합니다: `Application Support`·`Caches`·`Preferences`·`Containers`·`Group Containers`·`Saved Application State`·`HTTPStorages`·`Logs`·`WebKit`·`Cookies`·**`LaunchAgents`/`LaunchDaemons`**(앱을 지워도 계속 도는 백그라운드 데몬)·`PrivilegedHelperTools`·설치 영수증 등. 각 항목의 **경로 + 용량 + 합계**를 보여준 뒤에야 삭제합니다.
    - **매칭 안전장치** — 번들 ID 매칭이 1순위(`com.foo.app` 및 그 `com.foo.app.*` 헬퍼, `<팀ID>.com.foo.app` 그룹 컨테이너). 표시 이름 매칭(예 `~/Library/Logs/Foo`)은 보조 신호라 **`⚠이름매칭`** 으로 따로 표시해 사람이 확인하게 합니다. **여러 앱이 공유하는 벤더 폴더(`…/Google`, `…/Microsoft` 등)는 안전을 위해 제외** — Chrome 하나 지우려다 모든 Google 앱 데이터를 날리는 사고를 막습니다(리뷰 화면에 이 안내가 항상 표시됩니다).
    - **제거 방식** — 기본 **`[y]` 휴지통 이동**(Finder 경유, **되돌리기(Put Back) 가능**·보호 항목은 Finder가 인증을 띄움), 또는 **`[X]` 영구 삭제**(`rm -rf`, 복구 불가; `/Library`·root 소유 항목은 그때만 osascript로 승격). 기본이 휴지통이라 혹시 잘못 매칭돼도 복구할 수 있습니다.
    - 분석/제거는 비동기로 돌고(스피너), 권한이 필요하면 시스템 대화상자를 띄웁니다. 첫 휴지통 이동 때 macOS가 "Finder 제어 허용" 자동화 권한을 한 번 물을 수 있습니다.

화면은 터미널 너비에 맞춰 컬럼(PROCESS/PROJECT/NAME)을 자동으로 늘이고 줄입니다.

## 키 바인딩

| 키 | 동작 |
|----|------|
| `tab` / `1` `2` `3` `4` | 탭 전환 (1=System·기본, 2=Ports, 3=Processes, 4=Maintenance·macOS 전용) |
| `←` / `→` *(Maintenance)* | 하위 탭 전환 (유지보수 ⇄ 앱 제거) |
| `h` / `?` | System 탭 용어 설명 오버레이 — CPU·부하·메모리·온도·배터리 등 각 항목이 무슨 뜻인지 쉬운 말로 (esc/h 닫기). 탭 전환·단축키는 푸터 참조 |
| `↑` / `↓` | 행 이동 (테이블 탭·앱 목록·리뷰 스크롤) |
| `/` | 필터(검색) 모드 — 입력 중 실시간 필터, `enter` 적용, `esc` 해제 (Ports·Processes·앱 제거) |
| `t` | AGE 컬럼 토글: 경과시간 ⇄ 절대 시작일시(STARTED) |
| `r` | 즉시 새로고침 (System 탭=즉시 재측정, Maintenance 탭=상태/목록 다시 읽기) |
| `k` | 선택한 프로세스 종료 (SIGTERM) |
| `K` | 선택한 프로세스 강제 종료 (SIGKILL) |
| `e` *(유지보수)* | Spotlight 색인 재구성 (확인 후 관리자 인증) |
| `s` *(유지보수)* | 잠자기 방지(`disablesleep`) ON/OFF 토글 (관리자 인증) |
| `enter` *(앱 제거)* | 선택 앱 분석 — 잔재물 스캔 후 제거 항목 리뷰 |
| `y` *(앱 제거·리뷰)* | 앱+잔재물을 **휴지통으로 이동** (되돌리기 가능) |
| `X` *(앱 제거·리뷰)* | 앱+잔재물 **영구 삭제** (`rm -rf`, 복구 불가) |
| `n` / `esc` *(앱 제거·리뷰)* | 제거 취소 |
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
devrig run sysman --json ps      # 전체 프로세스 (CPU 내림차순; started/uptime_sec 포함). cpu는 실시간 값이라 기준선 확보용으로 ~350ms 두 번 샘플링
devrig run sysman --json metrics # 디바이스 상태 1회 스냅샷
```

> `--json metrics` 출력: 정적 하드웨어 스펙은 `spec`(hostname/model/cpu_model/logical_cpu/physical_cpu/perf_cores/eff_cores/gpu_cores/mem_total/disk_total/os/arch + battery_max_capacity_pct/battery_cycles/battery_condition)에 중첩, 라이브 값은 최상위(cpu_percent·per_cpu·load·procs·mem(+wired/active/inactive)·swap·net rate(+net_iface/net_ip/net_mask_bits/net_mask)·net_online/net_latency_ms·disk(+IOPS)·온도 그룹·uptime_sec·boot_time_unix·battery_*)에 평탄화됩니다. 네트워크·디스크 *속도*를 채우려 ~700ms 간격으로 두 번 샘플링합니다(첫 샘플은 카운터 기준선).

또한 **TUI가 System 탭을 보여주는 동안에는** 그 라이브 값(스펙+스냅샷)이 위 상태 파일의 `focused`에도 실립니다 — 즉 Claude/Codex가 "지금 보고 있는 이 시스템 상태"를 새로 스캔하지 않고 화면 그대로 답할 수 있습니다.

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
            tabs_*.go        탭 목록을 OS별로 정의 (Maintenance 탭은 darwin에서만)
  metrics/  metrics.go       System 뷰 수집: CPU/메모리/스왑/네트워크/디스크/온도/배터리 (+ spec_*.go: P/E·GPU·모델, battery_*.go)
            model.go         System 뷰 렌더: 스펙 헤더 + 게이지/스파크라인
  ports/    model.go         Ports 뷰: 리스너→프로세스→프로젝트 매핑 + 필터 + 종료
  process/  model.go         Processes 뷰: 전체 프로세스 테이블 + 필터 + 종료
  macos/    tab.go           Maintenance 탭(macOS 전용): 유지보수·앱 제거 하위 탭 셸(←/→)
            model.go,ops.go  하위 탭 ① 유지보수: Spotlight 복구 + pmset 토글
            uninstall.go     하위 탭 ② 앱 제거: 앱 목록→스캔→리뷰→제거 상태머신
            appscan.go       앱/잔재물 스캔·매칭·휴지통/영구 삭제 로직 (owner_*.go: 소유자 판별)
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
- [x] OS별 탭 (macOS 전용 Maintenance 탭: Spotlight 복구 · pmset disablesleep)
- [x] 앱 깔끔히 제거 (macOS) — 번들 ID로 잔재물(설정·캐시·로그·LaunchDaemon)까지 스캔→휴지통/영구 삭제
- [x] System(디바이스 상태) 기본 탭 — 하드웨어 스펙 + CPU/메모리/스왑/네트워크/디스크/온도/배터리/가동시간, 전 OS 공통, 온도는 Apple Silicon 포함
- [ ] 종료 전 확인 다이얼로그
- [ ] 정렬 기준 전환(CPU/MEM/PID/PROJECT)
- [ ] System 히스토리/그래프(시계열 스파크라인)
- [ ] GPU 사용률·팬 RPM (Apple Silicon: powermetrics 권한 필요)
- [ ] 네트워크 패킷 캡처/분석 뷰 (`gopacket` + libpcap; root/`cap_net_raw` 권한 필요)
