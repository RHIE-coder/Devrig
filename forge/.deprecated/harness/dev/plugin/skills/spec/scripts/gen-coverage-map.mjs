// skills/spec/scripts/gen-coverage-map.mjs
//
// [Model Limit Assumption]
// LLM은 AC↔Test 매핑을 일관되게 추적하지 못한다.
// → Spec의 AC를 coverage.json 엔트리로 결정론적 변환.
//
// [Exit Protocol]
// exit(0) = 엔트리 생성/갱신 완료
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const specFile = process.env.HARNESS_SPEC_FILE || '';
const featureName = process.env.HARNESS_FEATURE || '';

function main() {
  if (!specFile || !featureName) {
    process.stderr.write('gen-coverage-map: HARNESS_SPEC_FILE + HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const specPath = resolve(projectDir, specFile);
  if (!existsSync(specPath)) {
    process.stderr.write(`gen-coverage-map: 파일 없음 — ${specFile}\n`);
    process.exit(1);
  }

  const raw = readFileSync(specPath, 'utf8');

  // AC 추출
  const lines = raw.split('\n');
  const acs = {};
  let currentId = null;
  let currentDesc = '';

  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s*id:\s*(AC-\S+)/);
    if (idMatch) {
      if (currentId) {
        acs[currentId] = {
          condition: currentDesc.trim(),
          test_file: null,
          test_name: null,
          status: 'uncovered',
        };
      }
      currentId = idMatch[1];
      currentDesc = '';
      continue;
    }
    if (currentId) {
      const descMatch = line.match(/^\s+desc:\s*"?([^"]*)"?\s*$/);
      if (descMatch) {
        currentDesc = descMatch[1];
      }
    }
  }
  if (currentId) {
    acs[currentId] = {
      condition: currentDesc.trim(),
      test_file: null,
      test_name: null,
      status: 'uncovered',
    };
  }

  // coverage.json 로드 또는 생성
  const coveragePath = resolve(projectDir, '.harness/state/coverage.json');
  mkdirSync(dirname(coveragePath), { recursive: true });

  let coverage;
  if (existsSync(coveragePath)) {
    try {
      coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
    } catch {
      coverage = { v: 1, features: {} };
    }
  } else {
    coverage = { v: 1, features: {} };
  }

  // Spec ID 추출
  const specIdMatch = raw.match(/^id:\s*(\S+)/m);
  const specId = specIdMatch?.[1] || `SPEC-${featureName.replace(/\//g, '-')}`;

  // feature 엔트리 갱신
  coverage.features[featureName] = {
    spec_id: specId,
    acs,
  };

  writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n', 'utf8');

  const result = {
    feature: featureName,
    ac_count: Object.keys(acs).length,
    all_uncovered: true,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
