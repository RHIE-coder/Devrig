// bench/tests/skills/review/review-scripts.test.mjs
//
// AC-RV01~RV09: review skill scripts 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const gateCheckPath = resolve(pluginRoot, 'skills/review/scripts/gate-check.mjs');
const diffAnalyzerPath = resolve(pluginRoot, 'skills/review/scripts/diff-analyzer.mjs');
const collectVerdictsPath = resolve(pluginRoot, 'skills/review/scripts/collect-verdicts.mjs');

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

function runWithStdin(scriptPath, projectDir, stdinData, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ...envExtra,
  };
  delete env.NODE_TEST_CONTEXT;
  const input = typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData);
  try {
    const stdout = execFileSync('node', [scriptPath], {
      env, input, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

function setupWorkflow(projectDir, featureName, data) {
  const dir = resolve(projectDir, '.harness/state');
  mkdirSync(dir, { recursive: true });
  const wf = { features: { [featureName]: data } };
  writeFileSync(resolve(dir, 'workflow.json'), JSON.stringify(wf));
}

describe('review skill scripts', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- gate-check ---
  describe('gate-check', () => {
    // AC-RV01
    it('AC-RV01: HARNESS_FEATURE 없으면 exit(1)', () => {
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: '' });
      assert.equal(r.exitCode, 1);
    });

    // AC-RV02
    it('AC-RV02: implement.passed 없으면 exit(2) + G3', () => {
      setupWorkflow(projectDir, 'auth/login', { implement: { passed: false } });
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
      assert.ok(r.stderr.includes('G3'));
    });

    // AC-RV03
    it('AC-RV03: implement.passed=true → exit(0)', () => {
      setupWorkflow(projectDir, 'auth/login', { implement: { passed: true } });
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.passed, true);
      assert.equal(out.gate, 'G3');
    });

    it('workflow.json 없으면 exit(2)', () => {
      const r = run(gateCheckPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
    });
  });

  // --- diff-analyzer ---
  describe('diff-analyzer', () => {
    // AC-RV05
    it('AC-RV05: 비git 환경 → 빈 분석 (complexity=unknown)', () => {
      const r = run(diffAnalyzerPath, projectDir, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.files_changed, 0);
      assert.equal(out.complexity, 'unknown');
    });

    // AC-RV04
    it('AC-RV04: git 변경 존재 → files_changed, insertions 포함', () => {
      // git repo 초기화
      const gitEnv = { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' };
      const gitOpts = { cwd: projectDir, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...gitEnv } };
      execSync('git init -b main', gitOpts);
      writeFileSync(resolve(projectDir, 'init.txt'), 'init');
      execSync('git add . && git commit -m "init"', gitOpts);
      execSync('git checkout -b feature', gitOpts);
      writeFileSync(resolve(projectDir, 'new-file.txt'), 'hello\nworld\n');
      execSync('git add . && git commit -m "add file"', gitOpts);

      const r = run(diffAnalyzerPath, projectDir, {
        HARNESS_FEATURE: 'auth/login',
        HARNESS_BASE_BRANCH: 'main',
      });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.files_changed >= 1);
      assert.ok(out.insertions >= 1);
      assert.equal(out.complexity, 'low');
    });

    it('HARNESS_FEATURE 없으면 exit(1)', () => {
      const r = run(diffAnalyzerPath, projectDir, { HARNESS_FEATURE: '' });
      assert.equal(r.exitCode, 1);
    });
  });

  // --- collect-verdicts ---
  describe('collect-verdicts', () => {
    // AC-RV06
    it('AC-RV06: ANY BLOCK → overall=BLOCK + exit(2)', () => {
      const verdicts = [
        { reviewer: 'security', verdict: 'BLOCK', findings: ['SQL injection'], confidence: 'high' },
        { reviewer: 'quality', verdict: 'PASS', findings: [], confidence: 'high' },
      ];
      const r = runWithStdin(collectVerdictsPath, projectDir, verdicts, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 2);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.overall, 'BLOCK');
      assert.equal(out.block_count, 1);
    });

    // AC-RV07
    it('AC-RV07: ANY NEEDS_CHANGE → overall=NEEDS_CHANGE + exit(0)', () => {
      const verdicts = [
        { reviewer: 'quality', verdict: 'NEEDS_CHANGE', findings: ['naming'], confidence: 'medium' },
        { reviewer: 'spec', verdict: 'PASS', findings: [], confidence: 'high' },
      ];
      const r = runWithStdin(collectVerdictsPath, projectDir, verdicts, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.overall, 'NEEDS_CHANGE');
      assert.equal(out.needs_change_count, 1);
    });

    // AC-RV08
    it('AC-RV08: ALL PASS → overall=PASS + exit(0)', () => {
      const verdicts = [
        { reviewer: 'security', verdict: 'PASS', findings: [], confidence: 'high' },
        { reviewer: 'quality', verdict: 'PASS', findings: [], confidence: 'high' },
        { reviewer: 'spec', verdict: 'PASS', findings: [], confidence: 'high' },
      ];
      const r = runWithStdin(collectVerdictsPath, projectDir, verdicts, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.overall, 'PASS');
      assert.equal(out.pass_count, 3);
    });

    // AC-RV09
    it('AC-RV09: review-{feature}.json 파일 저장', () => {
      const verdicts = [
        { reviewer: 'spec', verdict: 'PASS', findings: [], confidence: 'high' },
      ];
      const r = runWithStdin(collectVerdictsPath, projectDir, verdicts, { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const saved = resolve(projectDir, '.harness/state/review-auth-login.json');
      assert.ok(existsSync(saved));
      const data = JSON.parse(readFileSync(saved, 'utf8'));
      assert.equal(data.feature, 'auth/login');
      assert.equal(data.overall, 'PASS');
    });

    it('빈 verdict → NO_INPUT + exit(0)', () => {
      const r = runWithStdin(collectVerdictsPath, projectDir, '', { HARNESS_FEATURE: 'auth/login' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.overall, 'NO_INPUT');
    });

    it('HARNESS_FEATURE 없으면 exit(1)', () => {
      const r = runWithStdin(collectVerdictsPath, projectDir, '[]', { HARNESS_FEATURE: '' });
      assert.equal(r.exitCode, 1);
    });
  });
});
