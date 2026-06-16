# Claude Platform Blueprint for Harness

> Claude Code 플랫폼의 내부 메커니즘을 하네스 설계자 관점에서 종합 정리.
> API/SDK 코드, 설치법, CLI 사용법은 제외. 플랫폼 구조와 하네스 설계에 영향을 주는 제약/동작만 포함.

---

**목차**

- [1. 디렉토리 구조와 자동 발견](#1-디렉토리-구조와-자동-발견)
- [2. 컨텍스트 윈도우 경제학](#2-컨텍스트-윈도우-경제학)
- [3. 확장 포인트 — Skills](#3-확장-포인트--skills)
- [4. 확장 포인트 — Subagents](#4-확장-포인트--subagents)
- [5. 확장 포인트 — Hooks](#5-확장-포인트--hooks)
- [6. 확장 포인트 — MCP](#6-확장-포인트--mcp)
- [7. 확장 포인트 — Plugins](#7-확장-포인트--plugins)
- [8. 확장 포인트 — Channels](#8-확장-포인트--channels)
- [9. 확장 포인트 — CLI/Headless](#9-확장-포인트--cliheadless)
- [10. 라이프사이클 이벤트와 분기 플래그](#10-라이프사이클-이벤트와-분기-플래그)
- [11. 보안 모델과 권한 계층](#11-보안-모델과-권한-계층)
- [12. 세션 라이프사이클과 Worktree](#12-세션-라이프사이클과-worktree)
- [13. 설정 시스템과 병합 규칙](#13-설정-시스템과-병합-규칙)
- [14. 비용 최적화 구조](#14-비용-최적화-구조)
- [15. 하네스 자체 평가 프레임워크](#15-하네스-자체-평가-프레임워크)
- [16. 프롬프트 엔지니어링과 가드레일](#16-프롬프트-엔지니어링과-가드레일)
- [17. 하네스 설계 권장사항](#17-하네스-설계-권장사항)
- [부록 A: 문서 참조 MANIFEST](#부록-a-문서-참조-manifest)
- [부록 B: 전체 문서 채택 현황](#부록-b-전체-문서-채택-현황-docsreviewclaude-ai)

---

## 1. 디렉토리 구조와 자동 발견

[→ 참조 문서](#ref-1-디렉토리-구조와-자동-발견)

### 1.1 Claude Code가 인식하는 구조

```
project-root/
├── CLAUDE.md                          # 프로젝트 지침서 (≤200줄)
├── .mcp.json                          # 팀 공유 MCP 서버
├── .worktreeinclude                   # worktree 복사 대상 gitignored 파일 목록
└── .claude/
    ├── settings.json      [committed] # 팀 설정: permissions, hooks, model, env
    ├── settings.local.json[gitignored]# 개인 오버라이드
    ├── skills/                        # 스킬 (SKILL.md 진입점)
    ├── agents/                        # 서브에이전트 정의
    ├── rules/                         # 조건부 지침 (paths: 스코핑)
    ├── commands/                      # 레거시 (skills 권장)
    ├── output-styles/                 # 출력 스타일 커스터마이징
    ├── agent-memory/      [committed] # 에이전트 영구 메모리
    └── agent-memory-local/[gitignored]# 에이전트 로컬 메모리
```

글로벌 레벨 (`~/.claude/`):
```
~/.claude/
├── CLAUDE.md              # 모든 프로젝트 개인 지침
├── settings.json          # 전 프로젝트 기본 설정
├── rules/                 # 전 프로젝트 개인 rules
├── skills/                # 전 프로젝트 개인 skills
├── agents/                # 전 프로젝트 개인 서브에이전트
└── projects/<project>/memory/  # Auto memory (MEMORY.md 인덱스)
```

### 1.2 자동 발견 제약

- Claude Code는 위 구조만 자동 발견. 임의 경로는 인식하지 않음
- `skills/` > `commands/` 우선. 같은 이름이면 skill이 이김
- `rules/`에 `paths:` 없으면 매 세션 로드 → CLAUDE.md와 같은 비용
- `@path` 임포트는 CLAUDE.md와 Rules에서만 동작 (자동 확장, 최대 5단계 재귀)
- Skill에서는 `@path` 대신 마크다운 링크로 참조 (Claude 판단 온디맨드)
- `.claude` 디렉토리는 protected path이지만 `commands/`, `agents/`, `skills/`, `worktrees/`는 예외 (Claude가 콘텐츠 생성 가능)

### 1.3 하네스 플러그인 구조 제안

```
harness/
├── .claude-plugin/
│   └── plugin.json                    # 매니페스트 (name, version, description)
├── skills/
│   ├── bootstrap/SKILL.md             # SessionStart 규칙 주입
│   ├── plan/SKILL.md                  # 계획 수립 워크플로우
│   ├── work/SKILL.md                  # 구현 워크플로우
│   ├── review/SKILL.md                # 코드 리뷰 오케스트레이션
│   └── compound/SKILL.md              # 지식 축적
├── agents/
│   ├── explorer.md                    # 읽기 전용 탐색 (haiku)
│   ├── implementer.md                 # 구현 (sonnet, 전체 도구)
│   ├── reviewer.md                    # 리뷰 (sonnet, 읽기 전용)
│   └── verifier.md                    # 검증 (haiku, Bash+Read)
├── hooks/hooks.json                   # 라이프사이클 훅 설정
├── .mcp.json                          # 플러그인 전용 MCP 서버
├── bin/                               # PATH에 추가되는 실행 파일
└── settings.json                      # 플러그인 기본 설정 (agent 키)
```

---

## 2. 컨텍스트 윈도우 경제학

[→ 참조 문서](#ref-2-컨텍스트-윈도우-경제학)

### 2.1 세션 시작 시 자동 로드 (~7,850 토큰, 전체의 ~4%)

| 순서 | 항목 | 토큰 | 비고 |
|:----:|------|:----:|------|
| 1 | System prompt | ~4,200 | Anthropic 하드코딩, 수정 불가 |
| 2 | Auto memory (MEMORY.md) | ~680 | 200줄/25KB 제한 |
| 3 | Environment info | ~280 | git status 포함 |
| 4 | MCP tools (deferred) | ~120 | 이름만, 스키마는 온디맨드 |
| 5 | Skill descriptions | ~450 | **compact 후 재주입 안 됨** |
| 6 | ~/.claude/CLAUDE.md | ~320 | 글로벌 개인 지침 |
| 7 | Project CLAUDE.md | ~1,800 | 프로젝트 규칙 |

### 2.2 작업 중 비용 패턴

| 이벤트 | 토큰 | 설명 |
|--------|:----:|------|
| 파일 읽기 (Read) | 1,000~3,000+ | 컨텍스트의 대부분. 터미널에선 한줄이지만 전체가 컨텍스트 진입 |
| Rule 자동 로드 | 200~400 | `paths:` 매칭 파일 작업 시 |
| Edit/Write 도구 | 300~600 | diff 형태로 진입 |
| Bash 출력 | 가변 | 전체 출력이 컨텍스트 진입 |
| Hook 출력 | 100~120 | `additionalContext` JSON으로만 진입 |
| Subagent 스폰 | 80 | 스폰 비용만. 내부는 별도 윈도우 |
| Subagent 반환 | ~420 | 요약만 메인에 반환 |

### 2.3 가시성 3단계 (비용 함정)

| 가시성 | 터미널 표시 | 컨텍스트 진입 |
|--------|:-----------:|:------------:|
| **hidden** | 안 보임 | 전체 |
| **brief** | 한줄 요약 | 전체 |
| **full** | 전체 표시 | 전체 |

→ 터미널에서 한줄로 보이는 파일 읽기도 실제로 수천 토큰을 소비.

### 2.4 Skill Description 예산

| 제약 | 값 |
|------|-----|
| 전체 예산 | 컨텍스트 윈도우의 **1%** (fallback 8,000자) |
| 개별 description 캡 | **250자** |
| `disable-model-invocation: true` | 설명 비용 **0** (컨텍스트 미진입) |
| 환경변수 조정 | `SLASH_COMMAND_TOOL_CHAR_BUDGET` |

설계 규칙:
- 스킬 10개 × 250자 = 2,500자 → 예산의 ~31%. 30개 넘으면 잘림 시작
- **핵심 용도를 첫 문장에 배치** (250자 캡에서 뒤는 잘림)
- 수동 전용 스킬은 `disable-model-invocation: true`로 비용 0
- `user-invocable: false` 스킬은 설명이 컨텍스트에 올라감 (Claude 전용 내부 스킬)

### 2.5 MCP Tool Search 옵션

| `ENABLE_TOOL_SEARCH` | 동작 |
|----------------------|------|
| (미설정, 기본) | 이름만 로드, 온디맨드 스키마 |
| `auto` | 10% 이내면 스키마 선로드, 초과 시 deferred |
| `auto:<N>` | N% 임계값 커스텀 |
| `false` | 모든 스키마 즉시 로드 |

- 서버 instructions 2KB, 도구 description 2KB에서 잘림 → 핵심을 앞쪽에 배치
- Sonnet 4+ / Opus 4+ 필요. Haiku 미지원

### 2.6 Compact 생존 규칙

| 항목 | Compact 후 | 비고 |
|------|:----------:|------|
| System prompt | ✅ 재주입 | 불변 |
| CLAUDE.md | ✅ 디스크에서 재로드 | 변경 반영됨 |
| Auto memory | ✅ 재로드 | |
| Rules | ✅ 재로드 | |
| **Skill descriptions** | ⚠️ 부분 소실 | 아래 상세 참조 |
| 대화 중 동적 컨텍스트 | ❌ 소실 | Hook으로 재주입 필요 |
| 서브에이전트 트랜스크립트 | ✅ 별도 저장 | 메인 compact 영향 없음 |

Compact 시 대화가 원래 토큰의 **~12%**로 압축됨.

#### Skill Description Compact 소실 상세

**소실 대상은 "미호출 스킬의 L1 카탈로그"이며, 이미 호출된 스킬은 보존된다.**

| 스킬 상태 | Compact 후 | 이유 |
|----------|:----------:|------|
| 이미 호출됨 (L2 합류) | ✅ 보존 | 대화 컨텍스트에 내용 포함 |
| **미호출 (L1 description만)** | ❌ 소실 | 세션 시작 시 주입된 카탈로그가 재주입 안 됨 |

**문제 시나리오:**

```
세션 시작 → 스킬 A, B, C, D description 로드 (L1 카탈로그)
→ 스킬 A 호출 (L2 지시문이 컨텍스트 합류)
→ compact 발생
→ 스킬 A: ✅ 정상 동작 (이미 합류)
→ 스킬 B, C, D: ❌ Claude가 존재 자체를 모름 → 자발적 호출 불가
→ 사용자가 "/B" 명시 호출: ✅ 동작 (description 없어도 명시 호출은 가능)
```

→ 소실되는 것은 "이런 스킬들이 있다"는 **카탈로그**. Claude가 **어떤 스킬을 호출할 수 있는지** 모르게 되는 것이지, 스킬 기능 자체가 사라지는 것은 아님. 사용자가 `/skill명`으로 직접 호출하면 여전히 동작함.

**이중 방어 전략:**

**(1) SessionStart Hook + compact matcher (자동 재주입)**

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{
        "type": "command",
        "command": "echo '{\"available_skills\": [\"/plan - 설계 수립\", \"/review - 코드 리뷰\", \"/work - 구현\"]}'"
      }]
    }]
  }
}
```

compact 후 세션 재개 시 `matcher: "compact"`가 트리거 → `additionalContext`로 스킬 목록 재주입.

**(2) CLAUDE.md에 스킬 카탈로그 명시 (디스크 재로드 활용)**

```markdown
## 사용 가능한 스킬
- /plan — 설계 수립. 작업 분해, 접근법 제안
- /review — 코드 리뷰. 보안, 성능, 스타일 검사
- /work — 구현. 계획 기반 코드 작성
```

CLAUDE.md는 compact 후 디스크에서 재로드되므로, 여기에 기재된 스킬 카탈로그는 항상 살아남음.

**(3) 조합 권장:** (1) + (2) 이중 적용. CLAUDE.md가 기본 방어, Hook이 구조화된 보강.

### 2.7 컨텍스트 엔지니어링 3종 프리미티브

> 출처: claude-cookbooks `context_engineering_tools.ipynb`

API 레벨에서 제공되는 3종 컨텍스트 관리 프리미티브. CLI에서는 `/compact`와 auto memory로 간접 활용.

| 프리미티브 | 무엇을 교환 | CLI 대응 | 추론 비용 |
|-----------|------------|----------|----------|
| **Compaction** | 상세 → 요약 | `/compact`, auto-compaction | 요약 생성 비용 |
| **Tool Clearing** | 오래된 도구 결과 제거 | 없음 (API 전용) | **제로** |
| **Memory** | 크로스세션 지식 | auto memory (`MEMORY.md`) | 도구 호출 오버헤드 |

**조합 시 핵심 규칙:** Tool Clearing과 Memory를 동시 사용할 때 `exclude_tools: ["memory"]` 설정 필수 — clearing이 메모리 읽기/쓰기를 제거하면 학습 패턴을 반복 조회하게 되어 비용 급증.

**의사결정 프레임워크:**

| 상황 | 권장 |
|------|------|
| 수일/수주 걸친 세션 | Memory |
| 재조회 가능한 큰 도구 결과 | Clearing |
| 대화가 주요 컨텍스트 | Compaction |
| 재조회 불가능한 도구 결과 | Compaction (clearing 아닌) |
| 매 세션 새로 시작 | Memory 건너뛰기 |
| 윈도우 이내 세션 | Compaction 건너뛰기 |

### 2.8 즉시 컴팩션 패턴 (Instant Compaction)

> 출처: claude-cookbooks `session_memory_compaction.ipynb`

| 전략 | 방식 | 사용자 대기 |
|------|------|:----------:|
| 전통적 | 한계 도달 시 요약 생성 | 40+초 |
| **즉시** | 소프트 임계값에서 백그라운드 선제 요약 | **0초** |

**세션 메모리 프롬프트 구조 (6단계):**

```
## User Intent — 원래 요청 + 정제사항
## Completed Work — 수행된 작업, 정확한 식별자
## Errors & Corrections — 사용자 수정 원문
## Active Work — 작업 중단 지점, 부분 결과
## Pending Tasks — 명시 요청 vs 암시
## Key References — ID, 경로, URL, 값, 컨텍스트
```

**압축 우선순위:** 사용자 수정 > 오류 > 진행 중 작업 > 완료 작업.

CLI 하네스 적용: Hook(PostToolUse)으로 토큰 사용량 모니터링 → 임계값 도달 시 `Summarize from here` 자동 트리거. 위 6단계 구조를 커스텀 지시문 템플릿으로 사용.

---

## 3. 확장 포인트 — Skills

[→ 참조 문서](#ref-3-확장-포인트--skills)

### 3.1 에이전틱 루프 내 위치

Skills는 **루프 내부에서 온디맨드 주입**되는 확장. 세션 시작 시 description만, 호출 시 전체 내용이 메인 컨텍스트에 합류.

### 3.2 Progressive Disclosure 3단계

스킬 로딩은 3단계로 나뉜다:

| 단계 | 로딩 시점 | 내용 |
|------|----------|------|
| 메타데이터 | 세션 시작 시 항상 | YAML frontmatter (name, description). 전체 예산: 컨텍스트의 1%, 개별 description 250자 캡 |
| 지시문 | 트리거 시 | SKILL.md 본문. 권장 5,000토큰 미만 |
| 리소스/코드 | 실행 시 | scripts/, references/ — 실행 결과만 컨텍스트 진입. 직접 비용 0 |

description 예산 (1%, fallback 8,000자) 내에서 스킬 수가 많으면 잘림 발생 — §2.4 참조.

### 3.3 Frontmatter 전체 필드

| 필드 | 필수 | 설명 |
|------|:----:|------|
| `name` | - | `/` 커맨드명. 생략 시 디렉토리명. 소문자+하이픈, 64자 |
| `description` | 권장 | Claude 자동 호출 판단용. 250자 캡. **핵심을 앞에** |
| `argument-hint` | - | 자동완성 시 인자 힌트 |
| `disable-model-invocation` | - | `true` = 사용자만 호출. 설명도 컨텍스트 미진입 |
| `user-invocable` | - | `false` = `/` 메뉴 숨김. Claude만 호출 |
| `allowed-tools` | - | 스킬 활성 시 승인 없이 사용 가능한 도구 |
| `model` | - | 스킬 활성 시 모델 오버라이드 |
| `effort` | - | effort 오버라이드: `low`/`medium`/`high`/`max` |
| `context` | - | `fork` = 격리 서브에이전트에서 실행 |
| `agent` | - | `context: fork` 시 에이전트 타입 (`Explore`, `Plan`, 커스텀) |
| `hooks` | - | 스킬 라이프사이클 훅 |
| `paths` | - | glob 패턴. 매칭 파일 작업 시에만 자동 로드 |
| `shell` | - | `bash`(기본) 또는 `powershell` |

### 3.4 호출 제어 매트릭스

| 설정 | 사용자 호출 | Claude 호출 | 컨텍스트 비용 |
|------|:---------:|:---------:|:-----------:|
| (기본) | O | O | 설명 항상, 전체는 호출 시 |
| `disable-model-invocation: true` | O | X | **0** (설명 미진입) |
| `user-invocable: false` | X | O | 설명 항상, 전체는 호출 시 |

### 3.5 문자열 치환

| 변수 | 설명 |
|------|------|
| `$ARGUMENTS` / `$0`, `$1` | 전체/위치별 인자 |
| `${CLAUDE_SESSION_ID}` | 현재 세션 ID |
| `${CLAUDE_SKILL_DIR}` | SKILL.md 위치 디렉토리 |

### 3.6 동적 컨텍스트 주입 (`` !`command` ``)

셸 명령을 **전처리 단계**에서 실행. Claude가 아닌 클라이언트가 실행하며 결과만 스킬에 삽입.
- 0 tool call로 동적 정보 주입
- `disableSkillShellExecution: true`로 보안 비활성화 가능
- Multi-line: `` ```! ... ``` `` 블록 지원

### 3.7 배치 위치와 우선순위

enterprise > personal (`~/.claude/skills/`) > project (`.claude/skills/`). Plugin은 네임스페이스(`/plugin:skill`)로 충돌 없음.

### 3.8 allowed-tools 리터럴 레퍼런스

**권한 불요 도구 (기본 허용):**

| 도구 | 용도 |
|------|------|
| `Read`, `Grep`, `Glob` | 파일 읽기/검색 |
| `Agent`, `SendMessage` | 서브에이전트 스폰/메시지 |
| `ToolSearch` | deferred 도구 스키마 로드 |
| `TodoWrite` | 작업 목록 관리 |
| `TaskCreate/Get/List/Update/Stop/Output` | 비동기 작업 관리 |
| `CronCreate/Delete/List` | 예약 작업 |
| `EnterPlanMode` | 계획 모드 진입 |
| `EnterWorktree` / `ExitWorktree` | Worktree 관리 |
| `LSP` | 언어 서버 |
| `AskUserQuestion` | 사용자 질문 |

**권한 필요 도구:**

| 도구 | 용도 |
|------|------|
| `Bash` / `PowerShell` | 셸 명령 실행 |
| `Edit` / `Write` / `NotebookEdit` | 파일 수정/생성 |
| `ExitPlanMode` | 계획 모드 종료 (구현 시작) |
| `Skill` | 스킬 호출 |
| `WebFetch` / `WebSearch` | 웹 요청/검색 |

**패턴 문법:**

```yaml
# 스페이스 구분
allowed-tools: Read Grep Bash

# YAML 리스트 + 인자 패턴
allowed-tools:
  - Read
  - Grep
  - "Bash(npm test *)"       # 인자 패턴 매칭
  - "mcp__server__tool"      # MCP 도구 (서버__도구명)
```

서브에이전트 `tools`/`disallowedTools`에서의 Agent 제한:
- `tools: Agent(worker, researcher)` — 특정 에이전트 타입만 스폰 허용
- `disallowedTools: Agent(Explore)` — 특정 에이전트 차단 (tools보다 우선)

### 3.9 Skill Hooks — 포매터와 라이프사이클

**전역 포매터 Hook (settings.json):**

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
      }]
    }]
  }
}
```

→ 모든 Edit/Write 후 자동 포매팅. 스킬과 무관하게 전역 적용.

**Skill frontmatter Hook:**

```yaml
---
name: lint-fix
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "jq -r '.tool_input.file_path' | xargs eslint --fix"
  Stop:
    - hooks:
        - type: command
          command: "./scripts/final-check.sh"
---
```

**스코프 규칙:**
- Skill frontmatter 훅은 **스킬 활성 시에만** 실행, 비활성화 시 자동 정리
- `Stop` 이벤트는 부모 세션에서 `SubagentStop`으로 변환
- Plugin `hooks/hooks.json` = 플러그인 활성 시 적용 (standalone과 동일 형식)

**결합 전략:**

| 대상 | 위치 | 시점 |
|------|------|------|
| 프로젝트 전역 포매터 | `.claude/settings.json` | 항상 |
| 스킬별 린터/검증 | Skill frontmatter `hooks:` | 스킬 활성 시만 |
| 플러그인 포매터 | `hooks/hooks.json` | 플러그인 활성 시 |

### 3.10 context: fork 심층

| 속성 | 기본 (inline) | `context: fork` |
|------|:------------:|:---------------:|
| 실행 위치 | 메인 컨텍스트 | 격리 서브에이전트 |
| 대화 히스토리 | 접근 가능 | **접근 불가** |
| CLAUDE.md | 이미 로드됨 | 별도 로드 (추가 비용) |
| 다른 스킬 | 접근 가능 | `skills:` 명시 프리로드만 |
| 메인 비용 | SKILL.md 전체 토큰 | ~80t (스폰) + ~420t (반환) |

**`agent` 필드 옵션:**

| 값 | 모델 | 도구 | 용도 |
|----|:----:|------|------|
| `Explore` | Haiku | 읽기 전용 | 탐색/분석 |
| `Plan` | 상속 | 읽기 전용 | 설계/계획 |
| `general-purpose` | 상속 | 전체 | 범용 |
| 커스텀 에이전트명 | frontmatter 정의 | frontmatter 정의 | 역할별 |

**사용 시점:**
- 대화 히스토리 불필요한 독립 작업 (분석, 생성, 검증)
- 메인 컨텍스트 오염 방지가 필요한 대규모 파일 처리
- 병렬 실행이 필요한 경우

**주의:**
- fork 에이전트는 메인의 이전 대화를 모름 → 필요 컨텍스트는 SKILL.md나 `$ARGUMENTS`로 전달
- CLAUDE.md가 별도 로드 → 무거운 CLAUDE.md는 fork 비용 증가
- 반환 값은 요약만 (~420t) → 대용량 결과는 파일에 저장하고 경로만 반환

### 3.11 paths — 자동 로드 전략

```yaml
---
name: react-helper
paths: "src/components/**/*.tsx"
description: React 컴포넌트 작업 시 패턴 가이드
---
```

**동작:**
1. 사용자가 `src/components/Button.tsx` 작업 → glob 매칭
2. 스킬 전체(SKILL.md)가 컨텍스트에 자동 주입 (L2 로드)
3. 매칭 안 되면 description만 유지 (L1, ~100t)

**토큰 영향:**
- 매칭 시: L2 전체 (~5,000t 이하)
- 비매칭: L1 메타데이터만 (~100t)
- paths glob 패턴 자체는 비용 0

**설계 규칙:**

| DO | DON'T |
|----|-------|
| 좁은 패턴: `src/components/**/*.tsx` | 광범위: `**/*.ts` (거의 모든 작업에서 로드) |
| 파일 유형 특정: `*.prisma`, `*.proto` | 루트 glob: `*` |
| 디렉토리 스코핑: `tests/**/*` | 다중 광범위 조합 |

**주의:**
- 여러 스킬의 paths가 같은 파일에 매칭되면 **모두 로드** → 컨텍스트 폭발
- paths는 description 예산(1%)과 별도. 매칭 시 L2 전체 비용 발생
- SKILL.md에서 `@path`는 미동작 → 마크다운 링크로 참조 (Claude 온디맨드 판단)

### 3.12 스킬별 모델 전략

```yaml
---
name: quick-lint
model: haiku
effort: low
---
```

**모델 해석 우선순위:**
```
1. CLAUDE_CODE_SUBAGENT_MODEL 환경변수
2. Skill frontmatter model 필드
3. 메인 대화 모델
```

**역할별 모델 가이드:**

| 역할 | 모델 | effort | 근거 |
|------|:----:|:------:|------|
| 분류/필터링 | `haiku` | `low` | 최소 비용, 기계적 작업 |
| 탐색/읽기 전용 | `haiku` | - | Explore 기본, 경량 |
| 코드 리뷰/분석 | `sonnet` | `high` | 품질-비용 균형 |
| 구현/리팩터링 | `sonnet`/`inherit` | - | 전체 도구 필요 |
| 아키텍처 설계 | `opus`/`inherit` | `max` | 최고 품질 판단 |

`model: haiku` + `effort: low` → 최소 비용 조합 (분류, 포매팅).
`model: inherit` = 부모 세션 모델 사용.

---

## 4. 확장 포인트 — Subagents

[→ 참조 문서](#ref-4-확장-포인트--subagents)

### 4.1 에이전틱 루프 내 위치

Subagents는 **루프 바깥에서 독립 루프를 생성**하는 확장. 자체 컨텍스트 윈도우에서 작업 후 요약만 반환.

### 4.2 빌트인 서브에이전트

| 에이전트 | 모델 | 도구 | CLAUDE.md |
|---------|:----:|------|:---------:|
| **Explore** | Haiku | 읽기 전용 | 건너뜀 |
| **Plan** | 상속 | 읽기 전용 | 건너뜀 |
| **General-purpose** | 상속 | 전체 | 로드 |

### 4.3 Frontmatter 전체 필드

| 필드 | 필수 | 설명 |
|------|:----:|------|
| `name` | O | 고유 식별자. 소문자+하이픈 |
| `description` | O | Claude 위임 판단 기준 |
| `tools` | - | allowlist. 생략 시 전부 상속 |
| `disallowedTools` | - | denylist. tools보다 먼저 적용 |
| `model` | - | `sonnet`/`opus`/`haiku`/`inherit` |
| `permissionMode` | - | 권한 모드 오버라이드 |
| `maxTurns` | - | 최대 에이전틱 턴 수 |
| `skills` | - | 프리로드 스킬 (전체 내용 주입, 온디맨드 아님) |
| `mcpServers` | - | 인라인 정의 또는 기존 서버 참조 |
| `hooks` | - | 서브에이전트 전용 훅 |
| `memory` | - | 영구 메모리: `user`/`project`/`local` |
| `background` | - | `true` = 항상 백그라운드 |
| `effort` | - | effort 오버라이드 |
| `isolation` | - | `worktree` = 격리된 git worktree |
| `initialPrompt` | - | `--agent`로 메인 에이전트 실행 시 첫 턴 자동 제출 |

### 4.4 메인 세션 vs 서브에이전트 컨텍스트

| 속성 | 메인 세션 | 서브에이전트 |
|------|----------|-------------|
| System prompt | ~4,200 토큰 | ~900 토큰 (축약) |
| CLAUDE.md | 로드 | 로드 (빌트인 Explore/Plan은 skip) |
| Auto memory | 로드 | 미로드 (`memory:` 있으면 자체 MEMORY.md) |
| Skills | description 로드 | 상속 안 함 (`skills:` 필드로 명시 프리로드만) |
| 재귀 | Agent 도구 사용 | Agent 도구 미포함 (재귀 방지) |
| MCP | 전체 연결 | 인라인 정의 = 서브에이전트 전용 (메인 비용 0) |

### 4.5 권한 상속

| 부모 모드 | 서브에이전트 |
|----------|------------|
| `bypassPermissions` | **무조건 상속** (frontmatter 무시) |
| `auto` | **무조건 상속** (classifier가 서브에이전트 도구도 평가) |
| 그 외 | frontmatter `permissionMode`로 오버라이드 가능 |

### 4.6 모델 해석 우선순위

```
1. CLAUDE_CODE_SUBAGENT_MODEL 환경변수
2. 호출 시 model 파라미터
3. frontmatter model 필드
4. 메인 대화의 모델
```

### 4.7 Plugin Agent 보안 제약

Plugin `agents/`의 `hooks`, `mcpServers`, `permissionMode` frontmatter가 **무시됨**. 필요하면 `.claude/agents/`로 복사해야 함.

---

## 5. 확장 포인트 — Hooks

[→ 참조 문서](#ref-5-확장-포인트--hooks)

### 5.1 에이전틱 루프 내 위치

Hooks는 **루프 바깥의 이벤트 콜백**. LLM 불관여. 결정론적 실행.

### 5.2 Hook 이벤트 전체 (24+)

| 이벤트 | 발화 시점 | matcher 대상 |
|--------|---------|-------------|
| **SessionStart** | 세션 시작/재개 | `startup`, `resume`, `clear`, `compact` |
| **UserPromptSubmit** | 프롬프트 제출 시 (Claude 처리 전) | - |
| **PreToolUse** | 도구 실행 전. **차단 가능** | 도구 이름 |
| **PermissionRequest** | 권한 다이얼로그 표시 시 | 도구 이름 |
| **PermissionDenied** | auto mode classifier 거부 시 | 도구 이름 |
| **PostToolUse** | 도구 성공 후 | 도구 이름 |
| **PostToolUseFailure** | 도구 실패 후 | 도구 이름 |
| **Notification** | 알림 발생 시 | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| **SubagentStart** | 서브에이전트 시작 | 에이전트 타입 |
| **SubagentStop** | 서브에이전트 완료 | 에이전트 타입 |
| **TaskCreated** | 작업 생성 시 | - |
| **TaskCompleted** | 작업 완료 시 | - |
| **Stop** | Claude 응답 완료 시 | - |
| **StopFailure** | API 에러로 턴 종료 | `rate_limit`, `auth_failed`, `billing_error` 등 |
| **TeammateIdle** | agent team 팀원 idle 전환 | - |
| **InstructionsLoaded** | CLAUDE.md/rules 로드 시 | `session_start`, `nested_traversal`, `path_glob_match` 등 |
| **ConfigChange** | 설정 파일 변경 시 | `user`/`project`/`local`/`policy_settings`, `skills` |
| **CwdChanged** | 작업 디렉토리 변경 시 | - |
| **FileChanged** | 감시 파일 변경 시 | 파일명 |
| **WorktreeCreate** | worktree 생성 시 | - |
| **WorktreeRemove** | worktree 삭제 시 | - |
| **PreCompact** | compact 전 | `manual`, `auto` |
| **PostCompact** | compact 후 | `manual`, `auto` |
| **Elicitation** | MCP 서버 사용자 입력 요청 | MCP 서버 이름 |
| **ElicitationResult** | MCP 입력 응답 | MCP 서버 이름 |
| **SessionEnd** | 세션 종료 | `clear`, `resume`, `logout` 등 |

### 5.3 입출력 구조

**입력** (stdin JSON):
```json
{
  "session_id": "abc123",
  "cwd": "/Users/sarah/myproject",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

**Exit Code 의미:**

| exit code | 동작 |
|:---------:|------|
| **0** | 진행 허용. stdout → 컨텍스트 추가 (SessionStart, UserPromptSubmit) |
| **2** | **차단**. stderr → Claude에 피드백 |
| 기타 | 진행. 트랜스크립트에 에러 표시 |

**구조화 JSON 출력** (exit 0 + stdout):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use rg instead of grep"
  }
}
```

`permissionDecision` 값: `allow`, `deny`, `ask`, `defer`

### 5.4 `if` 필드 — 인자 패턴 필터

matcher는 도구 이름만, `if`는 인자까지 필터:
```json
{ "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(git *)", "command": "./check-git.sh" }] }
```

### 5.5 Hook 타입 4가지

| 타입 | 토큰 비용 | 용도 |
|------|:--------:|------|
| **command** | 0 | 결정론적 검증 (기본값, 우선 사용) |
| **http** | 0 | 외부 웹훅 |
| **prompt** | haiku 1턴 | 판단이 필요한 yes/no |
| **agent** | 다중 턴 | 도구 사용 검증 (최대 50턴, 60초) |

### 5.6 Hook과 권한 모드

- **PreToolUse 훅은 권한 모드 체크 전에 실행됨**
- `permissionDecision: "deny"` → `bypassPermissions`에서도 차단
- `permissionDecision: "allow"` → settings의 deny 규칙은 무시 불가
- **Hook은 제한 강화만 가능, 완화 불가**

### 5.7 복수 Hook 실행 규칙

- 매칭되는 모든 훅이 **병렬 실행**, 동일 명령 자동 중복 제거
- 결정 충돌 시 **가장 제한적인 것 적용**: deny > ask > allow
- 복수 PreToolUse 훅이 `updatedInput` 수정 시 비결정론적 (마지막 완료 훅 적용)

### 5.8 설정 위치

| 위치 | 스코프 |
|------|--------|
| `~/.claude/settings.json` | 전 프로젝트 |
| `.claude/settings.json` | 프로젝트 (VCS) |
| `.claude/settings.local.json` | 프로젝트 (개인) |
| Managed policy | 조직 전체 |
| Plugin `hooks/hooks.json` | 플러그인 활성 시 |
| Skill/Agent frontmatter | 컴포넌트 활성 시 |

### 5.9 주요 함정

| 함정 | 원인/해결 |
|------|---------|
| Hook stdout 컨텍스트 진입 규칙 | exit 0일 때 stdout은 기본적으로 디버그 로그만. **예외: SessionStart, UserPromptSubmit에서는 exit 0 stdout이 컨텍스트에 진입.** 그 외 이벤트는 `additionalContext` JSON 사용 |
| Stop hook 무한루프 | `stop_hook_active: true`일 때 `exit 0`으로 조기 반환 필수 |
| PermissionRequest 비대화형 미작동 | `-p` 모드에서는 `PreToolUse` 사용 |
| JSON 파싱 실패 | `~/.zshrc`의 `echo`가 JSON 앞에 출력 → `[[ $- == *i* ]]` 가드 |

---

## 6. 확장 포인트 — MCP

[→ 참조 문서](#ref-6-확장-포인트--mcp)

### 6.1 에이전틱 루프 내 위치

MCP는 **루프 내부에서 도구를 확장**하는 프로토콜. 외부 서비스를 Claude의 도구로 연결.

### 6.2 전송 방식

| 전송 | 설명 |
|------|------|
| **HTTP** (권장) | 원격 클라우드 서비스 |
| **SSE** (deprecated) | 원격 이벤트 스트림 |
| **stdio** | 로컬 프로세스 |

### 6.3 설치 스코프와 우선순위

| 스코프 | 저장 위치 | 우선순위 |
|--------|----------|:-------:|
| **local** | `~/.claude.json` (프로젝트별) | 1 (최고) |
| **project** | `.mcp.json` (VCS) | 2 |
| **user** | `~/.claude.json` | 3 |

환경변수 확장: `${VAR}` 또는 `${VAR:-default}` — `command`, `args`, `env`, `url`, `headers`에서 사용.

### 6.4 인증

- **OAuth 2.0**: 토큰 자동 갱신, 시크릿은 시스템 키체인에 저장
- **headersHelper**: 임의 셸 명령으로 동적 헤더 생성 (Kerberos, 단기 토큰 등). 매 연결마다 실행, 10초 타임아웃

### 6.5 출력 제한

| 설정 | 기본값 |
|------|--------|
| 경고 임계값 | 10,000 토큰 |
| `MAX_MCP_OUTPUT_TOKENS` | 25,000 토큰 |

초과 출력은 디스크 저장 후 파일 참조로 대체.

### 6.6 하네스 설계 시 주의

- 서버 연결이 세션 중 **무경고로 끊어질 수 있음** → `/mcp`로 상태 확인 필요
- 인라인 MCP 정의 (서브에이전트 전용) = 메인 컨텍스트 비용 0
- `claude mcp serve`로 Claude Code 자체를 MCP 서버로 노출 가능 → 에이전트 체이닝 활용

---

## 7. 확장 포인트 — Plugins

[→ 참조 문서](#ref-7-확장-포인트--plugins)

### 7.1 Plugin = 패키징 레이어

Skills, Agents, Hooks, MCP, LSP, bin을 하나의 배포 단위로 묶음. 네임스페이스(`/plugin:skill`)로 충돌 방지.

### 7.2 매니페스트 (`plugin.json`)

```json
{ "name": "harness", "description": "...", "version": "1.0.0" }
```

### 7.3 Plugin 컴포넌트별 제약

| 컴포넌트 | 위치 | 제약 |
|---------|------|------|
| Skills | `skills/` | standalone과 동일 |
| Agents | `agents/` | **`hooks`, `mcpServers`, `permissionMode` 무시됨** |
| Hooks | `hooks/hooks.json` | settings.json hooks와 동일 형식 |
| MCP | `.mcp.json` | `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` 환경변수 |
| bin | `bin/` | 활성 시 PATH 자동 추가 |
| Settings | `settings.json` | 현재 `agent` 키만 지원 |

### 7.4 개발/테스트

- `claude --plugin-dir ./my-plugin` — 로컬 테스트
- `/reload-plugins` — 변경사항 즉시 반영 (재시작 불필요)

---

## 8. 확장 포인트 — Channels

[→ 참조 문서](#ref-8-확장-포인트--channels)

### 8.1 에이전틱 루프 내 위치

Channels는 **루프 바깥에서 외부 이벤트를 Push**하는 확장. MCP가 "Claude → 외부 질의"인 반면, Channel은 "외부 → Claude에 이벤트 전달".

| 패턴 | 방향 | 예시 |
|------|:----:|------|
| MCP | Claude → 외부 | DB 쿼리, API 호출 |
| Remote Control | 사용자 → 세션 | 브라우저/모바일 세션 조작 |
| **Channel** | **외부 → 세션** | CI 실패 알림, 채팅 메시지 |

### 8.2 아키텍처

```
외부 시스템 → [Channel MCP Server (로컬)] → stdio → Claude Code 세션
                      ↑                              ↓
                reply 도구 ← ──────────── Claude 응답 (양방향 시)
```

- Channel = MCP 서버 + `claude/channel` capability 선언
- Claude Code가 subprocess로 스폰 → stdio 전송
- `notifications/claude/channel` 이벤트로 메시지 전달

### 8.3 지원 플랫폼

| 플랫폼 | 연결 방식 | 제약 |
|--------|---------|------|
| Telegram | Bot API 폴링 | BotFather 봇 + 토큰 |
| Discord | Bot + Gateway | Message Content Intent |
| iMessage | macOS Messages DB | macOS 전용, Full Disk Access |
| fakechat | localhost 웹 UI | 데모용, Bun 런타임 |
| Custom | MCP Server 직접 구현 | `--dangerously-load-development-channels` |

### 8.4 Capability 선언

| Capability | 필수 | 용도 |
|-----------|:----:|------|
| `claude/channel` | O | 이벤트 수신 등록 |
| `claude/channel/permission` | - | 원격 Permission Relay |
| `tools` | - | 양방향 (reply 도구 등록) |

**성숙도 단계:**
1. **단방향**: `claude/channel` + 이벤트 발행만
2. **양방향**: + `tools` capability + reply 도구 핸들러 + `instructions`
3. **Sender 게이팅**: + allowlist 로드 + sender ID 체크
4. **Permission Relay**: + `claude/channel/permission` + verdict 파싱

### 8.5 Permission Relay

승인된 원격 사용자가 **도구 실행을 승인/거부**:

1. Claude Code → `permission_request` 발행 (request_id, tool_name, description, input_preview)
2. Channel 서버 → 플랫폼 전달
3. 원격 사용자 → `yes <id>` / `no <id>` 응답
4. Channel 서버 → verdict 발행 (`allow` / `deny`)

- `request_id`: 5자 소문자 (`l` 제외 — 모바일 1/I/l 혼동 방지)
- 로컬 터미널 다이얼로그와 **병렬** — 먼저 응답한 쪽이 적용
- **보안**: allowlist 멤버 = 도구 실행 권한. **sender ID** 기반 게이팅 필수 (채팅방 ID 아님)

### 8.6 이벤트 포맷과 `meta` 주의

```typescript
await mcp.notification({
  method: 'notifications/claude/channel',
  params: { content: 'build failed', meta: { severity: 'high', run_id: '1234' } },
})
```

Claude 컨텍스트: `<channel source="my-channel" severity="high" run_id="1234">build failed</channel>`

- `meta` 키: 문자, 숫자, 언더스코어만. **하이픈 키는 무경고 드롭** (`run-id` → 소실)
- `instructions` 필드: 시스템 프롬프트에 주입. 이벤트 포맷/응답 방법 정의

### 8.7 설정

```bash
claude --channels plugin:telegram@claude-plugins-official
```

**Enterprise 정책:**
```json
{ "channelsEnabled": true, "allowedChannelPlugins": [{ "marketplace": "...", "plugin": "..." }] }
```

- `channelsEnabled` 미설정 = 채널 완전 차단
- `allowedChannelPlugins: []` (빈 배열) = 모든 채널 플러그인 차단
- Custom 채널은 `--dangerously-load-development-channels` 필요 (개발 전용, 확인 프롬프트 표시)

### 8.8 하네스 활용 패턴

| 패턴 | 구조 |
|------|------|
| CI 실패 → 자동 디버그 | Webhook Channel → 에러 로그 push → Claude 분석 → reply |
| 모니터링 알림 → 자동 진단 | Alert Channel → 메트릭 push → Claude 진단 |
| 채팅 브릿지 | Telegram/Discord → 질문 → 로컬 파일 작업 → 동일 채팅 답변 |

---

## 9. 확장 포인트 — CLI/Headless

[→ 참조 문서](#ref-9-확장-포인트--cliheadless)

### 9.1 에이전틱 루프 내 위치

CLI/Headless는 **루프의 진입점과 출력 포맷을 프로그래밍**하는 확장. 대화형 세션과 비대화형 파이프라인을 선택.

### 9.2 `-p` 모드 (비대화형)

```bash
claude -p "What does the auth module do?"                     # 텍스트
claude -p "Summarize" --output-format json                    # JSON
claude -p "Fix bug" --allowedTools "Read,Edit,Bash"           # 도구 승인
cat error.log | claude -p "Explain root cause" > analysis.txt # 파이프라인
```

**출력 포맷:**

| 포맷 | 필드 | 용도 |
|------|------|------|
| `text` | 평문 | 기본 |
| `json` | `result`, `session_id`, `structured_output` | 구조화 추출 |
| `stream-json` | 라인 구분 JSON | 실시간 스트리밍 |

**JSON Schema 강제:**
```bash
--output-format json --json-schema '{"type":"object","properties":{"functions":{"type":"array"}}}'
```
→ `structured_output`에 스키마 준수 결과. 파이프라인 중간 처리에 필수.

### 9.3 도구 제어 계층

```
--disallowedTools (최강: 모델 컨텍스트에서 제거, 도구 존재 자체를 모름)
  ↓
--tools (중간: 사용 가능 도구 집합 정의)
  ↓
--allowedTools (완화: 자동 승인, 도구는 보이지만 확인 건너뜀)
```

```bash
# 읽기 전용 에이전트
claude --tools "Read,Grep,Glob" --permission-mode plan -p "analyze this"

# 위험 명령 제거
claude --disallowedTools "Bash(rm *)" "Bash(git push *)" -p "refactor"
```

**패턴 매칭 주의:**
- `Bash(git diff *)` (스페이스+별표) → 안전 ✅
- `Bash(git diff*)` (스페이스 없음) → `git diff-index`도 매칭 ⚠️

### 9.4 시스템 프롬프트 구성

| 플래그 | 동작 |
|--------|------|
| `--system-prompt` | 기본 프롬프트 **전체 교체** (빌트인 기능 소실) |
| `--system-prompt-file` | 파일에서 전체 교체 (`--system-prompt`와 상호 배타) |
| `--append-system-prompt` | 기본에 **추가** (안전, 권장) |
| `--append-system-prompt-file` | 파일에서 추가 |

→ 대부분 하네스에서 `--append-system-prompt` 권장. 교체하면 빌트인 도구 설명/안전 지침 소실.

### 9.5 `--bare` 모드

```bash
claude --bare -p "query" \
  --append-system-prompt "Custom instructions" \
  --settings file-or-json \
  --mcp-config file-or-json
```

**건너뛰는 것**: Settings, Hooks, Skills, Plugins, MCP, Auto Memory, CLAUDE.md
**적용되는 것**: CLI 플래그만

- `CLAUDE_CODE_SIMPLE` 환경변수 설정됨 → Hook에서 bare 모드 감지 가능
- CI 파이프라인에서 **재현 가능한 실행 환경** 보장 (팀원 설정 차이 제거)

### 9.6 비용/턴 제어

| 플래그 | 용도 | 제약 |
|--------|------|------|
| `--max-turns` | 에이전틱 턴 제한 | `-p` 모드만 |
| `--max-budget-usd` | API 비용 상한 | `-p` 모드만 |
| `--fallback-model` | 과부하 시 자동 전환 | `-p` 모드만 |
| `--effort` | effort 레벨 (low/medium/high/max) | `max`만 Opus 전용, 설정 미저장 |

### 9.7 세션 연속성

```bash
session_id=$(claude -p "Start review" --output-format json | jq -r '.session_id')
claude -p "Continue" --resume "$session_id"         # ID로 재개
claude -p "Follow up" --continue                    # 최근 세션
claude -p "Branch" --continue --fork-session        # 분기
```

### 9.8 `-p` 모드 제약

| 제약 | 대안 |
|------|------|
| `/` 슬래시 커맨드 미작동 | `--append-system-prompt`로 지침 주입 |
| `PermissionRequest` 훅 미발화 | `PreToolUse` 훅 사용 |
| auto classifier 반복 차단 시 세션 중단 | `--allowedTools`로 명시 승인 |
| 사용자 상호작용 불가 | `--permission-mode dontAsk`/`bypassPermissions` |

### 9.9 하네스 CI 패턴

```bash
# 재현 가능 분석
claude --bare -p --output-format json \
  --json-schema '{"type":"object","properties":{"issues":{"type":"array"}}}' \
  --max-turns 5 --max-budget-usd 2.00 \
  "Review for security issues"

# 커밋 생성 (도구 제한)
claude -p --allowedTools "Bash(git diff *),Bash(git log *),Bash(git commit *)" \
  "Create commit for staged changes"
```

---

## 10. 라이프사이클 이벤트와 분기 플래그

[→ 참조 문서](#ref-10-라이프사이클-이벤트와-분기-플래그)

이 섹션은 하네스의 워크플로우 설계에서 **분기 조건이 되는 모든 플래그/리터럴 값**을 모은다.

### 10.1 stop_reason — 에이전틱 루프의 핵심 분기

| stop_reason | 의미 | 하네스 처리 |
|-------------|------|-----------|
| `end_turn` | 자연스러운 응답 완료 | 정상 완료. 결과 반환 |
| `tool_use` | 도구 호출 요청 | 도구 실행 → tool_result 반환 → 루프 계속 |
| `max_tokens` | `max_tokens` 한도 도달 | 잘림. 이어서 요청 또는 한도 증가. 불완전 tool_use 블록이면 더 높은 max_tokens로 재요청 |
| `stop_sequence` | 커스텀 stop sequence 매칭 | `stop_sequence` 필드에 매칭 시퀀스 |
| `pause_turn` | 서버 도구 실행 루프 반복 한도 도달 (기본 10) | 응답을 그대로 assistant 메시지로 재전송하여 계속 |
| `refusal` | 안전 문제로 거부 | 요청 수정 검토 |
| `model_context_window_exceeded` | 컨텍스트 윈도우 한계 도달 | 유효하지만 잘린 응답. 가변 길이 입력의 최대 출력 패턴 |
| `compaction` | 요약 완료 (beta, `pause_after_compaction: true` 시에만) | 추가 콘텐츠 주입 후 계속 |

**주요 패턴:**
- `end_turn` + 빈 응답: tool_result 직후에 텍스트 추가 시 발생. tool_result만 단독 전송이 올바른 패턴
- `pause_turn` 연속 처리: 응답을 assistant 메시지로 추가 → 반복 (max_continuations 제한 필요)
- `is_error: true` 플래그: 툴 실패 시 예외 대신 Claude에게 에러 위임 → 더 강인한 에이전트

### 10.2 Hook Exit Code

| exit code | 의미 |
|:---------:|------|
| `0` | 진행 허용 |
| `2` | **차단** (stderr → Claude 피드백) |
| 기타 | 진행 (에러 표시) |

### 10.3 Hook permissionDecision

| 값 | 의미 |
|----|------|
| `allow` | 프롬프트 건너뜀 (settings deny 무시 불가) |
| `deny` | 차단 (bypassPermissions에서도 차단) |
| `ask` | 사용자 확인 요청 |
| `defer` | 비대화형 모드에서 기본 동작 위임 |

### 10.4 SessionStart matcher 값

| matcher | 발화 시점 |
|---------|---------|
| `startup` | 새 세션 시작 |
| `resume` | 기존 세션 재개 |
| `clear` | 대화 초기화 |
| `compact` | compact 후 |

### 10.5 Permission 모드 리터럴 (6가지)

| 모드 | 자동 승인 범위 | 적합한 상황 |
|------|-------------|-----------|
| `default` | 읽기만 | 민감한 작업 |
| `acceptEdits` | 읽기 + 파일 편집 | 코드 반복 작업 |
| `plan` | 읽기만 (편집 차단) | 분석, 계획 수립 |
| `auto` | 전부 (classifier 검사) | 장시간 자율 작업 |
| `dontAsk` | allow 명시된 것만 | CI/자동화 |
| `bypassPermissions` | protected paths 제외 전부 | 격리 컨테이너 전용 |

### 10.6 auto 모드 Classifier Fallback 임계값

| 조건 | 동작 |
|------|------|
| 연속 3회 차단 | auto 일시정지 → 프롬프트 모드 |
| 누적 20회 차단 | auto 일시정지 → 프롬프트 모드 |
| 허용된 액션 | 연속 카운터 리셋 (누적 유지) |
| 비대화형(`-p`) | 반복 차단 시 세션 중단 |

### 10.7 auto 모드 기본 차단 목록

- `curl | bash` (외부 코드 다운로드+실행)
- 민감 데이터 외부 전송
- 프로덕션 배포/마이그레이션
- 클라우드 스토리지 대량 삭제
- IAM/레포 권한 변경
- 세션 전 존재 파일의 비가역적 삭제
- force push, main 직접 push

### 10.8 Effort Level

| 값 | 영향 |
|----|------|
| `low` | 간결 응답, 툴 호출 수 감소 |
| `medium` | 기본 |
| `high` | 심층 분석 |
| `max` | 최대 thinking |

낮은 effort = **툴 호출 수 자체도 감소** → 서브에이전트에 `model: "haiku"` 또는 낮은 effort 지정이 자연스러운 비용 제어.

---

## 11. 보안 모델과 권한 계층

[→ 참조 문서](#ref-11-보안-모델과-권한-계층)

### 11.1 Dual-Layer 규칙 체계

```
Layer 1: Technical Enforcement (Hook + Settings)
  ├── PreToolUse Hook: 파괴적 명령 차단 (rm -rf, force push)
  ├── permissions.deny: 도구/명령 단위 차단
  └── if 필터: 세밀한 인자 패턴 차단 ("Bash(git *)")

Layer 2: Behavioral Guidance (CLAUDE.md + Skills)
  ├── CLAUDE.md: 프로젝트 규칙, 코딩 표준
  ├── rules/: 파일 패턴별 조건부 지침
  └── Skills: 워크플로우 + 합리화 방어
```

Layer 1은 **100% 강제**, Layer 2는 **최선의 노력** (CLAUDE.md는 유저 메시지로 전달 → 100% 준수 보장 안 됨).

### 11.2 Permission Rule 평가 순서

```
deny → ask → allow (첫 매칭 승)
```

Rule 문법:
| 패턴 | 매칭 |
|------|------|
| `Bash` | 모든 Bash 명령 |
| `Bash(npm run *)` | `npm run`으로 시작하는 명령 |
| `Read(./.env)` | .env 파일 읽기 |
| `WebFetch(domain:example.com)` | 특정 도메인 요청 |

### 11.3 Protected Paths

어떤 모드에서도 자동 승인 안 됨:
- `.git`, `.vscode`, `.idea`, `.husky`, `.claude` (예외: `commands/`, `agents/`, `skills/`, `worktrees/`)
- `.gitconfig`, `.bashrc`, `.zshrc`, `.mcp.json`, `.claude.json` 등

### 11.4 auto 모드 Classifier 보안

- classifier는 **Sonnet 4.6**로 실행 (메인 모델과 무관)
- 보는 것: 유저 메시지, 도구 호출, CLAUDE.md
- **보지 못하는 것: 도구 결과(tool results)** → 파일/웹 내 prompt injection이 classifier를 직접 조작 불가
- 서브에이전트도 동일한 3단계 검사 (스폰 전 → 실행 중 → 완료 후)
- auto 모드 진입 시 광범위한 allow 규칙(`Bash(*)`, `Agent` 등) **자동 드롭**. 좁은 규칙만 유지

### 11.5 CLAUDE.md vs Settings — 강제 수준

```
반드시 지켜야 하는가?
├── YES → settings.json (permissions.deny, hooks)
│         → 기술적 강제. LLM 판단과 무관하게 클라이언트가 차단
└── NO  → CLAUDE.md
          → 행동 가이드. Claude가 "읽고 따르려고 노력" (비강제)
```

---

## 12. 세션 라이프사이클과 Worktree

[→ 참조 문서](#ref-12-세션-라이프사이클과-worktree)

### 12.1 Checkpointing (편집 추적/되감기)

- **매 유저 프롬프트마다** 새 체크포인트 자동 생성
- 파일 편집 도구(`Edit`, `Write`, `NotebookEdit`)만 추적. **Bash 도구의 파일 조작은 미추적**
- 세션 간 유지 (30일 후 자동 정리)

**되감기 액션:**

| 액션 | 코드 복원 | 대화 복원 |
|------|:---------:|:---------:|
| Restore code and conversation | O | O |
| Restore conversation | X | O |
| Restore code | O | X |
| Summarize from here | X | 압축 |

### 12.2 Summarize vs Restore vs Compact

| | Restore | Summarize from here | `/compact` |
|---|---------|-------------------|------------|
| **대상** | 코드/대화 되돌림 | 선택 지점 이후만 압축 | 전체 대화 압축 |
| **파일 변경** | 되돌림 | 없음 | 없음 |
| **이전 메시지** | 제거 | 그대로 유지 | 전체 요약 |
| **원본 보존** | 체크포인트 | 세션 트랜스크립트 | 소실 |

### 12.3 Resume vs Fork

| 명령 | 동작 |
|------|------|
| `claude -c` | 가장 최근 세션 이어서 |
| `claude -r` | 특정 세션 선택 재개 |
| `claude -c --fork-session` | 히스토리 복사 + 새 세션 (원본 유지) |

같은 세션을 여러 터미널에서 resume하면 메시지 뒤섞임 → 병렬 작업은 `--fork-session` 사용.

### 12.4 Worktree 생성과 라이프사이클

**CLI 진입:**
```bash
claude --worktree feature-x     # .claude/worktrees/feature-x/ 생성
claude -w                       # 자동 이름 부여
claude -w review --tmux         # Worktree + tmux 세션
```

**생성 시:**
- `origin/HEAD`에서 `worktree-<name>` 브랜치 생성
- `.worktreeinclude`에 명시된 gitignored 파일 자동 복사 (`.env`, secrets 등)

**정리:**
- 변경 없음 → worktree + 브랜치 **자동 삭제**
- 변경 있음 → 유지 여부 사용자 확인
- 고아 worktree → `cleanupPeriodDays`(기본 30일) 후 자동 삭제 (미커밋 변경 없을 시)

### 12.5 Worktree 설정

```json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "vendor", ".gradle"],
    "sparsePaths": ["src/", "tests/", "package.json"]
  }
}
```

| 설정 | 용도 | 주의 |
|------|------|------|
| `symlinkDirectories` | 대용량 디렉토리 심링크 (복사 방지) | **공유됨** — 한 worktree 수정 시 다른 것에도 영향 |
| `sparsePaths` | sparse-checkout (모노레포) | 범위 밖 경로 작업 시 **무경고 실패** |
| `.worktreeinclude` | gitignored 파일 복사 목록 | `.gitignore` 문법. 커스텀 Hook 사용 시 자동 처리 안 됨 |

**모노레포 최적 조합:**
```json
{ "worktree": { "sparsePaths": ["src/", "tests/", "*.json"], "symlinkDirectories": ["node_modules"] } }
```
→ Full checkout 30-60초 → Sparse+symlink 1-2초.

### 12.6 Subagent Worktree 격리

```yaml
---
name: batch-refactor
isolation: worktree
tools: Read, Grep, Bash(git *), Bash(npm test)
memory: project
---
```

- `.claude/worktrees/agent-<id>/`에 자동 생성
- 에이전트 완료 → 변경 없으면 즉시 삭제
- 메인 컨텍스트 비용: ~80t (스폰만). 에이전트 내부는 **별도 윈도우**
- 대규모 리팩터링, 파일 충돌 방지에 최적

### 12.7 Worktree Hook

```json
{
  "hooks": {
    "WorktreeCreate": [{ "hooks": [{ "type": "command", "command": ".claude/hooks/worktree-setup.sh" }] }],
    "WorktreeRemove": [{ "hooks": [{ "type": "command", "command": ".claude/hooks/worktree-cleanup.sh" }] }]
  }
}
```

- `WorktreeCreate`: worktree 생성 후, 세션 시작 전. exit 0 외 → 생성 중단
- `WorktreeRemove`: 삭제 확인 후 실행. 차단 불가 (정보성)
- **Custom Hook 사용 시 `.worktreeinclude` 자동 처리 안 됨** → 직접 구현 필요

### 12.8 Worktree 함정

| 함정 | 대응 |
|------|------|
| symlink 디렉토리 수정 → 다른 worktree에 영향 | 읽기 전용 의존성만 symlink |
| `origin/HEAD` 캐시 → stale 브랜치 | `git remote set-head origin -a` 실행 |
| sparse-checkout 범위 밖 무경고 실패 | `sparsePaths`에 필요 경로 모두 포함 |
| worktree 내 worktree 불가 | git 제한. 단일 레벨만 |
| `worktree-*` 브랜치 축적 | 정기 `git branch -d worktree-*` 정리 |

### 12.9 Auto-compaction

메인 ~95% 용량에서 자동 트리거. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`로 조기 트리거 가능. 서브에이전트도 동일 로직.

---

## 13. 설정 시스템과 병합 규칙

[→ 참조 문서](#ref-13-설정-시스템과-병합-규칙)

### 13.1 4단계 스코프

| 스코프 | 위치 | 우선순위 |
|--------|------|:-------:|
| **Managed** | 서버/plist/레지스트리 | 1 (최고) |
| **CLI 인자** | 세션 임시 | 2 |
| **Local** | `.claude/settings.local.json` | 3 |
| **Project** | `.claude/settings.json` | 4 |
| **User** | `~/.claude/settings.json` | 5 (최저) |

### 13.2 병합 규칙

- **배열 값** (permissions.allow 등) → 모든 스코프에서 **concat + 중복 제거** ("추가만 가능, 제거 불가")
- **스칼라 값** (model 등) → 높은 우선순위가 적용

### 13.3 핵심 설정 키

| 카테고리 | 키 | 설명 |
|---------|-----|------|
| 모델 | `model` | 기본 모델 |
| | `availableModels` | 선택 가능 모델 제한 |
| | `agent` | 메인 에이전트 지정 |
| 권한 | `permissions.allow/ask/deny` | 도구/명령 규칙 |
| | `permissions.defaultMode` | 기본 권한 모드 |
| Hook | `hooks` | 라이프사이클 훅 |
| | `disableAllHooks` | 전체 비활성화 |
| 환경 | `env` | 세션 환경변수 |
| | `effortLevel` | effort 레벨 지속 |
| Sandbox | `sandbox.enabled` | OS 레벨 격리 |
| | `sandbox.filesystem.allowWrite/denyWrite` | 파일시스템 제어 |
| | `sandbox.network.allowedDomains` | 네트워크 제어 |
| Managed only | `disableSkillShellExecution` | 스킬 셸 실행 비활성화 |
| | `allowManagedHooksOnly` | 사용자/프로젝트 훅 차단 |
| | `channelsEnabled` | 채널 마스터 스위치 |

### 13.4 `--bare` 모드

settings, hooks, skills, plugins, MCP, auto memory, CLAUDE.md **전부 건너뜀**. CLI 플래그로 전달한 것만 적용. CI 파이프라인에서 재현 가능한 실행 환경 구성에 활용.

---

## 14. 비용 최적화 구조

[→ 참조 문서](#ref-14-비용-최적화-구조)

| 컴포넌트 | 비용 | 최적화 |
|---------|------|--------|
| Skill descriptions | ~100t/스킬 | `disable-model-invocation: true`로 수동 전용 비용 0 |
| Script-First | 65% 절감 | 분류/파싱/검증을 scripts/로 위임 |
| Subagent 격리 | 6,100t 작업 → 420t 반환 | 탐색/분석은 서브에이전트, 메인은 요약만 수신 |
| MCP 인라인 | 메인 비용 0 | 서브에이전트 전용 MCP는 인라인 정의 |
| Hook command | 0 토큰 | `command` 타입 우선, `prompt`/`agent`는 최후 수단 |
| Rules paths: | 온디맨드 | 무조건 로드 rules는 CLAUDE.md와 동일 비용 |
| `!` command | 0 tool call | 전처리 단계 실행, 결과만 컨텍스트 |
| Thinking 토큰 | 전량 과금 | 응답에 보이는 토큰 ≠ 과금 토큰. `/fast` 모드로 effort 감소 |
| Prompt caching (API) | cache read = 입력 비용의 10% | 안정적 툴셋 대량 요청 시 효과적 |
| Tool search | deferred loading | 20개 이상 도구 시 즉시 적용 |

### 조합 패턴

| 패턴 | 구조 | 용도 |
|------|------|------|
| Skill + Hook | Skill = 워크플로우, Hook(PostToolUse) = 출력 검증 | 검증 파이프라인 |
| Subagent + 도구 제한 | explore(haiku, 읽기 전용) + implement(sonnet, 전체) | 역할 분리 |
| Skill + MCP | Skill = 사용법, MCP = 외부 연결 | 외부 연동 |
| Hook + Hook | Pre = 위험 차단, Post = 감사 로그, Stop = 최종 검증 | 가드레일 체인 |
| Slash → Skill → Subagent | 사용자 진입 → 워크플로우 → 격리 분석 | 전체 파이프라인 |

---

## 15. 하네스 자체 평가 프레임워크

[→ 참조 문서](#ref-15-하네스-자체-평가-프레임워크)

하네스/플러그인의 품질을 정량 측정하고 회귀를 방지하는 프레임워크.

### 15.1 평가 유형 6가지

| 유형 | 방식 | 측정 | 적합한 대상 |
|------|------|------|-----------|
| **Exact Match** | 코드 | 문자열 동일성 | 분류, 카테고리 |
| **Cosine Similarity** | 코드 (SBERT) | 의미적 유사도 0-1 | 일관성 검증 |
| **ROUGE-L** | 코드 (LCS) | 콘텐츠 커버리지 F1 | 요약, 관련성 |
| **Likert Scale** | LLM (1-5) | 주관적 품질 | 톤, 스타일 |
| **Binary Classification** | LLM (yes/no) | 이진 판단 | 프라이버시, 안전성 |
| **Ordinal Scale** | LLM (1-5) | 구조화 판단 | 컨텍스트 활용도 |

**코드 기반**: 빠르고 신뢰. Exact Match, Cosine Similarity, ROUGE-L.
**LLM 기반**: 유연하고 미묘. 별도 모델 권장 (생성 ≠ 채점). `<thinking>` 후 점수 → 정확도 향상.

### 15.2 하네스 성공 기준 (다차원)

| 차원 | 측정 방법 | 예시 기준 |
|------|---------|---------|
| Task Fidelity | Exact Match, ROUGE-L | F1 ≥ 0.85 |
| Consistency | Cosine Similarity | 동일 입력 유사도 ≥ 0.92 |
| Safety | Binary Classification | 99.5% 비유해 출력 |
| Latency | 시간 측정 | 95% < 200ms |
| Cost | API 비용 추적 | 작업당 ≤ $0.05 |
| Context Utilization | Ordinal Scale | 평균 ≥ 4.0/5.0 |

### 15.3 엣지 케이스 테스트

| 카테고리 | 예시 |
|---------|------|
| 비관련 입력 | 완전히 무관한 질문/데이터 |
| 초과 길이 | 컨텍스트 윈도우 근접 입력 |
| 악의적 입력 | Jailbreak, prompt injection |
| 모호한 입력 | 인간도 불일치하는 케이스 |
| 오타/비문 | "Wut's yur retrn polcy?" |
| 혼합 감성 | "great product but terrible support" |
| 암묵적 데이터 | 가설적 PII, 관계 정보 |

### 15.4 채점 방법 선택

| 방법 | 속도 | 신뢰도 | 확장성 | 미묘함 |
|------|:----:|:------:|:------:|:------:|
| 코드 기반 | 최고 | 최고 | 높음 | 낮음 |
| LLM 기반 | 높음 | 중간 | 높음 | 높음 |
| 인간 | 최저 | 최고 | 낮음 | 최고 |

→ 기본: 코드 기반. 미묘한 판단: LLM. 고위험: 인간.
→ LLM 채점 시 **독립 모델** 사용 (생성 Sonnet → 채점 Haiku/Opus)

### 15.5 회귀 테스트 파이프라인

```
1. 개발자: Claude Console에서 테스트 케이스 생성 ({{variable}} 템플릿)
2. CSV 내보내기 → CI 파이프라인 통합
3. 스킬/에이전트 업데이트 → 자동 전체 테스트 실행
4. 품질 점수 비교 → 회귀 감지 → 배포 차단/경고
```

**하네스 적용:**
- 플러그인 등록 시 성공 기준 + 테스트 CSV 제출 의무화
- 마켓플레이스 품질 배지: `consistency ≥ 0.92`, `accuracy ≥ 0.88`
- 배포 후 LLM 자동 모니터링 (출력 품질 지속 추적)

### 15.6 멀티 모델 평가 아키텍처

```
사용자 입력 → [생성: Sonnet] → 출력 → [평가: Haiku/Opus] → 점수 → [감사 로그]
```

- Thinking 토큰은 전량 과금 → 평가에 `effort: low` + Haiku로 비용 최소화
- 매 출력 점수화 + 결과 저장 → 출력-입력 추적 (컴플라이언스)
- **Fresh start > compaction**: 컨텍스트 새로고침 시 파일시스템 재발견(progress.json, git log)이 compaction 요약보다 신뢰

### 15.7 쿡북 기반 그레이딩 패턴

> 출처: claude-cookbooks `building_evals.ipynb`, `evaluator_optimizer.ipynb`

**모델 기반 그레이딩 (XML 추출 패턴):**

```python
grader_prompt = """<answer>{answer}</answer>
<rubric>{rubric}</rubric>
Think in <thinking></thinking> tags.
Output 'correct' or 'incorrect' in <correctness></correctness> tags."""

match = re.search(r"<correctness>(.*?)</correctness>", completion, re.DOTALL)
```

**Evaluator-Optimizer 루프 (반복 개선):**

```
생성기 → 출력 → 평가기 → PASS? → 완료
                    ↓ NEEDS_IMPROVEMENT
              피드백 + 모든 이전 시도 → 생성기 (반복)
```

핵심: 평가기가 3상태(PASS/NEEDS_IMPROVEMENT/FAIL) 반환. **모든 이전 시도를 메모리로 축적** — 같은 실수 반복 방지. 프로덕션에서 max iteration cap 필수.

**Eval 설계 원칙 (쿡북):**
- Eval 분포 = 실제 사용 분포와 일치
- 높은 볼륨 + 낮은 품질 > 낮은 볼륨 + 높은 품질
- 객관식 변환으로 자동 그레이딩 가능하게 재구성
- `max_tokens=5`로 출력 제한 (숫자만 응답)

---

## 16. 프롬프트 엔지니어링과 가드레일

[→ 참조 문서](#ref-16-프롬프트-엔지니어링과-가드레일)

하네스가 사용자 프롬프트 품질을 향상시키고 출력 품질을 보장하는 기법.

### 16.1 기본 원칙

| 원칙 | 설명 |
|------|------|
| **명확성** | Claude = "컨텍스트 없는 천재 직원". 암묵적 가정 없이 명시 |
| **동기 부여** | "타원 금지" < "TTS가 타원을 발음 못하므로 금지" (why → 일반화 향상) |
| **Few-Shot** | 3-5개 예시. `<example>` 태그 래핑. 추상 지시 < 구체 예시 |
| **XML 구조** | `<instructions>`, `<context>`, `<input>` 분리로 혼합 콘텐츠 오해 방지 |
| **역할 지정** | 시스템 프롬프트 첫 문장: `"You are a helpful coding assistant."` |

### 16.2 긴 컨텍스트 (20K+ 토큰)

- 긴 데이터 **상단** (쿼리/지시 전), 쿼리 **하단** → 응답 품질 **최대** 30% 향상
- 다중 문서: `<documents>` > `<document index="n">` > `<source>` + `<document_content>`
- 인용 강제: "관련 부분을 먼저 인용하고, 분석하라"

### 16.3 출력 포맷 제어

| 기법 | 설명 |
|------|------|
| 긍정형 지시 | ~~"마크다운 쓰지 마"~~ → "산문 단락으로 작성" |
| XML 출력 태그 | `<flowing_prose>` → 태그 내 스타일 강제 |
| 프롬프트 미러링 | 프롬프트에 마크다운 없으면 출력도 감소 |
| JSON Schema | `--json-schema`로 구조 강제 (§9 참조) |

> Claude 4.6: 이전보다 간결. 요약 필요 시 명시. Opus 4.6 수학: 기본 LaTeX.

### 16.4 Thinking/Effort 최적화

- **Adaptive Thinking** 권장: `thinking: {"type": "adaptive"}` + `effort: "high"`
- `budget_tokens` deprecated → `effort` 사용
- Opus 4.6 **과도한 탐색** 제어: "접근을 선택하고 고수하라", effort 낮춤
- Thinking 토큰 **전량 과금** → 비용 관리 핵심

### 16.5 환각 감소 7전략

| # | 전략 | 패턴 |
|:-:|------|------|
| 1 | 허용된 불확실성 | "확신 없으면 '정보가 부족합니다'라고 말하라" |
| 2 | 증거 기반 2단계 | 관련 인용 추출 → 인용에서만 분석 |
| 3 | 인용 검증 | 각 주장에 직접 인용 대조. 미확인 → 제거 |
| 4 | Chain-of-Thought | 단계별 추론 강제 → 결함 논리 감지 |
| 5 | Best-of-N | 동일 프롬프트 N회 → 불일치 = 환각 위험 |
| 6 | 반복 정제 | 출력을 다음 입력으로 → 이전 주장 검증 |
| 7 | 지식 제한 | "제공된 문서만 사용. 일반 지식 의존 금지" |

### 16.6 일관성 가드레일

- **출력 포맷 명세**: JSON 키, 필수 필드, 타입 명시
- **Few-Shot 제약**: `<example>` 태그로 기대 구조 시연
- **RAG 감사 추적**: `<kb_entry>` 출처 태그 → 출력-입력 추적
- **프롬프트 체이닝**: 복잡한 작업 → 작은 일관된 단계 분해
- **캐릭터 일관성**: 시나리오별 사전 정의 응답

### 16.7 Jailbreak/Injection 방어 5단계

| # | 방어 | 구현 |
|:-:|------|------|
| 1 | **사전 심사** | Haiku + Structured Output (`is_harmful: boolean`)로 입력 분류 |
| 2 | **입력 검증** | 패턴 필터 + LLM 기반 검증 |
| 3 | **가치 선언** | 시스템 프롬프트에 윤리/컴플라이언스 가치 명시 |
| 4 | **반복 추적** | 동일 거부 요청 반복 → 경고 → 스로틀 → 차단 |
| 5 | **지속 모니터링** | 출력 정기 분석 → jailbreak 신호 감지 → 전략 갱신 |

### 16.8 프롬프트 유출 방지

> 완벽한 방법은 없음. 목표는 위험 감소.

| 기법 | 설명 |
|------|------|
| 컨텍스트 분리 | 핵심 IP → 시스템 프롬프트 + "절대 언급 금지" |
| 후처리 필터 | regex, 키워드, LLM으로 유출 탐지 |
| 불필요 정보 제거 | 작업 불필요 독점 정보는 프롬프트에서 제외 |
| 정기 감사 | 프롬프트와 출력 주기적 검토 |

→ Opus/Sonnet 4.6은 prefill 미지원 → 강한 부정문 + 후처리 필터가 현재 최선

### 16.9 하네스 프롬프트 품질 향상 파이프라인

```
사용자 프롬프트 → [UserPromptSubmit Hook] 품질 사전 검사
                    ├── 모호성 → 구체화 요청
                    ├── 스코프 과다 → 단계 분해 제안
                    └── 누락 컨텍스트 → 필요 정보 요청
                  → [PreToolUse Hook] 안전성 검사
                  → [PostToolUse Hook] 출력 품질 검증
                    ├── 환각 탐지 (증거 기반)
                    └── 포맷 준수 확인
                  → [Stop Hook] 최종 감사
                    ├── 프롬프트 유출 필터
                    └── 품질 점수 기록
```

**검증을 최우선 행동으로:**
```
나쁜 예: "이메일 검증 함수 작성"
좋은 예: "validateEmail() 작성. 테스트: user@example.com → true, invalid → false.
          테스트 실행 후 두 케이스 모두 확인."
```

**CLAUDE.md 최적화 원칙:**
- 포함: 비표준 빌드 명령, 비표준 코드 스타일, 아키텍처 결정, 테스트 가이드라인
- 제외: 코드에서 읽을 수 있는 것, 표준 규칙, 자주 바뀌는 정보
- 테스트: "이 줄 없으면 Claude가 실패하나?" → 아니면 제거

**서브에이전트 과다 사용 방지:**
```
서브에이전트는 병렬 작업, 격리 컨텍스트, 독립 워크스트림에만 사용.
단순 작업, 단일 파일 편집은 직접 수행.
```
→ Opus 4.6은 서브에이전트 과다 생성 경향 → 명시적 가이드 필요

---

## 17. 하네스 설계 권장사항

[→ 참조 문서](#ref-17-하네스-설계-권장사항)

### 17.1 즉시 구현 권장

**A. Hook 기반 Guardrail Layer (비용 0)**

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(rm -rf *)", "command": "echo 'BLOCKED: rm -rf' >&2 && exit 2" }] },
      { "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(git push --force*)", "command": "echo 'BLOCKED: force push' >&2 && exit 2" }] }
    ]
  }
}
```

**B. Script-First Skill 패턴**

```
skills/review/
├── SKILL.md              # 오케스트레이션 지시만 (~200줄)
├── scripts/              # 결정론적 로직
│   ├── classify.sh
│   └── confidence.sh
└── references/           # 필요시 로드
    └── review-criteria.md
```

SKILL.md는 "스크립트를 실행하고 결과를 해석하라"만. 65% 토큰 절감.

**C. Compact 방어 (SessionStart Hook)** — §2.6 상세 참조

```json
{ "hooks": { "SessionStart": [{ "matcher": "compact", "hooks": [{ "type": "command", "command": "cat .harness/compact-recovery.txt" }] }] } }
```

→ Skill description 소실 방어는 §2.6의 이중 방어 전략(Hook + CLAUDE.md 카탈로그) 참조.

### 17.2 워크플로우 조합 패턴 (쿡북 기반)

> 출처: claude-cookbooks `patterns/agents/` — 모든 패턴의 기본 인프라는 LLM 호출 래퍼 + XML 태그 파서 두 함수뿐.

| 패턴 | 토폴로지 | LLM 호출 | 하네스 적용 |
|------|----------|:--------:|-----------|
| **Chain** | 순차 파이프라인 | N | Skill 내 단계별 정제 (추출→변환→포맷) |
| **Parallel** | 팬아웃 (동일 프롬프트) | N (동시) | Subagent 병렬 리뷰 (보안+성능+테스트) |
| **Router** | 분류+전문 핸들러 | 2 | UserPromptSubmit Hook에서 의도 분류→Skill 라우팅 |
| **Evaluator-Optimizer** | 생성-평가 루프 | 2+/반복 | PostToolUse Hook에서 출력 품질 루프 |
| **Orchestrator-Workers** | 동적 팬아웃 | 1+N | Plan Skill이 태스크 분해→Worker Subagent 위임 |

**XML = LLM 구조화 프로토콜**: 쿡북 전체에서 `<reasoning>`, `<selection>`, `<evaluation>`, `<feedback>`, `<correctness>`, `<summary>`, `<tasks>` 태그가 일관 사용. JSON보다 LLM 친화적 — 하네스의 Hook 간 통신 프로토콜로 채택 권장.

**`.claude/` 실전 구조 (쿡북 레포 자체):**

```
.claude/
├── agents/code-reviewer.md           # 코드 리뷰 서브에이전트
├── commands/                          # CI 연동 슬래시 커맨드 7개
│   ├── notebook-review.md            #   노트북 품질 검사
│   ├── model-check.md                #   모델명 규칙 검사
│   ├── link-review.md                #   링크 유효성 검사
│   └── review-pr.md / review-pr-ci.md  #   PR 리뷰 (인터랙티브 / CI)
└── skills/cookbook-audit/
    ├── SKILL.md                       # 감사 스킬 정의
    ├── style_guide.md                 # 스타일 가이드 (참조 문서)
    └── validate_notebook.py           # 검증 스크립트 (Script-First 패턴)
```

→ Commands로 CI 파이프라인 자동화, Skills로 품질 게이트 구현하는 실전 레퍼런스.

### 17.3 설계 시 주의해야 할 함정

| # | 함정 | 대응 |
|:-:|------|------|
| 1 | Skill description 잘림 (30개 초과 시) | 핵심 스킬만 상주, 나머지 `disable-model-invocation: true` |
| 2 | Plugin Agent 보안 제약 (hooks/mcpServers/permissionMode 무시) | `.claude/agents/`로 복사 |
| 3 | Compact 후 미호출 Skill description 소실 | 이중 방어: Hook(compact matcher) + CLAUDE.md 카탈로그 (§2.6 상세) |
| 4 | CLAUDE.md = 비강제 | Layer 1(settings/hooks)로 기술적 강제, Layer 2(CLAUDE.md)는 행동 가이드 |
| 5 | 서브에이전트 Skills 비상속 | `skills:` frontmatter 명시 프리로드 (비용 감안) |
| 6 | auto 모드 진입 시 광범위한 allow 규칙 드롭 | 좁은 규칙으로 설계 |
| 7 | Bash 파일 조작 체크포인트 미추적 | Edit/Write 유도 또는 Git 커밋 강제 Hook |
| 8 | `@path` 남발 시 세션 시작 컨텍스트 폭발 | CLAUDE.md/Rules에서 `@path` 최소화 |

### 17.4 폴더 이름 추천

**플러그인:**

| 후보 | 네임스페이스 예시 |
|------|-----------------|
| `forge` | `/forge:plan`, `/forge:review` |
| `harness` | `/harness:plan`, `/harness:review` |
| `rig` | `/rig:plan`, `/rig:review` |

**에이전트:**

| 파일 | 역할 | model | tools |
|------|------|:-----:|-------|
| `explorer.md` | 코드 탐색 | haiku | Read, Grep, Glob |
| `implementer.md` | 구현 | sonnet/inherit | 전체 |
| `reviewer.md` | 리뷰 | sonnet | Read, Grep, Glob |
| `verifier.md` | 테스트 실행 | haiku | Bash, Read, Grep |
| `architect.md` | 설계 판단 | opus/inherit | 전체 |

### 17.5 Agent Teams (실험적)

| 시나리오 | 구성 | 장점 |
|---------|------|------|
| 병렬 리뷰 | 보안+성능+테스트 | 독립 도메인 분리 |
| 경쟁 가설 디버깅 | 3-5명 병렬 검증 | 앵커링 편향 극복 |
| 크로스 레이어 구현 | FE+BE+테스트 | 파일 충돌 방지 |

제약: 팀원은 lead 히스토리 미상속, 같은 파일 편집 → 덮어쓰기 위험, 세션당 1팀.
→ 현재는 **서브에이전트 기반 Controller+Workers**가 더 안정적.

---

## 부록 A: 문서 참조 MANIFEST

[↑ 목차로 돌아가기](#claude-platform-blueprint-for-harness)

각 섹션에서 참고한 리뷰 문서와 사유를 체크박스 형태로 정리.

---

### <a id="ref-1-디렉토리-구조와-자동-발견"></a>REF §1. 디렉토리 구조와 자동 발견

[↑ §1로 돌아가기](#1-디렉토리-구조와-자동-발견)

- [x] `03-claude-directory.md` — `.claude/` 내부 구조, 파일별 committed/gitignored 구분, settings 키, commands vs skills, rules 상세
- [x] `02-features-overview.md` — 확장 레이어 6종의 루프 내 위치, `@path` 임포트 동작
- [x] `13-plugins.md` — 플러그인 디렉토리 구조, 매니페스트, 컴포넌트 배치 규칙

---

### <a id="ref-2-컨텍스트-윈도우-경제학"></a>REF §2. 컨텍스트 윈도우 경제학

[↑ §2로 돌아가기](#2-컨텍스트-윈도우-경제학)

- [x] `04-context-window.md` — 세션 자동 로드 토큰, Hook 출력 규칙, Subagent 격리 수치, Compact 보존/소실, 가시성 3단계
- [x] `02-features-overview.md` — 확장 기능별 비용 패턴, MCP tool search 2단계
- [x] `14-skills.md` — Skill description 예산 (1%, 250자 캡)
- [x] `11-mcp.md` — Tool Search 옵션, 출력 제한 (10K/25K)
- [x] `api-curated-for-harness.md` — Context Awareness, context rot, compaction
- [x] ☆ `claude-cookbooks: context_engineering_tools.ipynb` — 3종 프리미티브 (Compaction/Clearing/Memory) 비교, 조합 규칙, 의사결정 프레임워크
- [x] ☆ `claude-cookbooks: session_memory_compaction.ipynb` — 즉시 컴팩션 패턴, 6단계 세션 메모리 구조, 백그라운드 선제 요약

---

### <a id="ref-3-확장-포인트--skills"></a>REF §3. 확장 포인트 — Skills

[↑ §3로 돌아가기](#3-확장-포인트--skills)

- [x] `14-skills.md` — Frontmatter 전체, 호출 제어, 문자열 치환, `context: fork`, paths, allowed-tools, model, hooks
- [x] `15-hooks-guide.md` — Skill frontmatter hooks 스코프, PostToolUse 포매터 패턴
- [x] `reference/04-tools-reference.md` — 빌트인 도구 전체 목록, 권한 필요/불요 구분
- [x] `09-sub-agents.md` — 빌트인 에이전트 모델 기본값, 모델 해석 우선순위, Agent 제한 패턴
- [x] `02-features-overview.md` — Progressive Disclosure 3단계
- [x] `api-curated-for-harness.md` — Skills 설계 원칙, description 작성법

---

### <a id="ref-4-확장-포인트--subagents"></a>REF §4. 확장 포인트 — Subagents

[↑ §4로 돌아가기](#4-확장-포인트--subagents)

- [x] `09-sub-agents.md` — Frontmatter 전체, 빌트인 에이전트, 모델 해석, 도구 제어, MCP 스코핑, 권한 상속
- [x] `04-context-window.md` — 서브에이전트 컨텍스트 시뮬레이션 (스폰 80t, 반환 420t)
- [x] `06-permission-modes.md` — auto 모드 서브에이전트 3단계 검사
- [x] `api-curated-for-harness.md` — Agent SDK 서브에이전트 설계

---

### <a id="ref-5-확장-포인트--hooks"></a>REF §5. 확장 포인트 — Hooks

[↑ §5로 돌아가기](#5-확장-포인트--hooks)

- [x] `15-hooks-guide.md` — 이벤트 전체 (24+), 입출력, `if` 필드, 타입 4가지, 권한 모드 관계
- [x] `04-context-window.md` — Hook 출력 컨텍스트 진입 규칙
- [x] `config/01-settings.md` — Hook 설정 키

---

### <a id="ref-6-확장-포인트--mcp"></a>REF §6. 확장 포인트 — MCP

[↑ §6로 돌아가기](#6-확장-포인트--mcp)

- [x] `11-mcp.md` — 전송/스코프/우선순위, OAuth, Tool Search, 출력 제한, Channels
- [x] `02-features-overview.md` — MCP 루프 내 위치, 연결 끊김 무경고
- [x] `config/01-settings.md` — MCP 설정 키
- [x] `09-sub-agents.md` — 서브에이전트 MCP 인라인 정의

---

### <a id="ref-7-확장-포인트--plugins"></a>REF §7. 확장 포인트 — Plugins

[↑ §7로 돌아가기](#7-확장-포인트--plugins)

- [x] `13-plugins.md` — Standalone vs Plugin, 매니페스트, 컴포넌트별 제약, Agent 보안
- [x] `config/01-settings.md` — Plugin 설정 키

---

### <a id="ref-8-확장-포인트--channels"></a>REF §8. 확장 포인트 — Channels

[↑ §8로 돌아가기](#8-확장-포인트--channels)

- [x] `16-channels.md` — Push 모델, 지원 플랫폼, Sender allowlist, Permission Relay
- [x] `reference/09-channels-reference.md` — Channel MCP 서버 구현, Capability 선언, meta 필드, 성숙도 단계
- [x] `config/01-settings.md` — `channelsEnabled`, `allowedChannelPlugins`

---

### <a id="ref-9-확장-포인트--cliheadless"></a>REF §9. 확장 포인트 — CLI/Headless

[↑ §9로 돌아가기](#9-확장-포인트--cliheadless)

- [x] `18-headless.md` — `-p` 모드, `--bare`, 출력 포맷, 도구 승인, 세션 연속성, JSON Schema
- [x] `reference/01-cli-reference.md` — CLI 플래그 전체, 도구 제어 계층, 시스템 프롬프트 구성, 비용/턴 제어

---

### <a id="ref-10-라이프사이클-이벤트와-분기-플래그"></a>REF §10. 라이프사이클 이벤트와 분기 플래그

[↑ §10로 돌아가기](#10-라이프사이클-이벤트와-분기-플래그)

- [x] `api/03-build-with-claude/03-stop-reasons.md` — stop_reason 7가지, 빈 응답 패턴
- [x] `api-curated-for-harness.md` — stop_reason + compaction, effort 영향, classifier fallback
- [x] `15-hooks-guide.md` — Hook exit code, permissionDecision, SessionStart matcher
- [x] `06-permission-modes.md` — 6모드 리터럴, auto 기본 차단 목록, classifier fallback

---

### <a id="ref-11-보안-모델과-권한-계층"></a>REF §11. 보안 모델과 권한 계층

[↑ §11로 돌아가기](#11-보안-모델과-권한-계층)

- [x] `06-permission-modes.md` — 6모드 상세, auto classifier, protected paths, allow 드롭
- [x] `config/01-settings.md` — Permission rule, sandbox 설정, managed-only 키
- [x] `15-hooks-guide.md` — Hook과 권한 모드 관계

---

### <a id="ref-12-세션-라이프사이클과-worktree"></a>REF §12. 세션 라이프사이클과 Worktree

[↑ §12로 돌아가기](#12-세션-라이프사이클과-worktree)

- [x] `reference/06-checkpointing.md` — 체크포인트 동작, 되감기, Summarize vs Restore vs Compact
- [x] `01-how-claude-code-works.md` — Resume vs Fork, worktree 병렬 작업, 세션 관리
- [x] `04-context-window.md` — Compact 보존/소실, ~12% 압축률
- [x] `config/01-settings.md` — worktree 설정, `cleanupPeriodDays`, auto-compaction
- [x] `15-hooks-guide.md` — WorktreeCreate/Remove 이벤트, Hook에서 worktree 커스텀 로직

---

### <a id="ref-13-설정-시스템과-병합-규칙"></a>REF §13. 설정 시스템과 병합 규칙

[↑ §13로 돌아가기](#13-설정-시스템과-병합-규칙)

- [x] `config/01-settings.md` — 4단계 스코프, 병합 규칙, 전체 설정 키, Managed 배포, `--bare`, `apiKeyHelper`
- [x] `03-claude-directory.md` — settings.json 주요 키, 글로벌 config

---

### <a id="ref-14-비용-최적화-구조"></a>REF §14. 비용 최적화 구조

[↑ §14로 돌아가기](#14-비용-최적화-구조)

- [x] `04-context-window.md` — 항목별 토큰 비용, 서브에이전트 격리 수치
- [x] `02-features-overview.md` — 확장 기능별 비용 패턴
- [x] `14-skills.md` — description 예산, disable-model-invocation 비용 0
- [x] `api-curated-for-harness.md` — thinking 과금, effort 제어, prompt caching

---

### <a id="ref-15-하네스-자체-평가-프레임워크"></a>REF §15. 하네스 자체 평가 프레임워크

[↑ §15로 돌아가기](#15-하네스-자체-평가-프레임워크)

- [x] `api/14-test-evaluate/01-develop-tests.md` — 평가 유형 6가지, 성공 기준 정의, 엣지 케이스, 채점 방법 비교
- [x] `api/14-test-evaluate/02-eval-tool.md` — Console 평가 도구, 테스트 케이스 CSV, 회귀 테스트 파이프라인
- [x] `api-curated-for-harness.md` — 멀티 모델 평가, thinking 비용, effort 제어
- [x] ☆ `claude-cookbooks: building_evals.ipynb` — 3종 그레이딩 (코드/인간/모델), XML correctness 추출 패턴, eval 설계 원칙
- [x] ☆ `claude-cookbooks: evaluator_optimizer.ipynb` — 생성-평가 루프, 3상태 평가, 누적 메모리 패턴

---

### <a id="ref-16-프롬프트-엔지니어링과-가드레일"></a>REF §16. 프롬프트 엔지니어링과 가드레일

[↑ §16로 돌아가기](#16-프롬프트-엔지니어링과-가드레일)

- [x] `api/13-prompt-engineering/01-overview.md` — 기본 원칙, Few-Shot, XML 구조, 역할 지정, 긴 컨텍스트 처리
- [x] `api/03-build-with-claude/04-prompting-best-practices.md` — 출력 포맷 제어, Thinking 최적화, Agentic 설계
- [x] `api/15-strengthen-guardrails/01-reduce-hallucinations.md` — 환각 감소 7전략
- [x] `api/15-strengthen-guardrails/02-increase-consistency.md` — 일관성 가드레일, RAG 감사
- [x] `api/15-strengthen-guardrails/03-mitigate-jailbreaks.md` — Jailbreak 방어 5단계
- [x] `api/15-strengthen-guardrails/05-reduce-prompt-leak.md` — 프롬프트 유출 방지 기법
- [x] `08-best-practices.md` — CLAUDE.md 최적화, 검증 패턴, 컨텍스트 관리 안티패턴

---

### <a id="ref-17-하네스-설계-권장사항"></a>REF §17. 하네스 설계 권장사항

[↑ §17로 돌아가기](#17-하네스-설계-권장사항)

- [x] `15-hooks-guide.md` — Hook 기반 guardrail, compact 방어
- [x] `14-skills.md` — Script-First 패턴, description 설계
- [x] `09-sub-agents.md` — 역할별 모델/도구 조합
- [x] `13-plugins.md` — 플러그인 구조, Agent 보안 제약
- [x] `reference/06-checkpointing.md` — Bash 미추적 → Edit/Write 유도
- [x] `06-permission-modes.md` — auto 모드 allow 드롭 → 좁은 규칙
- [x] ☆ `claude-cookbooks: patterns/agents/*.ipynb` — 워크플로우 5패턴 (Chain/Parallel/Router/Evaluator-Optimizer/Orchestrator-Workers), XML 프로토콜
- [x] ☆ `claude-cookbooks: .claude/` 디렉토리 — 실전 Commands(CI 연동 7개) + Skills(cookbook-audit) + Agents(code-reviewer) 구조

---

### 전체 참조 현황 요약

| 문서 | 참조 섹션 수 |
|------|:----------:|
| `config/01-settings.md` | 7 |
| `15-hooks-guide.md` | 6 |
| `04-context-window.md` | 5 |
| `api-curated-for-harness.md` | 5 |
| `14-skills.md` | 5 |
| `02-features-overview.md` | 4 |
| `06-permission-modes.md` | 4 |
| `09-sub-agents.md` | 4 |
| `13-plugins.md` | 3 |
| `03-claude-directory.md` | 3 |
| `01-how-claude-code-works.md` | 2 |
| `reference/06-checkpointing.md` | 2 |
| `11-mcp.md` | 2 |
| `16-channels.md` | 1 |
| `18-headless.md` | 1 |
| `reference/01-cli-reference.md` | 1 |
| `reference/04-tools-reference.md` | 1 |
| `reference/09-channels-reference.md` | 1 |
| `08-best-practices.md` | 1 |
| `api/03-build-with-claude/03-stop-reasons.md` | 1 |
| `api/14-test-evaluate/01-develop-tests.md` | 1 |
| `api/14-test-evaluate/02-eval-tool.md` | 1 |
| `api/13-prompt-engineering/01-overview.md` | 1 |
| `api/03-build-with-claude/04-prompting-best-practices.md` | 1 |
| `api/15-strengthen-guardrails/01-reduce-hallucinations.md` | 1 |
| `api/15-strengthen-guardrails/02-increase-consistency.md` | 1 |
| `api/15-strengthen-guardrails/03-mitigate-jailbreaks.md` | 1 |
| `api/15-strengthen-guardrails/05-reduce-prompt-leak.md` | 1 |

---

## 부록 B: 전체 문서 채택 현황 (docs/review/claude-ai)

[↑ 목차로 돌아가기](#claude-platform-blueprint-for-harness)

`docs/review/claude-ai/` 하위 전체 파일 리스트.
`[x]` = 본 블루프린트에서 참조됨, `[ ]` = 미참조. 각 항목에 사유 포함.

---

### Core (01~18)

- [x] `01-how-claude-code-works.md` — 에이전틱 루프, Resume/Fork, 세션 관리 → §10, §13
- [x] `02-features-overview.md` — 확장 레이어 6종 위치, Progressive Disclosure, 비용 패턴 → §1, §2, §3, §6, §12
- [x] `03-claude-directory.md` — `.claude/` 구조, settings 키, commands/skills/rules 배치 → §1, §3, §11
- [x] `04-context-window.md` — 토큰 경제, Compact 보존/소실, Hook 출력 규칙, 서브에이전트 격리 → §2, §4, §10, §12
- [ ] `05-memory.md` — Auto Memory 사용법. 사용자 가이드 성격, 하네스 내부 메커니즘 아님
- [x] `06-permission-modes.md` — 6모드 리터럴, auto classifier, 서브에이전트 3단계 검사 → §4, §8, §9, §13
- [ ] `07-common-workflows.md` — 일상 워크플로우 (PR 리뷰, 리팩터링 등). 사용자 가이드 성격
- [x] `08-best-practices.md` — CLAUDE.md 최적화, 검증 패턴, 컨텍스트 관리 안티패턴 → §16
- [x] `09-sub-agents.md` — Frontmatter, 도구 제어, MCP 스코핑, 권한 상속, 메모리 → §4, §6, §13
- [ ] `10-agent-teams.md` — Agent Teams 실험적 기능. 제약이 많아 현재 서브에이전트 기반 권장 (§13에서 언급)
- [x] `11-mcp.md` — 전송/스코프/우선순위, OAuth, Tool Search, 출력 제한, Channels → §2, §6
- [ ] `12-discover-plugins.md` — 마켓플레이스 탐색. 사용자 가이드 성격 (§7에서 제외 사유 기재)
- [x] `13-plugins.md` — Standalone vs Plugin, 매니페스트, 컴포넌트별 제약, Agent 보안 → §1, §7, §13
- [x] `14-skills.md` — Frontmatter, 호출 제어, 문자열 치환, `context: fork`, description 예산 → §2, §3, §12, §13
- [x] `15-hooks-guide.md` — 24+ 이벤트, 입출력 구조, `if` 필드, 타입 4가지, 권한 모드 관계 → §5, §8, §9, §13
- [x] `16-channels.md` — Push 모델, Sender allowlist, Permission Relay, Channel 아키텍처 → §8
- [ ] `17-scheduled-tasks.md` — 예약 작업 (Cron). 하네스 설계보다 운영/자동화 영역
- [x] `18-headless.md` — `-p` 모드, `--bare`, 출력 포맷, 도구 승인, JSON Schema → §9

---

### api-curated-for-harness.md

- [x] `api-curated-for-harness.md` — API 문서 중 하네스 설계 관련 핵심만 선별 정리한 큐레이션 문서 → §2, §3, §4, §8, §12

---

### api/

> API 문서 105건. 대부분 API/SDK 구현 상세이며, 하네스 설계 관련 핵심은 `api-curated-for-harness.md`에 이미 통합됨.

#### api/ 루트

- [ ] `api/MANIFEST.md` — API 문서 목차/인덱스. 메타 문서
- [ ] `api/01-intro.md` — API 소개. 개요 문서
- [ ] `api/02-quickstart.md` — API 퀵스타트. 시작 가이드

#### api/03-build-with-claude/

- [ ] `api/03-build-with-claude/01-overview.md` — 빌드 개요. `api-curated`에 핵심 통합
- [ ] `api/03-build-with-claude/02-messages-api.md` — Messages API 상세. API 구현 상세
- [x] `api/03-build-with-claude/03-stop-reasons.md` — stop_reason 7가지 전체 + 빈 응답 패턴 → §8
- [x] `api/03-build-with-claude/04-prompting-best-practices.md` — 출력 포맷 제어, Thinking 최적화, Agentic 설계 패턴 → §16

#### api/04-model-capabilities/

- [ ] `api/04-model-capabilities/01-extended-thinking.md` — Extended Thinking API. `api-curated`에 핵심 통합
- [ ] `api/04-model-capabilities/02-adaptive-thinking.md` — Adaptive Thinking. API 구현 상세
- [ ] `api/04-model-capabilities/03-effort.md` — Effort 제어. `api-curated`에 핵심 통합
- [ ] `api/04-model-capabilities/04-fast-mode.md` — Fast Mode. 모델 구성 옵션
- [ ] `api/04-model-capabilities/05-structured-outputs.md` — Structured Outputs. API 구현 상세
- [ ] `api/04-model-capabilities/06-citations.md` — Citations. API 구현 상세
- [ ] `api/04-model-capabilities/07-streaming.md` — Streaming. API 구현 상세
- [ ] `api/04-model-capabilities/08-batch-processing.md` — Batch Processing. API 구현 상세
- [ ] `api/04-model-capabilities/09-pdf-support.md` — PDF 지원. API 구현 상세
- [ ] `api/04-model-capabilities/10-search-results.md` — Search Results. API 구현 상세
- [ ] `api/04-model-capabilities/11-multilingual.md` — 다국어 지원. API 구현 상세
- [ ] `api/04-model-capabilities/12-embeddings.md` — Embeddings. API 구현 상세

#### api/05-tools/

- [ ] `api/05-tools/01-overview.md` — Tool Use 개요. `api-curated`에 핵심 통합
- [ ] `api/05-tools/02-how-tool-use-works.md` — Tool Use 동작 원리. API 구현 상세
- [ ] `api/05-tools/03-tutorial-agent.md` — Agent 튜토리얼. API 구현 상세
- [ ] `api/05-tools/04-define-tools.md` — 도구 정의. API 구현 상세
- [ ] `api/05-tools/05-handle-tool-calls.md` — 도구 호출 처리. API 구현 상세
- [ ] `api/05-tools/06-parallel-tool-use.md` — 병렬 도구 호출. API 구현 상세
- [ ] `api/05-tools/07-tool-runner.md` — Tool Runner. API 구현 상세
- [ ] `api/05-tools/08-strict-tool-use.md` — Strict Tool Use. API 구현 상세
- [ ] `api/05-tools/09-tool-use-caching.md` — Tool Use Caching. API 구현 상세
- [ ] `api/05-tools/10-server-tools.md` — Server Tools. API 구현 상세
- [ ] `api/05-tools/11-troubleshooting.md` — 도구 트러블슈팅. API 구현 상세
- [ ] `api/05-tools/12-tool-reference.md` — 도구 레퍼런스. API 구현 상세
- [ ] `api/05-tools/13-web-search.md` — Web Search. API 구현 상세
- [ ] `api/05-tools/14-web-fetch.md` — Web Fetch. API 구현 상세
- [ ] `api/05-tools/15-code-execution.md` — Code Execution. API 구현 상세
- [ ] `api/05-tools/16-memory-tool.md` — Memory Tool. API 구현 상세
- [ ] `api/05-tools/17-bash-tool.md` — Bash Tool. API 구현 상세
- [ ] `api/05-tools/18-computer-use.md` — Computer Use. API 구현 상세
- [ ] `api/05-tools/19-text-editor.md` — Text Editor. API 구현 상세

#### api/06-tool-infrastructure/

- [ ] `api/06-tool-infrastructure/01-manage-tool-context.md` — Tool Context 관리. API 구현 상세
- [ ] `api/06-tool-infrastructure/02-tool-combinations.md` — 도구 조합. API 구현 상세
- [ ] `api/06-tool-infrastructure/03-tool-search.md` — Tool Search API. `api-curated`에 핵심 통합
- [ ] `api/06-tool-infrastructure/04-programmatic-tool-calling.md` — Programmatic Tool Calling. API 구현 상세
- [ ] `api/06-tool-infrastructure/05-fine-grained-streaming.md` — Fine-grained Streaming. API 구현 상세

#### api/07-context-management/

- [ ] `api/07-context-management/01-context-windows.md` — Context Windows API. `api-curated`에 핵심 통합
- [ ] `api/07-context-management/02-compaction.md` — Compaction API. `api-curated`에 핵심 통합
- [ ] `api/07-context-management/03-context-editing.md` — Context Editing. API 구현 상세
- [ ] `api/07-context-management/04-prompt-caching.md` — Prompt Caching. `api-curated`에 핵심 통합
- [ ] `api/07-context-management/05-token-counting.md` — Token Counting. API 구현 상세

#### api/08-files-assets/

- [ ] `api/08-files-assets/01-files-api.md` — Files API. API 구현 상세

#### api/09-agent-skills/

- [ ] `api/09-agent-skills/01-overview.md` — Agent Skills 개요. `api-curated`에 핵심 통합
- [ ] `api/09-agent-skills/02-quickstart.md` — Agent Skills 퀵스타트. 시작 가이드
- [ ] `api/09-agent-skills/03-best-practices.md` — Agent Skills 베스트 프랙티스. `api-curated`에 핵심 통합
- [ ] `api/09-agent-skills/04-enterprise.md` — Enterprise Skills. 조직 배포 가이드
- [ ] `api/09-agent-skills/05-claude-api-skill.md` — Claude API Skill. API 구현 상세
- [ ] `api/09-agent-skills/06-skills-guide.md` — Skills Guide. 사용자 가이드

#### api/10-agent-sdk/

- [ ] `api/10-agent-sdk/01-overview.md` — Agent SDK 개요. `api-curated`에 핵심 통합
- [ ] `api/10-agent-sdk/02-quickstart.md` — SDK 퀵스타트. 시작 가이드
- [ ] `api/10-agent-sdk/03-agent-loop.md` — Agent Loop. `api-curated`에 핵심 통합
- [ ] `api/10-agent-sdk/04-claude-code-features.md` — SDK에서 CC 기능 사용. SDK 구현 상세
- [ ] `api/10-agent-sdk/05-sessions.md` — Sessions 관리. SDK 구현 상세
- [ ] `api/10-agent-sdk/06-streaming-input.md` — Streaming Input. SDK 구현 상세
- [ ] `api/10-agent-sdk/07-streaming-output.md` — Streaming Output. SDK 구현 상세
- [ ] `api/10-agent-sdk/08-mcp.md` — SDK MCP 연동. SDK 구현 상세
- [ ] `api/10-agent-sdk/09-custom-tools.md` — Custom Tools. SDK 구현 상세
- [ ] `api/10-agent-sdk/10-tool-search.md` — Tool Search. SDK 구현 상세
- [ ] `api/10-agent-sdk/11-permissions.md` — SDK Permissions. SDK 구현 상세
- [ ] `api/10-agent-sdk/12-user-input.md` — User Input. SDK 구현 상세
- [ ] `api/10-agent-sdk/13-hooks.md` — SDK Hooks. SDK 구현 상세
- [ ] `api/10-agent-sdk/14-file-checkpointing.md` — File Checkpointing. SDK 구현 상세
- [ ] `api/10-agent-sdk/15-structured-outputs.md` — Structured Outputs. SDK 구현 상세
- [ ] `api/10-agent-sdk/16-hosting.md` — Hosting. SDK 배포 가이드
- [ ] `api/10-agent-sdk/17-secure-deployment.md` — Secure Deployment. SDK 보안 배포 가이드
- [ ] `api/10-agent-sdk/18-system-prompts.md` — System Prompts. SDK 구현 상세
- [ ] `api/10-agent-sdk/19-subagents.md` — Subagents. SDK 구현 상세
- [ ] `api/10-agent-sdk/20-slash-commands.md` — Slash Commands. SDK 구현 상세
- [ ] `api/10-agent-sdk/21-skills.md` — Skills. SDK 구현 상세
- [ ] `api/10-agent-sdk/22-cost-tracking.md` — Cost Tracking. SDK 구현 상세
- [ ] `api/10-agent-sdk/23-todo-tracking.md` — Todo Tracking. SDK 구현 상세
- [ ] `api/10-agent-sdk/24-plugins.md` — Plugins. SDK 구현 상세
- [ ] `api/10-agent-sdk/25-typescript.md` — TypeScript SDK. SDK 구현 상세
- [ ] `api/10-agent-sdk/26-typescript-v2.md` — TypeScript SDK v2. SDK 구현 상세
- [ ] `api/10-agent-sdk/27-python.md` — Python SDK. SDK 구현 상세
- [ ] `api/10-agent-sdk/28-migration-guide.md` — Migration Guide. SDK 마이그레이션 가이드

#### api/11-mcp/

- [ ] `api/11-mcp/01-mcp-connector.md` — MCP Connector. API 구현 상세
- [ ] `api/11-mcp/02-remote-mcp-servers.md` — Remote MCP Servers. API 구현 상세

#### api/12-platforms/

- [ ] `api/12-platforms/01-amazon-bedrock.md` — Amazon Bedrock. 플랫폼 배포 가이드
- [ ] `api/12-platforms/02-bedrock-legacy.md` — Bedrock Legacy. 플랫폼 배포 가이드
- [ ] `api/12-platforms/03-microsoft-foundry.md` — Microsoft Foundry. 플랫폼 배포 가이드
- [ ] `api/12-platforms/04-vertex-ai.md` — Vertex AI. 플랫폼 배포 가이드

#### api/13-prompt-engineering/

- [x] `api/13-prompt-engineering/01-overview.md` — 기본 원칙, Few-Shot, XML 구조, 역할 지정, 긴 컨텍스트 → §16
- [ ] `api/13-prompt-engineering/02-prompting-tools.md` — 프롬프팅 도구. 사용자 가이드

#### api/14-test-evaluate/

- [x] `api/14-test-evaluate/01-develop-tests.md` — 평가 유형 6가지, 성공 기준, 엣지 케이스, 채점 방법 → §15
- [x] `api/14-test-evaluate/02-eval-tool.md` — Console 평가 도구, 테스트 CSV, 회귀 파이프라인 → §15
- [ ] `api/14-test-evaluate/03-reduce-latency.md` — 지연 감소. API 최적화 가이드

#### api/15-strengthen-guardrails/

- [x] `api/15-strengthen-guardrails/01-reduce-hallucinations.md` — 환각 감소 7전략 → §16
- [x] `api/15-strengthen-guardrails/02-increase-consistency.md` — 일관성 가드레일, RAG 감사 추적 → §16
- [x] `api/15-strengthen-guardrails/03-mitigate-jailbreaks.md` — Jailbreak 방어 5단계 → §16
- [ ] `api/15-strengthen-guardrails/04-streaming-refusals.md` — Streaming Refusals. API 구현 상세
- [x] `api/15-strengthen-guardrails/05-reduce-prompt-leak.md` — 프롬프트 유출 방지 기법 → §16

#### api/16-admin/

- [ ] `api/16-admin/01-admin-api.md` — Admin API. 조직 관리 API
- [ ] `api/16-admin/02-data-residency.md` — Data Residency. 데이터 정책
- [ ] `api/16-admin/03-workspaces.md` — Workspaces. 조직 관리
- [ ] `api/16-admin/04-usage-cost-api.md` — Usage/Cost API. 비용 조회 API
- [ ] `api/16-admin/05-analytics-api.md` — Analytics API. 분석 API
- [ ] `api/16-admin/06-data-retention.md` — Data Retention. 데이터 보존 정책

---

### config/

- [x] `config/01-settings.md` — 4단계 스코프, 병합 규칙, 전체 설정 키, Managed 배포, sandbox → §5, §6, §7, §9, §10, §11
- [ ] `config/02-permissions.md` — 권한 설정 상세. `config/01-settings.md`와 `06-permission-modes.md`에 핵심 통합
- [ ] `config/03-sandboxing.md` — OS 레벨 격리 상세. `config/01-settings.md`의 sandbox 키로 핵심 포함 (§9에서 제외 사유 기재)
- [ ] `config/04-terminal-config.md` — 터미널 구성. UI/UX 설정
- [ ] `config/05-fullscreen.md` — 전체 화면 모드. UI/UX 설정
- [ ] `config/06-model-config.md` — 모델 구성. `config/01-settings.md`의 model 키로 포함
- [ ] `config/07-fast-mode.md` — Fast Mode 설정. 모델 구성 옵션
- [ ] `config/08-voice-dictation.md` — 음성 받아쓰기. UI/UX 기능
- [ ] `config/09-output-styles.md` — 출력 스타일. UI/UX 설정
- [ ] `config/10-statusline.md` — 상태 표시줄. UI/UX 설정
- [ ] `config/11-keybindings.md` — 키 바인딩. UI/UX 설정

---

### reference/

- [x] `reference/01-cli-reference.md` — CLI 플래그 전체, 도구 제어 계층, 시스템 프롬프트 구성 → §9
- [ ] `reference/02-commands.md` — 슬래시 커맨드 레퍼런스. CLI 사용법
- [ ] `reference/03-env-vars.md` — 환경변수 레퍼런스. CLI 구성
- [x] `reference/04-tools-reference.md` — 빌트인 도구 전체 목록, 권한 필요/불요 구분 → §3
- [ ] `reference/05-interactive-mode.md` — 인터랙티브 모드. CLI 사용법
- [x] `reference/06-checkpointing.md` — 체크포인트 동작, 되감기, Summarize vs Restore vs Compact → §10, §13
- [ ] `reference/07-hooks-reference.md` — Hook 이벤트 레퍼런스. `15-hooks-guide.md`의 상세 버전 (§5에서 제외 사유 기재)
- [ ] `reference/08-plugins-reference.md` — Plugin CLI 레퍼런스. 사용법 (§7에서 제외 사유 기재)
- [x] `reference/09-channels-reference.md` — Channel MCP 서버 구현, Capability, meta 필드, Permission Relay → §8

---

### extra-*

- [ ] `extra-llms-txt.md` — LLMs.txt 표준. 외부 표준 설명
- [ ] `extra-mcp-plugin-integration-guide.md` — MCP Plugin 통합 가이드. 통합 튜토리얼
- [ ] `extra-mcp-server-build-guide.md` — MCP Server 빌드 가이드. 빌드 튜토리얼

---

### 채택 현황 요약

| 구분 | 전체 | 채택 | 비율 |
|------|:----:|:----:|:----:|
| Core (01~18) | 18 | 15 | 83% |
| api-curated | 1 | 1 | 100% |
| api/ | 105 | 9 | 9% |
| config/ | 11 | 1 | 9% |
| reference/ | 9 | 4 | 44% |
| extra-* | 3 | 0 | 0% |
| ☆ claude-cookbooks | 8 | 8 | 100% |
| **합계** | **155** | **38** | **25%** |

> 이전 버전(30건, 20%) 대비 증가. claude-cookbooks 8건 신규 채택: §2 컨텍스트 프리미티브/즉시 컴팩션, §15 그레이딩 패턴/Evaluator-Optimizer, §17 워크플로우 5패턴/.claude 실전 구조. 외부 쿡북 소스는 ☆ 마크로 구분.
