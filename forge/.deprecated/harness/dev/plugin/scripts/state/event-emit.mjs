// scripts/state/event-emit.mjs
//
// [Model Limit Assumption]
// LLM은 feature lifecycle 이력을 일관되게 유지하지 못한다.
// → 모든 feature event를 append-only JSONL로 기록하여 상태 재구축 가능하게 함.
//
// [Exit Protocol]
// exit(0) = 기록 성공
// exit(1) = 런타임 에러
//
// [Usage]
// echo '{"type":"SpecCreated","payload":{"domain":"auth","feature":"login"}}' | \
//   node event-emit.mjs
//
// 또는 CLI 인자로:
//   node event-emit.mjs --type SpecCreated --domain auth --feature login

import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { latestVersion } from './upcaster.mjs';
import { openSync, flockSync, closeSync } from './flock.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const producer = process.env.HARNESS_PRODUCER || 'unknown';

/**
 * CLI 인자 파싱 (--key value 형식)
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const val = argv[i + 1];
    if (key && val) args[key] = val;
  }
  return args;
}

/**
 * 이벤트 경로 결정: .harness/state/events/{domain}/{feature}/{YYYY-MM}.jsonl
 */
function eventPath(domain, feature) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return resolve(projectDir, '.harness/state/events', domain, feature, `${month}.jsonl`);
}

async function main() {
  let record;

  // stdin 또는 CLI 인자에서 이벤트 구성
  const cliArgs = parseArgs(process.argv);

  if (cliArgs.type) {
    // CLI 인자 모드
    record = {
      type: cliArgs.type,
      payload: {
        domain: cliArgs.domain || 'unknown',
        feature: cliArgs.feature || 'unknown',
      },
    };
    // 추가 payload 필드
    for (const [k, v] of Object.entries(cliArgs)) {
      if (!['type', 'domain', 'feature'].includes(k)) {
        record.payload[k] = v;
      }
    }
  } else {
    // stdin 모드
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();

    if (!raw) {
      process.stderr.write('event-emit: 빈 입력, skip\n');
      process.exit(0);
    }

    try {
      record = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`event-emit: JSON 파싱 실패 — ${e.message}\n`);
      process.exit(1);
    }
  }

  // 필수 필드 검증
  if (!record.type) {
    process.stderr.write('event-emit: type 필드 필수\n');
    process.exit(1);
  }

  const domain = record.payload?.domain || 'unknown';
  const feature = record.payload?.feature || 'unknown';

  // 이벤트 레코드 정규화 (최신 버전으로 기록)
  const event = {
    type: record.type,
    v: latestVersion(record.type),
    ts: record.ts || new Date().toISOString(),
    payload: record.payload || {},
    producer: record.producer || producer,
  };

  // 대상 파일 경로
  const targetPath = eventPath(domain, feature);
  const targetDir = dirname(targetPath);

  // 디렉토리 생성
  mkdirSync(targetDir, { recursive: true });

  // flock 직렬화 + append
  const fd = openSync(targetPath);
  try {
    flockSync(fd);
    const line = JSON.stringify(event) + '\n';
    appendFileSync(targetPath, line, 'utf8');
  } finally {
    closeSync(fd);
  }

  // stdout에 기록된 이벤트 반환 (호출자가 사용 가능)
  process.stdout.write(JSON.stringify(event) + '\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`event-emit: ${e.message}\n`);
  process.exit(1);
});
