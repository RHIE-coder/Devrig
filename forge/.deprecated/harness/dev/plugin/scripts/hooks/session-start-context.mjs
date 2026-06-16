// scripts/hooks/session-start-context.mjs
//
// [Model Limit Assumption]
// Compact 후 LLM은 사용 가능한 스킬 목록과 워크플로우 상태를 잃는다.
// → SessionStart에서 스킬 카탈로그와 상태 요약을 additionalContext로 재주입.
//
// [Exit Protocol]
// exit(0) = 주입 성공 (stdout으로 JSON 출력)
// exit(1) = 런타임 에러

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '.';

/**
 * skills/ 디렉토리에서 SKILL.md를 가진 스킬 목록을 수집
 */
function collectSkills() {
  const skillsDir = resolve(pluginRoot, 'skills');
  if (!existsSync(skillsDir)) return [];

  const skills = [];
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(skillsDir, entry.name, 'SKILL.md');
      if (existsSync(skillMd)) {
        skills.push(`/harness:${entry.name}`);
      }
    }
  } catch {
    // skills 디렉토리 읽기 실패 — 빈 목록
  }

  return skills;
}

/**
 * workflow.json에서 상태 요약 추출
 */
function loadWorkflowSummary() {
  const workflowPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(workflowPath)) return null;

  try {
    const raw = readFileSync(workflowPath, 'utf8');
    const wf = JSON.parse(raw);

    const activeFeatures = Object.entries(wf.features || {})
      .filter(([, f]) => f.phase !== 'done')
      .map(([name, f]) => ({ name, phase: f.phase }));

    return {
      mode: wf.session?.mode || 'standard',
      right_size: wf.session?.right_size,
      active_features: activeFeatures,
      bypass_budgets: wf.bypass_budgets,
    };
  } catch {
    return null;
  }
}

function main() {
  // .harness/ 미존재 → 조용히 통과
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const skills = collectSkills();
  const workflow = loadWorkflowSummary();

  const context = {
    harness: {
      skills: skills.length > 0 ? skills : ['(Phase 1 — 스킬 미구현)'],
      workflow: workflow || { mode: 'standard', active_features: [] },
    },
  };

  process.stdout.write(JSON.stringify(context) + '\n');
  process.exit(0);
}

main();
