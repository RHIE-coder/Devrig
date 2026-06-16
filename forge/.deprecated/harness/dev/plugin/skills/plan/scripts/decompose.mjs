// skills/plan/scripts/decompose.mjs
//
// [Model Limit Assumption]
// LLM은 태스크 분해 시 AC 매핑을 누락할 수 있다.
// → Spec에서 AC 목록을 추출하여 분해 보조 데이터 제공.
//
// [Exit Protocol]
// exit(0) = AC 목록 추출 완료 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function findSpec() {
  const candidates = [
    resolve(projectDir, '.harness/specs', `${featureName}.spec.yaml`),
  ];
  const parts = featureName.split('/');
  if (parts.length === 2) {
    candidates.push(resolve(projectDir, '.harness/specs', parts[0], `${parts[1]}.spec.yaml`));
  }
  return candidates.find(existsSync) || null;
}

function main() {
  if (!featureName) {
    process.stderr.write('decompose: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const specPath = findSpec();
  if (!specPath) {
    process.stderr.write(`decompose: Spec 없음 — ${featureName}\n`);
    process.exit(1);
  }

  const raw = readFileSync(specPath, 'utf8');
  const lines = raw.split('\n');
  const acs = [];
  let currentId = null;
  let currentDesc = '';
  let currentTestable = '';

  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s*id:\s*(AC-\S+)/);
    if (idMatch) {
      if (currentId) acs.push({ id: currentId, desc: currentDesc.trim(), testable: currentTestable.trim() });
      currentId = idMatch[1];
      currentDesc = '';
      currentTestable = '';
      continue;
    }
    if (currentId) {
      const descMatch = line.match(/^\s+desc:\s*"?([^"]*)"?\s*$/);
      if (descMatch) currentDesc = descMatch[1];
      const testMatch = line.match(/^\s+testable:\s*"?([^"]*)"?\s*$/);
      if (testMatch) currentTestable = testMatch[1];
    }
  }
  if (currentId) acs.push({ id: currentId, desc: currentDesc.trim(), testable: currentTestable.trim() });

  const result = {
    feature: featureName,
    ac_count: acs.length,
    acs,
    hint: 'Plan의 각 step에 최소 1 AC를 매핑하세요.',
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main();
