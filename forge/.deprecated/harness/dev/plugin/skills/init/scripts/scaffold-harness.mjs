// skills/init/scripts/scaffold-harness.mjs
//
// [Model Limit Assumption]
// LLM은 디렉토리 구조를 정확하게 생성하지 못할 수 있다.
// → 결정론적으로 .harness/ 전체 구조를 생성.
//
// [Exit Protocol]
// exit(0) = 생성 완료 (또는 이미 존재)
// exit(2) = 이미 존재 + 덮어쓰기 거부

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const forceOverwrite = process.env.HARNESS_FORCE === 'true';

const harnessDir = resolve(projectDir, '.harness');

// 생성할 디렉토리 목록
const dirs = [
  '.harness/state',
  '.harness/state/events',
  '.harness/state/snapshots',
  '.harness/state/incidents',
  '.harness/specs',
  '.harness/plans',
  '.harness/decisions',
  '.harness/knowledge',
  '.harness/knowledge/solutions',
  '.harness/knowledge/learnings',
];

function main() {
  if (existsSync(harnessDir) && !forceOverwrite) {
    process.stderr.write('scaffold-harness: .harness/ 이미 존재 — skip\n');
    // stdout으로 이미 존재 상태 알림
    process.stdout.write(JSON.stringify({ status: 'exists', path: harnessDir }) + '\n');
    process.exit(0);
  }

  for (const dir of dirs) {
    mkdirSync(resolve(projectDir, dir), { recursive: true });
  }

  // .gitignore for .harness/state/ (audit 로그 등 git 제외)
  const gitignorePath = resolve(harnessDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, [
      '# Harness state files (session-specific, not versioned)',
      'state/audit.jsonl',
      'state/audit-*.jsonl',
      'state/audit.jsonl.lock',
      'state/events/**/*.lock',
      '',
    ].join('\n'));
  }

  process.stderr.write('scaffold-harness: .harness/ 구조 생성 완료\n');
  process.stdout.write(JSON.stringify({ status: 'created', path: harnessDir, dirs: dirs.length }) + '\n');
  process.exit(0);
}

main();
