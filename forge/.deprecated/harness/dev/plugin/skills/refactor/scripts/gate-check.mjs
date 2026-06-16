// skills/refactor/scripts/gate-check.mjs
//
// [Model Limit Assumption]
// LLM은 커버리지 미달 상태에서 리팩토링을 시작하여 행동 변경을 탐지하지 못할 수 있다.
// → 최소 커버리지 임계값을 결정론적으로 확인.
//
// [Exit Protocol]
// exit(0) = 리팩토링 가능
// exit(2) = 커버리지 미달
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const bypassCoverage = process.env.HARNESS_BYPASS_COVERAGE === 'true';

function main() {
  if (!featureName) {
    process.stderr.write('refactor gate-check: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  if (bypassCoverage) {
    process.stderr.write('⚠️ refactor: coverage 검증 bypass\n');
    process.stdout.write(JSON.stringify({ passed: true, feature: featureName, bypassed: true }) + '\n');
    process.exit(0);
  }

  // config에서 min_coverage 읽기
  let minCoverage = 70;
  const cfgPath = resolve(projectDir, '.harness/config.yaml');
  if (existsSync(cfgPath)) {
    const raw = readFileSync(cfgPath, 'utf8');
    const match = raw.match(/min_coverage:\s*(\d+)/m);
    if (match) minCoverage = parseInt(match[1], 10);
  }

  // coverage-report 확인
  const slug = featureName.replace(/\//g, '-');
  const covPath = resolve(projectDir, '.harness/state', `coverage-report-${slug}.json`);

  if (!existsSync(covPath)) {
    process.stderr.write(`⚠️ refactor: coverage-report 없음. --bypass-coverage로 skip 가능.\n`);
    process.exit(2);
  }

  let coverage;
  try {
    coverage = JSON.parse(readFileSync(covPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`refactor gate-check: coverage 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  const pct = coverage.percentage || 0;
  if (pct < minCoverage) {
    process.stderr.write(`⛔ refactor: coverage ${pct}% < 최소 ${minCoverage}%. --bypass-coverage로 skip 가능.\n`);
    process.exit(2);
  }

  process.stdout.write(JSON.stringify({
    passed: true,
    feature: featureName,
    coverage: pct,
    min_coverage: minCoverage,
  }) + '\n');
  process.exit(0);
}

main();
