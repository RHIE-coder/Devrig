// skills/implement/scripts/coverage-report.mjs
//
// [Model Limit Assumption]
// LLM은 "모든 AC를 테스트했다"고 선언하지만 실제 누락이 있을 수 있다.
// → coverage.json의 AC 매핑 상태를 집계하여 정량적 커버리지 리포트 산출.
//
// [Exit Protocol]
// exit(0) = 커버리지 리포트 생성 (stdout JSON)
// exit(2) = 커버리지 임계값 미달
// exit(1) = 런타임 에러

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const thresholdEnv = process.env.HARNESS_COVERAGE_THRESHOLD || '100';

function main() {
  if (!featureName) {
    process.stderr.write('coverage-report: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const coveragePath = resolve(projectDir, '.harness/state/coverage.json');
  if (!existsSync(coveragePath)) {
    process.stderr.write('coverage-report: coverage.json 없음 — gen-coverage-map 먼저 실행\n');
    process.exit(1);
  }

  let coverage;
  try {
    coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  } catch (e) {
    process.stderr.write(`coverage-report: coverage.json 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  const featureData = coverage.features?.[featureName];
  if (!featureData) {
    process.stderr.write(`coverage-report: feature "${featureName}" 엔트리 없음\n`);
    process.exit(1);
  }

  const acs = featureData.acs || {};
  const total = Object.keys(acs).length;
  if (total === 0) {
    process.stderr.write('coverage-report: AC가 0개\n');
    process.exit(1);
  }

  let covered = 0;
  let uncovered = 0;
  const uncoveredList = [];

  for (const [acId, acData] of Object.entries(acs)) {
    if (acData.status === 'covered' || acData.test_file) {
      covered++;
    } else {
      uncovered++;
      uncoveredList.push(acId);
    }
  }

  const percentage = Math.round((covered / total) * 100);
  const threshold = parseInt(thresholdEnv, 10);

  const report = {
    feature: featureName,
    spec_id: featureData.spec_id,
    total_acs: total,
    covered,
    uncovered,
    percentage,
    threshold,
    meets_threshold: percentage >= threshold,
    uncovered_acs: uncoveredList,
  };

  // 리포트를 state에 기록
  const reportPath = resolve(projectDir, '.harness/state', `coverage-report-${featureName.replace(/\//g, '-')}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  process.stdout.write(JSON.stringify(report) + '\n');

  if (percentage < threshold) {
    process.stderr.write(`⛔ 커버리지 ${percentage}% < 임계값 ${threshold}%\n`);
    if (uncoveredList.length > 0) {
      process.stderr.write('   미커버 AC:\n');
      for (const ac of uncoveredList) {
        process.stderr.write(`   - ${ac}\n`);
      }
    }
    process.exit(2);
  }

  process.stderr.write(`✅ 커버리지 ${percentage}% (임계값 ${threshold}%)\n`);
  process.exit(0);
}

main();
