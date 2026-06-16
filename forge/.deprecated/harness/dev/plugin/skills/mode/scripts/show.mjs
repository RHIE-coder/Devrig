// skills/mode/scripts/show.mjs
//
// [Model Limit Assumption]
// LLM은 현재 세션 mode를 workflow.json 외의 맥락에서 추정할 수 있다.
// → workflow.json에서 mode를 결정론적으로 읽어 반환.
//
// [Exit Protocol]
// exit(0) = mode 정보 출력 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function main() {
  const harnessDir = resolve(projectDir, '.harness');
  if (!existsSync(harnessDir)) {
    process.stderr.write('mode show: .harness/ 미초기화. /harness:init 을 먼저 실행하세요.\n');
    process.exit(1);
  }

  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) {
    process.stdout.write(JSON.stringify({ mode: 'standard', source: 'default' }) + '\n');
    process.exit(0);
  }

  try {
    const workflow = JSON.parse(readFileSync(wfPath, 'utf8'));
    const mode = workflow.session?.mode || 'standard';

    // config.yaml의 mode와 비교
    let configMode = null;
    const cfgPath = resolve(projectDir, '.harness/config.yaml');
    if (existsSync(cfgPath)) {
      const raw = readFileSync(cfgPath, 'utf8');
      const match = raw.match(/^\s*mode:\s*(\S+)/m);
      configMode = match ? match[1].toLowerCase() : null;
    }

    const source = configMode && configMode !== 'auto' && configMode === mode
      ? 'config'
      : workflow.session?.mode_source || 'default';

    process.stdout.write(JSON.stringify({ mode, source, config_mode: configMode }) + '\n');
    process.stderr.write(`현재 mode: ${mode} (source: ${source})\n`);
  } catch (e) {
    process.stderr.write(`mode show: ${e.message}\n`);
    process.exit(1);
  }

  process.exit(0);
}

main();
