// skills/sync/scripts/detect-drift.mjs
//
// [Model Limit Assumption]
// LLM은 코드와 Spec의 불일치를 체계적으로 탐지하지 못한다.
// → Spec AC 목록과 실제 코드/테스트 파일을 비교하여 drift를 결정론적으로 탐지.
//
// [Exit Protocol]
// exit(0) = drift 리포트 (stdout JSON)
// exit(1) = 런타임 에러

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function collectFiles(dir, ext, baseDir) {
  if (!baseDir) baseDir = dir;
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, ext, baseDir));
    } else if (entry.name.endsWith(ext)) {
      const relative = full.replace(baseDir + '/', '').replace(ext, '');
      files.push(relative);
    }
  }
  return files;
}

function main() {
  const specsDir = resolve(projectDir, '.harness/specs');
  const plansDir = resolve(projectDir, '.harness/plans');
  const testsDir = resolve(projectDir, 'tests');

  if (!existsSync(specsDir)) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no specs dir' }) + '\n');
    process.exit(0);
  }

  const specs = collectFiles(specsDir, '.spec.yaml');
  const plans = new Set(collectFiles(plansDir, '.plan.md'));
  const tests = new Set(collectFiles(testsDir, '.test.mjs'));

  const drifts = [];

  for (const spec of specs) {
    // spec 있는데 plan 없음
    if (!plans.has(spec)) {
      drifts.push({ feature: spec, type: 'spec_without_plan', severity: 'medium' });
    }
  }

  // 테스트 파일이 있는데 대응 spec 없음
  const specSet = new Set(specs);
  for (const test of tests) {
    // 테스트 이름에서 feature 추출 시도
    const normalized = test.replace(/-/g, '/');
    if (!specSet.has(test) && !specSet.has(normalized)) {
      // spec에 부분 매칭도 없으면 drift
      const hasPartialMatch = specs.some((s) => test.includes(s) || s.includes(test));
      if (!hasPartialMatch) {
        drifts.push({ feature: test, type: 'test_without_spec', severity: 'low' });
      }
    }
  }

  const result = {
    total_specs: specs.length,
    total_plans: plans.size,
    total_tests: tests.size,
    drifts,
    drift_count: drifts.length,
    has_drift: drifts.length > 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (drifts.length > 0) {
    process.stderr.write(`⚠️ sync: ${drifts.length}건 drift 탐지\n`);
    for (const d of drifts) {
      process.stderr.write(`  - ${d.feature}: ${d.type} (${d.severity})\n`);
    }
  } else {
    process.stderr.write('✅ sync: drift 없음\n');
  }

  process.exit(0);
}

main();
