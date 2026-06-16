// scripts/state/update-workflow.mjs
//
// [Model Limit Assumption]
// LLM은 세션 종료 시 워크플로우 상태를 영속화하지 못한다.
// → Stop hook에서 현재 phase/gates 상태를 workflow.json에 저장.
//
// [Exit Protocol]
// exit(0) = 갱신 성공
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openSync, flockSync, closeSync } from './flock.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const workflowPath = resolve(projectDir, '.harness/state/workflow.json');

function main() {
  // workflow.json이 없으면 하네스 미초기화 — 조용히 통과
  if (!existsSync(workflowPath)) {
    process.exit(0);
  }

  // flock으로 read-modify-write 직렬화
  const fd = openSync(workflowPath);
  try {
    flockSync(fd);

    let workflow;
    try {
      const raw = readFileSync(workflowPath, 'utf8');
      workflow = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`update-workflow: workflow.json 파싱 실패 — ${e.message}\n`);
      process.exit(1);
    }

    // 타임스탬프 갱신
    workflow.last_updated = new Date().toISOString();

    // stdin에서 갱신 데이터 읽기 (비동기 불필요 — Stop hook에서는 stdin이 없을 수 있음)
    // 환경변수로 갱신 정보 전달 (Claude Code hook은 stdin보다 env가 안정적)
    const featureName = process.env.HARNESS_FEATURE;
    const newPhase = process.env.HARNESS_PHASE;
    const gatePassed = process.env.HARNESS_GATE_PASSED;

    if (featureName && workflow.features[featureName]) {
      const feature = workflow.features[featureName];

      if (newPhase) {
        feature.phase = newPhase;
        feature.updated_at = workflow.last_updated;
      }

      if (gatePassed) {
        feature.gates_passed = feature.gates_passed || {};
        feature.gates_passed[gatePassed] = true;
      }
    }

    // 저장
    writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
  } finally {
    closeSync(fd);
  }

  process.exit(0);
}

main();
