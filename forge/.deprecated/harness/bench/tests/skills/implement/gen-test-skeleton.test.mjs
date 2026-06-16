// bench/tests/skills/implement/gen-test-skeleton.test.mjs
//
// AC-IM05~IM06: test skeleton 생성 테스트

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
const scriptPath = resolve(pluginRoot, 'skills/implement/scripts/gen-test-skeleton.mjs');

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

const SPEC_3AC = `id: SPEC-test
name: Test Feature
description: Test
acceptance_criteria:
  - id: AC-01
    desc: "첫 번째 AC"
    testable: "검증1"
  - id: AC-02
    desc: "두 번째 AC"
    testable: "검증2"
  - id: AC-03
    desc: "세 번째 AC"
    testable: "검증3"
`;

describe('implement/gen-test-skeleton', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-IM05
  it('AC-IM05: 3개 AC spec → 3개 it() 블록 생성', () => {
    mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), SPEC_3AC);

    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);

    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.ac_count, 3);
    assert.deepEqual(out.acs, ['AC-01', 'AC-02', 'AC-03']);

    // 파일이 생성되었는지 확인
    const testFile = resolve(projectDir, 'tests/auth/login.test.mjs');
    assert.ok(existsSync(testFile));

    const content = readFileSync(testFile, 'utf8');
    assert.ok(content.includes('AC-01'));
    assert.ok(content.includes('AC-02'));
    assert.ok(content.includes('AC-03'));
    assert.ok(content.includes("assert.fail('Not implemented yet')"));
  });

  it('stdout JSON에 feature와 test_file 포함', () => {
    mkdirSync(resolve(projectDir, '.harness/specs'), { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs/my-feature.spec.yaml'), SPEC_3AC);

    const r = run(projectDir, { HARNESS_FEATURE: 'my-feature' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.feature, 'my-feature');
    assert.ok(out.test_file.includes('my-feature.test.mjs'));
  });

  // AC-IM06
  it('AC-IM06: 기존 테스트 파일 존재 → 덮어쓰지 않음', () => {
    mkdirSync(resolve(projectDir, '.harness/specs/auth'), { recursive: true });
    writeFileSync(resolve(projectDir, '.harness/specs/auth/login.spec.yaml'), SPEC_3AC);

    const testDir = resolve(projectDir, 'tests/auth');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, 'login.test.mjs'), '// existing test\n');

    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 0);

    const content = readFileSync(resolve(testDir, 'login.test.mjs'), 'utf8');
    assert.equal(content, '// existing test\n'); // 원본 유지
  });

  it('HARNESS_FEATURE 없으면 exit(1)', () => {
    const r = run(projectDir, { HARNESS_FEATURE: '' });
    assert.equal(r.exitCode, 1);
  });

  it('Spec 없으면 exit(1)', () => {
    const r = run(projectDir, { HARNESS_FEATURE: 'auth/login' });
    assert.equal(r.exitCode, 1);
  });
});
