// scripts/state/load-state.mjs
//
// [Model Limit Assumption]
// LLM은 세션 간 워크플로우 상태를 기억하지 못한다.
// → SessionStart에서 workflow.json을 로드하여 상태를 복원.
//
// [Exit Protocol]
// exit(0) = 로드 성공 (stdout으로 상태 요약 JSON 출력)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const workflowPath = resolve(projectDir, '.harness/state/workflow.json');

/**
 * 초기 workflow.json 스키마
 */
function initialWorkflow() {
  return {
    v: 1,
    session: {
      mode: 'standard',
      started_at: null,
      right_size: null,
    },
    features: {},
    bypass_budgets: {
      gate: { used: 0, max: 3 },
      review: { used: 0, max: 3 },
      qa: { used: 0, max: 3 },
    },
    active_worktrees: [],
    last_updated: null,
  };
}

function main() {
  // .harness/ 존재 확인 — 없으면 하네스 미초기화 프로젝트
  const harnessDir = resolve(projectDir, '.harness');
  if (!existsSync(harnessDir)) {
    // 하네스 미초기화 — 조용히 통과
    process.exit(0);
  }

  const stateDir = dirname(workflowPath);
  mkdirSync(stateDir, { recursive: true });

  let workflow;

  if (existsSync(workflowPath)) {
    // 기존 workflow.json 로드
    try {
      const raw = readFileSync(workflowPath, 'utf8');
      workflow = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`load-state: workflow.json 파싱 실패 — ${e.message}\n`);
      process.stderr.write('load-state: compact-recovery에서 재구축 예정\n');
      workflow = null;
    }
  } else {
    // 최초 실행 — 초기 스키마 생성
    workflow = initialWorkflow();
    writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
    process.stderr.write('load-state: workflow.json 초기 생성 완료\n');
  }

  if (workflow) {
    // 세션 시작 시간 갱신
    workflow.session.started_at = new Date().toISOString();
    workflow.last_updated = new Date().toISOString();
    writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');

    // stdout으로 상태 요약 출력 (Claude Code additionalContext 주입용)
    const featureCount = Object.keys(workflow.features).length;
    const activeFeatures = Object.entries(workflow.features)
      .filter(([, f]) => f.phase !== 'done')
      .map(([name, f]) => `${name}(${f.phase})`)
      .join(', ');

    const summary = {
      mode: workflow.session.mode,
      right_size: workflow.session.right_size,
      feature_count: featureCount,
      active_features: activeFeatures || 'none',
      bypass_budgets: workflow.bypass_budgets,
    };

    process.stdout.write(JSON.stringify(summary) + '\n');
  }

  process.exit(0);
}

main();
