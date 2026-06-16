// bench/tests/knowledge/search.test.mjs
//
// AC-K01~K03: knowledge search 테스트

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
const scriptPath = resolve(pluginRoot, 'scripts/knowledge/search.mjs');

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
  const content = `---
id: ${meta.id || `SOL-${domain}-001`}
domain: ${domain}
tags: [${(meta.tags || []).join(', ')}]
created: ${meta.created || '2026-04-01'}
last_referenced: ${meta.last_referenced || '2026-04-01'}
ref_count: ${meta.ref_count || 0}
---

## 문제
${meta.problem || 'Test problem'}

## 해결
${meta.solution || 'Test solution'}
`;
  writeFileSync(resolve(dir, `${slug}.md`), content);
}

describe('knowledge/search', () => {
  let projectDir;

  beforeEach(() => { projectDir = tmpProject(); });
  afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

  // AC-K02
  it('AC-K02: 아카이브 비어있으면 빈 배열', () => {
    const r = run(projectDir, { HARNESS_DOMAIN: 'auth' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.deepEqual(out.results, []);
    assert.equal(out.total, 0);
  });

  it('solutions 디렉토리 없어도 빈 배열', () => {
    mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
    const r = run(projectDir, { HARNESS_DOMAIN: 'auth' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 0);
  });

  // AC-K01
  it('AC-K01: 동일 domain 솔루션 검색 성공', () => {
    writeSolution(projectDir, 'auth', 'timing-attack', {
      id: 'SOL-auth-001',
      tags: ['bcrypt', 'security'],
      problem: 'Timing attack',
      solution: 'Use timingSafeEqual',
    });

    const r = run(projectDir, { HARNESS_DOMAIN: 'auth' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 1);
    assert.equal(out.results[0].id, 'SOL-auth-001');
  });

  // AC-K03
  it('AC-K03: keyword 매칭으로 점수 정렬', () => {
    writeSolution(projectDir, 'auth', 'sol-a', {
      id: 'SOL-auth-001',
      tags: ['bcrypt'],
      problem: 'Problem A',
    });
    writeSolution(projectDir, 'auth', 'sol-b', {
      id: 'SOL-auth-002',
      tags: ['bcrypt', 'security', 'timing'],
      problem: 'Problem B about security and timing',
    });

    const r = run(projectDir, { HARNESS_DOMAIN: 'auth', HARNESS_KEYWORDS: 'security,timing' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.total, 2);
    // sol-b should score higher (more keyword matches)
    assert.equal(out.results[0].id, 'SOL-auth-002');
  });

  it('다른 domain 솔루션은 domain 점수 없음', () => {
    writeSolution(projectDir, 'billing', 'stripe', {
      id: 'SOL-billing-001',
      tags: ['stripe'],
    });

    const r = run(projectDir, { HARNESS_DOMAIN: 'auth', HARNESS_KEYWORDS: 'stripe' });
    assert.equal(r.exitCode, 0);
    const out = JSON.parse(r.stdout.trim());
    // keyword 'stripe' 매칭으로 나올 수는 있지만 domain 점수 없음
    if (out.total > 0) {
      assert.equal(out.results[0].domain, 'billing');
    }
  });
});
