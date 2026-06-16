// bench/tests/skills/spec/validate-spec.test.mjs
//
// Spec skill: validate-spec, check-testability, gen-coverage-map 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const validatePath = resolve(pluginRoot, 'skills/spec/scripts/validate-spec.mjs');
const testabilityPath = resolve(pluginRoot, 'skills/spec/scripts/check-testability.mjs');
const coverageMapPath = resolve(pluginRoot, 'skills/spec/scripts/gen-coverage-map.mjs');

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

const VALID_SPEC = `id: SPEC-test
name: Test Feature
description: A test feature
acceptance_criteria:
  - id: AC-01
    desc: "First AC"
    testable: "Can be tested"
  - id: AC-02
    desc: "Second AC"
    testable: "Also testable"
`;

const MISSING_NAME_SPEC = `id: SPEC-test
description: A test
acceptance_criteria:
  - id: AC-01
    desc: "AC"
    testable: "yes"
`;

const NO_AC_SPEC = `id: SPEC-test
name: Test
description: Test
acceptance_criteria:
`;

describe('spec skill scripts', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- validate-spec ---
  describe('validate-spec', () => {
    it('유효한 spec → exit(0)', () => {
      const specFile = 'test.spec.yaml';
      writeFileSync(resolve(projectDir, specFile), VALID_SPEC);
      const r = run(validatePath, projectDir, { HARNESS_SPEC_FILE: specFile });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.valid, true);
      assert.equal(out.ac_count, 2);
    });

    it('name 누락 → exit(2)', () => {
      const specFile = 'test.spec.yaml';
      writeFileSync(resolve(projectDir, specFile), MISSING_NAME_SPEC);
      const r = run(validatePath, projectDir, { HARNESS_SPEC_FILE: specFile });
      assert.equal(r.exitCode, 2);
    });

    it('AC 없음 → exit(2)', () => {
      const specFile = 'test.spec.yaml';
      writeFileSync(resolve(projectDir, specFile), NO_AC_SPEC);
      const r = run(validatePath, projectDir, { HARNESS_SPEC_FILE: specFile });
      assert.equal(r.exitCode, 2);
    });

    it('HARNESS_SPEC_FILE 없으면 exit(1)', () => {
      const r = run(validatePath, projectDir, { HARNESS_SPEC_FILE: '' });
      assert.equal(r.exitCode, 1);
    });
  });

  // --- gen-coverage-map ---
  describe('gen-coverage-map', () => {
    it('coverage.json 생성 + AC 엔트리', () => {
      const specFile = 'test.spec.yaml';
      writeFileSync(resolve(projectDir, specFile), VALID_SPEC);
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });

      const r = run(coverageMapPath, projectDir, {
        HARNESS_SPEC_FILE: specFile,
        HARNESS_FEATURE: 'test',
      });
      assert.equal(r.exitCode, 0);

      const coverage = JSON.parse(readFileSync(resolve(projectDir, '.harness/state/coverage.json'), 'utf8'));
      assert.ok(coverage.features.test);
      assert.equal(Object.keys(coverage.features.test.acs).length, 2);
      assert.equal(coverage.features.test.acs['AC-01'].status, 'uncovered');
    });
  });
});
