// skills/persona/scripts/dispatch.mjs
//
// [Model Limit Assumption]
// LLM은 서브커맨드 파싱을 자체적으로 수행할 수 있으나 일관성이 없다.
// → 인자를 결정론적으로 파싱하여 서브커맨드별 스크립트로 라우팅.
//
// [Exit Protocol]
// exit(0) = 라우팅 정보 출력 (stdout JSON)
// exit(1) = 알 수 없는 서브커맨드

const toolInput = process.env.TOOL_INPUT || '';

function main() {
  let content = '';
  try {
    const parsed = JSON.parse(toolInput);
    content = parsed.content || '';
  } catch {
    content = toolInput;
  }

  // /harness:persona <subcommand> ...
  const match = content.match(/\/harness:persona\s+(\S+)/i);
  const subcommand = match ? match[1].toLowerCase() : 'list';

  const valid = ['create', 'list', 'delete'];
  if (!valid.includes(subcommand)) {
    process.stderr.write(`persona: 알 수 없는 서브커맨드 "${subcommand}". 허용: ${valid.join(', ')}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ subcommand }) + '\n');
  process.exit(0);
}

main();
