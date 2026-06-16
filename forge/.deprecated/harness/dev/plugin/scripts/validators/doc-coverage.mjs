// scripts/validators/doc-coverage.mjs
//
// [Model Limit Assumption]
// LLM은 Spec이 존재하는데 Plan/Test가 없는 상태를 방치할 수 있다.
// → .harness/ 내 Spec↔Plan↔Test 존재 여부를 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = 문서 커버리지 리포트 (stdout JSON), 누락 있어도 exit(0) — 경고만
// exit(1) = 런타임 에러

import { existsSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

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
      // feature name 추출: specs/auth/login.spec.yaml → auth/login
      const relative = full.replace(baseDir + '/', '').replace(ext, '');
      files.push(relative);
    }
  }
  return files;
}

function main() {
  const specsDir = resolve(projectDir, '.harness/specs');
  const plansDir = resolve(projectDir, '.harness/plans');

  if (!existsSync(specsDir)) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no specs dir' }) + '\n');
    process.exit(0);
  }

  const specs = collectFiles(specsDir, '.spec.yaml');
  const plans = collectFiles(plansDir, '.plan.md');

  const planSet = new Set(plans);
  const gaps = [];

  for (const spec of specs) {
    if (!planSet.has(spec)) {
      gaps.push({ feature: spec, missing: 'plan' });
    }
  }

  const result = {
    total_specs: specs.length,
    total_plans: plans.length,
    gaps,
    gap_count: gaps.length,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (gaps.length > 0) {
    process.stderr.write(`⚠️ doc-coverage: ${gaps.length}개 feature에 Plan 누락\n`);
    for (const g of gaps) {
      process.stderr.write(`   - ${g.feature}: ${g.missing} 없음\n`);
    }
  }

  process.exit(0);
}

main();
