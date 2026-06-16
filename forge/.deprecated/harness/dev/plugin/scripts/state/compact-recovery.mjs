// scripts/state/compact-recovery.mjs
//
// [Model Limit Assumption]
// Compact 후 LLM 컨텍스트의 워크플로우 상태가 소실된다.
// → SessionStart에서 workflow.json 무결성을 검증하고,
//   손상/버전 불일치 시 events를 replay하여 재구축.
//
// [Exit Protocol]
// exit(0) = 검증 통과 또는 재구축 성공
// exit(1) = 재구축 불가 (events도 없는 경우)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { upcast } from './upcaster.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const workflowPath = resolve(projectDir, '.harness/state/workflow.json');
const eventsDir = resolve(projectDir, '.harness/state/events');

// 현재 workflow.json 스키마 버전
const CURRENT_WORKFLOW_VERSION = 1;

/**
 * events 디렉토리에서 모든 .jsonl 파일을 시간순으로 수집
 */
function collectEventFiles(dir) {
  const files = [];

  if (!existsSync(dir)) return files;

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  // 파일명 기준 정렬 (YYYY-MM.jsonl이므로 시간순)
  return files.sort();
}

/**
 * JSONL 파일에서 이벤트 레코드를 읽어 upcast 적용
 */
function readEvents(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const events = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      events.push(upcast(event));
    } catch {
      // 손상된 라인은 skip
      process.stderr.write(`compact-recovery: 손상된 이벤트 라인 skip — ${filePath}\n`);
    }
  }
  return events;
}

/**
 * 이벤트 스트림을 fold하여 workflow.json 재구축
 */
function foldEvents(events) {
  const workflow = {
    v: CURRENT_WORKFLOW_VERSION,
    session: {
      mode: 'standard',
      started_at: new Date().toISOString(),
      right_size: null,
    },
    features: {},
    bypass_budgets: {
      gate: { used: 0, max: 3 },
      review: { used: 0, max: 3 },
      qa: { used: 0, max: 3 },
    },
    active_worktrees: [],
    last_updated: new Date().toISOString(),
  };

  for (const event of events) {
    const domain = event.payload?.domain;
    const feature = event.payload?.feature;
    if (!domain || !feature) continue;

    const key = `${domain}/${feature}`;

    // feature 엔트리가 없으면 초기화
    if (!workflow.features[key]) {
      workflow.features[key] = {
        phase: 'spec',
        gates_passed: {},
        implement: { passed: false, iteration: 0 },
        review: { passed: false },
        qa: { passed: false },
        created_at: event.ts,
        updated_at: event.ts,
      };
    }

    const f = workflow.features[key];
    f.updated_at = event.ts;

    // 이벤트 타입별 fold 로직
    switch (event.type) {
      case 'SpecCreated':
        f.phase = 'spec';
        break;
      case 'PlanApproved':
        f.phase = 'plan';
        f.gates_passed.g1_spec = true;
        break;
      case 'ImplementStarted':
        f.phase = 'implement';
        f.gates_passed.g2_plan = true;
        break;
      case 'ImplementCompleted':
        f.implement.passed = true;
        f.implement.iteration = (f.implement.iteration || 0) + 1;
        break;
      case 'ReviewCompleted':
        f.review.passed = true;
        f.phase = 'review';
        break;
      case 'QAPassed':
        f.qa.passed = true;
        f.gates_passed.g3_test = true;
        f.gates_passed.g4_qa = true;
        f.phase = 'done';
        break;
      case 'QAFailed':
        f.qa.passed = false;
        f.phase = 'implement'; // QA 실패 → implement 재진입
        break;
      case 'GateBypassed':
        if (event.payload.gate_type) {
          const budgetKey = event.payload.gate_type;
          if (workflow.bypass_budgets[budgetKey]) {
            workflow.bypass_budgets[budgetKey].used += 1;
          }
        }
        break;
      case 'ModeDetected':
        if (event.payload.mode) {
          workflow.session.mode = event.payload.mode;
        }
        break;
    }
  }

  return workflow;
}

function main() {
  // .harness/ 미존재 → 조용히 통과
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  // workflow.json이 없으면 events에서 재구축 시도
  if (!existsSync(workflowPath)) {
    const eventFiles = collectEventFiles(eventsDir);
    if (eventFiles.length === 0) {
      // events도 없음 — 정상 (아직 아무 작업도 안 한 프로젝트)
      process.exit(0);
    }

    process.stderr.write('compact-recovery: workflow.json 없음 — events에서 재구축\n');
    const allEvents = eventFiles.flatMap(readEvents);
    const workflow = foldEvents(allEvents);
    writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
    process.stderr.write('compact-recovery: snapshot 재구축 완료\n');
    process.exit(0);
  }

  // workflow.json 존재 — 무결성 검증
  let workflow;
  try {
    const raw = readFileSync(workflowPath, 'utf8');
    workflow = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`compact-recovery: workflow.json 손상 — ${e.message}\n`);
    workflow = null;
  }

  // 버전 불일치 또는 파싱 실패 → 재구축
  if (!workflow || workflow.v !== CURRENT_WORKFLOW_VERSION) {
    process.stderr.write('compact-recovery: 버전 불일치 또는 손상 — events에서 재구축\n');
    const eventFiles = collectEventFiles(eventsDir);
    const allEvents = eventFiles.flatMap(readEvents);
    const rebuilt = foldEvents(allEvents);
    writeFileSync(workflowPath, JSON.stringify(rebuilt, null, 2) + '\n', 'utf8');
    process.stderr.write('compact-recovery: snapshot 재구축 완료\n');
  }

  process.exit(0);
}

main();
