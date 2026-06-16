// bench/tests/state/compact-recovery.test.mjs
//
// AC-ST04: snapshot 손상 → events fold 재구축
// AC-ST11: events도 없으면 조용히 통과
// AC-ST12: 하네스 미초기화 → 조용히 통과

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../../../dev/plugin/scripts/state/compact-recovery.mjs');

function tmpProject() {
  const dir = resolve(tmpdir(), `harness-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(projectDir) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  try {
    execFileSync('node', [scriptPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

function writeEvent(projectDir, domain, feature, event) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const eventDir = resolve(projectDir, '.harness/state/events', domain, feature);
  mkdirSync(eventDir, { recursive: true });
  const eventPath = resolve(eventDir, `${month}.jsonl`);
  const line = JSON.stringify(event) + '\n';
  writeFileSync(eventPath, line, { flag: 'a' });
}

describe('compact-recovery', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // --- AC-ST12: .harness/ 없음 ---
  describe('AC-ST12: 하네스 미초기화', () => {
    it('.harness/ 없음 → exit(0)', () => {
      const r = run(projectDir);
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-ST11: events도 없으면 조용히 통과 ---
  describe('AC-ST11: events 없음', () => {
    it('.harness/ 존재, events 없음, workflow.json 없음 → exit(0)', () => {
      mkdirSync(resolve(projectDir, '.harness'), { recursive: true });
      const r = run(projectDir);
      assert.equal(r.exitCode, 0);
    });
  });

  // --- AC-ST04: snapshot 손상 → 재구축 ---
  describe('AC-ST04: snapshot 손상 재구축', () => {
    it('workflow.json 손상(invalid JSON) + events 존재 → 재구축', () => {
      const stateDir = resolve(projectDir, '.harness/state');
      mkdirSync(stateDir, { recursive: true });
      // 손상된 workflow.json
      writeFileSync(resolve(stateDir, 'workflow.json'), '{corrupted!!!');

      // events 생성
      writeEvent(projectDir, 'auth', 'login', {
        type: 'SpecCreated',
        v: 1,
        ts: '2026-04-14T10:00:00Z',
        payload: { domain: 'auth', feature: 'login' },
        producer: 'harness:spec',
      });

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      // 재구축된 workflow.json 검증
      const wf = JSON.parse(readFileSync(resolve(stateDir, 'workflow.json'), 'utf8'));
      assert.equal(wf.v, 1);
      assert.ok(wf.features['auth/login']);
      assert.equal(wf.features['auth/login'].phase, 'spec');
    });

    it('workflow.json 없음 + events 존재 → events에서 구축', () => {
      mkdirSync(resolve(projectDir, '.harness/state'), { recursive: true });

      writeEvent(projectDir, 'auth', 'login', {
        type: 'SpecCreated', v: 1, ts: '2026-04-14T10:00:00Z',
        payload: { domain: 'auth', feature: 'login' },
        producer: 'harness:spec',
      });
      writeEvent(projectDir, 'auth', 'login', {
        type: 'PlanApproved', v: 1, ts: '2026-04-14T10:05:00Z',
        payload: { domain: 'auth', feature: 'login' },
        producer: 'harness:plan',
      });

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wfPath = resolve(projectDir, '.harness/state/workflow.json');
      const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
      assert.equal(wf.features['auth/login'].phase, 'plan');
      assert.equal(wf.features['auth/login'].gates_passed.g1_spec, true);
    });
  });

  // --- 정상 workflow.json은 변경 없음 ---
  describe('정상 workflow.json', () => {
    it('유효한 workflow.json v=1 → 변경 없음', () => {
      const stateDir = resolve(projectDir, '.harness/state');
      mkdirSync(stateDir, { recursive: true });
      const original = {
        v: 1,
        session: { mode: 'standard', started_at: null, right_size: null },
        features: {},
        bypass_budgets: { gate: { used: 0, max: 3 }, review: { used: 0, max: 3 }, qa: { used: 0, max: 3 } },
        active_worktrees: [],
        last_updated: '2026-04-14T10:00:00Z',
      };
      writeFileSync(resolve(stateDir, 'workflow.json'), JSON.stringify(original));

      const r = run(projectDir);
      assert.equal(r.exitCode, 0);

      const wf = JSON.parse(readFileSync(resolve(stateDir, 'workflow.json'), 'utf8'));
      assert.equal(wf.v, 1);
      assert.equal(wf.session.mode, 'standard');
    });
  });
});
