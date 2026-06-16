// bench/tests/validators/validators.test.mjs
//
// AC-VL01~VL08: validator scripts 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../dev/plugin');
const trackBashPath = resolve(pluginRoot, 'scripts/validators/track-bash-files.mjs');
const checkSideEffectsPath = resolve(pluginRoot, 'scripts/validators/check-side-effects.mjs');
const docCoveragePath = resolve(pluginRoot, 'scripts/validators/doc-coverage.mjs');
const checkCoveragePath = resolve(pluginRoot, 'scripts/validators/check-coverage.mjs');

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
  delete env.NODE_TEST_CONTEXT;
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('validators', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- track-bash-files ---
  describe('track-bash-files', () => {
    // AC-VL01
    it('AC-VL01: 리다이렉트(>) 감지 → bash_file_write_detected', () => {
      const r = run(trackBashPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ command: 'echo hello > output.txt' }),
      });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.event, 'bash_file_write_detected');
      assert.ok(out.patterns.length > 0);
    });

    // AC-VL02
    it('AC-VL02: 파일 조작 없으면 무출력', () => {
      const r = run(trackBashPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ command: 'echo hello' }),
      });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });

    it('cp 감지', () => {
      const r = run(trackBashPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ command: 'cp src.txt dest.txt' }),
      });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.event, 'bash_file_write_detected');
    });

    it('빈 TOOL_INPUT → exit(0)', () => {
      const r = run(trackBashPath, projectDir, { TOOL_INPUT: '' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });
  });

  // --- check-side-effects ---
  describe('check-side-effects', () => {
    // AC-VL03
    it('AC-VL03: 소스 변경 + tests/ 존재 → source_modified 이벤트', () => {
      mkdirSync(resolve(projectDir, 'tests'), { recursive: true });

      const r = run(checkSideEffectsPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ file_path: 'src/app.js' }),
      });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.event, 'source_modified');
      assert.equal(out.file, 'src/app.js');
    });

    // AC-VL04
    it('AC-VL04: 테스트 파일 변경 → 이벤트 없음', () => {
      mkdirSync(resolve(projectDir, 'tests'), { recursive: true });

      const r = run(checkSideEffectsPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ file_path: 'tests/auth.test.mjs' }),
      });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });

    it('/tests/ 경로도 무시', () => {
      mkdirSync(resolve(projectDir, 'tests'), { recursive: true });

      const r = run(checkSideEffectsPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ file_path: '/tests/helper.mjs' }),
      });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });

    it('빈 TOOL_INPUT → exit(0)', () => {
      const r = run(checkSideEffectsPath, projectDir, { TOOL_INPUT: '' });
      assert.equal(r.exitCode, 0);
    });
  });

  // --- doc-coverage ---
  describe('doc-coverage', () => {
    // AC-VL06
    it('AC-VL06: specs/ 없으면 skipped:true', () => {
      const r = run(docCoveragePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });

    // AC-VL05
    it('AC-VL05: spec 있고 plan 없는 feature → gaps에 포함', () => {
      // spec 생성
      const specDir = resolve(projectDir, '.harness/specs/auth');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(resolve(specDir, 'login.spec.yaml'), 'id: SPEC-login');

      // plan 없음
      const r = run(docCoveragePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.gap_count, 1);
      assert.equal(out.gaps[0].feature, 'auth/login');
      assert.equal(out.gaps[0].missing, 'plan');
    });

    it('spec+plan 모두 존재 → gap 없음', () => {
      const specDir = resolve(projectDir, '.harness/specs/auth');
      const planDir = resolve(projectDir, '.harness/plans/auth');
      mkdirSync(specDir, { recursive: true });
      mkdirSync(planDir, { recursive: true });
      writeFileSync(resolve(specDir, 'login.spec.yaml'), 'id: SPEC-login');
      writeFileSync(resolve(planDir, 'login.plan.md'), '# Plan');

      const r = run(docCoveragePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.gap_count, 0);
    });
  });

  // --- check-coverage ---
  describe('check-coverage', () => {
    // AC-VL08
    it('AC-VL08: coverage.json 없으면 skipped:true', () => {
      const r = run(checkCoveragePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.skipped, true);
    });

    // AC-VL07
    it('AC-VL07: feature별 AC 커버리지 산출', () => {
      const stateDir = resolve(projectDir, '.harness/state');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(resolve(stateDir, 'coverage.json'), JSON.stringify({
        features: {
          'auth/login': {
            acs: {
              'AC-01': { status: 'covered', test_file: 'auth.test.mjs' },
              'AC-02': { status: 'covered', test_file: 'auth.test.mjs' },
              'AC-03': { status: 'uncovered' },
            },
          },
        },
      }));

      const r = run(checkCoveragePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.features.length, 1);
      assert.equal(out.features[0].total_acs, 3);
      assert.equal(out.features[0].covered, 2);
      assert.equal(out.features[0].percentage, 67);
      assert.equal(out.summary.total_uncovered, 1);
    });

    it('다중 feature 종합', () => {
      const stateDir = resolve(projectDir, '.harness/state');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(resolve(stateDir, 'coverage.json'), JSON.stringify({
        features: {
          'auth/login': {
            acs: {
              'AC-01': { status: 'covered', test_file: 'a.test.mjs' },
              'AC-02': { status: 'covered', test_file: 'a.test.mjs' },
            },
          },
          'billing/charge': {
            acs: {
              'AC-01': { status: 'uncovered' },
            },
          },
        },
      }));

      const r = run(checkCoveragePath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.summary.total_features, 2);
      assert.equal(out.summary.total_acs, 3);
      assert.equal(out.summary.total_covered, 2);
      assert.equal(out.summary.total_uncovered, 1);
      assert.equal(out.summary.percentage, 67);
    });
  });
});
