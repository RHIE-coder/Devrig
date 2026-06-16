// scripts/workflow/route-hint.mjs
//
// [Model Limit Assumption]
// LLM은 현재 워크플로우 상태에서 다음 단계가 무엇인지 일관되게 추론하지 못한다.
// → 워크플로우 상태 기반으로 다음 스킬을 결정론적으로 추천.
//
// [Exit Protocol]
// exit(0) = 힌트 주입 (stdout으로 JSON) 또는 힌트 없음
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function loadWorkflow() {
  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) return null;
  try {
    return JSON.parse(readFileSync(wfPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * feature의 현재 phase에서 다음 스킬 추론
 */
function nextSkill(phase, feature) {
  const transitions = {
    spec: { hint: '/harness:plan', reason: 'Spec 완료 → Plan 작성 단계' },
    architect: { hint: '/harness:plan', reason: 'Architecture 완료 → Plan 작성 단계' },
    plan: { hint: '/harness:implement', reason: 'Plan 완료 → 구현 단계' },
    implement: { hint: '/harness:review', reason: '구현 완료 → 리뷰 단계' },
    review: { hint: '/harness:qa', reason: '리뷰 완료 → QA 단계' },
    qa: { hint: '/harness:deploy', reason: 'QA 통과 → 배포 단계' },
  };

  return transitions[phase] || null;
}

function main() {
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const workflow = loadWorkflow();
  if (!workflow) {
    process.exit(0);
  }

  // explore 모드: 힌트 없음
  if (workflow.session?.mode === 'explore') {
    process.exit(0);
  }

  // 활성 feature 중 가장 진행된 것의 다음 단계 추천
  const features = Object.entries(workflow.features || {})
    .filter(([, f]) => f.phase !== 'done');

  if (features.length === 0) {
    // feature 없음 → init 또는 spec 추천
    const hint = {
      hint: '/harness:spec',
      reason: '활성 feature가 없습니다. 새 feature를 시작하세요.',
    };
    process.stdout.write(JSON.stringify(hint) + '\n');
    process.exit(0);
  }

  // 가장 최근 업데이트된 feature
  const sorted = features.sort(
    ([, a], [, b]) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
  );
  const [name, feature] = sorted[0];
  const next = nextSkill(feature.phase, name);

  if (next) {
    const hint = {
      hint: `${next.hint} ${name}`,
      reason: next.reason,
      feature: name,
      current_phase: feature.phase,
    };
    process.stdout.write(JSON.stringify(hint) + '\n');
  }

  process.exit(0);
}

main();
