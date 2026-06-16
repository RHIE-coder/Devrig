// skills/implement/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// G1+G2: Spec과 Plan 없이 구현을 시작하면 요구사항 없는 코드가 됨.
// → Spec + Plan 존재를 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = Spec + Plan 존재
// exit(2) = 전제조건 미충족

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function findFile(subDir, ext) {
  const candidates = [
    resolve(projectDir, subDir, `${featureName}${ext}`),
  ];
  const parts = featureName.split('/');
  if (parts.length === 2) {
    candidates.push(resolve(projectDir, subDir, parts[0], `${parts[1]}${ext}`));
  }
  return candidates.find(existsSync) || null;
}

function main() {
  if (!featureName) {
    process.stderr.write('gate-check: HARNESS_FEATURE 환경변수 필요\n');
    process.exit(1);
  }

  // G1: Spec 존재 확인
  const specPath = findFile('.harness/specs', '.spec.yaml');
  if (!specPath) {
    process.stderr.write(`⛔ G1: Spec이 없습니다. /harness:spec ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  // G2: Plan 존재 확인
  const planPath = findFile('.harness/plans', '.plan.md');
  if (!planPath) {
    process.stderr.write(`⛔ G2: Plan이 없습니다. /harness:plan ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({
    gates: ['G1', 'G2'],
    passed: true,
    feature: featureName,
    spec: specPath,
    plan: planPath,
  }) + '\n');
  process.exit(0);
}

main();
