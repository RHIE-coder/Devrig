// bench/tests/qa/stack-runner.test.mjs
//
// AC-QA01~QA04: QA stack-runner 테스트

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
const scriptPath = resolve(pluginRoot, 'scripts/qa/stack-runner.mjs');

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
  delete env.NODE_TEST_CONTEXT;
  try {
    const stdout = execFileSync('node', [scriptPath], {
      env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000,
    });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

// node:test 형식의 테스트 파일 생성
function writeTestFile(dir, name, pass) {
  mkdirSync(dir, { recursive: true });
  const code = pass
    ? `import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('${name}', () => { assert.ok(true); });\n`
    : `import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('${name}', () => { assert.ok(false, 'intentional fail'); });\n`;
  writeFileSync(resolve(dir, `${name}.test.mjs`), code);
}

describe('qa/stack-runner', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-QA01
  it('AC-QA01: HARNESS_FEATURE 없으면 exit(1)', () => {
    const r = run(projectDir, { HARNESS_FEATURE: '' });
    assert.equal(r.exitCode, 1);
  });

  // AC-QA02
  it('AC-QA02: sequential_bottom_up에서 하위 FAIL → 상위 skipped', () => {
    // infra 실패, db/api 테스트 존재
    writeTestFile(resolve(projectDir, 'tests/infra'), 'infra-check', false);
    writeTestFile(resolve(projectDir, 'tests/db'), 'db-check', true);
    writeTestFile(resolve(projectDir, 'tests/api'), 'api-check', true);

    const r = run(projectDir, {
      HARNESS_FEATURE: 'auth/login',
      HARNESS_QA_MODE: 'sequential_bottom_up',
      HARNESS_QA_SKIP: 'ui',
    });
    assert.equal(r.exitCode, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.mode, 'sequential_bottom_up');
    assert.ok(out.halted);

    // infra=fail, db=skipped, api=skipped
    const infra = out.layers.find((l) => l.name === 'infra');
    const db = out.layers.find((l) => l.name === 'db');
    const api = out.layers.find((l) => l.name === 'api');
    assert.equal(infra.status, 'fail');
    assert.equal(db.status, 'skipped');
    assert.equal(api.status, 'skipped');
  });

  // AC-QA03
  it('AC-QA03: parallel 모드에서 모든 레이어 실행', () => {
    writeTestFile(resolve(projectDir, 'tests/infra'), 'infra-check', false);
    writeTestFile(resolve(projectDir, 'tests/db'), 'db-check', true);

    const r = run(projectDir, {
      HARNESS_FEATURE: 'auth/login',
      HARNESS_QA_MODE: 'parallel',
      HARNESS_QA_SKIP: 'api,ui',
    });
    assert.equal(r.exitCode, 2); // infra fails
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.mode, 'parallel');
    assert.equal(out.halted, false);

    // parallel: infra fail이어도 db는 실행됨
    const infra = out.layers.find((l) => l.name === 'infra');
    const db = out.layers.find((l) => l.name === 'db');
    assert.equal(infra.status, 'fail');
    assert.equal(db.status, 'pass');
  });

  // AC-QA04
  it('AC-QA04: HARNESS_QA_SKIP으로 레이어 스킵', () => {
    writeTestFile(resolve(projectDir, 'tests/infra'), 'infra-check', true);

    const r = run(projectDir, {
      HARNESS_FEATURE: 'auth/login',
      HARNESS_QA_MODE: 'parallel',
      HARNESS_QA_SKIP: 'db,api,ui',
    });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    // 오직 infra만 실행
    assert.equal(out.passed, 1);
    assert.equal(out.layers.length, 1);
    assert.equal(out.layers[0].name, 'infra');
  });

  it('테스트 디렉토리 없는 레이어 → skip', () => {
    // tests/ 자체가 없음
    const r = run(projectDir, {
      HARNESS_FEATURE: 'auth/login',
      HARNESS_QA_MODE: 'parallel',
    });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    // 모든 레이어 skip
    assert.equal(out.skipped, 4);
  });

  it('전체 통과 시 exit(0)', () => {
    writeTestFile(resolve(projectDir, 'tests/infra'), 'infra-check', true);
    writeTestFile(resolve(projectDir, 'tests/db'), 'db-check', true);

    const r = run(projectDir, {
      HARNESS_FEATURE: 'auth/login',
      HARNESS_QA_MODE: 'parallel',
      HARNESS_QA_SKIP: 'api,ui',
    });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.failed, 0);
    assert.equal(out.passed, 2);
  });
});
