// skills/plan/scripts/validate-plan.mjs
//
// [Model Limit Assumption]
// LLM은 Plan↔Spec AC 매핑의 완전성을 보장하지 못한다.
// → Plan에서 AC 참조를 추출하여 Spec의 모든 AC가 매핑되었는지 검증.
//
// [Exit Protocol]
// exit(0) = 매핑 완전 (stdout에 결과 JSON)
// exit(2) = 미매핑 AC 존재

import { readFileSync, existsSync } from 'node:fs';
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
    process.stderr.write('validate-plan: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  // Spec에서 AC ID 목록 추출
  const specPath = findFile('.harness/specs', '.spec.yaml');
  if (!specPath) {
    process.stderr.write(`validate-plan: Spec 없음\n`);
    process.exit(1);
  }

  const specRaw = readFileSync(specPath, 'utf8');
  const specACs = [...specRaw.matchAll(/^\s*-\s*id:\s*(AC-\S+)/gm)].map((m) => m[1]);

  // Plan에서 AC 참조 추출
  const planPath = findFile('.harness/plans', '.plan.md');
  if (!planPath) {
    process.stderr.write(`validate-plan: Plan 없음\n`);
    process.exit(2);
  }

  const planRaw = readFileSync(planPath, 'utf8');
  const planACs = new Set([...planRaw.matchAll(/AC-\d+/g)].map((m) => m[0]));

  // 미매핑 AC 검출
  const unmapped = specACs.filter((ac) => !planACs.has(ac));

  if (unmapped.length > 0) {
    process.stderr.write(`⛔ validate-plan: ${unmapped.length}개 AC가 Plan에 매핑되지 않음\n`);
    for (const ac of unmapped) {
      process.stderr.write(`   - ${ac}\n`);
    }
    process.exit(2);
  }

  const result = {
    valid: true,
    spec_acs: specACs.length,
    plan_acs: planACs.size,
    all_mapped: true,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
