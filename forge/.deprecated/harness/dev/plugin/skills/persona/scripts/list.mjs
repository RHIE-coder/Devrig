// skills/persona/scripts/list.mjs
//
// [Model Limit Assumption]
// LLM은 .claude/agents/ 파일을 누락 없이 열거하지 못할 수 있다.
// → 디렉토리 스캔으로 전체 페르소나 목록을 결정론적으로 출력.
//
// [Exit Protocol]
// exit(0) = 목록 출력 (stdout JSON)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

function extractMeta(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    // 첫 줄에서 이름 추출: # Name
    const nameMatch = content.match(/^#\s+(.+)/m);
    const name = nameMatch ? nameMatch[1].trim() : null;

    // "도메인" 또는 "domain" 키워드 근처에서 도메인 추출
    const domainMatch = content.match(/(?:도메인|domain)[^\n]*?(\S+)\s*(?:분야|영역|도메인)/i)
      || content.match(/(\S+)\s+도메인/i);
    const domain = domainMatch ? domainMatch[1] : null;

    // 타입 추출: domain-expert, business-role, tech-specialist
    const typeMatch = content.match(/(domain-expert|business-role|tech-specialist)/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'unknown';

    return { name, domain, type };
  } catch {
    return { name: null, domain: null, type: 'unknown' };
  }
}

function main() {
  const agentsDir = resolve(projectDir, '.claude/agents');

  if (!existsSync(agentsDir)) {
    process.stdout.write(JSON.stringify({ personas: [], total: 0 }) + '\n');
    process.exit(0);
  }

  const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  const personas = [];

  for (const file of files) {
    const filePath = join(agentsDir, file);
    const meta = extractMeta(filePath);
    personas.push({
      file,
      name: meta.name || file.replace('.md', ''),
      type: meta.type,
      domain: meta.domain,
    });
  }

  const result = { personas, total: personas.length };
  process.stdout.write(JSON.stringify(result) + '\n');

  if (personas.length === 0) {
    process.stderr.write('페르소나 없음. /harness:persona create 로 생성하세요.\n');
  } else {
    process.stderr.write(`${personas.length}개 페르소나:\n`);
    for (const p of personas) {
      process.stderr.write(`  - ${p.name} (${p.type}${p.domain ? ', ' + p.domain : ''})\n`);
    }
  }

  process.exit(0);
}

main();
