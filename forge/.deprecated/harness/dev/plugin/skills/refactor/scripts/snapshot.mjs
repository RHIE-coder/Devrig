// skills/refactor/scripts/snapshot.mjs
//
// [Model Limit Assumption]
// LLM은 리팩토링 전 상태를 기록하지 않아 사후 비교가 불가능할 수 있다.
// → Spec AC 해시와 테스트 결과를 결정론적으로 캡처.
//
// [Exit Protocol]
// exit(0) = 스냅샷 기록 완료 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function findSpec() {
  if (!featureName) return null;
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/specs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`),
    resolve(projectDir, '.harness/specs', `${featureName.replace(/\//g, '-')}.spec.yaml`),
  ];
  return candidates.find(existsSync) || null;
}

function main() {
  if (!featureName) {
    process.stderr.write('snapshot: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  // Spec AC 해시
  let specHash = null;
  const specPath = findSpec();
  if (specPath) {
    const content = readFileSync(specPath, 'utf8');
    specHash = createHash('sha256').update(content).digest('hex');
  }

  const snapshot = {
    feature: featureName,
    ts: new Date().toISOString(),
    spec_hash: specHash,
    spec_path: specPath,
  };

  // 저장
  const slug = featureName.replace(/\//g, '-');
  const outPath = resolve(projectDir, '.harness/state', `refactor-snapshot-${slug}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  process.stdout.write(JSON.stringify(snapshot) + '\n');
  process.stderr.write(`✅ refactor snapshot: ${outPath}\n`);
  process.exit(0);
}

main();
