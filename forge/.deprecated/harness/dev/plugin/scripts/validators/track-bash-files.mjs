// scripts/validators/track-bash-files.mjs
//
// [Model Limit Assumption]
// LLM은 Bash로 파일을 생성/수정하면서 하네스 추적 체계 밖에서 작업할 수 있다.
// → PostToolUse(Bash) 훅으로 Bash 명령의 파일 조작을 감지하여 경고.
//
// [Exit Protocol]
// exit(0) = 항상 통과 (경고만 출력, 차단 아님)

const toolInput = process.env.TOOL_INPUT || '';
const toolResult = process.env.TOOL_RESULT || '';

// 파일 조작 패턴 감지
const FILE_WRITE_PATTERNS = [
  />\s*\S+/,         // 리다이렉트: > file, >> file
  /tee\s+\S+/,       // tee file
  /cp\s+/,           // cp
  /mv\s+/,           // mv
  /mkdir\s+/,        // mkdir
  /touch\s+/,        // touch
  /curl.*-o\s+/,     // curl -o file
  /wget\s+/,         // wget
];

function main() {
  let command = '';
  try {
    const parsed = JSON.parse(toolInput);
    command = parsed.command || '';
  } catch {
    command = toolInput;
  }

  if (!command) {
    process.exit(0);
  }

  const detected = [];
  for (const pattern of FILE_WRITE_PATTERNS) {
    if (pattern.test(command)) {
      detected.push(pattern.source);
    }
  }

  if (detected.length > 0) {
    process.stderr.write(`⚠️ Bash 파일 조작 감지: ${detected.length}건\n`);
    process.stderr.write(`   명령: ${command.slice(0, 200)}\n`);
    process.stderr.write('   하네스 추적 체계 밖의 파일 변경입니다.\n');

    process.stdout.write(JSON.stringify({
      event: 'bash_file_write_detected',
      command: command.slice(0, 200),
      patterns: detected,
    }) + '\n');
  }

  process.exit(0);
}

main();
