// bench/tests/guardrails/protect-harness.test.mjs
//
// AC-S03: .harness/state/ 직접 편집 차단
// AC-S08: 보호 대상이 아닌 .harness/ 파일은 통과
// AC-S10: 빈 입력은 안전하게 통과

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/guardrails/protect-harness.mjs');

function run(filePath, projectDir) {
  const env = {
    ...process.env,
    TOOL_INPUT: filePath != null ? JSON.stringify({ file_path: filePath }) : '',
    CLAUDE_PROJECT_DIR: projectDir ?? '/tmp/test-project',
  };
  try {
    execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

describe('protect-harness', () => {
  // --- AC-S03: .harness/state/ 직접 편집 차단 ---
  describe('AC-S03: .harness/state/ 차단', () => {
    it('.harness/state/workflow.json → exit(2)', () => {
      const r = run('.harness/state/workflow.json');
      assert.equal(r.exitCode, 2);
    });

    it('.harness/state/audit.jsonl → exit(2)', () => {
      const r = run('.harness/state/audit.jsonl');
      assert.equal(r.exitCode, 2);
    });

    it('.harness/state/coverage.json → exit(2)', () => {
      const r = run('.harness/state/coverage.json');
      assert.equal(r.exitCode, 2);
    });

    it('절대경로 .harness/state/ → exit(2)', () => {
      const r = run('/tmp/test-project/.harness/state/workflow.json');
      assert.equal(r.exitCode, 2);
    });

    it('.harness/state/events/auth/login/2026-04.jsonl → exit(2)', () => {
      const r = run('.harness/state/events/auth/login/2026-04.jsonl');
      assert.equal(r.exitCode, 2);
    });
  });

  // --- AC-S08: 보호 대상 외 .harness/ 파일은 통과 ---
  describe('AC-S08: 비보호 .harness/ 경로 통과', () => {
    it('.harness/config.yaml → exit(0)', () => {
      const r = run('.harness/config.yaml');
      assert.equal(r.exitCode, 0);
    });

    it('.harness/specs/auth.spec.yaml → exit(0)', () => {
      const r = run('.harness/specs/auth.spec.yaml');
      assert.equal(r.exitCode, 0);
    });

    it('.harness/plans/auth.plan.md → exit(0)', () => {
      const r = run('.harness/plans/auth.plan.md');
      assert.equal(r.exitCode, 0);
    });
  });

  // --- 일반 파일 경로 통과 ---
  describe('일반 경로 통과', () => {
    it('src/index.js → exit(0)', () => {
      const r = run('src/index.js');
      assert.equal(r.exitCode, 0);
    });

    it('README.md → exit(0)', () => {
      const r = run('README.md');
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
