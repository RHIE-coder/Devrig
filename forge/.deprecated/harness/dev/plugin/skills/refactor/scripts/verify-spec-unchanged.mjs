// skills/refactor/scripts/verify-spec-unchanged.mjs
//
// [Model Limit Assumption]
// LLM은 리팩토링 중 Spec을 변경하여 "행동 보존"을 위반할 수 있다.
// → 리팩토링 전후 Spec 해시를 결정론적으로 비교하여 불변 확인.
//
// [Exit Protocol]
// exit(0) = Spec 불변 확인
// exit(2) = Spec 변경됨
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const bypassInvariant = process.env.HARNESS_BYPASS_INVARIANT === 'true';

function findSpec() {
  if (!featureName) return null;
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/specs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`),
    resolve(projectDir, '.harness/specs', `${featureName.replace(/\//g, '-')}.spec.yaml`),
  ];
  return candidates.find(existsSync) || null;
}

function main() {
  if (!featureName) {
    process.stderr.write('verify-spec-unchanged: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  if (bypassInvariant) {
    process.stderr.write('⚠️ refactor: spec invariant 검증 bypass\n');
    process.stdout.write(JSON.stringify({ unchanged: true, bypassed: true }) + '\n');
    process.exit(0);
  }

  // 스냅샷 로드
  const slug = featureName.replace(/\//g, '-');
  const snapPath = resolve(projectDir, '.harness/state', `refactor-snapshot-${slug}.json`);

  if (!existsSync(snapPath)) {
    process.stderr.write('verify-spec-unchanged: 스냅샷 없음 — snapshot.mjs를 먼저 실행하세요.\n');
    process.exit(1);
  }

  const snapshot = JSON.parse(readFileSync(snapPath, 'utf8'));

  // 현재 Spec 해시
  const specPath = findSpec();
  if (!specPath && !snapshot.spec_hash) {
    // 둘 다 없으면 변경 없음
    process.stdout.write(JSON.stringify({ unchanged: true, reason: 'no spec' }) + '\n');
    process.exit(0);
  }

  if (!specPath && snapshot.spec_hash) {
    process.stderr.write('⛔ Spec 파일이 삭제되었습니다!\n');
    process.exit(2);
  }

  const currentContent = readFileSync(specPath, 'utf8');
  const currentHash = createHash('sha256').update(currentContent).digest('hex');

  if (currentHash !== snapshot.spec_hash) {
    process.stderr.write(`⛔ Spec이 변경되었습니다! 리팩토링은 행동을 보존해야 합니다.\n`);
    process.stderr.write(`   이전: ${snapshot.spec_hash.slice(0, 12)}...\n`);
    process.stderr.write(`   현재: ${currentHash.slice(0, 12)}...\n`);
    process.stdout.write(JSON.stringify({
      unchanged: false,
      previous_hash: snapshot.spec_hash,
      current_hash: currentHash,
    }) + '\n');
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({ unchanged: true, hash: currentHash }) + '\n');
  process.stderr.write('✅ Spec 불변 확인\n');
  process.exit(0);
}

main();
