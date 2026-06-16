// bench/tests/skills/sync/sync-scripts.test.mjs
//
// AC-SY01~SY04: sync skill 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const detectDriftPath = resolve(pluginRoot, 'skills/sync/scripts/detect-drift.mjs');
const entropySweepPath = resolve(pluginRoot, 'skills/sync/scripts/entropy-sweep.mjs');
const promotePath = resolve(pluginRoot, 'skills/sync/scripts/promote.mjs');

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

describe('sync skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  describe('detect-drift', () => {
    // AC-SY01
    it('AC-SY01: spec 있고 plan 없으면 drift', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: test');

      const r = run(detectDriftPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.has_drift, true);
      assert.ok(out.drifts.some((d) => d.type === 'spec_without_plan'));
    });

    // AC-SY02
    it('AC-SY02: drift 없으면 has_drift=false', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/plans/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: test');
      writeFileSync(resolve(projectDir, '.harness/plans/auth/login.plan.md'), '# Plan');

      const r = run(detectDriftPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.has_drift, false);
    });

    it('specs 없으면 skip', () => {
      const r = run(detectDriftPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });
  });

  describe('entropy-sweep', () => {
    // AC-SY03
    it('AC-SY03: TODO 수집', () => {
      mkdirSync(resolve(projectDir, 'src'), { recursive: true });
      writeFileSync(resolve(projectDir, 'src/app.mjs'), '// TODO: fix this\nconst x = 1;\n// FIXME: urgent\n');

      const r = run(entropySweepPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.todos.count >= 2);
    });

    it('빈 프로젝트 → 낮은 entropy', () => {
      const r = run(entropySweepPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.todos.count, 0);
    });
  });

  describe('promote', () => {
    // AC-SY04
    it('AC-SY04: prototype + 산출물 완비 → can_promote=true', () => {
      // workflow
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/state/workflow.json'),
        JSON.stringify({
          session: { mode: 'prototype' },
          features: { 'auth/login': { implement: { passed: true } } },
        }));
      // spec + plan
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/plans/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: test');
      writeFileSync(resolve(projectDir, '.harness/plans/auth/login.plan.md'), '# Plan');

      const r = run(promotePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.can_promote, true);
    });

    it('non-prototype → skip', () => {
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/state/workflow.json'),
        JSON.stringify({ session: { mode: 'standard' }, features: {} }));

      const r = run(promotePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });
  });
});
