---
description: DevRig toolkit(sysman)로 포트·프로세스·디바이스 상태·현재 포커스 항목에 대해 답하기
argument-hint: <포트/프로세스/디바이스 상태에 대한 질문>
---

당신은 로컬 머신의 **포트/프로세스** 상태에 대한 사용자의 질문에 답합니다. DevRig의 `sysman` 도구를 통해 실데이터를 가져오세요.

사용자 질문: $ARGUMENTS

## 데이터 소스

1. **리스닝 포트 스냅샷 (JSON)**

   ```bash
   devrig run sysman --json ports
   ```

   각 항목: `port, addr, pid, ppid, process, project, cwd, cmdline, cpu, mem, started, uptime_sec`.
   (`started`=RFC3339 시작시각, `uptime_sec`=실행 경과 초 → "며칠째 떠 있는지", "언제 띄웠는지" 답에 사용)
   - `cmdline` = **어떻게 실행했는지**(전체 실행 커맨드라인). "이 서버 어떻게 띄운 거야?" 질문에 그대로 사용.
   - `ppid` = 부모 PID. ⚠️ macOS에선 **프로세스의 약 2/3가 `ppid 1`(launchd 직속)** 입니다(GUI 앱·시스템 데몬 포함) → **`ppid 1` 자체는 고아가 아님.** 유저가 터미널에서 띄운 프로세스(`node`·`python`·`npm`·`bun` 등, 경로가 `/System`·`/Applications`·`/Library`·`/usr`가 **아닌** 것)가 `ppid 1`일 때만 "띄운 터미널이 죽어 launchd로 입양된 **고아 가능성**" → 그땐 Ctrl+C로 못 죽이니 pid/포트로 죽이라고 안내. 단정하지 말고 "가능성"으로 표현.
   `devrig`이 PATH에 없으면 `~/go/bin/devrig` 을 사용하세요.

2. **전체 프로세스 스냅샷 (CPU 내림차순, JSON)**

   ```bash
   devrig run sysman --json ps
   ```

   각 항목에 `ppid`, `cmdline` 포함. "CPU/MEM top N" 같은 질문은 이 출력을 정렬·상위 N개로 답하세요.
   족보를 직접 조립할 때는 이 덤프에서 `pid → ppid` 를 따라 올라가도 되지만, 보통은 아래 `tree` 가 더 간편합니다.

3. **프로세스 족보 / 부모 체인 (JSON)** — "누가 띄웠어?", "부모가 뭐야?", "족보 떠줘", "왜 독립 프로세스로 도나" 류 질문에 사용.

   ```bash
   devrig run sysman --json tree <pid>
   ```

   해당 `pid`부터 루트(`launchd`, PID 1)까지 **조상 체인을 위로 올라가며** 배열로 반환합니다.
   배열[0]=대상 프로세스, 마지막=최상위 조상. 각 노드: `pid, ppid, name, cmdline, ...`.
   - 답할 때는 들여쓰기 트리(`└─`)로 **누가 무엇의 부모인지** 보여주고, 각 노드의 `cmdline`으로 **어떻게 실행됐는지** 곁들이세요.
   - 체인은 거의 항상 `launchd`(PID 1)에서 끝납니다 — 이건 정상이지 고아 신호가 아님. launchd 직속 노드가 **시스템/앱이 아닌 유저 프로세스**(`node`·`npm`·`python` 등, 경로가 `/System`·`/Applications`·`/Library`·`/usr`가 아님)일 때만 → 터미널이 닫혀 입양된 **고아 가능성**으로(단정 말고) 설명. `/System`·`/Applications`·`/Library`·`/usr` 경로의 launchd 직속은 OS가 의도적으로 띄운 정상 프로세스.

