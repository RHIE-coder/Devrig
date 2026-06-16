// bench/tests/skills/implement/run-tests.test.mjs
//
// AC-IM07~IM08: run-tests 테스트

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
const scriptPath = resolve(pluginRoot, 'skills/implement/scripts/run-tests.mjs');

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

describe('implement/run-tests', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-IM07
  it('AC-IM07: 통과하는 테스트 → exit(0) + passed 수', () => {
    const testDir = resolve(projectDir, 'tests/auth');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, 'login.test.mjs'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('pass', () => {
  it('works', () => { assert.equal(1, 1); });
});
`);
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.passed, 1);
    assert.equal(out.failed, 0);
  });

  // AC-IM08
  it('AC-IM08: 실패하는 테스트 → exit(2) + failed 수', () => {
    const testDir = resolve(projectDir, 'tests/auth');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, 'login.test.mjs'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('fail', () => {
  it('breaks', () => { assert.equal(1, 2); });
});
`);
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.failed, 1);
  });

  it('HARNESS_TEST_FILE로 직접 지정', () => {
    const testFile = resolve(projectDir, 'my-test.test.mjs');
    writeFileSync(testFile, `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('direct', () => {
  it('ok', () => { assert.ok(true); });
});
`);
    const r = run(projectDir, { HARNESS_TEST_FILE: 'my-test.test.mjs', HARNESS_FEATURE: '' });
    assert.equal(r.exitCode, 0);
  });

  it('HARNESS_FEATURE, HARNESS_TEST_FILE 모두 없으면 exit(1)', () => {
    const r = run(projectDir, { HARNESS_FEATURE: '', HARNESS_TEST_FILE: '' });
    assert.equal(r.exitCode, 1);
  });
});
