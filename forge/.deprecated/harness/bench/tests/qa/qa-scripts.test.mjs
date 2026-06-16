// bench/tests/qa/qa-scripts.test.mjs
//
// AC-QA05~QA12: attribution, mock-ratio, coverage-trend 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../dev/plugin');
const attributionPath = resolve(pluginRoot, 'scripts/qa/attribution.mjs');
const mockRatioPath = resolve(pluginRoot, 'scripts/qa/mock-ratio.mjs');
const coverageTrendPath = resolve(pluginRoot, 'scripts/qa/coverage-trend.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runWithStdin(scriptPath, projectDir, stdinData, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ...envExtra,
  };
  delete env.NODE_TEST_CONTEXT;
  const input = typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData);
  try {
    const stdout = execFileSync('node', [scriptPath], {
      env, input, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

function run(scriptPath, projectDir, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ...envExtra,
  };
  delete env.NODE_TEST_CONTEXT;
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('qa scripts', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- attribution ---
  describe('attribution', () => {
    // AC-QA07
    it('AC-QA07: 전체 통과 → all_green, confidence=high', () => {
      const stackResult = {
        feature: 'auth/login',
        mode: 'sequential_bottom_up',
        layers: [
          { name: 'infra', status: 'pass' },
          { name: 'db', status: 'pass' },
        ],
      };
      const r = runWithStdin(attributionPath, projectDir, stackResult, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.verdict, 'all_green');
      assert.equal(out.confidence, 'high');
    });

    // AC-QA05
    it('AC-QA05: sequential_bottom_up 단일 실패 → pure_{layer}_issue, confidence=high', () => {
      const stackResult = {
        feature: 'auth/login',
        mode: 'sequential_bottom_up',
        layers: [
          { name: 'infra', status: 'fail' },
          { name: 'db', status: 'skipped', reason: 'lower layer failed' },
        ],
      };
      const r = runWithStdin(attributionPath, projectDir, stackResult, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.verdict, 'pure_infra_issue');
      assert.equal(out.confidence, 'high');
      assert.equal(out.failed_layer, 'infra');
    });

    // AC-QA06
    it('AC-QA06: 다중 실패 → multi_layer, confidence=low', () => {
      const stackResult = {
        feature: 'auth/login',
        mode: 'parallel',
        layers: [
          { name: 'infra', status: 'fail' },
          { name: 'db', status: 'fail' },
          { name: 'api', status: 'pass' },
        ],
      };
      const r = runWithStdin(attributionPath, projectDir, stackResult, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.verdict.startsWith('multi_layer'));
      assert.equal(out.confidence, 'low');
    });

    it('리포트 파일 저장', () => {
      const stackResult = {
        feature: 'auth/login',
        mode: 'parallel',
        layers: [{ name: 'infra', status: 'pass' }],
      };
      const r = runWithStdin(attributionPath, projectDir, stackResult, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const saved = resolve(projectDir, '.harness/state/qa-attribution-auth-login.json');
      assert.ok(existsSync(saved));
    });

    it('빈 입력 → exit(1)', () => {
      const r = runWithStdin(attributionPath, projectDir, '', { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 1);
    });
  });

  // --- mock-ratio ---
  describe('mock-ratio', () => {
    // AC-QA10
    it('AC-QA10: policy=off → skipped:true', () => {
      const r = run(mockRatioPath, projectDir, { HARNESS_MOCK_GUARD: 'off' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });

    // AC-QA08
    it('AC-QA08: strict_lower_real + 위반 → exit(2)', () => {
      // api 레이어 테스트에 db mock 사용
      const apiTestDir = resolve(projectDir, 'tests/api');
      mkdirSync(apiTestDir, { recursive: true });
      writeFileSync(resolve(apiTestDir, 'api-handler.test.mjs'),
        `import { mock } from 'node:test';\n// test that mocks db layer\nconst dbMock = mock();\n`);

      const r = run(mockRatioPath, projectDir, { HARNESS_MOCK_GUARD: 'strict_lower_real' });
      assert.equal(r.exitCode, 2);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.violations_count > 0);
    });

    // AC-QA09
    it('AC-QA09: warn + 위반 → exit(0) + violations 보고', () => {
      const apiTestDir = resolve(projectDir, 'tests/api');
      mkdirSync(apiTestDir, { recursive: true });
      writeFileSync(resolve(apiTestDir, 'handler.test.mjs'),
        `// uses sinon.stub for db\nimport sinon from 'sinon';\nsinon.stub();\n`);

      const r = run(mockRatioPath, projectDir, { HARNESS_MOCK_GUARD: 'warn' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.violations_count > 0);
      assert.equal(out.policy, 'warn');
    });

    it('위반 없으면 violations_count=0', () => {
      // api 테스트에 mock 패턴 없음
      const apiTestDir = resolve(projectDir, 'tests/api');
      mkdirSync(apiTestDir, { recursive: true });
      writeFileSync(resolve(apiTestDir, 'clean.test.mjs'),
        `import { test } from 'node:test';\ntest('clean', () => {});\n`);

      const r = run(mockRatioPath, projectDir, { HARNESS_MOCK_GUARD: 'strict_lower_real' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.violations_count, 0);
    });

    it('tests/ 없으면 skipped', () => {
      const r = run(mockRatioPath, projectDir, { HARNESS_MOCK_GUARD: 'warn' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });
  });

  // --- coverage-trend ---
  describe('coverage-trend', () => {
    function writeCoverageReport(projectDir, feature, data) {
      const slug = feature.replace(/\//g, '-');
      const dir = resolve(projectDir, '.harness/state');
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, `coverage-report-${slug}.json`), JSON.stringify(data));
    }

    function writeTrend(projectDir, feature, trend) {
      const slug = feature.replace(/\//g, '-');
      const dir = resolve(projectDir, '.harness/state');
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, `coverage-trend-${slug}.json`), JSON.stringify(trend));
    }

    // AC-QA11
    it('AC-QA11: 이전 대비 delta 계산', () => {
      writeCoverageReport(projectDir, 'auth/login', {
        percentage: 75, total_acs: 4, covered: 3, uncovered: 1,
      });
      // 이전 트렌드 존재
      writeTrend(projectDir, 'auth/login', {
        feature: 'auth/login',
        history: [
          { ts: '2026-04-13T00:00:00Z', percentage: 50, total_acs: 4, covered: 2, uncovered: 2 },
        ],
      });

      const r = run(coverageTrendPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.delta.percentage, 25); // 75 - 50
      assert.equal(out.delta.covered, 1);     // 3 - 2
      assert.equal(out.improving, true);
    });

    // AC-QA12
    it('AC-QA12: history 20개 제한', () => {
      writeCoverageReport(projectDir, 'auth/login', {
        percentage: 100, total_acs: 4, covered: 4, uncovered: 0,
      });
      // 20개 이력 존재 → 추가하면 21이 되어야 하지만 20으로 제한
      const history = Array.from({ length: 20 }, (_, i) => ({
        ts: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        percentage: 50 + i, total_acs: 4, covered: 2, uncovered: 2,
      }));
      writeTrend(projectDir, 'auth/login', { feature: 'auth/login', history });

      const r = run(coverageTrendPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);

      // 트렌드 파일에서 history 길이 확인
      const slug = 'auth-login';
      const trendData = JSON.parse(readFileSync(resolve(projectDir, `.harness/state/coverage-trend-${slug}.json`), 'utf8'));
      assert.equal(trendData.history.length, 20);
    });

    it('HARNESS_FEATURE 없으면 exit(1)', () => {
      const r = run(coverageTrendPath, projectDir, { HARNESS_FEATURE: '' });
      assert.equal(r.exitCode, 1);
    });

    it('coverage-report 없으면 skip', () => {
      const r = run(coverageTrendPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });

    it('첫 트렌드 → previous=null', () => {
      writeCoverageReport(projectDir, 'auth/login', {
        percentage: 50, total_acs: 4, covered: 2, uncovered: 2,
      });

      const r = run(coverageTrendPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.previous, null);
      assert.equal(out.delta.percentage, 50); // first entry: delta = current
    });
  });
});
