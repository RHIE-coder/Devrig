// skills/qa/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// LLM은 리뷰 미완료 상태에서 QA를 진행할 수 있다.
// → implement.passed 상태를 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = QA 진입 가능
// exit(2) = 전제조건 미충족

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

  if (!feature?.implement?.passed) {
    process.stderr.write(`⛔ G3: Implement이 완료되지 않았습니다.\n`);
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
