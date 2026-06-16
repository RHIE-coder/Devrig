// skills/spec/scripts/check-testability.mjs
//
// [Model Limit Assumption]
// LLM은 AC의 testable 필드 누락을 놓칠 수 있다.
// → 모든 AC에 testable 필드가 존재하는지 결정론적 검증.
//
// [Exit Protocol]
// exit(0) = 모든 AC testable (stdout에 결과 JSON)
// exit(2) = testable 누락 AC 존재

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const specFile = process.env.HARNESS_SPEC_FILE || '';

function main() {
  if (!specFile) {
    process.stderr.write('check-testability: HARNESS_SPEC_FILE 환경변수 필요\n');
    process.exit(1);
  }

  const specPath = resolve(projectDir, specFile);
  if (!existsSync(specPath)) {
    process.stderr.write(`check-testability: 파일 없음 — ${specFile}\n`);
    process.exit(2);
  }

  const raw = readFileSync(specPath, 'utf8');

  // AC 블록 추출 (간이 파서)
  // "- id: AC-xxx" 다음 줄들에서 testable 필드 확인
  const lines = raw.split('\n');
  const acs = [];
  let currentAc = null;

  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s*id:\s*(AC-\S+)/);
    if (idMatch) {
      if (currentAc) acs.push(currentAc);
      currentAc = { id: idMatch[1], hasTestable: false };
      continue;
    }
    if (currentAc && line.match(/^\s+testable:\s*.+/)) {
      currentAc.hasTestable = true;
    }
  }
  if (currentAc) acs.push(currentAc);

  const missing = acs.filter((ac) => !ac.hasTestable);

  if (missing.length > 0) {
    process.stderr.write(`⛔ check-testability: ${missing.length}개 AC에 testable 필드 누락\n`);
    for (const ac of missing) {
      process.stderr.write(`   - ${ac.id}\n`);
    }
    process.exit(2);
  }

  const result = {
    all_testable: true,
    ac_count: acs.length,
    file: specFile,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
