// bench/tests/skills/prompt-pipeline.test.mjs
//
// AC-PP01~PP07: prompt pipeline 테스트

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
const qualityCheckPath = resolve(pluginRoot, 'scripts/prompt/quality-check.mjs');
const autoTransformPath = resolve(pluginRoot, 'scripts/prompt/auto-transform.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(scriptPath, projectDir, toolInput, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    TOOL_INPUT: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput),
    ...envExtra,
  };
  try {
    const stdout = execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

function setupHarness(projectDir, mode = 'standard', autoTransform = true) {
  mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
  writeFileSync(resolve(projectDir, '.harness/config.yaml'),
    `mode: ${mode}\nworkflow:\n  prompt_pipeline:\n    auto_transform: ${autoTransform}\n`);
}

describe('prompt pipeline', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // --- quality-check ---
  describe('quality-check', () => {
    // AC-PP01
    it('AC-PP01: "빠르게" 포함 → ambiguity 경고', () => {
      setupHarness(projectDir);
      const r = run(qualityCheckPath, projectDir, { content: '빠르게 구현해줘' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.warnings.some((w) => w.type === 'ambiguity'));
    });

    // AC-PP02
    it('AC-PP02: /harness:implement (feature 없이) → scope 경고', () => {
      setupHarness(projectDir);
      const r = run(qualityCheckPath, projectDir, { content: '/harness:implement' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.warnings.some((w) => w.type === 'scope'));
    });

    // AC-PP03
    it('AC-PP03: explore 모드 → skip (exit(0), 경고 없음)', () => {
      setupHarness(projectDir, 'explore');
      const r = run(qualityCheckPath, projectDir, { content: '빠르게 대충 해줘' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), ''); // 출력 없음
    });

    // AC-PP04
    it('AC-PP04: 깨끗한 프롬프트 → 경고 없음', () => {
      setupHarness(projectDir);
      const r = run(qualityCheckPath, projectDir, { content: '/harness:implement auth/login' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), ''); // 출력 없음
    });

    it('.harness/ 없으면 skip', () => {
      const r = run(qualityCheckPath, projectDir, { content: '빠르게 해줘' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });

    it('빈 프롬프트 → skip', () => {
      setupHarness(projectDir);
      const r = run(qualityCheckPath, projectDir, '');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- auto-transform ---
  describe('auto-transform', () => {
    // AC-PP05
    it('AC-PP05: "긴급 배포" → bypass-qa 제안', () => {
      setupHarness(projectDir, 'standard', true);
      const r = run(autoTransformPath, projectDir, { content: '긴급 배포 해주세요' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.event, 'prompt_transformed');
      assert.ok(out.matches.some((m) => m.bypass_flag === 'bypass-qa'));
    });

    // AC-PP06
    it('AC-PP06: auto_transform=false → skip', () => {
      setupHarness(projectDir, 'standard', false);
      const r = run(autoTransformPath, projectDir, { content: '긴급 배포' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });

    // AC-PP07
    it('AC-PP07: explore 모드 → skip', () => {
      setupHarness(projectDir, 'explore', true);
      const r = run(autoTransformPath, projectDir, { content: '긴급 배포' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });

    it('"spec 없이" → bypass-gates:g1 제안', () => {
      setupHarness(projectDir, 'standard', true);
      const r = run(autoTransformPath, projectDir, { content: 'spec 없이 구현해줘' });
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.ok(out.matches.some((m) => m.bypass_flag === 'bypass-gates:g1'));
    });

    it('매칭 키워드 없으면 skip', () => {
      setupHarness(projectDir, 'standard', true);
      const r = run(autoTransformPath, projectDir, { content: '/harness:implement auth/login' });
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout.trim(), '');
    });
  });
});
