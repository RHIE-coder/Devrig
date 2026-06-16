// bench/tests/skills/plan/plan-scripts.test.mjs
//
// Plan skill: gate-check, decompose, validate-plan 테스트

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
const gateCheckPath = resolve(pluginRoot, 'skills/plan/scripts/gate-check.mjs');
const decomposePath = resolve(pluginRoot, 'skills/plan/scripts/decompose.mjs');
const validatePlanPath = resolve(pluginRoot, 'skills/plan/scripts/validate-plan.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(scriptPath, projectDir, envExtra = {}) {
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

const SPEC_YAML = `id: SPEC-auth-login
name: Auth Login
description: Login feature
acceptance_criteria:
  - id: AC-01
    desc: "유효한 credential → 로그인 성공"
    testable: "토큰 반환 확인"
  - id: AC-02
    desc: "잘못된 credential → 401"
    testable: "401 status 확인"
  - id: AC-03
    desc: "lockout 정책"
    testable: "5회 실패 후 잠금"
`;

describe('plan skill scripts', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- gate-check (G1) ---
  describe('gate-check', () => {
    it('Spec 존재 → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), SPEC_YAML);
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
    });

    it('Spec 없음 → exit(2) + G1', () => {
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('G1'));
    });

    it('HARNESS_FEATURE 없으면 exit(1)', () => {
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: '' });
      assert.equal(r.exitCode, 1);
    });
  });

  // --- decompose ---
  describe('decompose', () => {
    it('AC 목록 추출 성공', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), SPEC_YAML);
      const r = run(decomposePath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.ac_count, 3);
      assert.equal(out.acs[0].id, 'AC-01');
      assert.equal(out.acs[2].id, 'AC-03');
    });

    it('Spec 없음 → exit(1)', () => {
      const r = run(decomposePath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 1);
    });
  });

  // --- validate-plan ---
  describe('validate-plan', () => {
    it('모든 AC 매핑 → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/plans/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), SPEC_YAML);
      writeFileSync(resolve(projectDir, '.harness/plans/auth/login.plan.md'),
        '# Plan\n## Step 1\nAC-01, AC-02\n## Step 2\nAC-03\n');
      const r = run(validatePlanPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.valid, true);
    });

    it('AC-03 미매핑 → exit(2)', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/plans/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), SPEC_YAML);
      writeFileSync(resolve(projectDir, '.harness/plans/auth/login.plan.md'),
        '# Plan\n## Step 1\nAC-01, AC-02\n');
      const r = run(validatePlanPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('AC-03'));
    });
  });
});
