// bench/tests/skills/implement/side-effects.test.mjs
//
// AC-IM09~IM10: check-side-effects 테스트

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
const scriptPath = resolve(pluginRoot, 'skills/implement/scripts/check-side-effects.mjs');

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
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('implement/check-side-effects', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  it('tests/ 없으면 skip', () => {
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.skipped, true);
  });

  // AC-IM09
  it('AC-IM09: 기존 테스트 깨짐 → exit(2) + broken 목록', () => {
    const testDir = resolve(projectDir, 'tests/other');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, 'broken.test.mjs'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('broken', () => {
  it('fails', () => { assert.equal(1, 2); });
});
`);
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.failed, 1);
    assert.ok(out.broken.length > 0);
  });

  it('기존 테스트 모두 통과 → exit(0)', () => {
    const testDir = resolve(projectDir, 'tests/other');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, 'ok.test.mjs'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('ok', () => {
  it('passes', () => { assert.ok(true); });
});
`);
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.passed, 1);
    assert.equal(out.failed, 0);
  });

  // AC-IM10
  it('AC-IM10: 현재 feature 테스트는 side-effect에서 제외', () => {
    // 현재 feature 테스트 (실패) + 기존 테스트 (통과)
    const featureTestDir = resolve(projectDir, 'tests/auth');
    mkdirSync(featureTestDir, { recursive: true });
    writeFileSync(resolve(featureTestDir, 'login.test.mjs'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('feature', () => {
  it('wip', () => { assert.fail('not done yet'); });
});
`);

    const otherTestDir = resolve(projectDir, 'tests/other');
    mkdirSync(otherTestDir, { recursive: true });
    writeFileSync(resolve(otherTestDir, 'stable.test.mjs'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('stable', () => {
  it('ok', () => { assert.ok(true); });
});
`);

    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    // feature 테스트는 제외되므로 기존(stable)만 실행 → 통과
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.passed, 1);
    assert.equal(out.failed, 0);
  });
});
