// skills/migrate/scripts/scaffold-harness.mjs
//
// [Model Limit Assumption]
// LLM은 기존 프로젝트에 .harness/ 를 생성할 때 기존 코드를 수정할 수 있다.
// → .harness/ 구조만 결정론적으로 생성, 기존 파일 일체 수정 금지.
//
// [Exit Protocol]
// exit(0) = 스캐폴드 완료 (stdout JSON)
// exit(2) = 이미 존재
// exit(1) = 런타임 에러

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function main() {
  const harnessDir = resolve(projectDir, '.harness');

  if (existsSync(harnessDir)) {
    process.stderr.write('scaffold-harness: .harness/ 이미 존재\n');
    process.stdout.write(JSON.stringify({ status: 'exists' }) + '\n');
    process.exit(2);
  }

  // 디렉토리 구조 생성
  const dirs = [
    '.harness/specs',
    '.harness/plans',
    '.harness/state',
    '.harness/state/events',
    '.harness/adrs',
    '.harness/knowledge/solutions',
  ];

  for (const dir of dirs) {
    mkdirSync(resolve(projectDir, dir), { recursive: true });
  }

  // config.yaml (prototype 모드)
  writeFileSync(resolve(harnessDir, 'config.yaml'),
    `# Harness Configuration (migrated project)\nmode: prototype\n\nworkflow:\n  right_size: small\n\ntesting:\n  runner: node\n  timeout: 60000\n`);

  // .gitignore
  writeFileSync(resolve(harnessDir, '.gitignore'),
    `# Harness state (machine-generated)\nstate/workflow.json\nstate/events/\nstate/*.json\n`);

  const created = dirs.map((d) => d.replace('.harness/', ''));

  process.stdout.write(JSON.stringify({
    status: 'created',
    mode: 'prototype',
    directories: created,
  }) + '\n');
  process.stderr.write(`✅ .harness/ 스캐폴드 완료 (prototype mode)\n`);
  process.exit(0);
}

main();
