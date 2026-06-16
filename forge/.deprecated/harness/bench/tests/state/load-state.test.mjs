// bench/tests/state/load-state.test.mjs
//
// AC-ST01: workflow.json 없으면 초기 스키마 생성
// AC-ST02: workflow.json 있으면 로드 + 상태 요약 주입
// AC-ST12: 하네스 미초기화 프로젝트에서 조용히 통과

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/state/load-state.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
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

describe('load-state', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // --- AC-ST12: .harness/ 없으면 조용히 통과 ---
  describe('AC-ST12: 하네스 미초기화', () => {
    it('.harness/ 없음 → exit(0), workflow.json 미생성', () => {
      const r = run(projectDir);
      assert.equal(r.exitCode, 0);
      assert.equal(existsSync(resolve(projectDir, '.harness/state/workflow.json')), false);
    });
  });

  // --- AC-ST01: workflow.json 없으면 초기 생성 ---
  describe('AC-ST01: 초기 생성', () => {
    it('.harness/ 존재 + workflow.json 없음 → 초기 스키마 생성', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wfPath = resolve(projectDir, '.harness/state/workflow.json');
      assert.equal(existsSync(wfPath), true);

      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      assert.equal(wf.v, 1);
      assert.equal(wf.session.mode, 'standard');
      assert.ok(wf.session.started_at);
      assert.deepEqual(Object.keys(wf.features), []);
    });
  });

  // --- AC-ST02: 기존 workflow.json 로드 ---
  describe('AC-ST02: 기존 workflow 로드', () => {
    it('기존 workflow.json → stdout에 상태 요약 JSON', () => {
      const stateDir = resolve(projectDir, '.harness/state');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(resolve(stateDir, 'workflow.json'), JSON.stringify({
        v: 1,
        session: { mode: 'prototype', started_at: null, right_size: 'small' },
        features: {
          'auth/login': { phase: 'implement', gates_passed: {} },
        },
        bypass_budgets: { gate: { used: 0, max: 3 }, review: { used: 0, max: 3 }, qa: { used: 0, max: 3 } },
        active_worktrees: [],
        last_updated: null,
      }));

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const summary = JSON.parse(r.stdout.trim());
      assert.equal(summary.mode, 'prototype');
      assert.equal(summary.feature_count, 1);
      assert.ok(summary.active_features.includes('auth/login'));
    });
  });
});
