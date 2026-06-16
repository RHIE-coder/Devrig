// scripts/prompt/auto-transform.mjs
//
// [Model Limit Assumption]
// LLM은 자연어의 "긴급 배포" 같은 의도를 안전한 CLI 경로로 변환하지 못한다.
// → escape_lexicon 기반으로 자연어 키워드를 --bypass-* 제안으로 자동변환.
// opt-in: config.workflow.prompt_pipeline.auto_transform = true.
//
// [Exit Protocol]
// exit(0) = 변환 완료 또는 비활성화
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const toolInput = process.env.TOOL_INPUT || '';

// 기본 escape lexicon (config로 override 가능)
const DEFAULT_LEXICON = {
  'bypass-qa': ['긴급 배포', 'hotfix 배포', '지금 바로 배포', 'QA 없이 배포'],
  'bypass-gates:g1': ['spec 없이', 'spec 건너뛰어'],
  'bypass-gates:g2': ['plan 없이', '계획 건너뛰어'],
  'bypass-review': ['리뷰 스킵', '리뷰 없이', 'QA 바로'],
};

// --- 설정 로드 ---

function loadConfig() {
  const cfgPath = resolve(projectDir, '.harness/config.yaml');
  if (!existsSync(cfgPath)) return { autoTransform: false, mode: 'standard', lexicon: DEFAULT_LEXICON };
  try {
    const raw = readFileSync(cfgPath, 'utf8');
    const modeMatch = raw.match(/^\s*mode:\s*(\S+)/m);
    const mode = modeMatch?.[1]?.toLowerCase() || 'standard';
    const atMatch = raw.match(/auto_transform:\s*(true|false)/m);
    const autoTransform = atMatch?.[1] === 'true';

    // escape_lexicon 파싱은 간이 — 기본값 사용
    // 실제로는 YAML 파서 필요하지만 Phase 4에서는 기본 lexicon 사용
    return { autoTransform, mode, lexicon: DEFAULT_LEXICON };
  } catch {
    return { autoTransform: false, mode: 'standard', lexicon: DEFAULT_LEXICON };
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

// --- 변환 ---

function detectEscapeIntent(prompt, lexicon) {
  const matches = [];
  for (const [bypassFlag, keywords] of Object.entries(lexicon)) {
    for (const kw of keywords) {
      if (prompt.includes(kw)) {
        matches.push({
          keyword: kw,
          bypass_flag: bypassFlag,
          suggestion: `--${bypassFlag} --reason "<사유를 입력하세요>"`,
        });
      }
    }
  }
  return matches;
}

// --- Main ---

function main() {
  const config = loadConfig();

  // explore 모드는 pipeline skip
  if (config.mode === 'explore') {
    process.exit(0);
  }

  // opt-in 비활성화
  if (!config.autoTransform) {
    process.exit(0);
  }

  // .harness/ 미존재 → skip
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const prompt = parseUserPrompt();
  if (!prompt) {
    process.exit(0);
  }

  const matches = detectEscapeIntent(prompt, config.lexicon);

  if (matches.length === 0) {
    process.exit(0);
  }

  // 변환 제안 출력 (자동 우회 아님 — 유저에게 확인 요청)
  process.stderr.write(`🔄 프롬프트 자동변환 감지 (${matches.length}건):\n`);
  for (const m of matches) {
    process.stderr.write(`   "${m.keyword}" → ${m.suggestion}\n`);
  }
  process.stderr.write('   ※ 자동 우회가 아닙니다. --reason과 함께 명시적으로 사용하세요.\n');

  // stdout에 audit용 구조화된 결과
  process.stdout.write(JSON.stringify({
    event: 'prompt_transformed',
    matches,
    original_prompt: prompt.slice(0, 200),
  }) + '\n');

  process.exit(0);
}

main();
