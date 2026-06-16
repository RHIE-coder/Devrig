// bench/tests/skills/migrate/migrate-scripts.test.mjs
//
// AC-MG01~MG08: migrate skill deterministic scripts 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../../dev/plugin');
const detectStackPath = resolve(pluginRoot, 'skills/migrate/scripts/detect-stack.mjs');
const scaffoldPath = resolve(pluginRoot, 'skills/migrate/scripts/scaffold-harness.mjs');
const dispatchPath = resolve(pluginRoot, 'skills/migrate/scripts/dispatch.mjs');

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

describe('migrate skill', () => {
  let projectDir;
  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  describe('detect-stack', () => {
    // AC-MG01
    it('AC-MG01: package.json + express → javascript/express', () => {
      writeFileSync(resolve(projectDir, 'package.json'), JSON.stringify({
        dependencies: { express: '^4.18.0' },
      }));
      const r = run(detectStackPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.language, 'javascript');
      assert.equal(out.framework, 'express');
    });

    // AC-MG02
    it('AC-MG02: tsconfig.json → typescript', () => {
      writeFileSync(resolve(projectDir, 'package.json'), JSON.stringify({ dependencies: { next: '^14.0.0' } }));
      writeFileSync(resolve(projectDir, 'tsconfig.json'), '{}');
      const r = run(detectStackPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.language, 'typescript');
      assert.equal(out.framework, 'nextjs');
    });

    // AC-MG03
    it('AC-MG03: requirements.txt + flask → python/flask', () => {
      writeFileSync(resolve(projectDir, 'requirements.txt'), 'flask==3.0.0\nrequests==2.31.0\n');
      const r = run(detectStackPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.language, 'python');
      assert.equal(out.framework, 'flask');
    });

    it('매니페스트 없으면 unknown', () => {
      const r = run(detectStackPath, projectDir);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.language, 'unknown');
    });
  });

  describe('scaffold-harness', () => {
    // AC-MG04
    it('AC-MG04: .harness/ 구조 생성', () => {
      const r = run(scaffoldPath, projectDir);
      assert.equal(r.exitCode, 0);
      assert.ok(existsSync(resolve(projectDir, '.harness/specs')));
      assert.ok(existsSync(resolve(projectDir, '.harness/plans')));
      assert.ok(existsSync(resolve(projectDir, '.harness/state')));
    });

    // AC-MG05
    it('AC-MG05: prototype mode config', () => {
      run(scaffoldPath, projectDir);
      const cfg = readFileSync(resolve(projectDir, '.harness/config.yaml'), 'utf8');
      assert.ok(cfg.includes('mode: prototype'));
    });

    // AC-MG06
    it('AC-MG06: 이미 존재 → exit(2)', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      const r = run(scaffoldPath, projectDir);
      assert.equal(r.exitCode, 2);
    });
  });

  describe('dispatch', () => {
    // AC-MG07
    it('AC-MG07: 유효한 서브커맨드 파싱', () => {
      const r = run(dispatchPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ content: '/harness:migrate analyze' }),
      });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.subcommand, 'analyze');
    });

    // AC-MG08
    it('AC-MG08: 유효하지 않은 서브커맨드 → exit(1)', () => {
      const r = run(dispatchPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ content: '/harness:migrate invalid' }),
      });
      assert.equal(r.exitCode, 1);
    });

    it('서브커맨드 없으면 exit(1)', () => {
      const r = run(dispatchPath, projectDir, {
        TOOL_INPUT: JSON.stringify({ content: '/harness:migrate' }),
      });
      assert.equal(r.exitCode, 1);
    });
  });
});
