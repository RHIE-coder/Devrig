// skills/spec/scripts/validate-spec.mjs
//
// [Model Limit Assumption]
// LLM은 Spec YAML의 필수 필드 누락을 놓칠 수 있다.
// → 결정론적으로 Spec 형식과 완성도를 검증.
//
// [Exit Protocol]
// exit(0) = 검증 통과 (stdout에 결과 JSON)
// exit(2) = 검증 실패 (stderr에 사유)

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const specFile = process.env.HARNESS_SPEC_FILE || '';

function main() {
  if (!specFile) {
    process.stderr.write('validate-spec: HARNESS_SPEC_FILE 환경변수 필요\n');
    process.exit(1);
  }

  const specPath = resolve(projectDir, specFile);
  if (!existsSync(specPath)) {
    process.stderr.write(`validate-spec: 파일 없음 — ${specFile}\n`);
    process.exit(2);
  }

  const raw = readFileSync(specPath, 'utf8');
  const errors = [];

  // 필수 필드 검증 (간이 YAML 파싱)
  if (!raw.match(/^id:\s*\S+/m)) {
    errors.push('id 필드 누락');
  }
  if (!raw.match(/^name:\s*.+/m)) {
    errors.push('name 필드 누락');
  }
  if (!raw.match(/^description:\s*/m)) {
    errors.push('description 필드 누락');
  }
  if (!raw.match(/^acceptance_criteria:\s*$/m)) {
    errors.push('acceptance_criteria 섹션 누락');
  }

  // AC 최소 1개 존재
  const acMatches = raw.match(/^\s*-\s*id:\s*AC-/gm);
  if (!acMatches || acMatches.length === 0) {
    errors.push('AC가 최소 1개 이상 필요');
  }

  if (errors.length > 0) {
    process.stderr.write(`⛔ validate-spec: ${errors.length}개 오류\n`);
    for (const err of errors) {
      process.stderr.write(`   - ${err}\n`);
    }
    process.exit(2);
  }

  const result = {
    valid: true,
    ac_count: acMatches?.length || 0,
    file: specFile,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
