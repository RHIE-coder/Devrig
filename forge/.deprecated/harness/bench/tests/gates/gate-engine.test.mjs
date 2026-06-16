// bench/tests/gates/gate-engine.test.mjs
//
// AC-G01~G09: Gate Engine 전체 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/gates/gate-engine.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedHarness(projectDir, { mode = 'standard', features = {}, spec = null, plan = null } = {}) {
  mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });

  const wf = {
    v: 1,
    session: { mode, started_at: null, right_size: null },
    features,
    bypass_budgets: { gate: { used: 0, max: 3 }, review: { used: 0, max: 3 }, qa: { used: 0, max: 3 } },
    active_worktrees: [],
    last_updated: null,
  };
  writeFileSync(resolve(projectDir, '.harness/state/workflow.json'), JSON.stringify(wf));

  if (spec) {
    const specDir = resolve(projectDir, '.harness/specs', dirname(spec));
    mkdirSync(specDir, { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs', spec), `id: SPEC-test\nacceptance_criteria:\n  - id: AC-001\n    desc: test\n    testable: test\n`);
  }

  if (plan) {
    const planDir = resolve(projectDir, '.harness/plans', dirname(plan));
    mkdirSync(planDir, { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/plans', plan),
      typeof plan === 'string' ? 'x'.repeat(100) : plan.content);
  }
}

function run(projectDir, prompt) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    TOOL_INPUT: JSON.stringify({ content: prompt }),
  };
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('gate-engine', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- AC-G01: standard + spec 없음 → 차단 ---
  describe('AC-G01: G1 spec 없음', () => {
    it('/harness:implement auth/login (spec 없음) → exit(2)', () => {
      seedHarness(projectDir, { mode: 'standard' });
      const r = run(projectDir, '/harness:implement auth/login');
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('G1'));
    });

    it('/harness:plan auth/login (spec 없음) → exit(2)', () => {
      seedHarness(projectDir, { mode: 'standard' });
      const r = run(projectDir, '/harness:plan auth/login');
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('G1'));
    });
  });

  // --- AC-G02: prototype → G1 skip ---
  describe('AC-G02: prototype skip', () => {
    it('/harness:implement (prototype, spec 없음) → exit(0)', () => {
      seedHarness(projectDir, { mode: 'prototype' });
      const r = run(projectDir, '/harness:implement auth/login');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-G03: explore → 전체 skip ---
  describe('AC-G03: explore skip', () => {
    it('/harness:implement (explore) → exit(0)', () => {
      seedHarness(projectDir, { mode: 'explore' });
      const r = run(projectDir, '/harness:implement auth/login');
      assert.equal(r.exitCode, 0);
    });

    it('/harness:deploy (explore) → exit(0)', () => {
      seedHarness(projectDir, { mode: 'explore' });
      const r = run(projectDir, '/harness:deploy auth/login');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-G04: bypass ---
  describe('AC-G04: bypass 통과', () => {
    it('--bypass-gates:g1 → exit(0) + audit JSON', () => {
      seedHarness(projectDir, { mode: 'standard' });
      const r = run(projectDir, '/harness:implement auth/login --bypass-gates:g1 --reason "긴급 핫픽스"');
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes('gate_bypassed'));
    });
  });

  // --- AC-G05: G6 빈 plan ---
  describe('AC-G05: G6 빈 plan', () => {
    it('spec 존재 + plan 빈 파일 → exit(2)', () => {
      seedHarness(projectDir, { mode: 'standard', spec: 'auth/login.spec.yaml' });
      // 빈 plan 파일 생성 (< 50 bytes)
      mkdirSync(resolve(projectDir, '.harness/plans/auth'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/plans/auth/login.plan.md'), '# TODO\n');

      const r = run(projectDir, '/harness:implement auth/login');
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('G6'));
    });
  });

  // --- AC-G06: G6 실질 plan 통과 ---
  describe('AC-G06: G6 실질 plan 통과', () => {
    it('spec + substantive plan → exit(0)', () => {
      seedHarness(projectDir, {
        mode: 'standard',
        spec: 'auth/login.spec.yaml',
        plan: 'auth/login.plan.md',
      });
      const r = run(projectDir, '/harness:implement auth/login');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-G07: G4 deploy + qa 미통과 ---
  describe('AC-G07: G4 deploy 차단', () => {
    it('/harness:deploy (qa.passed=false) → exit(2)', () => {
      seedHarness(projectDir, {
        mode: 'standard',
        features: {
          'auth/login': {
            phase: 'review',
            gates_passed: {},
            implement: { passed: true, iteration: 1 },
            review: { passed: true },
            qa: { passed: false },
          },
        },
      });
      const r = run(projectDir, '/harness:deploy auth/login');
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('G4'));
    });
  });

  // --- AC-G08: /harness:* 아닌 프롬프트 ---
  describe('AC-G08: 일반 프롬프트', () => {
    it('일반 텍스트 → exit(0)', () => {
      seedHarness(projectDir);
      const r = run(projectDir, '파일 구조를 설명해줘');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-G09: .harness/ 없음 ---
  describe('AC-G09: 미초기화', () => {
    it('.harness/ 없음 → exit(0)', () => {
      const r = run(projectDir, '/harness:implement auth/login');
      assert.equal(r.exitCode, 0);
    });
  });
});
