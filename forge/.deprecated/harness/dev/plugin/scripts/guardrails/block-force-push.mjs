// scripts/guardrails/block-force-push.mjs
//
// [Model Limit Assumption]
// LLM은 "force push 금지" 지시를 긴급 상황 합리화로 우회할 수 있다.
// → Hook 레벨에서 물리적으로 차단.
//
// [Exit Protocol]
// exit(0) = 통과 (force push 아님)
// exit(2) = 차단 (force push 감지)

const input = process.env.TOOL_INPUT;

if (!input) {
  process.exit(0);
}

let command;
try {
  const parsed = JSON.parse(input);
  command = parsed.command ?? '';
} catch {
  command = input;
}

if (!command) {
  process.exit(0);
}

const normalized = command.replace(/\s+/g, ' ').trim();

// git push --force 변형 패턴
const forcePushPatterns = [
  [/\bgit\s+push\s+.*--force(?:-with-lease)?\b/, 'git push --force'],
  [/\bgit\s+push\s+.*-f\b/, 'git push -f'],
];

for (const [pattern, description] of forcePushPatterns) {
  if (pattern.test(normalized)) {
    process.stderr.write(`⛔ Safety: force push 차단 — ${description}\n`);
    process.stderr.write(`   명령: ${command.slice(0, 120)}${command.length > 120 ? '...' : ''}\n`);
    process.exit(2);
  }
}

process.exit(0);
