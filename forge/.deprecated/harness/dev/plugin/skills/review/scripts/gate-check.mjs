// skills/review/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// G3: Implement 완료 없이 리뷰를 시작하면 미완성 코드를 리뷰하게 됨.
// → Implement 완료 상태를 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = implement 완료 확인
// exit(2) = implement 미완료

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function loadWorkflow() {
  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) return null;
  try {
    return JSON.parse(readFileSync(wfPath, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  if (!featureName) {
    process.stderr.write('gate-check: HARNESS_FEATURE 환경변수 필요\n');
    process.exit(1);
  }

  const workflow = loadWorkflow();
  const feature = workflow?.features?.[featureName];

  // implement.passed 확인
  if (!feature?.implement?.passed) {
    process.stderr.write(`⛔ G3: Implement이 완료되지 않았습니다. /harness:implement ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({
    gate: 'G3',
    passed: true,
    feature: featureName,
  }) + '\n');
  process.exit(0);
}

main();
