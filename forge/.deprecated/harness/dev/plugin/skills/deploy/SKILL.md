# /harness:deploy

> QA 통과 후 배포 실행. Pivot transaction — 되돌릴 수 없으며 재시도만 가능.

## 사용법

```
/harness:deploy auth/login
/harness:deploy auth/login --reason "hotfix: 인증 장애 복구"
```

## 오케스트레이션

1. **Gate Check** — `scripts/gate-check.mjs`
   - G4: `workflow.features[feature].qa.passed === true` 확인
   - prototype 모드: G4만 확인 (review 불필요)
   - `--reason` 플래그로 G4 bypass 가능 (audit 기록)

2. **Pre-deploy Snapshot** — `scripts/pre-deploy-snapshot.mjs`
   - 현재 상태 스냅샷 (git SHA, workflow 상태, 커버리지)
   - `.harness/state/deploy-{feature}.json`에 기록

3. **배포 실행**은 LLM이 프로젝트별 deploy 명령을 실행
   - 스크립트는 gate + snapshot만 담당
   - 실제 배포 방법은 SKILL.md 지시로 LLM이 판단

## 제약

- 비가역적 작업 — 배포 후 보상 트랜잭션 없음 (재시도만 가능)
- explore 모드에서는 실행 불가 (실수 방지)
