// bench/tests/knowledge/prune.test.mjs
//
// AC-K07~K08: knowledge prune 테스트

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../../../dev/plugin');
const scriptPath = resolve(pluginRoot, 'scripts/knowledge/prune.mjs');

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

function writeSolution(projectDir, domain, slug, meta) {
  const dir = resolve(projectDir, '.harness/knowledge/solutions', domain);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${slug}.md`), `---
id: ${meta.id}
domain: ${domain}
ref_count: ${meta.ref_count}
created: ${meta.created}
---

## 문제
Test problem
`);
}

// 91일 전 날짜
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

describe('knowledge/prune', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  it('solutions 디렉토리 없으면 빈 candidates', () => {
    const r = run(projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 0);
  });

  // AC-K07
  it('AC-K07: ref_count=0 + 91일 경과 → candidates에 포함', () => {
    writeSolution(projectDir, 'auth', 'stale', {
      id: 'SOL-auth-001',
      ref_count: 0,
      created: daysAgo(91),
    });

    const r = run(projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 1);
    assert.equal(out.candidates[0].id, 'SOL-auth-001');
  });

  // AC-K08
  it('AC-K08: ref_count>0 → candidates에 미포함', () => {
    writeSolution(projectDir, 'auth', 'active', {
      id: 'SOL-auth-002',
      ref_count: 3,
      created: daysAgo(91),
    });

    const r = run(projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 0);
  });

  it('ref_count=0 but 89일 경과 → 미포함 (90일 미만)', () => {
    writeSolution(projectDir, 'auth', 'recent', {
      id: 'SOL-auth-003',
      ref_count: 0,
      created: daysAgo(89),
    });

    const r = run(projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 0);
  });

  it('HARNESS_PRUNE_AUTO=true → 실제 삭제', () => {
    writeSolution(projectDir, 'auth', 'stale', {
      id: 'SOL-auth-001',
      ref_count: 0,
      created: daysAgo(91),
    });

    const solPath = resolve(projectDir, '.harness/knowledge/solutions/auth/stale.md');
    assert.ok(existsSync(solPath));

    const r = run(projectDir, { HARNESS_PRUNE_AUTO: 'true' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 1);
    assert.equal(existsSync(solPath), false); // 삭제됨
  });

  it('혼합: stale + active → stale만 후보', () => {
    writeSolution(projectDir, 'auth', 'stale', {
      id: 'SOL-auth-001',
      ref_count: 0,
      created: daysAgo(100),
    });
    writeSolution(projectDir, 'auth', 'active', {
      id: 'SOL-auth-002',
      ref_count: 5,
      created: daysAgo(100),
    });

    const r = run(projectDir);
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 1);
    assert.equal(out.candidates[0].id, 'SOL-auth-001');
  });
});
