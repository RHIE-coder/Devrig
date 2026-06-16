// bench/tests/guardrails/block-force-push.test.mjs
//
// AC-S02: git push --force 차단
// AC-S10: 빈 입력은 안전하게 통과

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/guardrails/block-force-push.mjs');

function run(command) {
  const env = {
    ...process.env,
    TOOL_INPUT: command != null ? JSON.stringify({ command }) : '',
  };
  try {
    execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

describe('block-force-push', () => {
  // --- AC-S02: force push 차단 ---
  describe('AC-S02: force push 차단', () => {
    it('git push --force → exit(2)', () => {
      const r = run('git push --force');
      assert.equal(r.exitCode, 2);
    });

    it('git push --force origin main → exit(2)', () => {
      const r = run('git push --force origin main');
      assert.equal(r.exitCode, 2);
    });

    it('git push -f → exit(2)', () => {
      const r = run('git push -f');
      assert.equal(r.exitCode, 2);
    });

    it('git push -f origin feature → exit(2)', () => {
      const r = run('git push -f origin feature');
      assert.equal(r.exitCode, 2);
    });

    it('git push origin main --force → exit(2)', () => {
      const r = run('git push origin main --force');
      assert.equal(r.exitCode, 2);
    });

    it('git push --force-with-lease → exit(2)', () => {
      const r = run('git push --force-with-lease');
      assert.equal(r.exitCode, 2);
    });
  });

  // --- 정상 push는 통과 ---
  describe('정상 push 통과', () => {
    it('git push origin main → exit(0)', () => {
      const r = run('git push origin main');
      assert.equal(r.exitCode, 0);
    });

    it('git push → exit(0)', () => {
      const r = run('git push');
      assert.equal(r.exitCode, 0);
    });

    it('git push -u origin feature → exit(0)', () => {
      const r = run('git push -u origin feature');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-S10: 빈 입력 ---
  describe('AC-S10: 빈 입력 통과', () => {
    it('TOOL_INPUT 없음 → exit(0)', () => {
      const env = { ...process.env };
      delete env.TOOL_INPUT;
      try {
        execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        assert.fail(`빈 입력에서 exit(${e.status}) 발생`);
      }
    });
  });
});
