// scripts/qa/coverage-trend.mjs
//
// [Model Limit Assumption]
// LLM은 커버리지 수치 변화를 iteration 간 추적하지 못한다.
// → coverage-report와 이전 snapshot을 비교하여 delta를 결정론적으로 산출.
//
// [Exit Protocol]
// exit(0) = trend 리포트 생성 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function main() {
  if (!featureName) {
    process.stderr.write('coverage-trend: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const slug = featureName.replace(/\//g, '-');
  const currentPath = resolve(projectDir, '.harness/state', `coverage-report-${slug}.json`);
  const trendPath = resolve(projectDir, '.harness/state', `coverage-trend-${slug}.json`);

  // 현재 커버리지 리포트 로드
  if (!existsSync(currentPath)) {
    process.stderr.write('coverage-trend: coverage-report 없음, skip\n');
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no current report' }) + '\n');
    process.exit(0);
  }

  let current;
  try {
    current = JSON.parse(readFileSync(currentPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`coverage-trend: 현재 리포트 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  // 이전 트렌드 로드 (없으면 초기화)
  let trend;
  if (existsSync(trendPath)) {
    try {
      trend = JSON.parse(readFileSync(trendPath, 'utf8'));
    } catch {
      trend = { feature: featureName, history: [] };
    }
  } else {
    trend = { feature: featureName, history: [] };
  }

  // 현재 스냅샷 추가
  const snapshot = {
    ts: new Date().toISOString(),
    percentage: current.percentage || 0,
    total_acs: current.total_acs || 0,
    covered: current.covered || 0,
    uncovered: current.uncovered || 0,
  };

  const prev = trend.history.length > 0 ? trend.history[trend.history.length - 1] : null;

  // Delta 계산
  const delta = prev ? {
    percentage: snapshot.percentage - prev.percentage,
    covered: snapshot.covered - prev.covered,
    total_acs: snapshot.total_acs - prev.total_acs,
  } : {
    percentage: snapshot.percentage,
    covered: snapshot.covered,
    total_acs: snapshot.total_acs,
  };

  trend.history.push(snapshot);

  // 최근 20개만 유지
  if (trend.history.length > 20) {
    trend.history = trend.history.slice(-20);
  }

  // 저장
  mkdirSync(dirname(trendPath), { recursive: true });
  writeFileSync(trendPath, JSON.stringify(trend, null, 2) + '\n', 'utf8');

  const result = {
    feature: featureName,
    current: snapshot,
    previous: prev,
    delta,
    history_count: trend.history.length,
    improving: delta.percentage >= 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (delta.percentage < 0) {
    process.stderr.write(`⚠️ 커버리지 감소: ${delta.percentage}% (${prev?.percentage}% → ${snapshot.percentage}%)\n`);
  } else if (delta.percentage > 0) {
    process.stderr.write(`✅ 커버리지 증가: +${delta.percentage}% (${prev?.percentage || 0}% → ${snapshot.percentage}%)\n`);
  }

  process.exit(0);
}

main();
