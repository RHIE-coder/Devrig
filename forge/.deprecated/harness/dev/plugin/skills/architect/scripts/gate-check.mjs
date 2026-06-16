// skills/architect/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// LLM은 프로젝트 규모에 관계없이 아키텍처 결정을 생략할 수 있다.
// → Spec 존재 + right-size >= medium을 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = architect 실행 가능
// exit(2) = 전제조건 미충족
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const forceSize = process.env.HARNESS_FORCE_SIZE === 'true';

function findSpec() {
  if (!featureName) return null;
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/specs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`),
    resolve(projectDir, '.harness/specs', `${featureName.replace(/\//g, '-')}.spec.yaml`),
  ];
  return candidates.find(existsSync) || null;
}

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
    process.stderr.write('architect gate-check: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  // G1: Spec 존재
  const specPath = findSpec();
  if (!specPath) {
    process.stderr.write(`⛔ G1: Spec이 없습니다. /harness:spec ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  // right-size 확인
  const workflow = loadWorkflow();
  const size = workflow?.features?.[featureName]?.size
    || workflow?.session?.right_size
    || 'small';

  const sizeOrder = { small: 0, medium: 1, large: 2 };
  if ((sizeOrder[size] || 0) < 1 && !forceSize) {
    process.stderr.write(`⚠️ architect: right-size="${size}" (medium 이상 필요). --force-size로 강제 실행 가능.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({
    passed: true,
    feature: featureName,
    size,
    forced: forceSize,
  }) + '\n');
  process.exit(0);
}

main();
