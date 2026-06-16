// bench/tests/state/event-emit.test.mjs
//
// AC-ST07: feature event 기록
// AC-ST08: 동시 호출 시 flock 직렬화 무결성

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/state/event-emit.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCli(projectDir, args) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, HARNESS_PRODUCER: 'test' };
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.toString() };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

function runStdin(projectDir, input) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, HARNESS_PRODUCER: 'test' };
  try {
    const stdout = execFileSync('node', [scriptPath], {
      env,
      input: JSON.stringify(input),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.toString() };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

function findJsonlFile(projectDir) {
  const eventsDir = resolve(projectDir, '.harness/state/events');
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (entry.name.endsWith('.jsonl')) {
        return full;
      }
    }
    return null;
  }
  return walk(eventsDir);
}

describe('event-emit', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // --- AC-ST07: feature event 기록 ---
  describe('AC-ST07: event 기록', () => {
    it('CLI 인자 → events/{domain}/{feature}/{YYYY-MM}.jsonl 생성', () => {
      const r = runCli(projectDir, [
        '--type', 'SpecCreated',
        '--domain', 'auth',
        '--feature', 'login',
      ]);
      assert.equal(r.exitCode, 0);

      const jsonlPath = findJsonlFile(projectDir);
      assert.ok(jsonlPath, 'JSONL 파일이 생성되어야 함');
      assert.ok(jsonlPath.includes('auth/login'));

      const line = readFileSync(jsonlPath, 'utf8').trim();
      const event = JSON.parse(line);
      assert.equal(event.type, 'SpecCreated');
      assert.equal(event.payload.domain, 'auth');
      assert.equal(event.payload.feature, 'login');
      assert.ok(event.ts);
      assert.ok(event.v >= 1);
    });

    it('stdin → event 기록', () => {
      const r = runStdin(projectDir, {
        type: 'PlanApproved',
        payload: { domain: 'auth', feature: 'login' },
      });
      assert.equal(r.exitCode, 0);

      const jsonlPath = findJsonlFile(projectDir);
      assert.ok(jsonlPath);
      const event = JSON.parse(readFileSync(jsonlPath, 'utf8').trim());
      assert.equal(event.type, 'PlanApproved');
    });

    it('stdout에 기록된 이벤트 반환', () => {
      const r = runCli(projectDir, [
        '--type', 'ImplementStarted',
        '--domain', 'auth',
        '--feature', 'login',
      ]);
      assert.equal(r.exitCode, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(out.type, 'ImplementStarted');
    });
  });

  // --- AC-ST08: 동시 호출 무결성 ---
  describe('AC-ST08: 동시 호출 직렬화', () => {
    it('동시 5회 호출 → JSONL 줄 수 = 5, 전부 파싱 성공', async () => {
      const count = 5;
      const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, HARNESS_PRODUCER: 'test' };

      const promises = Array.from({ length: count }, (_, i) =>
        new Promise((res, rej) => {
          execFile('node', [scriptPath,
            '--type', 'SpecCreated',
            '--domain', 'auth',
            '--feature', 'login',
          ], { env }, (err) => {
            if (err && err.code !== 0) rej(err);
            else res();
          });
        })
      );

      await Promise.all(promises);

      const jsonlPath = findJsonlFile(projectDir);
      assert.ok(jsonlPath, 'JSONL 파일 존재');

      const lines = readFileSync(jsonlPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim());

      assert.equal(lines.length, count, `줄 수 = ${count}`);

      for (const line of lines) {
        const event = JSON.parse(line); // 파싱 실패하면 assert 자동 실패
        assert.equal(event.type, 'SpecCreated');
      }
    });
  });

  // --- 빈 입력 ---
  describe('빈 입력', () => {
    it('stdin 빈 입력 → exit(0)', () => {
      const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
      try {
        execFileSync('node', [scriptPath], {
          env,
          input: '',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (e) {
        assert.fail(`빈 입력에서 exit(${e.status}) 발생`);
      }
    });
  });
});