4. **디바이스 상태 스냅샷 (JSON)** — "CPU/메모리 얼마나 써?", "스왑 상태", "네트워크 트래픽", "온도/발열 어때?", "스펙/사양 알려줘", "배터리/가동시간" 류 질문에 사용.

   ```bash
   devrig run sysman --json metrics
   ```

   ~700ms 간격 두 번 샘플링 후 1회 출력. 필드:
   - `spec`(정적 하드웨어, 중첩 객체): `hostname, model, cpu_model, logical_cpu, physical_cpu, perf_cores, eff_cores, gpu_cores, cpu_mhz, mem_total, disk_total, disk_fstype, os, arch` + 배터리 수명 `battery_max_capacity_pct`(최대용량%)·`battery_cycles`(충전 횟수)·`battery_condition`
     - `perf_cores`/`eff_cores`(P/E 코어 분리), `gpu_cores`, `model`(예 `Mac14,9`)은 **Apple Silicon에서만** 채워집니다.
   - CPU: `cpu_percent`(총), `per_cpu`(코어별), `cores`, `load1/5/15`(Windows는 0)
   - 프로세스: `procs_total / procs_running / procs_blocked`
   - 메모리: `mem_total/mem_used/mem_available/mem_percent` + `mem_wired/mem_active/mem_inactive`(macOS·Linux), 스왑 `swap_total/swap_used/swap_percent` (바이트)
   - 네트워크: `net_sent_rate/net_recv_rate`(B/s, ↑업로드/↓다운로드) + 누적 `net_sent_total/net_recv_total` + 연결 품질 `net_online`(bool)·`net_latency_ms`(왕복 지연, 낮을수록 빠름)·`net_iface`/`net_ip`/`net_mask_bits`/`net_mask`(주 인터페이스·로컬 IP·서브넷 프리픽스·점표기 마스크)
   - 디스크: `disk_total/disk_used/disk_percent`(루트), `disk_read_rate/disk_write_rate`(B/s), `disk_read_iops/disk_write_iops`
   - 가동/배터리: `uptime_sec`(총 켜진 시간), `boot_time_unix`, `battery_present`(노트북만 true), `battery_percent`, `battery_state`(charging/discharging/charged/ac)
   - 온도: `temp_supported`(bool), `temps[]`(`{label, avg_c, max_c, count}` — label은 `CPU/SoC·GPU·Battery·Storage`), `temp_peak_key/temp_peak_c`(지금 가장 뜨거운 센서)
   - ⚠️ 온도 `avg_c`/`max_c`는 **현재값이지 상한이 아닙니다**(부하 시 ~100°C 가능). `temp_supported`가 `false`면 이 장비/OS에서 센서를 못 읽는 것 → "온도 미지원"으로 답하고 추정값을 지어내지 마세요. Apple Silicon은 sudo 없이 읽힙니다.

5. **현재 TUI가 포커스 중인 항목** — 사용자가 "이거", "지금 가리키는", "선택한" 이라고 하면
   상태 파일을 읽으세요 (`$XDG_STATE_HOME` 우선, 없으면 아래 경로):

   ```bash
   cat "${XDG_STATE_HOME:-${TMPDIR:-/tmp}}/devrig/sysman.json"
   ```

   `{ updated_at, view, filter, focused, visible }` 형태입니다.
   - `focused` = 지금 커서가 가리키는 행 ("이거"의 정답)
   - `visible` = 화면에 나열된 행 목록(필터 적용 후) — "현재 화면" 질문에 사용
   - `filter` = 적용 중인 검색어 (있으면)
   - **`view`가 `system`이면** `focused`는 행이 아니라 **지금 화면의 라이브 디바이스 상태**(`{spec, ...메트릭}`, 위 `--json metrics`와 같은 구조)입니다 → "지금 내 CPU/메모리/온도/배터리 상태 어때?"를 새로 스캔 없이 화면 그대로 답하세요.

   이 파일은 **sysman 종료 시 삭제**됩니다. 즉 **파일이 없으면 sysman이 실행 중이 아니라는 뜻**이니 사용자에게 "sysman을 먼저 띄워 달라"고 알리세요. 파일이 있어도 `updated_at`이 오래됐으면 신선도를 함께 언급하세요.

## 답변 지침

- **간결하게**, 한국어로. 핵심(어떤 프로젝트/프로세스/포트)을 먼저.
- "죽여도 되나?" 류 질문: `project`/`cwd`/`process`를 근거로 판단.
  - `project`가 `"—"`이거나 `cwd`가 `/`이면 **시스템/GUI 프로세스일 가능성** → 종료 주의 경고.
  - 개발 서버(node 등)이고 사용자의 워크스페이스 경로면 보통 안전. 단, 본인이 직접 쓰는 프로젝트인지 확인 권유.
- **사용자가 명시적으로 요청하기 전에는 절대 프로세스를 종료하지 마세요.** 요청 시에는 해당 `pid`로 `kill`을 제안/실행하되, 먼저 대상(포트·프로젝트·pid)을 한 줄로 확인시키세요.
