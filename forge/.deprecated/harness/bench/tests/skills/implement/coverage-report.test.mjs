// bench/tests/skills/implement/coverage-report.test.mjs
//
// AC-IM11~IM12: coverage-report 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const scriptPath = resolve(pluginRoot, 'skills/implement/scripts/coverage-report.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(projectDir, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ...envExtra,
  };
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

function writeCoverage(projectDir, featureName, acs) {
  const coveragePath = resolve(projectDir, '.harness/state/coverage.json');
  mkdirSync(dirname(coveragePath), { recursive: true });
  const data = {
    v: 1,
    features: {
      [featureName]: {
        spec_id: 'SPEC-test',
        acs,
      },
    },
  };
  writeFileSync(coveragePath, JSON.stringify(data, null, 2) + '\n');
}

function dirname2(path) {
  return resolve(path, '..');
}

describe('implement/coverage-report', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-IM11
  it('AC-IM11: 3개 AC 중 2개 covered → 67%', () => {
    writeCoverage(projectDir, 'auth/login', {
      'AC-01': { condition: 'test1', test_file: 'test.mjs', test_name: 'test1', status: 'covered' },
      'AC-02': { condition: 'test2', test_file: 'test.mjs', test_name: 'test2', status: 'covered' },
      'AC-03': { condition: 'test3', test_file: null, test_name: null, status: 'uncovered' },
    });

    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login', HARNESS_COVERAGE_THRESHOLD: '50' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total_acs, 3);
    assert.equal(out.covered, 2);
    assert.equal(out.percentage, 67);
    assert.equal(out.meets_threshold, true);
  });

  // AC-IM12
  it('AC-IM12: 67% < threshold 100% → exit(2)', () => {
    writeCoverage(projectDir, 'auth/login', {
      'AC-01': { condition: 'test1', test_file: 'test.mjs', test_name: 'test1', status: 'covered' },
      'AC-02': { condition: 'test2', test_file: 'test.mjs', test_name: 'test2', status: 'covered' },
      'AC-03': { condition: 'test3', test_file: null, test_name: null, status: 'uncovered' },
    });

    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login', HARNESS_COVERAGE_THRESHOLD: '100' });
    assert.equal(r.exitCode, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.meets_threshold, false);
    assert.deepEqual(out.uncovered_acs, ['AC-03']);
  });

  it('coverage.json 없으면 exit(1)', () => {
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 1);
  });

  it('feature 엔트리 없으면 exit(1)', () => {
    writeCoverage(projectDir, 'other/feature', {
      'AC-01': { condition: 'test1', status: 'covered' },
    });
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 1);
  });

  it('100% coverage → exit(0)', () => {
    writeCoverage(projectDir, 'auth/login', {
      'AC-01': { condition: 'test1', test_file: 'test.mjs', status: 'covered' },
      'AC-02': { condition: 'test2', test_file: 'test.mjs', status: 'covered' },
    });

    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login', HARNESS_COVERAGE_THRESHOLD: '100' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.percentage, 100);
    assert.equal(out.meets_threshold, true);
  });
});
