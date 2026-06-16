// bench/tests/state/upcaster.test.mjs
//
// AC-ST05: v1 이벤트 → 최신 버전 변환
// AC-ST06: 필드 누락 시 default 주입

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { upcast, latestVersion } from '../../../dev/plugin/scripts/state/upcaster.mjs';

describe('upcaster', () => {
  // --- AC-ST05: v1 → 최신 변환 ---
  describe('AC-ST05: QAPassed v1 → v3', () => {
    it('v1 QAPassed → v=3, duration_ms + agent_id 존재', () => {
      const v1 = {
        type: 'QAPassed',
        v: 1,
        ts: '2026-04-14T10:00:00Z',
        payload: { domain: 'auth', feature: 'login', coverage: { line: 85 } },
        producer: 'harness:qa',
      };

      const result = upcast(v1);
      assert.equal(result.v, 3);
      assert.equal(result.payload.duration_ms, null);
      assert.equal(result.payload.agent_id, 'unknown');
      assert.equal(result.payload.domain, 'auth');
    });
  });

  // --- AC-ST06: default 주입 ---
  describe('AC-ST06: 누락 필드 default 주입', () => {
    it('QAPassed v1 — duration_ms 없음 → null', () => {
      const v1 = { type: 'QAPassed', v: 1, payload: {} };
      const result = upcast(v1);
      assert.equal(result.payload.duration_ms, null);
    });

    it('QAPassed v2 — agent_id 없음 → unknown', () => {
      const v2 = { type: 'QAPassed', v: 2, payload: { duration_ms: 500 } };
      const result = upcast(v2);
      assert.equal(result.v, 3);
      assert.equal(result.payload.agent_id, 'unknown');
      assert.equal(result.payload.duration_ms, 500); // 기존 값 유지
    });

    it('QAFailed v1 — attribution 없음 → null', () => {
      const v1 = { type: 'QAFailed', v: 1, payload: {} };
      const result = upcast(v1);
      assert.equal(result.v, 2);
      assert.equal(result.payload.attribution, null);
    });
  });

  // --- 체인 없는 타입은 원본 반환 ---
  describe('체인 없는 타입', () => {
    it('PlanApproved (빈 체인) → 원본 그대로', () => {
      const event = { type: 'PlanApproved', v: 1, payload: {} };
      const result = upcast(event);
      assert.deepEqual(result, event);
    });

    it('알 수 없는 타입 → 원본 그대로', () => {
      const event = { type: 'UnknownEvent', v: 1, payload: {} };
      const result = upcast(event);
      assert.deepEqual(result, event);
    });
  });

  // --- latestVersion ---
  describe('latestVersion', () => {
    it('QAPassed → 3 (chain.length=2, v1=base)', () => {
      assert.equal(latestVersion('QAPassed'), 3);
    });

    it('PlanApproved → 1 (빈 체인)', () => {
      assert.equal(latestVersion('PlanApproved'), 1);
    });

    it('UnknownEvent → 1', () => {
      assert.equal(latestVersion('UnknownEvent'), 1);
    });
  });

  // --- SpecCreated upcaster ---
  describe('SpecCreated v1 → v2', () => {
    it('domain이 payload 밖에 있으면 안으로 이동', () => {
      const v1 = { type: 'SpecCreated', v: 1, domain: 'auth', payload: { feature: 'login' } };
      const result = upcast(v1);
      assert.equal(result.v, 2);
      assert.equal(result.payload.domain, 'auth');
    });
  });
});
