// scripts/gates/gate-engine.mjs
//
// [Model Limit Assumption]
// LLM은 "Spec 없이 구현하지 마라"는 지시를 합리화로 우회할 수 있다.
// → Hook 레벨에서 워크플로우 전제조건을 물리적으로 강제.
//
// [Exit Protocol]
// exit(0) = 게이트 통과 (또는 게이트 해당 없음)
// exit(2) = 게이트 실패 (전제조건 미충족)

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const toolInput = process.env.TOOL_INPUT || '';

// --- 상태 로드 ---

function loadWorkflow() {
  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) return null;
  try {
    return JSON.parse(readFileSync(wfPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig() {
  const cfgPath = resolve(projectDir, '.harness/config.yaml');
  if (!existsSync(cfgPath)) return {};
  try {
    const raw = readFileSync(cfgPath, 'utf8');
    // 간이 YAML 파서 — 필요한 키만 추출
    const modeMatch = raw.match(/^\s*mode:\s*(\S+)/m);
    return { mode: modeMatch?.[1]?.toLowerCase() };
  } catch {
    return {};
  }
}

// --- 유저 입력 파싱 ---

function parseUserPrompt() {
  let prompt = '';
  try {
    const parsed = JSON.parse(toolInput);
    prompt = parsed.content || parsed.prompt || parsed.command || '';
  } catch {
    prompt = toolInput;
  }
  return prompt.trim();
}

/**
 * 프롬프트에서 /harness:* 스킬 호출과 feature 이름 추출
 */
function extractSkillCall(prompt) {
  const match = prompt.match(/\/harness:(\S+)(?:\s+(\S+))?/);
  if (!match) return null;
  return { skill: match[1], feature: match[2] || null };
}

/**
 * 프롬프트에서 --bypass-gates 플래그 감지
 */
function extractBypass(prompt) {
  const match = prompt.match(/--bypass-gates(?::(\S+))?/);
  if (!match) return null;
  const reasonMatch = prompt.match(/--reason\s+"([^"]+)"/);
  return {
    gate: match[1] || 'all',
    reason: reasonMatch?.[1] || 'no reason',
  };
}

// --- Feature 상태 조회 ---

function getFeatureState(workflow, featureName) {
  if (!workflow?.features || !featureName) return null;
  return workflow.features[featureName] || null;
}

function specExists(featureName) {
  if (!featureName) return false;
  const specsDir = resolve(projectDir, '.harness/specs');
  if (!existsSync(specsDir)) return false;

  // {domain}/{feature}.spec.yaml 패턴
  const specPath = resolve(specsDir, `${featureName}.spec.yaml`);
  if (existsSync(specPath)) return true;

  // domain/feature 분리 패턴도 확인
  const parts = featureName.split('/');
  if (parts.length === 2) {
    const altPath = resolve(specsDir, parts[0], `${parts[1]}.spec.yaml`);
    if (existsSync(altPath)) return true;
  }
  return false;
}

function planExists(featureName) {
  if (!featureName) return false;
  const plansDir = resolve(projectDir, '.harness/plans');
  if (!existsSync(plansDir)) return false;

  const planPath = resolve(plansDir, `${featureName}.plan.md`);
  if (existsSync(planPath)) return true;

  const parts = featureName.split('/');
  if (parts.length === 2) {
    const altPath = resolve(plansDir, parts[0], `${parts[1]}.plan.md`);
    if (existsSync(altPath)) return true;
  }
  return false;
}

/**
 * G6: 빈 문서 감지 — 파일이 존재하지만 실질 내용이 없는 경우
 * 판단: 파일 크기 < 50 bytes
 */
function isSubstantive(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    const stats = statSync(filePath);
    return stats.size >= 50;
  } catch {
    return false;
  }
}

function findFile(baseDir, featureName, ext) {
  const direct = resolve(baseDir, `${featureName}${ext}`);
  if (existsSync(direct)) return direct;
  const parts = featureName.split('/');
  if (parts.length === 2) {
    const nested = resolve(baseDir, parts[0], `${parts[1]}${ext}`);
    if (existsSync(nested)) return nested;
  }
  return null;
}

// --- Gate 판정 ---

/**
 * @returns {{ blocked: boolean, gate: string, message: string } | null}
 */
function checkGates(skill, featureName, mode, workflow, bypass) {
  // Early-exit: explore → 모든 게이트 skip
  if (mode === 'explore') return null;

  // Early-exit: prototype → G1~G3 skip, G4만 강제
  const isPrototype = mode === 'prototype';

  // G1: /harness:implement + spec 없음
  if (!isPrototype && ['implement', 'plan'].includes(skill)) {
    if (featureName && !specExists(featureName)) {
      if (bypass?.gate === 'g1' || bypass?.gate === 'all') return null;
      return {
        blocked: true,
        gate: 'G1',
        message: `⛔ G1: Spec이 없습니다. /harness:spec ${featureName} 을 먼저 실행하세요.`,
      };
    }
  }

  // G2: /harness:implement + plan 없음
  if (!isPrototype && skill === 'implement') {
    if (featureName && !planExists(featureName)) {
      if (bypass?.gate === 'g2' || bypass?.gate === 'all') return null;
      return {
        blocked: true,
        gate: 'G2',
        message: `⛔ G2: Plan이 없습니다. /harness:plan ${featureName} 을 먼저 실행하세요.`,
      };
    }
  }

  // G3: /harness:qa + test 없음
  if (!isPrototype && skill === 'qa') {
    const feature = getFeatureState(workflow, featureName);
    if (feature && !feature.implement?.passed) {
      if (bypass?.gate === 'g3' || bypass?.gate === 'all') return null;
      return {
        blocked: true,
        gate: 'G3',
        message: `⛔ G3: 구현이 완료되지 않았습니다.`,
      };
    }
  }

  // G4: /harness:deploy + qa.passed=false
  if (skill === 'deploy') {
    const feature = getFeatureState(workflow, featureName);
    if (!feature?.qa?.passed) {
      if (bypass?.gate === 'g4' || bypass?.gate === 'all') return null;
      return {
        blocked: true,
        gate: 'G4',
        message: `⛔ G4: QA PASS가 필요합니다. /harness:qa ${featureName || ''} 을 먼저 실행하세요.`,
      };
    }
  }

  // G6: spec 존재 + plan/test 빈 문서
  if (!isPrototype && ['plan', 'implement', 'review'].includes(skill)) {
    if (featureName && specExists(featureName)) {
      const planFile = findFile(resolve(projectDir, '.harness/plans'), featureName, '.plan.md');
      if (planFile && !isSubstantive(planFile)) {
        if (bypass?.gate === 'g6' || bypass?.gate === 'all') return null;
        return {
          blocked: true,
          gate: 'G6',
          message: `⛔ G6 (IL-7): Spec이 존재하지만 Plan이 빈 문서입니다. 실질적 내용을 작성하세요.`,
        };
      }
    }
  }

  return null;
}

// --- Main ---

function main() {
  // .harness/ 미존재 → 게이트 검사 불필요
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const prompt = parseUserPrompt();
  if (!prompt) {
    process.exit(0);
  }

  const skillCall = extractSkillCall(prompt);
  if (!skillCall) {
    // /harness:* 호출이 아님 → 게이트 해당 없음
    process.exit(0);
  }

  const workflow = loadWorkflow();
  const config = loadConfig();
  const mode = workflow?.session?.mode || config.mode || 'standard';
  const bypass = extractBypass(prompt);

  const result = checkGates(skillCall.skill, skillCall.feature, mode, workflow, bypass);

  if (result?.blocked) {
    // bypass 감지 시 통과 처리 (이미 checkGates 내부에서 null 반환)
    // 여기 도달했으면 진짜 차단
    process.stderr.write(result.message + '\n');
    process.exit(2);
  }

  // bypass 사용 시 audit 정보 stdout 출력
  if (bypass) {
    const auditInfo = {
      event: 'gate_bypassed',
      gate: bypass.gate,
      reason: bypass.reason,
      skill: skillCall.skill,
      feature: skillCall.feature,
    };
    process.stderr.write(`⚠️ bypass 사용: ${bypass.gate} — "${bypass.reason}"\n`);
    process.stdout.write(JSON.stringify(auditInfo) + '\n');
  }

  process.exit(0);
}

main();
