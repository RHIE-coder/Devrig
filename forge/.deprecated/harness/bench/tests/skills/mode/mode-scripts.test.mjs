// bench/tests/skills/mode/mode-scripts.test.mjs
//
// AC-MD01~MD04: mode skill 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const showPath = resolve(pluginRoot, 'skills/mode/scripts/show.mjs');
const setPath = resolve(pluginRoot, 'skills/mode/scripts/set.mjs');

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

function setupWorkflow(projectDir, mode) {
  mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });
  writeFileSync(resolve(projectDir, '.harness/state/workflow.json'),
    JSON.stringify({ session: { mode }, last_updated: new Date().toISOString() }, null, 2));
}

describe('mode skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-MD01
  it('AC-MD01: show가 현재 mode 반환', () => {
    setupWorkflow(projectDir, 'prototype');
    const r = run(showPath, projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.mode, 'prototype');
  });

  // AC-MD02
  it('AC-MD02: set이 mode 전환', () => {
    setupWorkflow(projectDir, 'standard');
    const r = run(setPath, projectDir, { HARNESS_MODE: 'explore' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.previous, 'standard');
    assert.equal(out.current, 'explore');
    // workflow.json 확인
    const wf = JSON.parse(readFileSync(resolve(projectDir, '.harness/state/workflow.json'), 'utf8'));
    assert.equal(wf.session.mode, 'explore');
  });

  // AC-MD03
  it('AC-MD03: set auto → exit(2)', () => {
    setupWorkflow(projectDir, 'standard');
    const r = run(setPath, projectDir, { HARNESS_MODE: 'auto' });
    assert.equal(r.exitCode, 2);
  });

  // AC-MD04
  it('AC-MD04: 유효하지 않은 mode → exit(2)', () => {
    setupWorkflow(projectDir, 'standard');
    const r = run(setPath, projectDir, { HARNESS_MODE: 'invalid' });
    assert.equal(r.exitCode, 2);
  });

  it('.harness/ 없으면 show exit(1)', () => {
    const r = run(showPath, projectDir);
    assert.equal(r.exitCode, 1);
  });

  it('HARNESS_MODE 없으면 set exit(1)', () => {
    setupWorkflow(projectDir, 'standard');
    const r = run(setPath, projectDir, { HARNESS_MODE: '' });
    assert.equal(r.exitCode, 1);
  });
});
