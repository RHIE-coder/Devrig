---
description: DevRig toolkit(sysman)로 포트·프로세스·현재 포커스 항목에 대해 답하기
argument-hint: <포트/프로세스에 대한 질문>
allowed-tools: Bash(devrig:*), Bash(~/go/bin/devrig:*), Read
---

당신은 로컬 머신의 **포트/프로세스** 상태에 대한 사용자의 질문에 답합니다. DevRig의 `sysman` 도구를 통해 실데이터를 가져오세요.

사용자 질문: $ARGUMENTS

## 데이터 소스

1. **리스닝 포트 스냅샷 (JSON)**

   ```bash
   devrig run sysman --json ports
   ```

   각 항목: `port, addr, pid, process, project, cwd, cpu, mem, started, uptime_sec`.
   (`started`=RFC3339 시작시각, `uptime_sec`=실행 경과 초 → "며칠째 떠 있는지", "언제 띄웠는지" 답에 사용)
   `devrig`이 PATH에 없으면 `~/go/bin/devrig` 을 사용하세요.

2. **전체 프로세스 스냅샷 (CPU 내림차순, JSON)**

   ```bash
   devrig run sysman --json ps
   ```

   "CPU/MEM top N" 같은 질문은 이 출력을 정렬·상위 N개로 답하세요.

3. **현재 TUI가 포커스 중인 항목** — 사용자가 "이거", "지금 가리키는", "선택한" 이라고 하면
   상태 파일을 읽으세요 (`$XDG_STATE_HOME` 우선, 없으면 아래 경로):

   ```bash
   cat "${XDG_STATE_HOME:-${TMPDIR:-/tmp}}/devrig/sysman.json"
   ```

   `{ updated_at, view, filter, focused, visible }` 형태입니다.
   - `focused` = 지금 커서가 가리키는 행 ("이거"의 정답)
   - `visible` = 화면에 나열된 행 목록(필터 적용 후) — "현재 화면" 질문에 사용
   - `filter` = 적용 중인 검색어 (있으면)

   이 파일은 **sysman 종료 시 삭제**됩니다. 즉 **파일이 없으면 sysman이 실행 중이 아니라는 뜻**이니 사용자에게 "sysman을 먼저 띄워 달라"고 알리세요. 파일이 있어도 `updated_at`이 오래됐으면 신선도를 함께 언급하세요.

## 답변 지침

- **간결하게**, 한국어로. 핵심(어떤 프로젝트/프로세스/포트)을 먼저.
- "죽여도 되나?" 류 질문: `project`/`cwd`/`process`를 근거로 판단.
  - `project`가 `"—"`이거나 `cwd`가 `/`이면 **시스템/GUI 프로세스일 가능성** → 종료 주의 경고.
  - 개발 서버(node 등)이고 사용자의 워크스페이스 경로면 보통 안전. 단, 본인이 직접 쓰는 프로젝트인지 확인 권유.
- **사용자가 명시적으로 요청하기 전에는 절대 프로세스를 종료하지 마세요.** 요청 시에는 해당 `pid`로 `kill`을 제안/실행하되, 먼저 대상(포트·프로젝트·pid)을 한 줄로 확인시키세요.
