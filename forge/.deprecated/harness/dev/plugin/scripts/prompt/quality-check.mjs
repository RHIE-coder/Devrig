// scripts/prompt/quality-check.mjs
//
// [Model Limit Assumption]
// LLM은 모호한 프롬프트("빠르게 해줘")를 그대로 수용하여 품질 저하를 초래한다.
// → 프롬프트의 모호성, 스코프 누락, 요구사항 결함을 결정론적으로 검사.
//
// [Exit Protocol]
// exit(0) = 품질 검사 통과 (또는 비활성화)
// exit(2) = 품질 경고 (stderr에 경고, 차단은 아님 — 정보 제공)

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const toolInput = process.env.TOOL_INPUT || '';

// --- 모호성 패턴 ---

const AMBIGUITY_PATTERNS = [
  { pattern: /빠르게/g, issue: '"빠르게" — 구체적 성능 기준이나 기한을 명시하세요' },
  { pattern: /적절히/g, issue: '"적절히" — 구체적 기준을 정의하세요' },
  { pattern: /좋은\s*코드/g, issue: '"좋은 코드" — SOLID/Clean Code 등 구체적 기준을 명시하세요' },
  { pattern: /대충/g, issue: '"대충" — 범위와 완성도 기준을 명시하세요' },
  { pattern: /간단히/g, issue: '"간단히" — 범위를 명확히 하세요' },
  { pattern: /나중에/g, issue: '"나중에" — 기한 또는 조건을 명시하세요' },
  { pattern: /etc\.?|등등/g, issue: '"등등/etc" — 전체 목록을 명시하세요' },
  { pattern: /잘\s*만들어/g, issue: '"잘 만들어" — 수용 기준(AC)을 명시하세요' },
  { pattern: /알아서/g, issue: '"알아서" — 명확한 요구사항을 제시하세요' },
];

// --- 설정 로드 ---

function loadConfig() {
  const cfgPath = resolve(projectDir, '.harness/config.yaml');
  if (!existsSync(cfgPath)) return { enabled: true, mode: 'standard' };
  try {
    const raw = readFileSync(cfgPath, 'utf8');
    const modeMatch = raw.match(/^\s*mode:\s*(\S+)/m);
    const mode = modeMatch?.[1]?.toLowerCase() || 'standard';
    // prompt_pipeline.auto_transform 읽기 (간이)
    const pipelineMatch = raw.match(/auto_transform:\s*(true|false)/m);
    const autoTransform = pipelineMatch?.[1] === 'true';
    return { enabled: true, mode, autoTransform };
  } catch {
    return { enabled: true, mode: 'standard' };
  }
}

// --- 프롬프트 파싱 ---

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

// --- 검사 ---

function checkAmbiguity(prompt) {
  const warnings = [];
  for (const { pattern, issue } of AMBIGUITY_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    if (pattern.test(prompt)) {
      warnings.push({ type: 'ambiguity', issue });
    }
  }
  return warnings;
}

function checkScope(prompt) {
  const warnings = [];
  // /harness:implement 호출인데 feature 누락
  if (prompt.includes('/harness:implement') && !prompt.match(/\/harness:implement\s+\S+/)) {
    warnings.push({ type: 'scope', issue: '/harness:implement에 feature 인자가 누락되었습니다' });
  }
  if (prompt.includes('/harness:spec') && !prompt.match(/\/harness:spec\s+\S+/)) {
    warnings.push({ type: 'scope', issue: '/harness:spec에 feature 인자가 누락되었습니다' });
  }
  if (prompt.includes('/harness:plan') && !prompt.match(/\/harness:plan\s+\S+/)) {
    warnings.push({ type: 'scope', issue: '/harness:plan에 feature 인자가 누락되었습니다' });
  }
  return warnings;
}

// --- Main ---

function main() {
  const config = loadConfig();

  // explore 모드는 quality pipeline skip
  if (config.mode === 'explore') {
    process.exit(0);
  }

  // .harness/ 미존재 → 검사 불필요
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const prompt = parseUserPrompt();
  if (!prompt) {
    process.exit(0);
  }

  // /harness:* 호출이 아닌 일반 프롬프트도 검사
  const ambiguityWarnings = checkAmbiguity(prompt);
  const scopeWarnings = checkScope(prompt);
  const allWarnings = [...ambiguityWarnings, ...scopeWarnings];

  if (allWarnings.length === 0) {
    process.exit(0);
  }

  // 경고 출력 (exit(0) — 차단하지 않고 정보 제공)
  process.stderr.write(`⚠️ 프롬프트 품질 경고 (${allWarnings.length}건):\n`);
  for (const w of allWarnings) {
    process.stderr.write(`   [${w.type}] ${w.issue}\n`);
  }

  // stdout에 구조화된 결과
  process.stdout.write(JSON.stringify({
    warnings: allWarnings,
    count: allWarnings.length,
  }) + '\n');

  process.exit(0);
}

main();
