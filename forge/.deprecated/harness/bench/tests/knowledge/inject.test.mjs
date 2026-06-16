// bench/tests/knowledge/inject.test.mjs
//
// AC-K04~K06: knowledge inject 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../dev/plugin');
const scriptPath = resolve(pluginRoot, 'scripts/knowledge/inject.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(projectDir, stdinData, envExtra = {}) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ...envExtra,
  };
  try {
    const stdout = execFileSync('node', [scriptPath], {
      env,
      input: stdinData,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.toString(), stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

describe('knowledge/inject', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  it('빈 입력 → injected: false', () => {
    const r = run(projectDir, '');
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.injected, false);
  });

  it('결과 0건 → injected: false', () => {
    const r = run(projectDir, JSON.stringify({ results: [] }));
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.injected, false);
  });

  // AC-K05
  it('AC-K05: token 이내 → 전문 주입, truncated: false', () => {
    const input = JSON.stringify({
      results: [{
        id: 'SOL-auth-001',
        domain: 'auth',
        content: '---\nid: SOL-auth-001\ndomain: auth\nref_count: 0\n---\n\nShort solution body.',
      }],
    });
    const r = run(projectDir, input, { HARNESS_MAX_INJECT_TOKENS: '800' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.injected, true);
    assert.equal(out.count, 1);
    assert.equal(out.solutions[0].truncated, false);
    assert.ok(out.context.includes('Short solution body'));
  });

  // AC-K04
  it('AC-K04: max_inject_tokens 초과 시 truncate', () => {
    // 매우 긴 솔루션 생성 (800 token ≈ 3200 chars)
    const longBody = 'A'.repeat(4000);
    const input = JSON.stringify({
      results: [{
        id: 'SOL-auth-001',
        domain: 'auth',
        content: `---\nid: SOL-auth-001\ndomain: auth\nref_count: 0\n---\n\n${longBody}`,
      }],
    });
    const r = run(projectDir, input, { HARNESS_MAX_INJECT_TOKENS: '100' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.injected, true);
    assert.ok(out.total_tokens <= 100);
    assert.equal(out.solutions[0].truncated, true);
  });

  // AC-K06
  it('AC-K06: inject 후 ref_count 갱신', () => {
    const solDir = resolve(projectDir, '.harness/knowledge/solutions/auth');
    mkdirSync(solDir, { recursive: true });
    const solPath = resolve(solDir, 'timing.md');
    writeFileSync(solPath, `---
id: SOL-auth-001
domain: auth
ref_count: 2
last_referenced: 2026-04-01
---

Solution body here.
`);

    const input = JSON.stringify({
      results: [{
        id: 'SOL-auth-001',
        domain: 'auth',
        path: solPath,
        content: readFileSync(solPath, 'utf8'),
      }],
    });
    const r = run(projectDir, input);
    assert.equal(r.exitCode, 0);

    // ref_count가 3으로 증가했는지 확인
    const updated = readFileSync(solPath, 'utf8');
    assert.ok(updated.includes('ref_count: 3'));
  });
});
