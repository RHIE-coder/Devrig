// scripts/state/upcaster.mjs
//
// [Model Limit Assumption]
// LLM은 이벤트 스키마 변경 이력을 추적하지 못한다.
// → 읽기 시점에 항상 최신 버전으로 변환하여 소비자가 단일 스키마만 보게 함.
//
// [Exit Protocol]
// 라이브러리 모듈 — 직접 실행하지 않음. import하여 사용.

/**
 * 이벤트 타입별 upcaster 체인.
 * 각 함수는 정확히 한 버전씩만 올린다 (v_n → v_{n+1}).
 * 새 버전 추가 시 배열 끝에 함수를 append.
 */
export const upcasters = {
  // -- Feature lifecycle events --
  SpecCreated: [
    // v1 → v2: domain 필드를 payload 안으로 이동
    (e) => ({
      ...e,
      v: 2,
      payload: {
        ...e.payload,
        domain: e.payload.domain ?? e.domain ?? 'unknown',
      },
    }),
  ],

  PlanApproved: [],

  ImplementStarted: [],

  ImplementCompleted: [],

  ReviewCompleted: [
    // v1 → v2: verdicts 구조 변경 (flat → nested)
    (e) => ({
      ...e,
      v: 2,
      payload: {
        ...e.payload,
        verdicts: e.payload.verdicts ?? {},
      },
    }),
  ],

  QAPassed: [
    // v1 → v2: duration_ms 필드 추가
    (e) => ({ ...e, v: 2, payload: { ...e.payload, duration_ms: e.payload.duration_ms ?? null } }),
    // v2 → v3: agent_id 필드 추가
    (e) => ({ ...e, v: 3, payload: { ...e.payload, agent_id: e.payload.agent_id ?? 'unknown' } }),
  ],

  QAFailed: [
    // v1 → v2: attribution 필드 추가
    (e) => ({ ...e, v: 2, payload: { ...e.payload, attribution: e.payload.attribution ?? null } }),
  ],

  // -- Safety/Audit events --
  GateBypassed: [],

  DestructiveBlocked: [],

  // -- State events --
  ModeDetected: [],

  SnapshotRebuilt: [],
};

/**
 * 이벤트를 최신 스키마 버전으로 변환.
 * chain이 없는 타입은 원본 그대로 반환.
 *
 * @param {Object} event - { type, v, ts, payload, producer }
 * @returns {Object} 최신 버전의 이벤트
 */
export function upcast(event) {
  const chain = upcasters[event.type];
  if (!chain || chain.length === 0) return event;

  let cur = { ...event };
  const fromIdx = (cur.v ?? 1) - 1; // v1 → index 0

  for (let i = fromIdx; i < chain.length; i++) {
    cur = chain[i](cur);
  }

  return cur;
}

/**
 * 특정 이벤트 타입의 최신 버전 번호를 반환.
 *
 * @param {string} type - 이벤트 타입명
 * @returns {number} 최신 버전 (chain 길이 + 1, 없으면 1)
 */
export function latestVersion(type) {
  const chain = upcasters[type];
  return chain ? chain.length + 1 : 1;
}
