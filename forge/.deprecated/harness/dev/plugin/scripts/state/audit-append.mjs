// scripts/state/audit-append.mjs
//
// [Model Limit Assumption]
// LLM은 자동 판단의 이력을 추적하지 못한다.
// → 모든 자동 판단을 append-only JSONL로 기록하여 사후 검증 가능하게 함.
//
// [Exit Protocol]
// exit(0) = 기록 성공
// exit(1) = 런타임 에러 (파일 I/O 실패 등)

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openSync, closeSync, flockSync } from './flock.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

// config 기본값
const DEFAULT_AUDIT_PATH = '.harness/state/audit.jsonl';
const DEFAULT_ROTATE_MB = 10;

/**
 * stdin에서 JSON 레코드를 읽어 audit.jsonl에 append
 */
async function main() {
  // stdin 읽기
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    process.stderr.write('audit-append: 빈 입력, skip\n');
    process.exit(0);
  }

  // JSON 유효성 검증
  let record;
  try {
    record = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`audit-append: JSON 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  // 필수 필드 보강
  if (!record.ts) {
    record.ts = new Date().toISOString();
  }

  const auditPath = resolve(projectDir, DEFAULT_AUDIT_PATH);
  const auditDir = dirname(auditPath);

  // 디렉토리 생성
  mkdirSync(auditDir, { recursive: true });

  // flock 직렬화 + append
  const fd = openSync(auditPath);
  try {
    flockSync(fd);

    // rotate 검사
    try {
      const stats = statSync(auditPath);
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB >= DEFAULT_ROTATE_MB) {
        const now = new Date();
        const suffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const archivePath = resolve(auditDir, `audit-${suffix}.jsonl`);
        renameSync(auditPath, archivePath);
      }
    } catch {
      // 파일이 없으면 rotate 불필요
    }

    const line = JSON.stringify(record) + '\n';
    appendFileSync(auditPath, line, 'utf8');
  } finally {
    closeSync(fd);
  }

  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`audit-append: ${e.message}\n`);
  process.exit(1);
});
