// bench/tests/skills/refactor/refactor-scripts.test.mjs
//
// AC-RF01~RF05: refactor skill 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const gateCheckPath = resolve(pluginRoot, 'skills/refactor/scripts/gate-check.mjs');
const snapshotPath = resolve(pluginRoot, 'skills/refactor/scripts/snapshot.mjs');
const verifySpecPath = resolve(pluginRoot, 'skills/refactor/scripts/verify-spec-unchanged.mjs');

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

describe('refactor skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  describe('gate-check', () => {
    // AC-RF01
    it('AC-RF01: coverage < min → exit(2)', () => {
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/state/coverage-report-auth-login.json'),
        JSON.stringify({ percentage: 50, total_acs: 4, covered: 2 }));

      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
    });

    // AC-RF02
    it('AC-RF02: bypass-coverage → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      const r = run(gateCheckPath, projectDir, {
        HARNESS_FEATURE: 'auth/login',
        HARNESS_BYPASS_COVERAGE: 'true',
      });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.bypassed, true);
    });

    it('coverage >= min → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/state/coverage-report-auth-login.json'),
        JSON.stringify({ percentage: 80, total_acs: 5, covered: 4 }));

      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
    });
  });

  describe('snapshot + verify', () => {
    // AC-RF03
    it('AC-RF03: snapshot이 spec_hash 기록', () => {
      const specDir = resolve(projectDir, '.harness/specs/auth');
      mkdirSync(specDir, { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(specDir, 'login.spec.yaml'), 'id: SPEC-login\nname: Login');

      const r = run(snapshotPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.spec_hash);
      assert.equal(out.spec_hash.length, 64); // SHA-256
    });

    // AC-RF04
    it('AC-RF04: spec 변경 없음 → unchanged=true', () => {
      const specContent = 'id: SPEC-login\nname: Login';
      const specDir = resolve(projectDir, '.harness/specs/auth');
      mkdirSync(specDir, { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(specDir, 'login.spec.yaml'), specContent);

      // snapshot 생성
      run(snapshotPath, projectDir, { HARNESS_FEATURE: 'auth/login' });

      // 검증 (변경 없음)
      const r = run(verifySpecPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.unchanged, true);
    });

    // AC-RF05
    it('AC-RF05: spec 변경됨 → exit(2)', () => {
      const specDir = resolve(projectDir, '.harness/specs/auth');
      mkdirSync(specDir, { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(specDir, 'login.spec.yaml'), 'id: SPEC-login\nname: Login');

      // snapshot 생성
      run(snapshotPath, projectDir, { HARNESS_FEATURE: 'auth/login' });

      // spec 변경
      writeFileSync(resolve(specDir, 'login.spec.yaml'), 'id: SPEC-login\nname: Login\nnew_field: true');

      // 검증
      const r = run(verifySpecPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.unchanged, false);
    });
  });
});
