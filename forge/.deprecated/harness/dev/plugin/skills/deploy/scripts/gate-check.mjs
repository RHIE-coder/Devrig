// skills/deploy/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// LLM은 QA 미완료 상태에서 배포를 시도할 수 있다.
// → G4: qa.passed 상태를 결정론적으로 확인. explore 모드 차단.
//
// [Exit Protocol]
// exit(0) = 배포 가능
// exit(2) = 전제조건 미충족
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const bypassReason = process.env.HARNESS_BYPASS_REASON || '';

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
    process.stderr.write('deploy gate-check: HARNESS_FEATURE 환경변수 필요\n');
    process.exit(1);
  }

  const workflow = loadWorkflow();

  // explore 모드 차단
  const mode = workflow?.session?.mode || 'standard';
  if (mode === 'explore') {
    process.stderr.write('⛔ deploy: explore 모드에서는 배포할 수 없습니다.\n');
    process.exit(2);
  }

  const feature = workflow?.features?.[featureName];

  // bypass with reason
  if (bypassReason) {
    process.stderr.write(`⚠️ G4 bypass: ${bypassReason}\n`);
    process.stdout.write(JSON.stringify({
      gate: 'G4',
      passed: true,
      bypassed: true,
      reason: bypassReason,
      feature: featureName,
    }) + '\n');
    process.exit(0);
  }

  // G4: qa.passed 확인
  if (!feature?.qa?.passed) {
    process.stderr.write(`⛔ G4: QA가 통과되지 않았습니다. /harness:qa ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({
    gate: 'G4',
    passed: true,
    feature: featureName,
    mode,
  }) + '\n');
  process.exit(0);
}

main();
