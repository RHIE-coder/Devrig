# forge

> 재사용 가능한 **레시피 라이브러리** — 저장해뒀다 `builder` 엔진으로 꺼내 씁니다.

`toolkit/`이 "손에 들고 **쓰는** 도구"라면, `forge/`는 "코드·설정을 **찍어내는** 원본"입니다.
실제로 찍어내는 엔진은 [`toolkit/builder/`](../toolkit/builder)이고, 이 폴더는 그 재료(데이터)만 담습니다.

## 핵심 모델: "종류(kind)"는 없다

스니펫 / 스캐폴드 / 프로젝트 템플릿은 **별개의 종류가 아니라 같은 것의 스펙트럼**입니다
(파일 수·변수 치환·목적지·설정 패치·post-hook 가 다이얼처럼 변할 뿐). 그래서 레시피는
**한 종류**고, 동작은 `forge.yaml`에 **어떤 필드를 채웠느냐**로 결정됩니다.

차이가 나는 건 *물건*이 아니라 *쓸 때 고르는 동사*입니다:

| 동사 | 의미 | 트리거 |
|------|------|--------|
| `get` | 내용을 그냥 꺼내줌 (stdout) | 기본 |
| `add` | 기존 위치에 설치 (+ 설정 배선) | `target` / `patch` 존재 |
| `new` | 새 디렉터리 생성 (변수 렌더 + hook) | `dest: new` |

## 구조

```
forge/
└── <domain>/            # 찾는 기준 = 도메인 (claude, react, ci…). 동작과 무관, 분류용.
    └── <recipe>/
        ├── forge.yaml   # 매니페스트 (아래 스키마)
        └── ...          # payload (찍어낼 파일들)
```

## forge.yaml 스키마

```yaml
name:   claude-statusline           # 생략 시 폴더명
about:  한 줄 설명
dest:   inplace                     # inplace(기본) | new
target: ~/.claude                   # add 기본 설치 위치 (~ 확장)
files:  [statusline-command.mjs]    # 생략 시 forge.yaml/README 뺀 전체
patch:                              # add 시 설정 배선 (stage 2)
  - file: ~/.claude/settings.json
    set: { statusLine.command: "node ~/.claude/statusline-command.mjs" }
vars:   [{ name: ProjectName, prompt: "이름?" }]   # new 변수 (stage 3)
post:   [npm install, git init]     # new post-hook (stage 3)
```

## 사용

```bash
devrig run builder list
devrig run builder get  claude-statusline
devrig run builder add  claude-statusline           # → ~/.claude/ 에 설치
devrig run builder add  claude-statusline ./somedir # target 덮어쓰기
```

> `.deprecated/`는 옛 harness 프레임워크 보관소입니다 (builder가 무시함).
