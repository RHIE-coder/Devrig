// skills/persona/scripts/create.mjs
//
// [Model Limit Assumption]
// LLM은 페르소나 파일을 비표준 형식으로 생성할 수 있다.
// → 템플릿 기반으로 표준 Claude Code Agent .md 형식을 결정론적으로 생성.
//
// [Exit Protocol]
// exit(0) = 페르소나 생성 완료 (stdout JSON)
// exit(2) = 이미 존재
// exit(1) = 런타임 에러

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '.';
const personaName = process.env.HARNESS_PERSONA_NAME || '';
const personaType = process.env.HARNESS_PERSONA_TYPE || 'domain-expert';
const personaDomain = process.env.HARNESS_PERSONA_DOMAIN || '';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadTemplate(type) {
  const tmplPath = resolve(pluginRoot, 'skills/persona/templates', `${type}.md`);
  if (!existsSync(tmplPath)) return null;
  return readFileSync(tmplPath, 'utf8');
}

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function main() {
  if (!personaName) {
    process.stderr.write('persona create: HARNESS_PERSONA_NAME 필요\n');
    process.exit(1);
  }

  const slug = slugify(personaName);
  const agentsDir = resolve(projectDir, '.claude/agents');
  const filePath = resolve(agentsDir, `${slug}.md`);

  if (existsSync(filePath)) {
    process.stderr.write(`⚠️ 페르소나 "${personaName}" 이미 존재: ${filePath}\n`);
    process.stdout.write(JSON.stringify({ status: 'exists', name: personaName, file: filePath }) + '\n');
    process.exit(2);
  }

  let template = loadTemplate(personaType);
  if (!template) {
    // 기본 템플릿
    template = `# {{name}}

> {{domain}} 도메인의 {{type}} 페르소나.

## 역할

{{name}}은(는) {{domain}} 분야의 전문가입니다.

## 관점

- {{domain}} 관점에서 요구사항과 설계를 검토합니다.
- 실무 경험 기반의 피드백을 제공합니다.

## 제약

- 이 페르소나의 관점을 벗어나는 판단은 하지 않습니다.
`;
  }

  const content = renderTemplate(template, {
    name: personaName,
    type: personaType,
    domain: personaDomain || 'general',
  });

  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(filePath, content, 'utf8');

  const result = {
    status: 'created',
    name: personaName,
    type: personaType,
    domain: personaDomain || 'general',
    file: filePath,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.stderr.write(`✅ 페르소나 생성: ${personaName} → ${filePath}\n`);
  process.exit(0);
}

main();
