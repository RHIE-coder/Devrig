// skills/plan/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// G1: Spec 없이 Plan을 작성하면 요구사항 없는 구현이 됨.
// → Spec 존재를 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = Spec 존재
// exit(2) = Spec 없음

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function main() {
  if (!featureName) {
    process.stderr.write('gate-check: HARNESS_FEATURE 환경변수 필요\n');
    process.exit(1);
  }

  const candidates = [
    resolve(projectDir, '.harness/specs', `${featureName}.spec.yaml`),
  ];
  const parts = featureName.split('/');
  if (parts.length === 2) {
    candidates.push(resolve(projectDir, '.harness/specs', parts[0], `${parts[1]}.spec.yaml`));
  }

  const found = candidates.some(existsSync);
  if (!found) {
    process.stderr.write(`⛔ G1: Spec이 없습니다. /harness:spec ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({ gate: 'G1', passed: true, feature: featureName }) + '\n');
  process.exit(0);
}

main();
