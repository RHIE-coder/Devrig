// skills/brainstorm/scripts/load-personas.mjs
//
// [Model Limit Assumption]
// LLM은 .claude/agents/에 어떤 페르소나가 있는지 모르고 시작할 수 있다.
// → 사용 가능한 페르소나를 결정론적으로 스캔하여 목록 제공.
//
// [Exit Protocol]
// exit(0) = 페르소나 목록 출력 (stdout JSON)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const filterNames = (process.env.HARNESS_PERSONAS || '').split(',').filter(Boolean);

function extractMeta(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const nameMatch = content.match(/^#\s+(.+)/m);
    const roleMatch = content.match(/^>\s*(.+)/m);
    return {
      name: nameMatch ? nameMatch[1].trim() : null,
      summary: roleMatch ? roleMatch[1].trim() : null,
      content: content.slice(0, 500),
    };
  } catch {
    return { name: null, summary: null, content: '' };
  }
}

function main() {
  const agentsDir = resolve(projectDir, '.claude/agents');
  const personas = [];

  if (existsSync(agentsDir)) {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const meta = extractMeta(join(agentsDir, file));
      const slug = file.replace('.md', '');
      personas.push({
        file,
        slug,
        name: meta.name || slug,
        summary: meta.summary,
      });
    }
  }

  // 필터 적용
  let selected;
  if (filterNames.length > 0) {
    selected = personas.filter((p) =>
      filterNames.some((f) =>
        p.name.includes(f) || p.slug.includes(f.toLowerCase())
      )
    );
  } else {
    selected = personas;
  }

  // 항상 포함되는 내장 관점
  const builtIn = [
    { slug: 'devils-advocate', name: 'Devils Advocate', summary: '약점 공격 및 반론 제시', builtin: true },
    { slug: 'requirements-analyst', name: 'Requirements Analyst', summary: '구조화된 요구사항 분석', builtin: true },
  ];

  const result = {
    user_personas: selected,
    builtin_perspectives: builtIn,
    total: selected.length + builtIn.length,
    filter_applied: filterNames.length > 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  process.stderr.write(`brainstorm: ${selected.length}개 사용자 페르소나 + ${builtIn.length}개 내장 관점\n`);
  for (const p of selected) {
    process.stderr.write(`  - ${p.name}: ${p.summary || '(설명 없음)'}\n`);
  }

  process.exit(0);
}

main();
