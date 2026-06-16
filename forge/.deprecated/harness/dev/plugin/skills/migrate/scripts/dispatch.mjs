// skills/migrate/scripts/dispatch.mjs
//
// [Model Limit Assumption]
// LLM은 migrate 서브커맨드를 일관되게 파싱하지 못할 수 있다.
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

  const match = content.match(/\/harness:migrate\s+(\S+)/i);
  const subcommand = match ? match[1].toLowerCase() : '';

  const valid = ['init', 'analyze', 'extract-spec', 'gen-test'];
  if (!subcommand || !valid.includes(subcommand)) {
    process.stderr.write(`migrate: 서브커맨드 필요. 허용: ${valid.join(', ')}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ subcommand }) + '\n');
  process.exit(0);
}

main();
