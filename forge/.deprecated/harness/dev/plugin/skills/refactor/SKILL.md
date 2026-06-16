# /harness:refactor

> 행동 보존 코드 구조 개선. 메인 SDLC 밖의 유지보수 루프.

## 사용법

```
/harness:refactor auth/login
/harness:refactor auth/login --bypass-coverage     # 커버리지 미달 허용
/harness:refactor auth/login --bypass-invariant     # spec 불변 검증 건너뜀
```

## 오케스트레이션

1. **Gate Check** — `scripts/gate-check.mjs`
   - coverage >= config.refactor.min_coverage (default 70%)
   - `--bypass-coverage`로 waive 가능

2. **사전 스냅샷** — `scripts/snapshot.mjs`
   - Spec AC 해시, 테스트 결과 캡처
   - `.harness/state/refactor-snapshot-{feature}.json` 저장

3. **리팩토링 실행** — LLM (implementer, worktree)
   - Agent: explorer → implementer (mode: refactor)
   - Reviewer: reviewer-quality, reviewer-performance (reviewer-spec 불필요 — spec 불변 증명됨)

4. **사후 검증** — `scripts/verify-spec-unchanged.mjs`
   - Spec AC 해시 비교 → 불변 확인
   - 실패 시 rollback 안내

5. **테스트 동등성** — `scripts/verify-tests-identical.mjs`
   - 리팩토링 전후 테스트 실행 결과 비교
   - RED 테스트 발생 시 즉시 경고

## 제약

- Spec AC 변경은 리팩토링이 아님 — `/harness:sync` 또는 `/harness:implement` 사용
- 리팩토링 중 RED 테스트 → 마지막 변경 rollback 안내
