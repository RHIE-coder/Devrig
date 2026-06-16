// bench/tests/skills/implement/gate-check.test.mjs
//
// AC-IM01~IM04: implement gate-check 테스트

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
const scriptPath = resolve(pluginRoot, 'skills/implement/scripts/gate-check.mjs');

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

describe('implement/gate-check', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-IM01
  it('AC-IM01: HARNESS_FEATURE 없으면 exit(1)', () => {
    const r = run(projectDir, { HARNESS_FEATURE: '' });
    assert.equal(r.exitCode, 1);
  });

  // AC-IM02
  it('AC-IM02: Spec 없으면 exit(2) + G1 안내', () => {
    mkdirSync(resolve(projectDir, '.harness/specs'), { recursive: true });
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('G1'));
  });

  // AC-IM03
  it('AC-IM03: Plan 없으면 exit(2) + G2 안내', () => {
    mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
    mkdirSync(resolve(projectDir, '.harness/plans'), { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: SPEC-test\n');
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes('G2'));
  });

  // AC-IM04
  it('AC-IM04: Spec+Plan 모두 존재 → exit(0) + passed:true', () => {
    mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
    mkdirSync(resolve(projectDir, '.harness/plans/auth'), { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: SPEC-test\n');
    writeFileSync(resolve(projectDir, '.harness/plans/auth/login.plan.md'), '# Plan\n## Steps\n');
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.passed, true);
  });

  it('flat feature name으로도 동작', () => {
    mkdirSync(resolve(projectDir, '.harness/specs'), { recursive: true });
    mkdirSync(resolve(projectDir, '.harness/plans'), { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs/my-feature.spec.yaml'), 'id: SPEC-test\n');
    writeFileSync(resolve(projectDir, '.harness/plans/my-feature.plan.md'), '# Plan\n');
    const r = run(projectDir, { HARNESS_FEATURE: 'my-feature' });
    assert.equal(r.exitCode, 0);
  });
});
