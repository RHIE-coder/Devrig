// bench/tests/guardrails/block-destructive.test.mjs
//
// AC-S01: rm -rf 패턴 차단
// AC-S04: 정상 명령은 통과
// AC-S06: git reset --hard 차단
// AC-S07: DROP TABLE/DATABASE 차단
// AC-S10: 빈 입력은 안전하게 통과

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/guardrails/block-destructive.mjs');

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

describe('block-destructive', () => {
  // --- AC-S01: rm -rf 패턴 차단 ---
  describe('AC-S01: rm -rf 차단', () => {
    it('rm -rf / → exit(2)', () => {
      const r = run('rm -rf /');
      assert.equal(r.exitCode, 2);
    });

    it('rm -rf /tmp/something → exit(2)', () => {
      const r = run('rm -rf /tmp/something');
      assert.equal(r.exitCode, 2);
    });

    it('rm -fr . → exit(2)', () => {
      const r = run('rm -fr .');
      assert.equal(r.exitCode, 2);
    });

    it('sudo rm -rf /var → exit(2)', () => {
      const r = run('sudo rm -rf /var');
      assert.equal(r.exitCode, 2);
    });
  });

  // --- AC-S06: git reset --hard 차단 ---
  describe('AC-S06: git reset --hard 차단', () => {
    it('git reset --hard → exit(2)', () => {
      const r = run('git reset --hard');
      assert.equal(r.exitCode, 2);
    });

    it('git reset --hard HEAD~3 → exit(2)', () => {
      const r = run('git reset --hard HEAD~3');
      assert.equal(r.exitCode, 2);
    });
  });

  // --- AC-S07: DROP TABLE/DATABASE 차단 ---
  describe('AC-S07: DROP TABLE/DATABASE 차단', () => {
    it('DROP TABLE users → exit(2)', () => {
      const r = run('psql -c "DROP TABLE users"');
      assert.equal(r.exitCode, 2);
    });

    it('DROP DATABASE mydb → exit(2)', () => {
      const r = run('mysql -e "DROP DATABASE mydb"');
      assert.equal(r.exitCode, 2);
    });

    it('TRUNCATE TABLE logs → exit(2)', () => {
      const r = run('psql -c "TRUNCATE TABLE logs"');
      assert.equal(r.exitCode, 2);
    });
  });

  // --- git clean -f 차단 ---
  describe('git clean -f 차단', () => {
    it('git clean -fd → exit(2)', () => {
      const r = run('git clean -fd');
      assert.equal(r.exitCode, 2);
    });
  });

  // --- AC-S04: 정상 명령은 통과 ---
  describe('AC-S04: 정상 명령 통과', () => {
    it('ls -la → exit(0)', () => {
      const r = run('ls -la');
      assert.equal(r.exitCode, 0);
    });

    it('git status → exit(0)', () => {
      const r = run('git status');
      assert.equal(r.exitCode, 0);
    });

    it('npm install → exit(0)', () => {
      const r = run('npm install');
      assert.equal(r.exitCode, 0);
    });

    it('git push origin main → exit(0)', () => {
      const r = run('git push origin main');
      assert.equal(r.exitCode, 0);
    });

    it('cat /etc/passwd → exit(0)', () => {
      const r = run('cat /etc/passwd');
      assert.equal(r.exitCode, 0);
    });

    it('git log --oneline → exit(0)', () => {
      const r = run('git log --oneline');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-S10: 빈 입력은 통과 ---
  describe('AC-S10: 빈 입력 통과', () => {
    it('TOOL_INPUT 없음 → exit(0)', () => {
      const env = { ...process.env };
      delete env.TOOL_INPUT;
      try {
        execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
        // exit(0)
      } catch (e) {
        assert.fail(`빈 입력에서 exit(${e.status}) 발생`);
      }
    });

    it('빈 command → exit(0)', () => {
      const r = run('');
      assert.equal(r.exitCode, 0);
    });
  });
});
