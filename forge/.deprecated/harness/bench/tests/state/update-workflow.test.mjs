// bench/tests/state/update-workflow.test.mjs
//
// AC-ST03: Stop 시 phase/gates_passed 갱신

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/state/update-workflow.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedWorkflow(projectDir, features = {}) {
  const stateDir = resolve(projectDir, '.harness/state');
  mkdirSync(stateDir, { recursive: true });
  const wf = {
    v: 1,
    session: { mode: 'standard', started_at: '2026-04-14T10:00:00Z', right_size: null },
    features,
    bypass_budgets: { gate: { used: 0, max: 3 }, review: { used: 0, max: 3 }, qa: { used: 0, max: 3 } },
    active_worktrees: [],
    last_updated: '2026-04-14T10:00:00Z',
  };
  writeFileSync(resolve(stateDir, 'workflow.json'), JSON.stringify(wf));
  return resolve(stateDir, 'workflow.json');
}

function run(projectDir, envExtra = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...envExtra };
  try {
    execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

describe('update-workflow', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // --- AC-ST03: phase 갱신 ---
  describe('AC-ST03: phase/gates 갱신', () => {
    it('HARNESS_FEATURE + HARNESS_PHASE → phase 변경', () => {
      const wfPath = seedWorkflow(projectDir, {
        'auth/login': { phase: 'spec', gates_passed: {} },
      });

      const r = run(projectDir, {
        HARNESS_FEATURE: 'auth/login',
        HARNESS_PHASE: 'plan',
      });
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      assert.equal(wf.features['auth/login'].phase, 'plan');
    });

    it('HARNESS_GATE_PASSED → gate 추가', () => {
      const wfPath = seedWorkflow(projectDir, {
        'auth/login': { phase: 'plan', gates_passed: {} },
      });

      const r = run(projectDir, {
        HARNESS_FEATURE: 'auth/login',
        HARNESS_GATE_PASSED: 'g1_spec',
      });
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      assert.equal(wf.features['auth/login'].gates_passed.g1_spec, true);
    });

    it('last_updated 갱신됨', () => {
      const wfPath = seedWorkflow(projectDir, {});
      run(projectDir);
      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      assert.notEqual(wf.last_updated, '2026-04-14T10:00:00Z');
    });
  });

  // --- workflow.json 없으면 조용히 통과 ---
  describe('workflow.json 없음', () => {
    it('exit(0)', () => {
      const r = run(projectDir);
      assert.equal(r.exitCode, 0);
    });
  });
});
