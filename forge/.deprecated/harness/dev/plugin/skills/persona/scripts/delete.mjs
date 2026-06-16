// skills/persona/scripts/delete.mjs
//
// [Model Limit Assumption]
// LLM은 파일 삭제 시 대상을 잘못 식별할 수 있다.
// → 페르소나 이름 기반으로 대상 파일을 결정론적으로 확인 후 삭제.
//
// [Exit Protocol]
// exit(0) = 삭제 완료 (stdout JSON)
// exit(2) = 대상 미존재
// exit(1) = 런타임 에러

import { existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const personaName = process.env.HARNESS_PERSONA_NAME || '';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function main() {
  if (!personaName) {
    process.stderr.write('persona delete: HARNESS_PERSONA_NAME 필요\n');
    process.exit(1);
  }

  const agentsDir = resolve(projectDir, '.claude/agents');
  if (!existsSync(agentsDir)) {
    process.stderr.write(`⚠️ 페르소나 "${personaName}" 없음 (.claude/agents/ 미존재)\n`);
    process.exit(2);
  }

  // slug 기반 + 직접 이름 기반 모두 탐색
  const slug = slugify(personaName);
  const candidates = [
    `${slug}.md`,
    `${personaName}.md`,
  ];

  let found = null;
  for (const candidate of candidates) {
    const filePath = join(agentsDir, candidate);
    if (existsSync(filePath)) {
      found = filePath;
      break;
    }
  }

  if (!found) {
    process.stderr.write(`⚠️ 페르소나 "${personaName}" 없음\n`);
    process.stdout.write(JSON.stringify({ status: 'not_found', name: personaName }) + '\n');
    process.exit(2);
  }

  unlinkSync(found);
  process.stdout.write(JSON.stringify({ status: 'deleted', name: personaName, file: found }) + '\n');
  process.stderr.write(`✅ 페르소나 삭제: ${personaName} (${found})\n`);
  process.exit(0);
}

main();
