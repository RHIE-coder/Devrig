// bench/tests/skills/persona/persona-scripts.test.mjs
//
// AC-PS01~PS05: persona skill 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const createPath = resolve(pluginRoot, 'skills/persona/scripts/create.mjs');
const listPath = resolve(pluginRoot, 'skills/persona/scripts/list.mjs');
const deletePath = resolve(pluginRoot, 'skills/persona/scripts/delete.mjs');

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

describe('persona skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-PS01
  it('AC-PS01: create가 파일 생성', () => {
    const r = run(createPath, projectDir, {
      HARNESS_PERSONA_NAME: '보안전문가',
      HARNESS_PERSONA_TYPE: 'tech-specialist',
      HARNESS_PERSONA_DOMAIN: 'security',
    });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.status, 'created');
    assert.ok(existsSync(resolve(projectDir, '.claude/agents/보안전문가.md')));
  });

  // AC-PS02
  it('AC-PS02: create가 기존 파일 덮어쓰지 않음', () => {
    mkdirSync(resolve(projectDir, '.claude/agents'), { recursive: true });
    writeFileSync(resolve(projectDir, '.claude/agents/보안전문가.md'), '# existing');

    const r = run(createPath, projectDir, {
      HARNESS_PERSONA_NAME: '보안전문가',
      HARNESS_PERSONA_TYPE: 'tech-specialist',
    });
    assert.equal(r.exitCode, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.status, 'exists');
  });

  // AC-PS03
  it('AC-PS03: list가 전체 목록 반환', () => {
    mkdirSync(resolve(projectDir, '.claude/agents'), { recursive: true });
    writeFileSync(resolve(projectDir, '.claude/agents/persona-a.md'), '# Persona A');
    writeFileSync(resolve(projectDir, '.claude/agents/persona-b.md'), '# Persona B');

    const r = run(listPath, projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 2);
  });

  // AC-PS04
  it('AC-PS04: delete가 파일 삭제', () => {
    mkdirSync(resolve(projectDir, '.claude/agents'), { recursive: true });
    writeFileSync(resolve(projectDir, '.claude/agents/보안전문가.md'), '# 보안전문가');

    const r = run(deletePath, projectDir, { HARNESS_PERSONA_NAME: '보안전문가' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.status, 'deleted');
    assert.ok(!existsSync(resolve(projectDir, '.claude/agents/보안전문가.md')));
  });

  // AC-PS05
  it('AC-PS05: delete 미존재 → exit(2)', () => {
    const r = run(deletePath, projectDir, { HARNESS_PERSONA_NAME: '없는페르소나' });
    assert.equal(r.exitCode, 2);
  });

  it('list 빈 디렉토리 → total=0', () => {
    const r = run(listPath, projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 0);
  });
});
