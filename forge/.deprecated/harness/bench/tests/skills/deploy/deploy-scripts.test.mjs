// bench/tests/skills/deploy/deploy-scripts.test.mjs
//
// AC-DP01~DP05: deploy skill 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const gateCheckPath = resolve(pluginRoot, 'skills/deploy/scripts/gate-check.mjs');
const snapshotPath = resolve(pluginRoot, 'skills/deploy/scripts/pre-deploy-snapshot.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(scriptPath, projectDir, envExtra = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_ROOT: pluginRoot, ...envExtra };
  delete env.NODE_TEST_CONTEXT;
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

function setupWorkflow(projectDir, featureName, data, mode = 'standard') {
  mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
  writeFileSync(resolve(projectDir, '.harness/state/workflow.json'),
    JSON.stringify({ session: { mode }, features: { [featureName]: data } }));
}

describe('deploy skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-DP01
  it('AC-DP01: qa.passed 없으면 exit(2)', () => {
    setupWorkflow(projectDir, 'auth/login', { qa: { passed: false } });
    const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('G4'));
  });

  // AC-DP02
  it('AC-DP02: qa.passed=true → exit(0)', () => {
    setupWorkflow(projectDir, 'auth/login', { qa: { passed: true } });
    const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.passed, true);
  });

  // AC-DP03
  it('AC-DP03: explore 모드 차단', () => {
    setupWorkflow(projectDir, 'auth/login', { qa: { passed: true } }, 'explore');
    const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 2);
  });

  // AC-DP04
  it('AC-DP04: bypass-reason → exit(0) + bypassed', () => {
    setupWorkflow(projectDir, 'auth/login', {});
    const r = run(gateCheckPath, projectDir, {
      HARNESS_FEATURE: 'auth/login',
      HARNESS_BYPASS_REASON: 'hotfix',
    });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.bypassed, true);
  });

  // AC-DP05
  it('AC-DP05: pre-deploy-snapshot 기록', () => {
    setupWorkflow(projectDir, 'auth/login', { qa: { passed: true } });
    const r = run(snapshotPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);
    const saved = resolve(projectDir, '.harness/state/deploy-auth-login.json');
    assert.ok(existsSync(saved));
    const data = JSON.parse(readFileSync(saved, 'utf8'));
    assert.equal(data.feature, 'auth/login');
    assert.ok(data.git.sha);
  });
});
