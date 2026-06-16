# Project Structure

> 하네스 플러그인 구조, 유저 프로젝트 구조, Config 스키마, 문서 체계.
>
> **반복 등장 용어:** `AC`(Acceptance Criteria — coverage.json의 매핑 키), `Right-Size`(config.yaml의 `workflow.right_size` 설정값). 표준 정의는 [00-overview.md#용어집](00-overview.md#용어집-glossary).

---

## 1. 하네스 개발 전체 구조 (forge/harness/)

```
forge/harness/
│
├── docs/                                ← 문서
│   ├── insights/                        ← 리서치 분석
│   │   ├── agentic-framework-patterns.md
│   │   └── claude-platform-blueprint.md
│   └── design/                          ← 설계 문서 (현재)
│       ├── 00-overview.md
│       ├── 01-philosophy.md
│       ├── 02-architecture.md
│       ├── 03-workflow.md
│       ├── 04-agent-system.md
│       ├── 05-project-structure.md
│       ├── 06-cli-reference.md
│       ├── 07-hooks-system.md
│       ├── 08-skill-system.md
│       ├── 09-script-system.md
│       └── 10-state-and-audit.md
│
├── dev/                                 ← 도메인 A: 하네스 자체 개발 공간
│   ├── specs/                           ← 하네스 스킬/에이전트 Spec
│   ├── plans/                           ← 구현 계획
│   └── tests/                           ← 하네스 자체 테스트
│
├── bench/                               ← 하네스 검증/벤치마크
│   ├── evals/                           ← 스킬 평가 (headless)
│   ├── pressure/                        ← 압력 테스트
│   └── regression/                      ← 회귀 테스트
│
└── marketplace/                         ← 배포 산출물
    ├── .claude-plugin/
    │   └── marketplace.json             ← 마켓플레이스 매니페스트
    └── plugins/
        └── harness/                     ← 메인 플러그인
            └── (아래 §2 참조)
```

---

## 2. 하네스 플러그인 구조 (harness/)

### 2.0 슬래시 명령 네이밍 규칙

Claude Code 플러그인은 **`/{plugin}:{skill}`** 한 단계 콜론만 지원한다 (`commands/` · `skills/` 서브디렉토리는 파일 정리용일 뿐 명령 이름에 반영되지 않음. [claude-code#2422](https://github.com/anthropics/claude-code/issues/2422) 참조).

따라서 `/harness:migrate:init` 같은 **다단계 콜론은 사용 불가**. 하네스는 대신 **git-style 서브커맨드** 패턴을 사용한다:

| 형식 | 예 | 언제 |
|------|----|------|
| `/harness:<skill>` | `/harness:spec auth/login` | 단일 동작 스킬 (대부분) |
| `/harness:<group> <sub>` | `/harness:migrate init`, `/harness:persona create` | 여러 서브커맨드를 가진 그룹 |

그룹 스킬의 `SKILL.md`는 첫 번째 인자를 보고 `scripts/{sub}.mjs`로 dispatch한다 (`dispatch.mjs` 참조). 새 서브커맨드는 스크립트 추가만으로 확장 가능.

```
harness/
├── .claude-plugin/
│   └── plugin.json                      ← 플러그인 매니페스트
│
├── skills/                              ← 단계별 스킬 (사용자 인터페이스)
│   │
│   ├── init/                            ← 프로젝트 초기 구성
│   │   ├── SKILL.md                     ← 오케스트레이션 지시
│   │   ├── scripts/
│   │   │   ├── scaffold-harness.mjs      ← .harness/ 디렉토리 생성
│   │   │   ├── gen-config.mjs            ← 유저 답변 기반 config.yaml 생성
│   │   │   └── copy-examples.mjs         ← example/ 파일을 프로젝트 루트에 복사 (유저 동의 시)
│   │   ├── references/
│   │   │   └── stack-presets.md          ← 스택별 기본 설정 가이드
│   │   ├── templates/
│   │   │   ├── config.yaml.tmpl         ← config 템플릿 (하네스 영역)
│   │   │   └── gitignore.tmpl           ← .harness용 gitignore
│   │   └── examples/                     ← 유저가 복사해 쓸 수 있는 예시 (강제 아님)
│   │       ├── CLAUDE.md.example        ← CLAUDE.md 예시 (스킬 카탈로그 · 프로젝트 컨텍스트)
│   │       └── rules/                   ← .claude/rules/ 예시 (업계 선례상 유저 소유)
│   │           ├── harness-workflow.md.example
│   │           ├── test-first.md.example
│   │           └── architecture.md.example
│   │
│   ├── brainstorm/                      ← 아이디어 탐색
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── load-personas.mjs         ← .claude/agents/ 로드
│   │   │   ├── suggest-personas.mjs      ← 프로젝트 타입·주제 기반 페르소나 추천
│   │   │   └── summarize-session.mjs     ← 결과 정리
│   │   └── references/
│   │       ├── brainstorm-guide.md      ← 효과적 브레인스토밍 지침
│   │       └── persona-creation.md      ← 페르소나 생성 가이드
│   │
│   ├── spec/                            ← 기능 명세
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── validate-spec.mjs         ← Spec 형식/완성도 검증
│   │   │   ├── check-testability.mjs     ← criteria testability 확인
│   │   │   └── extract-criteria.mjs      ← acceptance criteria 추출
│   │   ├── references/
│   │   │   ├── spec-writing-guide.md    ← Spec 작성법
│   │   │   └── acceptance-patterns.md   ← 좋은 AC 패턴/안티패턴
│   │   └── templates/
│   │       └── spec.template.yaml       ← Spec 파일 템플릿
│   │
│   ├── architect/                       ← 소프트웨어 아키텍처
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── check-constraints.mjs     ← 아키텍처 제약 검증
│   │   │   └── dep-graph.mjs             ← 의존성 그래프 분석
│   │   └── references/
│   │       ├── clean-architecture.md    ← Clean Architecture 가이드
│   │       ├── hexagonal.md             ← Hexagonal Architecture 가이드
│   │       ├── security-checklist.md    ← 보안 체크리스트
│   │       └── performance-principles.md← 성능 원칙
│   │
│   ├── ux/                              ← UI/UX 설계
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   └── check-accessibility.mjs   ← 접근성 검증
│   │   └── references/
│   │       ├── accessibility-guide.md   ← WCAG 2.1 AA 가이드
│   │       └── responsive-patterns.md   ← 반응형 패턴
│   │
│   ├── plan/                            ← 구현 계획
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── gate-check.mjs            ← Spec 존재 확인
│   │   │   ├── decompose.mjs             ← 태스크 분해 보조
│   │   │   └── validate-plan.mjs         ← Plan↔Spec 매핑 검증
│   │   ├── references/
│   │   │   └── plan-writing-guide.md    ← Plan 작성법
│   │   └── templates/
│   │       └── plan.template.md         ← Plan 파일 템플릿
│   │
│   ├── implement/                       ← 코드 구현
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── gate-check.mjs            ← Spec+Plan 존재 확인
│   │   │   ├── gen-test-skeleton.mjs     ← Spec → Test skeleton 생성
│   │   │   ├── run-tests.mjs             ← 테스트 실행 래퍼
│   │   │   ├── check-side-effects.mjs    ← 기존 test 깨짐 감지
│   │   │   └── coverage-report.mjs       ← 커버리지 산출
│   │   └── references/
│   │       └── tdd-workflow.md          ← TDD 워크플로우 가이드
│   │
│   ├── review/                          ← 코드 리뷰
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── gate-check.mjs            ← implement 완료 확인
│   │   │   ├── diff-analyzer.mjs         ← 변경 범위 분석
│   │   │   └── collect-verdicts.mjs      ← 리뷰어 판단 종합
│   │   └── references/
│   │       ├── security-review.md       ← 보안 리뷰 체크리스트
│   │       ├── performance-review.md    ← 성능 리뷰 체크리스트
│   │       └── code-quality-review.md   ← 코드 품질 체크리스트
│   │
│   ├── qa/                              ← QA 테스트
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── gate-check.mjs            ← review PASS 확인
│   │   │   ├── regression-runner.mjs     ← regression test 실행
│   │   │   ├── coverage-threshold.mjs    ← 커버리지 임계값 확인
│   │   │   └── report-gen.mjs            ← QA 보고서 생성
│   │   └── references/
│   │       ├── qa-strategy.md           ← QA 전략 가이드
│   │       └── test-types.md            ← 테스트 유형별 가이드
│   │
│   ├── deploy/                          ← 배포
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── gate-check.mjs            ← QA PASS 확인
│   │
│   ├── sync/                            ← /harness:sync — 코드↔문서 동기화
│   │   ├── SKILL.md                     ← /harness:sync 오케스트레이션
│   │   ├── scripts/
│   │   │   ├── detect-drift.mjs          ← last-sync-commit vs HEAD 비교
│   │   │   ├── extract-changes.mjs       ← 변경된 코드에서 spec 영향 추출
│   │   │   └── update-specs.mjs          ← spec/plan/test 역방향 갱신
│   │   └── references/
│   │       └── sync-strategy.md         ← 동기화 전략 가이드
│   │
│   ├── persona/                         ← /harness:persona <sub> — 페르소나 관리 (git-style)
│   │   ├── SKILL.md                     ← 첫 인자(subcommand) dispatch: create/list/edit/delete
│   │   ├── scripts/
│   │   │   ├── dispatch.mjs             ← 인자 파싱 → scripts/{sub}.mjs 호출
│   │   │   ├── create.mjs               ← `/harness:persona create` (대화형 생성)
│   │   │   ├── list.mjs                 ← `/harness:persona list`
│   │   │   ├── pick-template.mjs        ← 답변 → 템플릿 매칭 (domain/business/tech)
│   │   │   └── render-persona.mjs       ← 초안 렌더링 → .claude/agents/
│   │   └── references/
│   │       └── persona-patterns.md     ← 페르소나 작성 패턴 가이드
│   │
│   └── migrate/                         ← /harness:migrate <sub> — 마이그레이션 (git-style)
│       ├── SKILL.md                     ← 첫 인자(subcommand) dispatch: init/analyze/extract-spec/gen-test
│       ├── scripts/
│       │   ├── dispatch.mjs             ← 인자 파싱 → scripts/{sub}.mjs 호출
│       │   ├── init.mjs                 ← `/harness:migrate init` — 초기 구성
│       │   ├── analyze.mjs              ← `/harness:migrate analyze` — 기존 프로젝트 분석
│       │   ├── extract-spec.mjs         ← `/harness:migrate extract-spec` — Code → Spec 역추출
│       │   ├── gen-test.mjs             ← `/harness:migrate gen-test` — 테스트 없는 코드 → 테스트 생성
│       │   ├── detect-stack.mjs         ← 기존 프로젝트 스택 감지 (migrate 전용)
│       │   └── scaffold-harness.mjs     ← (공용) .harness/ 구조 생성
│       └── references/
│           └── migration-strategy.md    ← 마이그레이션 전략 가이드
│
├── agents/                              ← 역할별 에이전트
│   ├── core/                            ← 기본 에이전트
│   │   ├── explorer.md
│   │   ├── implementer.md
│   │   ├── reviewer-security.md
│   │   ├── reviewer-performance.md
│   │   ├── reviewer-quality.md
│   │   ├── reviewer-spec.md
│   │   ├── test-strategist.md
│   │   ├── verifier.md
│   │   ├── architect.md
│   │   ├── requirements-analyst.md
│   │   ├── devils-advocate.md
│   │   └── qa-engineer.md
│   │
│   └── personas/                        ← 유저 페르소나 가이드
│       ├── README.md                    ← 페르소나 생성 가이드
│       └── templates/
│           ├── domain-expert.template.md
│           ├── business-role.template.md
│           └── tech-specialist.template.md
│
├── hooks/
│   └── hooks.json                       ← 전체 Hook 정의
│
├── scripts/                             ← 공용 스크립트 (스킬 간 공유)
│   ├── guardrails/                      ← Safety Layer
│   │   ├── block-destructive.mjs         ← rm -rf, DROP TABLE 등 차단
│   │   ├── block-force-push.mjs          ← git push --force 차단
│   │   └── protect-harness.mjs           ← .harness/state/ 직접 수정 차단
│   │
│   ├── gates/                           ← 워크플로우 게이트
│   │   └── gate-engine.mjs              ← 통합 게이트 엔진
│   │
│   ├── prompt/                          ← 프롬프트 파이프라인
│   │   ├── quality-check.mjs             ← 모호성/스코프/누락 검사
│   │   └── auto-transform.mjs            ← 프롬프트 자동변환
│   │
│   ├── state/                           ← 상태 관리
│   │   ├── load-state.mjs                ← SessionStart 시 상태 로드
│   │   ├── update-workflow.mjs           ← Stop 시 상태 갱신
│   │   ├── compact-recovery.mjs          ← Compact 후 상태 복원
│   │   └── audit-append.mjs              ← audit.jsonl append (flock + rotate)
│   │
│   ├── hooks/                           ← SessionStart 컨텍스트 주입
│   │   └── session-start-context.mjs    ← 스킬 카탈로그·워크플로우 요약·활성 feature·
│   │                                       bypass_budgets 잔량을 SessionStart hook additionalContext로 주입
│   │                                       (CLAUDE.md 의존 제거용 — 유저는 선택적으로 CLAUDE.md.example 사용)
│   │
│   ├── workflow/                        ← 결정 엔진 (Workflow Layer)
│   │   ├── determine-mode.mjs            ← mode 자동 판별 (config.auto_detect)
│   │   │                                   → emit mode_auto_detected
│   │   └── determine-size.mjs            ← right-size 자동 판별 (3축 AND)
│   │                                       → emit right_size_determined
│   │
│   ├── qa/                              ← QA Stack / Coverage 계산
│   │   ├── stack-runner.mjs              ← qa_stack.mode에 따른 계층 실행
│   │   │                                   → emit qa_layer_halted
│   │   ├── attribution.mjs               ← 실패 귀인 리포트 (failed_layer/verdict)
│   │   │                                   → emit qa_attribution_report
│   │   ├── mock-ratio.mjs                ← integration_ratio + mock_guard 감지
│   │   │                                   → emit qa_attribution_warning
│   │   └── coverage-trend.mjs            ← iteration 간 각 축 델타 계산
│   │
│   └── validators/                      ← 공용 검증
│       ├── check-side-effects.mjs        ← 기존 test 깨짐 감지
│       ├── doc-coverage.mjs              ← Spec있는데 Plan/Test 없으면 경고
│       └── check-coverage.mjs            ← Spec↔Test 매핑 확인
│
├── templates/                           ← 프로젝트 템플릿
│   └── project/
│       ├── config.yaml.tmpl             ← config 기본 템플릿
│       └── personas/
│           └── default-set.yaml         ← 프로젝트 타입별 기본 페르소나 세트
│
└── settings.json                        ← 플러그인 기본 설정
```

---

## 3. 유저 프로젝트 구조 (.harness/)

하네스를 사용하는 프로젝트에서 하네스가 관리하는 구조.

```
user-project/
│
├── .claude/
│   ├── settings.json                    ← harness 플러그인 활성화
│   ├── agents/                          ← 유저 페르소나 (Claude Code 표준 경로)
│   │   ├── ddd-expert.md                ← 예시: DDD 전문가
│   │   └── saas-cto.md                  ← 예시: SaaS CTO
│   └── rules/                           ← 유저 소유 (optional) — 업계 선례가 유저 편집 영역
│       ├── harness-workflow.md           ←   examples/rules/*.md.example을 복사해 시작
│       ├── test-first.md                ←   하네스는 덮어쓰지 않음. drift는 /harness:sync로 감지만
│       └── architecture.md              ←   (config 기반 검증은 reviewer-architecture가 직접 수행)
│
├── CLAUDE.md                            ← 유저 소유 (optional) — Anthropic 선례가 "project context file"로 지칭
│                                          examples/CLAUDE.md.example 복사 안내만. 스킬 카탈로그는 SessionStart hook이 주입
│                                          ⚠️ README 복사 금지 — 비자명한 레포-특화 제약만 (Gloaguen 2026: LLMCtx −3% 성공/+23% 비용)
│
├── .harness/                            ← 하네스 관리 공간 (하나로 뭉침)
│   │
│   ├── config.yaml                      ← 하네스 설정 (§4 참조)
│   │
│   ├── specs/                           ← 기능 명세 (Source of Truth)
│   │   └── {domain}/
│   │       └── {feature}.spec.yaml
│   │       예: auth/login.spec.yaml
│   │           auth/token-refresh.spec.yaml
│   │           payment/checkout.spec.yaml
│   │
│   ├── plans/                           ← 구현 계획
│   │   └── {domain}/
│   │       └── {feature}.plan.md
│   │       예: auth/login.plan.md
│   │
│   ├── decisions/                       ← 아키텍처 결정 기록 (ADR)
│   │   └── {nnn}-{title}.md
│   │   예: 001-jwt-strategy.md
│   │       002-database-choice.md
│   │
│   ├── reviews/                         ← 리뷰/QA 기록
│   │   └── {domain}/
│   │       └── {feature}-{type}-{iteration}.md
│   │       예: auth/login-review-001.md
│   │           auth/login-qa-001.md
│   │
│   ├── knowledge/                       ← 축적 지식
│   │   └── solutions/
│   │       └── {domain}/
│   │           └── {title}.md
│   │       예: auth/bcrypt-timing-attack.md
│   │
│   └── state/                           ← 워크플로우 상태 (하네스 자동 관리)
│       ├── workflow.json                ← 현재 상태 snapshot (fold 결과)
│       ├── coverage.json                ← Spec↔Test (AC) 매핑 현황 (snapshot)
│       ├── coverage-report.json         ← 다축 Coverage 통합 레포트 (line/branch/mutation/ac/boundary/error_path/integration_ratio)
│       ├── coverage-trend.json          ← 이터레이션별 각 축 값 추이 (delta 계산용)
│       ├── qa-attribution.json          ← QA Stack 실패 귀인 리포트 (failed_layer/verdict)
│       ├── events/                      ← Event stream (append-only, Aggregate별)
│       │   └── {domain}/
│       │       └── {feature}/
│       │           └── {YYYY-MM}.jsonl  ← 월별 샤드. 한 줄 = 한 이벤트
│       │       예: auth/login/2026-04.jsonl
│       ├── snapshots/                   ← Aggregate별 상태 snapshot (선택, 성능용)
│       │   └── {domain}/
│       │       └── {feature}.json
│       ├── audit.jsonl                  ← 자동 판단 감사 로그 (append-only)
│       │                                  — mode/right-size/prompt/model/gate
│       │                                    전환 근거 역추적. config.audit 참조.
│       ├── audit-{YYYY-MM}.jsonl        ← 회전된 과거 로그 (rotate_mb 초과 시)
│       ├── escalations.jsonl            ← Saga 보상 실패 시 유저 개입 요청 큐
│       ├── incidents/                   ← Pivot 이후(Deploy) 실패 기록
│       │   └── {YYYY-MM-DD}-{slug}.md
│       └── index.json                   ← stream 목록·최신 seq 번호
│
├── src/                                 ← 유저 코드 (구조는 유저 자유)
│   └── (whatever structure user prefers)
│
└── tests/                               ← 유저 테스트 (IDE/CI 인식 필요)
    └── (whatever structure user prefers)
```

**핵심 규칙:**

| 규칙 | 설명 |
|------|------|
| `.harness/` 안은 하네스가 관리 | 문서 형식, 파일명 규칙, 커버리지 검증 |
| `.harness/` 밖은 유저의 영역 | src/, tests/ 구조는 하네스가 강제하지 않음 |
| tests/는 .harness/ 밖 | 코드이므로 IDE 인식, CI 실행 필요 |
| `.claude/agents/`에 페르소나 | Claude Code 표준 경로. 네이티브 탐색 가능 |
| `.claude/rules/`는 **유저 소유** (optional) | `/harness:init` 은 `examples/rules/*.md.example` 복사 안내만. 하네스가 덮어쓰지 않음 (업계 선례: OpenAI `AGENTS.md` · Anthropic `CLAUDE.md` 모두 유저 컨텍스트 파일로 취급) |
| `CLAUDE.md`는 **유저 소유** (optional) | `examples/CLAUDE.md.example` 복사 안내만. 스킬 카탈로그·워크플로우 요약은 SessionStart hook의 `session-start-context.mjs` 가 `additionalContext`로 주입. **작성 원칙: README 복사 금지 — 비자명한 레포-특화 제약(특이 빌드 명령·정책 금지사항·숨은 환경 요구)만.** ETH Zürich AGENTbench 실증(Gloaguen 2026): LLM 자동 생성 컨텍스트 −3% 성공·+23% 비용, 개발자 수기 +4% 성공·+19% 비용 — 비용은 항상 발생하므로 최소화가 유일한 안전 전략 |
| Spec↔Test 매핑은 하네스가 추적 | .harness/state/coverage.json |
| state/는 하네스만 수정 | 유저/에이전트 직접 수정 차단 (Safety) |

---

## 4. Config 스키마 (.harness/config.yaml)

```yaml
# .harness/config.yaml — 하네스 프로젝트 설정

# ─── 프로젝트 정보 ─────────────────────────────────────────────
project:
  name: "my-app"
  type: webapp                          # webapp | api | library | monorepo | cli
  
  # 유저의 코드 구조 (하네스가 강제하지 않음 — 탐색/매핑용)
  structure:
    source: src/
    tests: tests/
    # 모노레포의 경우:
    # packages:
    #   api: packages/api/
    #   web: packages/web/
  
  # 기술 스택 (에이전트 컨텍스트 제공용)
  stack:
    language: typescript
    framework: nextjs
    test_runner: vitest
    package_manager: pnpm
    database: postgresql                # 선택
    orm: prisma                         # 선택

# ─── 워크플로우 ────────────────────────────────────────────────
workflow:
  # 모드: auto | standard (배포 가능 제품) | prototype (실험) | explore (QnA·학습)
  # - 기본값은 standard (조용한 전환 방지)
  # - auto 는 opt-in: 세션 시작 시 classifier가 결정. 02-architecture.md §3 ⑤ 참조
  # → 모드별 게이트/파이프라인/Test-First 활성화 여부는 01-philosophy.md §5 참조
  mode: standard

  # Mode Auto-Detect (mode: auto 일 때만 유효)
  # 자동 변환은 Audit Log(아래 audit 블록)에 전부 기록됨.
  auto_detect:
    enabled: false                      # mode가 auto일 때만 참조됨
    initial_default: standard           # 신호 부족 시 fallback (가장 엄격한 기본)

    # 안전 규칙 — 자동 전환이 게이트를 조용히 풀지 못하도록
    safety:
      narrow_only: true                 # standard → (prototype|explore) 자동 내림 금지
      promotion_requires_user: true     # prototype/explore → standard 승격은 /harness:sync만
      session_start_only: true          # 분류는 세션 시작 1회만, 중간 전환 금지

    # 판별 규칙 — 위에서 아래로 평가, 첫 매치로 확정 (결정론적)
    # scripts/workflow/determine-mode.mjs 가 이 규칙을 소비
    rules:
      - id: RULE-MODE-EXPLORE-001
        desc: "질문형 프롬프트 + 수정 의도 없음 + /harness:* 미호출"
        when:
          prompt_classifier: [question, explain, howto]
          no_harness_skill: true
          no_file_edit_intent: true
        set: explore

      - id: RULE-MODE-PROTOTYPE-001
        desc: "실험 브랜치 + 대상 feature의 spec 부재"
        when:
          branch_pattern: "^(experiment|spike|prototype|draft)/"
          no_spec_for_target: true
        set: prototype

      - id: RULE-MODE-STANDARD-DEFAULT
        desc: "위 조건에 매치되지 않으면 가장 엄격한 기본값"
        when: {}                        # fallthrough
        set: standard

  # Explore 모드 옵션 (mode: explore 일 때, 또는 auto로 explore 확정 시)
  explore:
    allow_edit: false                   # true면 편집 허용, false면 경고만 출력

  # 프롬프트 파이프라인 (mode: explore 에서는 자동 비활성화)
  prompt_pipeline:
    auto_transform: true                # 프롬프트 자동변환
    feedback: true                      # 피드백 모드

    # Escape Hatch lexicon — 자연어 의도 키워드 → --bypass-* 제안 (03-workflow.md §1.9)
    # 매칭 시 자동 우회하지 않고 유저에게 확인 프롬프트 + --reason 요구
    escape_lexicon:
      "bypass-qa":        ["긴급 배포", "hotfix 배포", "지금 바로 배포", "QA 없이 배포"]
      "bypass-gates:g1":  ["spec 없이", "spec 건너뛰어"]
      "bypass-gates:g2":  ["plan 없이", "계획 건너뛰어"]
      "bypass-review":    ["리뷰 스킵", "리뷰 없이", "QA 바로"]
      # 팀별 커스텀 용어 추가 가능

  # Right-Size 설정 (판정 근거: 00-overview.md Glossary의 footnote 참조)
  right_size:
    threshold: auto                     # auto | small | medium | large
    # auto: 아래 thresholds를 사용해 결정론적으로 판정
    # small|medium|large: 수동 고정 — Architect는 상향만 override 가능

    # 3축 임계값 (AND 결합). 한 축이라도 넘으면 상위 밴드로 승격.
    # 기본값은 인간 리뷰어 기준(Miller 1956, SmartBear 2012, Google/MS 가이드)
    thresholds:
      small:
        ac_max: 3                       # Miller 3±1 하한
        files_max: 4                    # SmartBear 2012 검출률 피크
        loc_max: 100                    # Google "small PR"
      medium:
        ac_max: 7                       # Miller 7±2 상한
        files_max: 10                   # Rigby & Bird 2013 median
        loc_max: 400                    # SmartBear 400 LOC/h 검출 한계
      # large: 위 medium 밴드 초과 — 자동 split_required=true

    # LOC 측정에서 제외할 파일 패턴 (git diff --numstat 기반)
    loc_exclude:
      - "**/package-lock.json"
      - "**/pnpm-lock.yaml"
      - "**/yarn.lock"
      - "**/*.snap"
      - "**/__snapshots__/**"
      - "**/generated/**"
      - "**/*.generated.*"
      - "**/fixtures/**"

    # 언어 보정 (선택) — 언어당 loc_max를 배수로 조정
    # 미설정 시 1.0 — 기본 수치(100/400)를 그대로 사용
    loc_multiplier:
      # go: 1.3                         # Go는 명시성으로 LOC가 커짐
      # rust: 1.2
      # ts: 1.0
      # kotlin: 0.9

    # 수준별 ceremony 차등
    small:
      skip: [brainstorm, architect, ux]
      review: light                     # 단일 reviewer
      qa: [unit, sanity, smoke]

    medium:
      skip: [brainstorm]
      review: standard                  # 2-3 reviewer
      qa: [unit, sanity, smoke, integration, regression]

    large:
      skip: []                          # 전 단계 필수
      review: deep                      # 4 reviewer 병렬
      qa: [unit, sanity, smoke, integration, regression, e2e, load, stress, recovery]
      split_required: true              # Architect가 feature 분할 검토 강제

    # Architect override 규칙
    # - security/complexity 평가 결과 상향만 허용 (force_size: medium | large)
    # - 하향 고정 금지 (판정식은 하한, 실제 위험은 이보다 클 수 있음)
    force_size_policy: upward_only

  # Iron Laws 표시 (끌 수 없음)
  # gates:
  #   spec_before_implement: always     # 읽기 전용
  #   plan_before_implement: always     # 읽기 전용
  #   test_before_qa: always            # 읽기 전용
  #   qa_before_deploy: always          # 읽기 전용

# ─── 아키텍처/디자인 ───────────────────────────────────────────
architecture:
  style: clean-architecture             # clean-architecture | hexagonal | layered | custom
  custom_guide: null                    # custom 시: .harness/guides/architecture.md

  patterns:                             # 선택: 사용하는 디자인 패턴
    - repository-pattern
    # - cqrs
    # - event-sourcing
  
  constraints:
    max_module_dependencies: 5
    no_circular_deps: true

ux:
  style: null                           # material-design-3 | apple-hig | custom | null (비UI)
  custom_guide: null
  
  constraints:
    max_click_depth: 3                  # 선택
    mobile_first: true                  # 선택
    dark_mode: required                 # required | optional | none

# ─── 에이전트 설정 ─────────────────────────────────────────────
agents:
  # 역할별 모델 오버라이드
  implementer:
    model: sonnet                       # haiku | sonnet | opus | inherit
  reviewer-security:
    model: opus                          # 보안 리뷰는 opus 필수 (04-agent-system.md ⚑)
  reviewer-performance:
    model: sonnet
  reviewer-quality:
    model: sonnet
  reviewer-spec:
    model: sonnet
  architect:
    model: opus
  explorer:
    model: haiku
  verifier:
    model: haiku

  # Confidence 임계값
  confidence_threshold:
    done: 0.80
    concerns: 0.60

# ─── 테스트 전략 ───────────────────────────────────────────────
testing:
  # 테스트 피라미드/트로피는 참고 가이드 (03-workflow.md 부록 A.4).
  # 실질 품질 강제는 integration_ratio(mock-vs-real) + Coverage 8축이 담당.
  # Shape 자체는 하네스가 직접 강제하지 않음 — 잡아야 할 건 layer 개수 비율이 아닌 mock-only 편향.

  # Coverage 다축 전략 (03-workflow.md §4.4 참조)
  # 단일 정량 수치(line%)는 coverage의 증명이 아니다 — 3범주 × 8축 교차 검증.
  coverage:
    # ── 정량 축 (Quantitative) ─────────────────────────────
    line:
      min: 80                           # 최소 line coverage %
    branch:
      min: 70                           # 최소 branch coverage %
    mutation:
      tool: null                        # null | stryker | pit | mutmut | cargo-mutants
      min: 60                           # tool 설정 시 최소 mutation score %
      # Right-Size medium 이상에서 권장, large에서 필수
    ac:
      min: 100                          # 모든 AC가 매핑+PASS 여야 함 (coverage.json)

    # ── 정성 축 (Qualitative) ──────────────────────────────
    boundary:
      required_for: [medium, large]     # off-by-one / null / empty / max / min 체크
      responsible_agent: test-strategist
    error_path:
      required_for: [medium, large]     # 예외·실패 분기 검증 체크
      responsible_agent: reviewer-quality
    integration_ratio:
      min: 0.3                          # 전체 test 중 실제 의존성 쓰는 비율 하한 (30%)
      required_for: [large]             # small/medium은 선택
      # mock-only 편향 방지 — scripts/qa/mock-ratio.mjs 로 계산

    # ── 트렌드 축 (Trend) ──────────────────────────────────
    delta:
      policy: no_regression             # no_regression | allow_with_reason | ignore
      # - no_regression: 이전 대비 감소 시 G4 BLOCK (기본, 가장 엄격)
      # - allow_with_reason: 감소 허용하되 reason 필드 필수
      # - ignore: 트렌드 검사 off (비권장)
      tracked_axes: [line, branch, mutation, ac]

    # ── 옵션 축 (Advanced) ─────────────────────────────────
    property_based:
      enabled: false
      tool: null                        # fast-check | hypothesis | jqwik | null
    contract:
      enabled: false
      tool: null                        # pact | spring-cloud-contract | null
    fuzz:
      enabled: false
      tool: null                        # go-fuzz | libFuzzer | atheris | null

  # 하위호환: 기존 coverage_target 필드는 deprecated — coverage 블록으로 이관
  # coverage_target:
  #   line: 80
  #   branch: 70

  # 테스트 실행 명령 — 9가지 유형 (03-workflow.md 부록 A 참조)
  # 하네스는 유형(WHAT)만 강제, 러너·도구(HOW)는 유저 선택
  commands:
    unit: "pnpm test"
    sanity: "pnpm test:sanity"          # 수정 부위 국소 실행 (좁고 얕음)
    smoke: "pnpm test:smoke"            # 핵심 경로 1~2개 E2E (넓고 얕음)
    integration: "pnpm test:integration"
    regression: "pnpm test --all"       # 전체 suite 재실행
    e2e: "pnpm test:e2e"                # 유저 시나리오 전 구간
    load: "k6 run tests/load/default.js"
    stress: "k6 run tests/stress/default.js"
    recovery: "pnpm test:chaos"         # chaos/recovery 시나리오
    coverage: "pnpm test:coverage"
    # QA Stack 계층별 명령 (qa_stack.layers[].tests 에서 참조)
    infra: "pnpm test:infra"            # 환경변수/CORS/CSP/네트워크/secret 존재
    db: "pnpm test:db"                  # 마이그레이션/인덱스/쿼리 플랜
    api: "pnpm test:api"                # 엔드포인트 계약·에러 응답·인증
    ui: "pnpm test:ui"                  # 비주얼 회귀·a11y·반응형·브라우저

  # Right-Size별 QA 필수/권장 매트릭스 (03-workflow.md §1.2)
  # 3가지 scope.mode:
  #   auto    (기본) Right-Size 매트릭스 자동 적용
  #   manual  아래 include/exclude를 사용 — 영구 override
  #   request 매 /harness:qa 호출마다 플래그로 지정
  #           (플래그 미지정 시 auto와 동일)
  scope:
    mode: auto                          # auto | manual | request
    # manual 모드 예시:
    # include: [unit, sanity, smoke, integration, regression]
    # exclude: [load, stress, recovery]

  # 유저가 Right-Size 필수 유형을 skip했을 때 Gate (G4: QA→Deploy) 정책
  # 자세한 의미와 예시는 03-workflow.md §1.2 참조
  skip_required_policy: block_deploy    # block_deploy | warn | allow
  # - block_deploy (기본): 테스트는 실행되나 G4 통과 불가 — 배포 차단, 감사 경로 유지
  # - warn: audit에 기록만 하고 G4 통과 (실험/학습용)
  # - allow: 완전 무시 (dangerously, 프로덕션 금지)

  # /harness:qa 호출마다 audit.jsonl 에 qa_invoked 이벤트 기록
  # 매트릭스와 실제 실행 집합이 다르면 추가로 qa_scope_overridden emit
  # (config.audit.events에서 on/off 가능)

  # ── QA Stack — 계층 의존 순차 검증 (03-workflow.md §1.3.1) ─────
  # "Infra → DB → API → UI" 처럼 하위 계층부터 검증이 통과해야
  # 상위 계층이 실행된다. 상위 실패는 하위 PASS를 전제로 자동
  # 귀인(attribution)되어 "순수 UI 문제" 같은 진단을 가능하게 함.
  qa_stack:
    mode: parallel                      # parallel | sequential_bottom_up | custom
    # - parallel (기본, 하위호환): QA Concern을 병렬 실행 (빠름, 귀인 약함)
    # - sequential_bottom_up: 아래 layers 순서로 실행. 하나라도 FAIL이면
    #                         상위는 skip + 감사 이벤트 qa_layer_halted emit.
    #                         "완고한 소프트웨어" 구축용 (느리지만 엄격).
    # - custom: custom_order를 그대로 따름

    # 계층 정의 — name / depends_on / fail_policy / commands 매핑
    # depends_on 은 DAG 검증(순환 금지), topological 순으로 실행됨.
    layers:
      - name: infra
        depends_on: []
        tests: [infra]                  # testing.commands.infra (없으면 smoke의 env 부분)
        fail_policy: halt_upstream      # halt_upstream | continue | warn
      - name: db
        depends_on: [infra]
        tests: [db]                     # migration / query plan / index 검증
        fail_policy: halt_upstream
      - name: api
        depends_on: [db]
        tests: [integration, api]       # 계약·에러 응답·인증 시나리오
        fail_policy: halt_upstream
      - name: ui
        depends_on: [api]
        tests: [e2e, ui]                # 비주얼/a11y/반응형/브라우저
        fail_policy: halt_upstream

    # custom 모드에서만 사용 — layers 이름을 명시 순서로 나열
    custom_order: []                    # 예: [infra, api, db, ui]

    # 귀인(Attribution) — 상위 실패 + 하위 PASS = 상위 계층 문제로 자동 결론
    attribution:
      enabled: true                     # scripts/qa/attribution.mjs 실행
      output: .harness/state/qa-attribution.json
      # 리포트 예시:
      # {
      #   "failed_layer": "ui",
      #   "passed_layers": ["infra", "db", "api"],
      #   "verdict": "pure_ui_issue",
      #   "evidence": { "failed_tests": [...], "api_contract_match": true }
      # }

    # 귀인 신뢰성 조건 — 상위 테스트가 하위를 mock하면 귀인이 성립하지 않음
    # (UI가 API mock을 쓰면 "API PASS"라는 전제가 깨지므로)
    mock_guard:
      enforce: strict_lower_real        # strict_lower_real | warn | off
      # - strict_lower_real: 상위 계층 테스트에서 하위 계층 mock 감지 시 G4 BLOCK
      # - warn: 감지만 하고 qa_attribution_warning emit (G4는 통과)
      # - off: 검사 없음 (귀인 정확도 저하 감수)
      detect_rules:                     # 정적 분석 규칙 (scripts/qa/mock-ratio.mjs 와 공유)
        - "UI 테스트에서 API 경로/HTTP 클라이언트를 mock/stub으로 치환한 흔적"
        - "API 테스트에서 DB 연결을 in-memory/mock으로 치환한 흔적"

  # 도구 선택 (하네스는 유형을 강제, 도구는 자유)
  e2e_tool: playwright                  # playwright | cypress | selenium | custom
  load_tool: k6                         # k6 | artillery | jmeter | locust | custom
  chaos_tool: toxiproxy                 # toxiproxy | chaos-mesh | litmus | custom

  # 성능 SLA (load / stress / recovery 판정 기준)
  sla:
    load:
      p95_latency_ms: 200
      error_rate: 0.001                 # 0.1%
      target_rps: 1000
    stress:
      graceful_degrade: true            # 429/503 명확 반환 요구
      data_integrity: true              # 데이터 손상 불허
    recovery:
      rto_seconds: 30                   # Recovery Time Objective
      rpo_seconds: 0                    # Recovery Point Objective (데이터 손실 허용)

  # 대상 플랫폼
  platforms:                            # 복수 선택 가능
    - web
    # - ios
    # - android

# ─── 실행 전략 ─────────────────────────────────────────────────
execution:
  parallel:
    enabled: true                    # Plan의 독립 태스크를 병렬 실행
    max_worktrees: 3                 # 동시 worktree 최대 수
    auto_merge: true                 # 병렬 완료 후 자동 merge

# ─── 리팩토링 (/harness:refactor, 03-workflow.md §1.11) ────────
refactor:
  min_coverage: 70                      # Lv3 refactor 진입 전 최소 커버리지 (%)

# ─── 마이그레이션 (도메인 C 전용) ──────────────────────────────
# 원칙: 기존 코드를 legacy/로 옮기거나 entrypoint를 교체하지 않고
#       기존 구조 위에 .harness/ 레이어를 축적한다 (03-workflow.md §2.1~§2.2).
migration:
  strategy: wrap                        # wrap (Lv2) | refactor (Lv3) | mixed
  priority_modules: []                  # 우선 마이그레이션 모듈
  wrap_min_coverage: 60                 # Lv2 종료 커버리지 임계 (%)
  lv3_coverage_relaxation: 50           # Lv3 /harness:refactor 진입 임계값 완화 폭(%)
                                        # 예: refactor.min_coverage=70 + relaxation=50 → 실효 임계 20%

# ─── 감사 로그 (Audit / Debug) ─────────────────────────────────
# 하네스가 "자동으로 내린 판단"은 모두 여기로 기록.
# 목적: 왜 이 모드로 확정됐는가 / 왜 이 right-size로 판정됐는가 /
#       프롬프트가 어떻게 변환됐는가 / 게이트가 왜 skip됐는가 — 역추적.
# 저장 경로: .harness/state/audit.jsonl (append-only JSONL)
audit:
  enabled: true                         # false면 자동 판단은 여전히 동작, 기록만 중단
  path: .harness/state/audit.jsonl
  retention_days: 90                    # 0 = 영구 보존
  rotate_mb: 50                         # 파일이 이 크기 넘으면 audit-YYYY-MM.jsonl 로 회전

  # 어떤 자동 판단 이벤트를 기록할지 (기본 전부 on)
  events:
    mode_auto_detected: true            # workflow.auto_detect 가 결정한 모드
    right_size_determined: true         # determine-size.mjs 결과
    force_size_applied: true            # Architect가 상향 override
    prompt_transformed: true            # prompt_pipeline.auto_transform 결과
    model_tier_escalated: true          # haiku → sonnet → opus 자동 승격
    gate_skipped: true                  # mode가 explore/prototype이라 gate skip된 경우
    agent_escalation: true              # DONE/CONCERNS/NEEDS_CONTEXT/BLOCKED 전이
    qa_invoked: true                    # /harness:qa 호출 시 실행 집합·플래그 기록
    qa_scope_overridden: true           # 매트릭스와 실제 실행 집합이 다를 때
    coverage_evaluated: true            # Coverage 다축 평가 결과 (line/branch/mutation/ac/boundary/error_path/integration_ratio/delta)
    qa_layer_halted: true               # QA Stack sequential_bottom_up 모드에서 하위 FAIL로 상위 skip
    qa_attribution_report: true         # 실패 귀인(attribution) 리포트 — 어느 계층의 문제인가
    qa_attribution_warning: true        # mock_guard 경고 (상위가 하위를 mock → 귀인 무효)
    gate_bypassed: true                 # 유저 --bypass-* 로 gate/review/qa 우회 — --reason 필수 · 세션 sticky warning (03-workflow.md §1.9)

  # --bypass-* 유형별 주간 budget (초과 시 설계 재검토 시그널, 03-workflow.md §1.9)
  bypass_budgets:
    "bypass-qa": 2
    "bypass-gates:g1": 5
    "bypass-review": 3

  # PII/보안 대응 — 기록 시 redact할 필드
  redact_fields:
    - prompt_body                       # 프롬프트 본문 자체는 hash만 저장
    # - signals.file_content

  # 공통 이벤트 스키마 (참고용, 실제 기록은 JSONL)
  # {
  #   "ts": "2026-04-13T14:22:01Z",
  #   "session_id": "sess-01HX...",
  #   "event": "mode_auto_detected",
  #   "decision": { "from": null, "to": "standard" },
  #   "signals": { "has_spec": true, "branch": "feature/auth-login", ... },
  #   "rule_id": "RULE-MODE-STANDARD-DEFAULT",
  #   "reversible": true,               # 유저가 수동 override로 되돌릴 수 있는가
  #   "source": "hook:SessionStart"     # 어느 컴포넌트가 emit 했는가
  # }
```

---

## 5. 문서 체계 규칙

### 5.1 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **빈 문서 금지** | Spec이 있으면 Plan과 Test도 실체가 있어야 함. 빈 template 상태 금지 |
| **전체 커버리지** | 기능 1, 2, 3이면 1, 2, 3 모두 문서화. 2만 있는 상태는 허용 안 됨 |
| **하나의 공간** | 모든 하네스 산출물은 .harness/ 안에. 프로젝트 루트에 흩뿌리지 않음 |
| **Spec이 시작** | Spec 없는 Plan/Test/Code는 존재 이유가 없음 |
| **자동 검증** | 하네스가 커버리지를 자동으로 추적하고 빈틈을 경고 |

### 5.2 Spec ↔ Plan ↔ Test 매핑

```
.harness/specs/auth/login.spec.yaml
  │
  ├── AC-001 ──→ .harness/plans/auth/login.plan.md (Step 2)
  │              tests/auth/login.test.ts#valid-credentials
  │
  ├── AC-002 ──→ .harness/plans/auth/login.plan.md (Step 2)
  │              tests/auth/login.test.ts#invalid-password
  │
  └── AC-003 ──→ .harness/plans/auth/login.plan.md (Step 3)
                 tests/auth/login-lockout.test.ts
```

매핑 현황은 `.harness/state/coverage.json`에 자동 추적:

```json
{
  "specs": {
    "auth/login": {
      "status": "approved",
      "criteria": {
        "AC-001": { "plan_step": "Step 2", "test": "tests/auth/login.test.ts", "test_status": "pass" },
        "AC-002": { "plan_step": "Step 2", "test": "tests/auth/login.test.ts", "test_status": "pass" },
        "AC-003": { "plan_step": "Step 3", "test": "tests/auth/login-lockout.test.ts", "test_status": "fail" }
      },
      "coverage": {
        "criteria_with_plan": "3/3",
        "criteria_with_test": "3/3",
        "test_pass_rate": "2/3"
      }
    }
  },
  "orphan_tests": [],
  "specs_without_plan": [],
  "specs_without_test": []
}
```

**`coverage.json` 갱신 시점:**

| 시점 | 트리거 | 갱신 주체 | 갱신 항목 |
|------|--------|----------|-----------|
| Spec 저장 | `/harness:spec` 완료 | 스킬이 `scripts/state/update-coverage.mjs` 호출 | `specs[*].status`, `criteria` 목록 추가 |
| Plan 저장 | `/harness:plan` 완료 | 스킬이 `update-coverage.mjs` 호출 | `criteria[*].plan_step` 매핑 |
| Test 저장 | `/harness:implement` 중 test 파일 Write | PostToolUse hook → `update-coverage.mjs` | `criteria[*].test` 매핑, `orphan_tests` 재계산 |
| Test 실행 결과 | `/harness:qa` / `/harness:review` 종료 | 스킬이 `update-coverage.mjs` 호출 | `criteria[*].test_status`, `coverage.*` 재계산 |
| 일관성 검증 | `/harness:deploy` 전 | `validators/doc-coverage.mjs` (read-only) | 갱신 없음 — 불일치 시 배포 차단 |

- 모든 쓰기는 `scripts/state/update-coverage.mjs` 경유 (flock + read-modify-write).
- Worktree 내부 PostToolUse는 **summary만 stdout으로 emit**, 실제 파일 갱신은 메인 세션이 병합 시점에 수행 (→ 02 §7.5 참조).

### 5.3 버전 관리 — Event Log 스키마 진화 (Upcaster)

> **출처:** Event Sourcing의 *Versioned Event + Upcaster* 개념 차용 (프레임워크 도입 없음). 배경: [patterns/03-event-sourcing-evolution.md](../../insights/patterns/03-event-sourcing-evolution.md), 적용 근거: [patterns/05-harness-applicability.md §4.4](../../insights/patterns/05-harness-applicability.md#44--upcaster--스키마-진화-방어).
>
> → Upcaster 규칙·State 파일 스키마·Compact Recovery 상세: [10-state-and-audit.md](10-state-and-audit.md)

하네스 버전업 시 기존 프로젝트의 `.harness/state/events/**/*.jsonl`·`workflow.json` 스키마가 새 버전과 충돌하는 문제를 **읽을 때 변환(Schema on Read)**으로 해결.

**모든 이벤트 레코드의 공통 스키마:**

```json
{
  "v": 2,                                  // 스키마 버전 (필수)
  "ts": "2026-04-13T10:30:00.000Z",
  "stream": "auth/login",                  // Aggregate ID = {domain}/{feature}
  "seq": 42,                               // stream 내 순번 (append-only 보장)
  "type": "QAPassed",                      // 이벤트 타입명
  "payload": { ... },                      // 타입별 페이로드
  "producer": "harness:qa"                 // 발행 주체 (스킬명 또는 hook명)
}
```

**Upcaster 모듈 — `scripts/state/upcaster.mjs`:**

```javascript
// 이벤트 타입별 upcaster 체인. 각 함수는 한 버전씩만 올린다.
export const upcasters = {
  QAPassed: [
    // v1 → v2: duration_ms 필드 추가 (기본값 null)
    (e) => ({ ...e, v: 2, duration_ms: e.duration_ms ?? null }),
    // v2 → v3: agent_id 필드 추가
    (e) => ({ ...e, v: 3, agent_id: e.agent_id ?? "unknown" }),
  ],
  StepCompleted: [
    // v1 → v2: right_size 필드 추가
    (e) => ({ ...e, v: 2, right_size: e.right_size ?? "medium" }),
  ],
  // ... 타입별로 체인 유지
};

// 사용: 이벤트를 읽을 때 항상 최신 스키마로 변환
export function upcast(event) {
  const chain = upcasters[event.type] ?? [];
  let cur = event;
  const from = (cur.v ?? 1) - 1;  // v1은 인덱스 0부터
  for (let i = from; i < chain.length; i++) cur = chain[i](cur);
  return cur;
}
```

**규칙:**

| # | 규칙 | 이유 |
|---|------|------|
| 1 | 모든 이벤트는 `v` 필드를 **쓸 때 최신 버전**으로 기록 | 구버전으로 쓰면 upcaster 체인이 길어짐 |
| 2 | Upcaster는 **한 버전씩만** 올린다 | 점프 변환은 유지보수 불가 |
| 3 | 읽기 전 **반드시** `upcast()` 경유 | 소비자는 항상 최신 스키마를 본다 |
| 4 | **필드 추가**는 default 주입으로 해결 (additive 우선) | 가장 안전한 변경 |
| 5 | 필드 **삭제·이름변경**은 upcaster 필수 | additive 아니면 읽기 호환 책임 |
| 6 | **이벤트 타입 삭제** 금지 | 과거 로그 replay 불가 — deprecated 태그로만 표시 |
| 7 | `workflow.json`·`coverage.json` **snapshot도 `v` 필드 보유** | 오래된 스냅샷은 discard → events에서 rebuild |

**Snapshot 손상/버전 불일치 시 복구:**

```
workflow.json 로드 시 v != 현재 버전
  ↓
discard snapshot
  ↓
events/{feature}/*.jsonl 전체 읽기 → upcast → fold → 재생성
  ↓
새 버전으로 workflow.json 저장
```

→ **Snapshot은 최적화**이지 진실의 원천이 아니다. 진실은 events/*.jsonl. 이 규칙이 깨지면 Event Sourcing이 아니다.

**릴리스 체크리스트 (스키마 변경 시):**

- [ ] 새 필드는 additive인가? (default 주입 가능?)
- [ ] `v` 번호를 올렸는가?
- [ ] `upcaster.mjs`에 체인이 추가됐는가? (한 단계씩)
- [ ] 구버전 스냅샷 discard 로직 동작 확인?
- [ ] CHANGELOG에 스키마 변경 명시?

### 5.4 문서 커버리지 검증 (`scripts/validators/doc-coverage.mjs`)

```
doc-coverage.mjs 실행 시:
  1. .harness/specs/ 전체 스캔
  2. 각 spec에 대해:
     ├── .harness/plans/ 에 대응 plan 존재? → 없으면 WARNING
     ├── tests/ 에 매핑된 test 존재? → 없으면 WARNING
     └── Spec의 모든 AC가 test에 매핑? → 누락 있으면 WARNING
  3. 결과 리포트 출력

※ /harness:implement 진입 시 Gate로도 실행 (WARNING이 아닌 BLOCK)
```

---

## 6. /harness:init 플로우

### 6.1 새 프로젝트 (/harness:init)

```
/harness:init 실행
  │
  ├── 1. 프로젝트 정보 수집 (대화형 질문)
  │   ├── 프로젝트 이름
  │   ├── 프로젝트 타입 (webapp/api/library/monorepo/cli)
  │   ├── 기술 스택 (유저에게 질문. --stack 플래그로 직접 지정 가능)
  │   └── 아키텍처 선호 (질문 또는 "모르겠다" → Best Practice)
  │   ※ 새 프로젝트는 빈 디렉토리이므로 코드 감지(detect-stack)는 하지 않음.
  │      기존 프로젝트에서 코드 감지가 필요하면 /harness:migrate init 사용.
  │
  ├── 2. .harness/ 디렉토리 생성
  │   ├── config.yaml (수집된 답변 기반)
  │   └── state/workflow.json (초기 상태)
  │
  ├── 3. .claude/ 최소 구성
  │   ├── settings.json — 플러그인 활성화 확인 (하네스 필수)
  │   └── agents/ — 디렉토리 생성만. 내용물 없음.
  │   ※ rules/ 는 생성하지 않음 — 업계 선례(OpenAI AGENTS.md / Anthropic CLAUDE.md)가 유저 소유를
  │      전제로 하므로 하네스가 자동 생성하지 않는다. `examples/rules/*.md.example` 복사 안내만.
  │   ※ 페르소나 추천은 /harness:brainstorm 에서 주제 맥락과 함께 수행.
  │      빈 프로젝트에서 타입만으로 추천하는 것은 프리셋 복사에 불과하므로 init에서는 하지 않는다.
  │
  ├── 4. CLAUDE.md 자동 생성 없음
  │   ※ 스킬 카탈로그·워크플로우 요약은 SessionStart hook 의 `scripts/hooks/session-start-context.mjs`
  │      가 `additionalContext` 로 매 세션 주입. CLAUDE.md 는 선택적 유저 편집 영역.
  │      원하면 `examples/CLAUDE.md.example` 을 복사해 프로젝트 루트에 배치.
  │
  ├── 5. 환경 설정
  │   └── .gitignore 에 .harness/state/ 추가 (선택)
  │
  └── 6. 안내
      "프로젝트가 초기화되었습니다.
       · 스킬 카탈로그는 매 세션 시작 시 자동 주입됩니다.
       · 페르소나는 /harness:brainstorm 에서 주제와 함께 추천받을 수 있습니다.
         또는 /harness:persona create 로 직접 생성하세요.
       · 선택: cp \$CLAUDE_PLUGIN_ROOT/skills/init/examples/{CLAUDE.md.example,rules/*} ./
         복사하면 유저 소유 영역으로 편집 가능.
         ⚠️ CLAUDE.md 작성 시: README 내용을 복사하지 마세요.
            비자명한 레포-특화 제약(특이 빌드 명령, 정책 금지사항,
            숨은 환경 요구)만 적습니다. (ETH Zürich AGENTbench 2026:
            LLM 자동 생성 컨텍스트는 성공률 -3%, 비용 +23%;
            개발자 수기도 +4% 대가로 +19% 비용 — 최소화가 최선.)
       다음 단계: /harness:brainstorm 또는 /harness:spec으로 시작하세요."
```

### 6.2 마이그레이션 (/harness:migrate init)

```
/harness:migrate init [--strategy wrap|refactor|mixed] 실행
  │
  ├── 1. 기존 프로젝트 분석
  │   ├── scripts/migrate/detect-stack.mjs
  │   │   → package.json, go.mod, pom.xml 등에서 스택 감지
  │   ├── scripts/migrate/analyze.mjs
  │   │   → 코드 규모, 모듈 수, 파일 수 산출
  │   ├── 기존 테스트 탐지
  │   │   → tests/, __tests__/, *_test.go 등 탐지
  │   │   → 커버리지 측정 (가능한 경우)
  │   └── 기존 문서/설정 탐지
  │
  ├── 2. --strategy 결정 (기본 wrap)
  │   └── config.yaml migration.strategy 에 기록 (03-workflow.md §2.1)
  │
  ├── 3. .harness/ 디렉토리 생성
  │   ├── config.yaml (감지된 스택 + strategy 기반)
  │   │   └── migration 섹션 활성화
  │   └── state/workflow.json (마이그레이션 상태)
  │
  ├── 4. 마이그레이션 리포트 생성
  │   └── "47개 모듈, 테스트 커버리지 15%.
  │        핵심 모듈:
  │          - auth/ (23 파일, 테스트 2개)
  │          - payment/ (18 파일, 테스트 0개)  ← 위험
  │          - user/ (12 파일, 테스트 8개)
  │        권장: auth, payment부터 spec 역추출"
  │
  └── 5. 안내
      "마이그레이션이 초기화되었습니다.
       다음 단계: /harness:migrate analyze로 상세 분석을 진행하세요."
```

---

## 7. hooks.json 전체 구조

> → Hook 라이프사이클·실행 모델·분류 체계 상세: [07-hooks-system.md](07-hooks-system.md)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/load-state.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/compact-recovery.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/session-start-context.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/workflow/determine-mode.mjs"
          }
        ]
      }
    ],

    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/gates/gate-engine.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/prompt/quality-check.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/prompt/auto-transform.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/route-hint.mjs"
          }
        ]
      }
    ],

    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/block-destructive.mjs"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/block-force-push.mjs"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/protect-harness.mjs"
        }]
      }
    ],

    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/guardrails/track-bash-files.mjs"
        }]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/validators/check-side-effects.mjs"
        }]
      }
    ],

    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/state/update-workflow.mjs"
        }]
      }
    ]
  }
}
```

> **hooks.json ↔ 설계 대응 (검증용):**
>
> | Hook 이벤트 | 스크립트 | 설계 문서 참조 |
> |---|---|---|
> | SessionStart | `load-state.mjs` | 02-architecture.md §3 ④ State |
> | SessionStart | `compact-recovery.mjs` | 10-state-and-audit.md §7 (내부에서 snapshot 불일치 감지 시에만 실행) |
> | SessionStart | `session-start-context.mjs` | 02-architecture.md §6 |
> | SessionStart | `determine-mode.mjs` | 03-workflow.md §0.4 (mode=auto 시에만 실효) |
> | UserPromptSubmit | `gate-engine.mjs` | 03-workflow.md §1.2 |
> | UserPromptSubmit | `quality-check.mjs` | 02-architecture.md §3 ④ Quality |
> | UserPromptSubmit | `auto-transform.mjs` | 02-architecture.md §3 ④ Quality |
> | UserPromptSubmit | `route-hint.mjs` | 08-skill-system.md §4 (유저 입력 기반 다음 스킬 제안) |
> | PreToolUse (Bash) | `block-destructive.mjs` | 02-architecture.md §3 ① Safety |
> | PreToolUse (Bash) | `block-force-push.mjs` | 02-architecture.md §3 ① Safety |
> | PreToolUse (Edit\|Write) | `protect-harness.mjs` | 02-architecture.md §3 ① Safety |
> | PostToolUse (Bash) | `track-bash-files.mjs` | 02-architecture.md §3 ① Safety |
> | PostToolUse (Edit\|Write) | `check-side-effects.mjs` | 02-architecture.md §3 ④ Quality |
> | Stop | `update-workflow.mjs` | 02-architecture.md §3 ④ State |
