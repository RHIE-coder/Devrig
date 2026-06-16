# forge/harness

Claude Code 기반 agentic engineering harness — 워크플로우 강제, 가드레일, 품질 파이프라인.

---

## 디렉토리 구조

```
forge/harness/
├── dev/                  # 개발 영역
│   ├── plugin/           # 실제 플러그인 코드 (scripts, agents, hooks)
│   ├── specs/            # 스킬/레이어별 spec (17개)
│   └── plans/            # 구현 계획 문서
│
├── bench/                # 검증 영역
│   ├── tests/            # 단위 테스트 (node:test, 33개)
│   └── evals/            # 시나리오 평가 (migrate fixtures 등)
│
├── marketplace/          # 릴리즈 영역
│   ├── plugins/          # 배포 완료 플러그인
│   └── .claude-plugin/   # marketplace.json
│
├── docs/                 # 설계 문서 및 인사이트
└── review/               # 리뷰 작업물
```

---

## bench 실행

테스트는 `node:test` 기반 `.mjs` 파일이다. 별도 패키지 설치 불필요.

**전체 실행:**
```bash
find forge/harness/bench/tests -name "*.test.mjs" | xargs node --test
```

**카테고리별 실행:**
```bash
node --test forge/harness/bench/tests/guardrails/*.test.mjs
node --test forge/harness/bench/tests/state/*.test.mjs
node --test forge/harness/bench/tests/gates/*.test.mjs
node --test forge/harness/bench/tests/knowledge/*.test.mjs
node --test forge/harness/bench/tests/qa/*.test.mjs
node --test forge/harness/bench/tests/validators/*.test.mjs
node --test forge/harness/bench/tests/skills/**/*.test.mjs
```

**단일 파일:**
```bash
node --test forge/harness/bench/tests/guardrails/block-destructive.test.mjs
```

---

## dev → marketplace 이동

`dev/plugin/`이 완성도 기준을 충족하면 `marketplace/plugins/harness/`로 이동한다.

**이동 조건:**

| 조건 | 기준 |
|------|------|
| bench/tests 전부 통과 | `node --test` 실패 0 |
| spec.yaml AC 충족 | `dev/specs/*.spec.yaml`의 Acceptance Criteria 대조 |
| plugin.json / hooks.json 정합성 확인 | 플러그인 매니페스트 검토 |

**이동 절차:**
```bash
# 1. 플러그인 디렉토리 복사
cp -r forge/harness/dev/plugin/ forge/harness/marketplace/plugins/harness/

# 2. marketplace.json의 "plugins" 배열에 항목 추가
#    forge/harness/marketplace/.claude-plugin/marketplace.json
```

이동 후 `marketplace.json` 예시:
```json
{
  "plugins": [
    {
      "name": "harness",
      "path": "./plugins/harness",
      "version": "0.1.0"
    }
  ]
}
```
