// scripts/validators/check-coverage.mjs
//
// [Model Limit Assumption]
// LLM은 Spec AC와 Test의 1:1 매핑을 자발적으로 유지하지 못한다.
// → coverage.json에서 미커버 AC를 결정론적으로 검출.
//
// [Exit Protocol]
// exit(0) = 커버리지 확인 완료 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function main() {
  const coveragePath = resolve(projectDir, '.harness/state/coverage.json');

  if (!existsSync(coveragePath)) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no coverage.json' }) + '\n');
    process.exit(0);
  }

  let coverage;
  try {
    coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  } catch (e) {
    process.stderr.write(`check-coverage: coverage.json 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  const features = coverage.features || {};
  const report = [];

  for (const [featureName, data] of Object.entries(features)) {
    const acs = data.acs || {};
    const total = Object.keys(acs).length;
    let covered = 0;
    const uncovered = [];

    for (const [acId, acData] of Object.entries(acs)) {
      if (acData.status === 'covered' || acData.test_file) {
        covered++;
      } else {
        uncovered.push(acId);
      }
    }

    report.push({
      feature: featureName,
      total_acs: total,
      covered,
      uncovered_count: uncovered.length,
      uncovered_acs: uncovered,
      percentage: total > 0 ? Math.round((covered / total) * 100) : 0,
    });
  }

  const totalACs = report.reduce((sum, r) => sum + r.total_acs, 0);
  const totalCovered = report.reduce((sum, r) => sum + r.covered, 0);
  const totalUncovered = report.reduce((sum, r) => sum + r.uncovered_count, 0);

  const result = {
    features: report,
    summary: {
      total_features: report.length,
      total_acs: totalACs,
      total_covered: totalCovered,
      total_uncovered: totalUncovered,
      percentage: totalACs > 0 ? Math.round((totalCovered / totalACs) * 100) : 0,
    },
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (totalUncovered > 0) {
    process.stderr.write(`⚠️ check-coverage: ${totalUncovered}개 AC 미커버\n`);
    for (const r of report) {
      if (r.uncovered_count > 0) {
        process.stderr.write(`   - ${r.feature}: ${r.uncovered_acs.join(', ')}\n`);
      }
    }
  }

  process.exit(0);
}

main();
