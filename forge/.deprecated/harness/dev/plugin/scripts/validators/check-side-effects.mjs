// scripts/validators/check-side-effects.mjs
//
// [Model Limit Assumption]
// LLM은 Edit/Write 후 기존 테스트 깨짐을 자발적으로 확인하지 않는다.
// → PostToolUse(Edit|Write) 훅으로 파일 변경 후 기존 테스트 상태를 경고.
//
// [Exit Protocol]
// exit(0) = 항상 통과 (경고만 출력, 차단 아님)

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const toolInput = process.env.TOOL_INPUT || '';

function main() {
  // 변경된 파일 경로 추출
  let filePath = '';
  try {
    const parsed = JSON.parse(toolInput);
    filePath = parsed.file_path || parsed.path || '';
  } catch {
    filePath = toolInput;
  }

  if (!filePath) {
    process.exit(0);
  }

  // 테스트 파일 자체 변경은 무시
  if (filePath.includes('.test.') || filePath.includes('/tests/') || filePath.includes('/bench/')) {
    process.exit(0);
  }

  // 소스 코드 변경 시 경고
  const testsDir = resolve(projectDir, 'tests');
  if (existsSync(testsDir)) {
    process.stderr.write(`ℹ️ 소스 변경 감지: ${filePath}\n`);
    process.stderr.write('   기존 테스트 영향 여부를 확인하세요.\n');

    process.stdout.write(JSON.stringify({
      event: 'source_modified',
      file: filePath,
      hint: 'run existing tests to check for side-effects',
    }) + '\n');
  }

  process.exit(0);
}

main();
