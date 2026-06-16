// scripts/guardrails/block-destructive.mjs
//
// [Model Limit Assumption]
// LLM은 "파괴적 명령을 실행하지 마라"는 지시를 합리화로 우회할 수 있다.
// → Hook 레벨에서 물리적으로 차단.
//
// [Exit Protocol]
// exit(0) = 통과 (안전한 명령)
// exit(2) = 차단 (파괴적 명령 감지)

const input = process.env.TOOL_INPUT;

if (!input) {
  process.exit(0);
}

let command;
try {
  const parsed = JSON.parse(input);
  command = parsed.command ?? '';
} catch {
  // TOOL_INPUT이 JSON이 아닌 경우 raw string으로 취급
  command = input;
}

if (!command) {
  process.exit(0);
}

// 공백/탭 정규화 — 다중 공백, 탭을 단일 공백으로
const normalized = command.replace(/\s+/g, ' ').trim();

// 파괴적 패턴 목록
// 각 항목: [pattern, description]
const destructivePatterns = [
  // 파일시스템 파괴
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/, 'rm -rf 패턴'],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+\/(?:\s|$)/, 'rm -r / (루트 삭제)'],
  [/\brm\s+-[a-zA-Z]*f[a-zA-Z]*\s+\/(?:\s|$)/, 'rm -f / (루트 삭제)'],

  // Git 파괴
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, 'git clean -f'],

  // DB 파괴
  [/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, 'DROP TABLE/DATABASE/SCHEMA'],
  [/\bTRUNCATE\s+(TABLE\s+)?\w/i, 'TRUNCATE TABLE'],
  [/\bDELETE\s+FROM\s+\w+\s*;?\s*$/im, 'DELETE FROM (조건 없는 전체 삭제)'],

  // 디스크/파티션 파괴
  [/\bmkfs\b/, 'mkfs (파일시스템 포맷)'],
  [/\bdd\s+.*\bof=\/dev\//, 'dd of=/dev/ (디스크 직접 쓰기)'],

  // 시스템 위험
  [/\bchmod\s+-R\s+777\s+\/(?:\s|$)/, 'chmod -R 777 / (루트 퍼미션 변경)'],
  [/\bchown\s+-R\s+.*\s+\/(?:\s|$)/, 'chown -R / (루트 소유자 변경)'],

  // 환경 파괴
  [/\b:(){ :\|:& };:/, 'fork bomb'],
  [/>\s*\/dev\/sda/, '/dev/sda 직접 쓰기'],
];

for (const [pattern, description] of destructivePatterns) {
  if (pattern.test(normalized)) {
    process.stderr.write(`⛔ Safety: 파괴적 명령 차단 — ${description}\n`);
    process.stderr.write(`   명령: ${command.slice(0, 120)}${command.length > 120 ? '...' : ''}\n`);
    process.exit(2);
  }
}

process.exit(0);
