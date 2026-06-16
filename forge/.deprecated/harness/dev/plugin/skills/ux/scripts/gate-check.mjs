// skills/ux/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// LLM은 Spec 없이 UX 설계를 시작할 수 있다.
// → Spec 존재를 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = UX 설계 가능
// exit(2) = Spec 미존재
// exit(1) = 런타임 에러

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

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
    process.stderr.write('ux gate-check: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  if (!findSpec()) {
    process.stderr.write(`⛔ G1: Spec이 없습니다. /harness:spec ${featureName} 을 먼저 실행하세요.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({ passed: true, feature: featureName }) + '\n');
  process.exit(0);
}

main();
