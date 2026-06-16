// bench/tests/skills/init.test.mjs
//
// AC-I01~I05: Init Skill 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../dev/plugin');
const scaffoldPath = resolve(pluginRoot, 'skills/init/scripts/scaffold-harness.mjs');
const genConfigPath = resolve(pluginRoot, 'skills/init/scripts/gen-config.mjs');
const copyExamplesPath = resolve(pluginRoot, 'skills/init/scripts/copy-examples.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runScript(scriptPath, projectDir, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ...envExtra,
  };
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString() };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('init skill', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- AC-I01: scaffold ---
  describe('AC-I01: .harness/ 구조 생성', () => {
    it('scaffold → 필수 디렉토리 존재', () => {
      const r = runScript(scaffoldPath, projectDir);
      assert.equal(r.exitCode, 0);

      assert.ok(existsSync(resolve(projectDir, '.harness/state')));
      assert.ok(existsSync(resolve(projectDir, '.harness/specs')));
      assert.ok(existsSync(resolve(projectDir, '.harness/plans')));
      assert.ok(existsSync(resolve(projectDir, '.harness/decisions')));
      assert.ok(existsSync(resolve(projectDir, '.harness/knowledge')));
    });

    it('scaffold → .gitignore 생성', () => {
      runScript(scaffoldPath, projectDir);
      assert.ok(existsSync(resolve(projectDir, '.harness/.gitignore')));
    });

    it('stdout에 status: created', () => {
      const r = runScript(scaffoldPath, projectDir);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.status, 'created');
    });
  });

  // --- AC-I02: config.yaml 생성 (standard 기본) ---
  describe('AC-I02: config.yaml 생성', () => {
    it('gen-config → config.yaml에 mode: standard', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      const r = runScript(genConfigPath, projectDir);
      assert.equal(r.exitCode, 0);

      const config = readFileSync(resolve(projectDir, '.harness/config.yaml'), 'utf8');
      assert.ok(config.includes('mode: standard'));
    });
  });

  // --- AC-I03: --mode prototype ---
  describe('AC-I03: mode prototype', () => {
    it('HARNESS_MODE=prototype → config.yaml에 mode: prototype', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      const r = runScript(genConfigPath, projectDir, { HARNESS_MODE: 'prototype' });
      assert.equal(r.exitCode, 0);

      const config = readFileSync(resolve(projectDir, '.harness/config.yaml'), 'utf8');
      assert.ok(config.includes('mode: prototype'));
    });
  });

  // --- AC-I04: 이미 .harness/ 존재 시 덮어쓰기 않음 ---
  describe('AC-I04: 이미 존재 시 skip', () => {
    it('기존 .harness/ → status: exists', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      const r = runScript(scaffoldPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.status, 'exists');
    });

    it('기존 config.yaml → skip', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      writeFileSync(resolve(projectDir, '.harness/config.yaml'), 'mode: explore\n');

      runScript(genConfigPath, projectDir);
      const config = readFileSync(resolve(projectDir, '.harness/config.yaml'), 'utf8');
      assert.ok(config.includes('mode: explore')); // 기존 값 유지
    });
  });

  // --- AC-I05: example 미덮어쓰기 ---
  describe('AC-I05: example 미덮어쓰기', () => {
    it('기존 CLAUDE.md → 변경 없음', () => {
      const original = '# My Project\n';
      writeFileSync(resolve(projectDir, 'CLAUDE.md'), original);

      runScript(copyExamplesPath, projectDir);
      const content = readFileSync(resolve(projectDir, 'CLAUDE.md'), 'utf8');
      assert.equal(content, original);
    });

    it('CLAUDE.md 없으면 복사', () => {
      const r = runScript(copyExamplesPath, projectDir);
      assert.equal(r.exitCode, 0);
      assert.ok(existsSync(resolve(projectDir, 'CLAUDE.md')));
    });

    it('HARNESS_SKIP_EXAMPLES=true → 복사 안 함', () => {
      const r = runScript(copyExamplesPath, projectDir, { HARNESS_SKIP_EXAMPLES: 'true' });
      assert.equal(r.exitCode, 0);
      assert.equal(existsSync(resolve(projectDir, 'CLAUDE.md')), false);
    });
  });
});
