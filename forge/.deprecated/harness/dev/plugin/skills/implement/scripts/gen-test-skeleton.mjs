// skills/implement/scripts/gen-test-skeleton.mjs
//
// [Model Limit Assumption]
// LLM은 AC를 빠뜨리고 테스트를 작성할 수 있다.
// → Spec의 모든 AC를 추출하여 테스트 골격을 결정론적으로 생성.
//
// [Exit Protocol]
// exit(0) = 골격 생성/출력 완료 (stdout JSON)
// exit(1) = 런타임 에러

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function findSpec() {
  const candidates = [
    resolve(projectDir, '.harness/specs', `${featureName}.spec.yaml`),
  ];
  const parts = featureName.split('/');
  if (parts.length === 2) {
    candidates.push(resolve(projectDir, '.harness/specs', parts[0], `${parts[1]}.spec.yaml`));
  }
  return candidates.find(existsSync) || null;
}

function extractACs(specRaw) {
  const lines = specRaw.split('\n');
  const acs = [];
  let currentId = null;
  let currentDesc = '';
  let currentTestable = '';

  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s*id:\s*(AC-\S+)/);
    if (idMatch) {
      if (currentId) {
        acs.push({ id: currentId, desc: currentDesc.trim(), testable: currentTestable.trim() });
      }
      currentId = idMatch[1];
      currentDesc = '';
      currentTestable = '';
      continue;
    }
    if (currentId) {
      const descMatch = line.match(/^\s+desc:\s*"?([^"]*)"?\s*$/);
      if (descMatch) currentDesc = descMatch[1];
      const testMatch = line.match(/^\s+testable:\s*"?([^"]*)"?\s*$/);
      if (testMatch) currentTestable = testMatch[1];
    }
  }
  if (currentId) {
    acs.push({ id: currentId, desc: currentDesc.trim(), testable: currentTestable.trim() });
  }
  return acs;
}

function generateSkeleton(featureName, acs) {
  const parts = featureName.split('/');
  const suiteName = parts.length === 2 ? `${parts[0]}/${parts[1]}` : featureName;

  let code = `import { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';\n\n`;
  code += `describe('${suiteName}', () => {\n`;

  for (const ac of acs) {
    const label = ac.testable || ac.desc || ac.id;
    code += `  // ${ac.id}: ${ac.desc}\n`;
    code += `  it('${ac.id} — ${label.replace(/'/g, "\\'")}', () => {\n`;
    code += `    // TODO: test-strategist가 구체 테스트 작성\n`;
    code += `    assert.fail('Not implemented yet');\n`;
    code += `  });\n\n`;
  }

  code += `});\n`;
  return code;
}

function main() {
  if (!featureName) {
    process.stderr.write('gen-test-skeleton: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const specPath = findSpec();
  if (!specPath) {
    process.stderr.write(`gen-test-skeleton: Spec 없음 — ${featureName}\n`);
    process.exit(1);
  }

  const specRaw = readFileSync(specPath, 'utf8');
  const acs = extractACs(specRaw);

  if (acs.length === 0) {
    process.stderr.write(`gen-test-skeleton: AC가 없음 — ${featureName}\n`);
    process.exit(1);
  }

  const skeleton = generateSkeleton(featureName, acs);

  // 테스트 파일 경로 결정
  const parts = featureName.split('/');
  let testFileName;
  if (parts.length === 2) {
    testFileName = `${parts[1]}.test.mjs`;
  } else {
    testFileName = `${featureName}.test.mjs`;
  }
  const testDir = resolve(projectDir, 'tests', ...parts.slice(0, -1));
  const testPath = resolve(testDir, testFileName);

  // 이미 존재하면 덮어쓰지 않음
  if (existsSync(testPath)) {
    process.stderr.write(`gen-test-skeleton: 테스트 파일 이미 존재 — ${testPath}\n`);
    process.stderr.write('기존 파일을 유지합니다.\n');
  } else {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testPath, skeleton, 'utf8');
    process.stderr.write(`gen-test-skeleton: 테스트 골격 생성 — ${testPath}\n`);
  }

  const result = {
    feature: featureName,
    ac_count: acs.length,
    acs: acs.map((ac) => ac.id),
    test_file: testPath,
    skeleton_generated: !existsSync(testPath) || true,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
