// bench/tests/skills/architect/architect-scripts.test.mjs
//
// AC-AR01~AR05: architect skill 테스트

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
const gateCheckPath = resolve(pluginRoot, 'skills/architect/scripts/gate-check.mjs');
const depGraphPath = resolve(pluginRoot, 'skills/architect/scripts/dep-graph.mjs');
const constraintsPath = resolve(pluginRoot, 'skills/architect/scripts/check-constraints.mjs');

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

describe('architect skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  describe('gate-check', () => {
    // AC-AR01
    it('AC-AR01: spec 없으면 exit(2)', () => {
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
    });

    // AC-AR02
    it('AC-AR02: small + force 없으면 exit(2)', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: test');
      writeFileSync(resolve(projectDir, '.harness/state/workflow.json'),
        JSON.stringify({ session: { right_size: 'small' }, features: {} }));

      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
    });

    // AC-AR03
    it('AC-AR03: medium → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: test');
      writeFileSync(resolve(projectDir, '.harness/state/workflow.json'),
        JSON.stringify({ session: { right_size: 'medium' }, features: {} }));

      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
    });

    it('small + force → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), 'id: test');

      const r = run(gateCheckPath, projectDir, {
        HARNESS_FEATURE: 'auth/login',
        HARNESS_FORCE_SIZE: 'true',
      });
      assert.equal(r.exitCode, 0);
    });
  });

  describe('dep-graph', () => {
    // AC-AR04
    it('AC-AR04: import 분석 → edges', () => {
      mkdirSync(resolve(projectDir, 'src'), { recursive: true });
      writeFileSync(resolve(projectDir, 'src/index.mjs'), "import { foo } from './utils.mjs';\n");
      writeFileSync(resolve(projectDir, 'src/utils.mjs'), 'export const foo = 1;\n');

      const r = run(depGraphPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.total_edges > 0);
      assert.ok(out.nodes.length >= 2);
    });

    it('src/ 없으면 빈 그래프', () => {
      const r = run(depGraphPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.total_files, 0);
    });
  });

  describe('check-constraints', () => {
    // AC-AR05
    it('AC-AR05: spec에서 기술 키워드 추출', () => {
      mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'),
        'id: SPEC-login\nacceptance_criteria:\n  - desc: "인증 토큰 만료 처리"\n  - desc: "응답시간 200ms 이내"\n');

      const r = run(constraintsPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.constraint_count > 0);
      assert.ok(out.constraints.some((c) => c.category === 'security'));
      assert.ok(out.constraints.some((c) => c.category === 'performance'));
    });

    it('spec 없으면 빈 결과', () => {
      const r = run(constraintsPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.constraint_count, 0);
    });
  });
});
