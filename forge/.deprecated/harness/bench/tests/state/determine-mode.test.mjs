// bench/tests/state/determine-mode.test.mjs
//
// AC-ST09: opt-in 설정 시 mode 분류
// AC-ST10: opt-in 꺼져 있으면 skip

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/workflow/determine-mode.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedProject(projectDir, configYaml, workflowOverride) {
  const harnessDir = resolve(projectDir, '.harness');
  const stateDir = resolve(projectDir, '.harness/state');
  mkdirSync(stateDir, { recursive: true });

  if (configYaml !== null) {
    writeFileSync(resolve(harnessDir, 'config.yaml'), configYaml);
  }

  const wf = workflowOverride || {
    v: 1,
    session: { mode: 'standard', started_at: null, right_size: null },
    features: {},
    bypass_budgets: { gate: { used: 0, max: 3 }, review: { used: 0, max: 3 }, qa: { used: 0, max: 3 } },
    active_worktrees: [],
    last_updated: null,
  };
  writeFileSync(resolve(stateDir, 'workflow.json'), JSON.stringify(wf));
}

function run(projectDir) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  try {
    const stdout = execFileSync('node', [scriptPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.toString() };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('determine-mode', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // --- AC-ST09: mode 설정 반영 ---
  describe('AC-ST09: config mode 반영', () => {
    it('mode: prototype → workflow.json mode=prototype', () => {
      seedProject(projectDir, 'mode: prototype\n');

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(
        resolve(projectDir, '.harness/state/workflow.json'), 'utf8'
      ));
      assert.equal(wf.session.mode, 'prototype');
    });

    it('mode: explore → workflow.json mode=explore', () => {
      seedProject(projectDir, 'mode: explore\n');

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(
        resolve(projectDir, '.harness/state/workflow.json'), 'utf8'
      ));
      assert.equal(wf.session.mode, 'explore');
    });

    it('mode: auto → standard (classifier 미구현)', () => {
      seedProject(projectDir, 'mode: auto\n');

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(
        resolve(projectDir, '.harness/state/workflow.json'), 'utf8'
      ));
      assert.equal(wf.session.mode, 'standard');
    });

    it('stdout에 mode 결과 JSON', () => {
      seedProject(projectDir, 'mode: prototype\n');

      const r = run(projectDir);
      const result = JSON.parse(r.stdout.trim());
      assert.equal(result.mode, 'prototype');
      assert.equal(result.source, 'config');
    });
  });

  // --- AC-ST10: mode 미설정 → skip ---
  describe('AC-ST10: mode 미설정', () => {
    it('config.yaml에 mode 없음 → workflow.json 변경 없음', () => {
      seedProject(projectDir, 'some_other_key: value\n');

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(
        resolve(projectDir, '.harness/state/workflow.json'), 'utf8'
      ));
      assert.equal(wf.session.mode, 'standard'); // 원래 값 유지
    });

    it('config.yaml 자체가 없음 → skip', () => {
      seedProject(projectDir, null);

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);
    });
  });

  // --- .harness/ 없음 ---
  describe('.harness/ 없음', () => {
    it('exit(0)', () => {
      const r = run(projectDir);
      assert.equal(r.exitCode, 0);
    });
  });
});
