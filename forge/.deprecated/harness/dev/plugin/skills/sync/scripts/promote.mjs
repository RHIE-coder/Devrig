// skills/sync/scripts/promote.mjs
//
// [Model Limit Assumption]
// LLM은 prototype 모드 feature를 standard로 승격할 때 필수 산출물 누락을 확인하지 않을 수 있다.
// → spec, plan, test 존재 여부를 결정론적으로 확인하여 승격 가능성 판정.
//
// [Exit Protocol]
// exit(0) = 승격 판정 결과 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function loadWorkflow() {
  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) return null;
  try {
    return JSON.parse(readFileSync(wfPath, 'utf8'));
  } catch {
    return null;
  }
}

function findSpec(featureName) {
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/specs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`),
    resolve(projectDir, '.harness/specs', `${featureName.replace(/\//g, '-')}.spec.yaml`),
  ];
  return candidates.some(existsSync);
}

function findPlan(featureName) {
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/plans', ...parts.slice(0, -1), `${parts[parts.length - 1]}.plan.md`),
    resolve(projectDir, '.harness/plans', `${featureName.replace(/\//g, '-')}.plan.md`),
  ];
  return candidates.some(existsSync);
}

function main() {
  const workflow = loadWorkflow();
  if (!workflow) {
    process.stderr.write('promote: workflow.json 없음\n');
    process.exit(1);
  }

  const mode = workflow.session?.mode || 'standard';
  if (mode !== 'prototype') {
    process.stdout.write(JSON.stringify({ skipped: true, reason: `현재 mode=${mode}, prototype이 아님` }) + '\n');
    process.exit(0);
  }

  const features = workflow.features || {};
  const promotable = [];
  const blocked = [];

  for (const [name, data] of Object.entries(features)) {
    const hasSpec = findSpec(name);
    const hasPlan = findPlan(name);
    const hasImpl = data.implement?.passed === true;

    const missing = [];
    if (!hasSpec) missing.push('spec');
    if (!hasPlan) missing.push('plan');
    if (!hasImpl) missing.push('implement');

    if (missing.length === 0) {
      promotable.push({ feature: name, ready: true });
    } else {
      blocked.push({ feature: name, missing });
    }
  }

  const result = {
    current_mode: mode,
    promotable,
    blocked,
    can_promote: blocked.length === 0 && promotable.length > 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (result.can_promote) {
    process.stderr.write(`✅ ${promotable.length}개 feature 승격 가능\n`);
  } else if (blocked.length > 0) {
    process.stderr.write(`⚠️ ${blocked.length}개 feature 승격 불가:\n`);
    for (const b of blocked) {
      process.stderr.write(`  - ${b.feature}: ${b.missing.join(', ')} 누락\n`);
    }
  }

  process.exit(0);
}

main();
