// scripts/guardrails/protect-harness.mjs
//
// [Model Limit Assumption]
// LLM은 .harness/state/ 파일을 직접 편집하여 워크플로우 상태를 조작할 수 있다.
// → Hook 레벨에서 물리적으로 차단. state/ 수정은 하네스 스크립트만 가능.
//
// [Exit Protocol]
// exit(0) = 통과 (보호 대상이 아닌 경로)
// exit(2) = 차단 (.harness/state/ 직접 수정 시도)

import { resolve, relative } from 'node:path';

const input = process.env.TOOL_INPUT;
const projectDir = process.env.CLAUDE_PROJECT_DIR;

if (!input) {
  process.exit(0);
}

let filePath;
try {
  const parsed = JSON.parse(input);
  filePath = parsed.file_path ?? '';
} catch {
  filePath = input;
}

if (!filePath) {
  process.exit(0);
}

// 절대 경로로 정규화
const absPath = resolve(projectDir || '.', filePath);
const relPath = relative(projectDir || '.', absPath);

// .harness/state/ 하위 경로인지 확인
const protectedPrefix = '.harness/state/';
const normalizedRel = relPath.replace(/\\/g, '/');

if (normalizedRel.startsWith(protectedPrefix) || normalizedRel === '.harness/state') {
  process.stderr.write(`⛔ Safety: .harness/state/ 직접 수정 차단\n`);
  process.stderr.write(`   경로: ${filePath}\n`);
  process.stderr.write(`   .harness/state/는 하네스 스크립트만 수정할 수 있습니다.\n`);
  process.exit(2);
}

process.exit(0);
