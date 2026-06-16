// skills/deploy/scripts/pre-deploy-snapshot.mjs
//
// [Model Limit Assumption]
// LLM은 배포 전 상태를 기록하지 않고 진행할 수 있다.
// → 배포 직전 상태를 결정론적으로 캡처하여 사후 분석 가능하게 함.
//
// [Exit Protocol]
// exit(0) = 스냅샷 기록 완료 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function main() {
  if (!featureName) {
    process.stderr.write('pre-deploy-snapshot: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  // git SHA
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse HEAD', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // non-git project
  }

  // git branch
  let gitBranch = 'unknown';
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // non-git project
  }

  // workflow 상태
  let featureState = null;
  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (existsSync(wfPath)) {
    try {
      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      featureState = wf.features?.[featureName] || null;
    } catch {
      // ignore
    }
  }

  // coverage
  let coverage = null;
  const slug = featureName.replace(/\//g, '-');
  const covPath = resolve(projectDir, '.harness/state', `coverage-report-${slug}.json`);
  if (existsSync(covPath)) {
    try {
      coverage = JSON.parse(readFileSync(covPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  const snapshot = {
    feature: featureName,
    ts: new Date().toISOString(),
    git: { sha: gitSha, branch: gitBranch },
    workflow_state: featureState,
    coverage: coverage ? { percentage: coverage.percentage, total_acs: coverage.total_acs } : null,
  };

  // 저장
  const outPath = resolve(projectDir, '.harness/state', `deploy-${slug}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  process.stdout.write(JSON.stringify(snapshot) + '\n');
  process.stderr.write(`✅ pre-deploy snapshot 기록: ${outPath}\n`);
  process.exit(0);
}

main();
