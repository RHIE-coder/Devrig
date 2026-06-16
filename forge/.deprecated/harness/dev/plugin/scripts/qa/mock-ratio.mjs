// scripts/qa/mock-ratio.mjs
//
// [Model Limit Assumption]
// LLM은 상위 계층 테스트가 하위 계층을 mock하여 귀인 무효화되는 것을 감지하지 못한다.
// → 테스트 코드에서 mock/stub 패턴을 정적 분석하여 mock_guard 정책 위반 검출.
//
// [Exit Protocol]
// exit(0) = mock_guard 통과 (또는 정책 off)
// exit(2) = mock_guard 위반 (strict_lower_real)
// exit(1) = 런타임 에러

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const policy = process.env.HARNESS_MOCK_GUARD || 'warn'; // strict_lower_real | warn | off

// mock/stub 감지 패턴
const MOCK_PATTERNS = [
  /\bmock\s*\(/gi,
  /\bstub\s*\(/gi,
  /\bjest\.mock\s*\(/gi,
  /\bsinon\.\w+\s*\(/gi,
  /\bvi\.mock\s*\(/gi,
  /\bmockImplementation/gi,
  /\bspyOn\s*\(/gi,
];

// 계층별 디렉토리 매핑
const LAYER_DIRS = ['infra', 'db', 'api', 'ui'];

function collectTestFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.test.js') || entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

function detectMocks(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const findings = [];
  for (const pattern of MOCK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      findings.push(pattern.source);
    }
  }
  return findings;
}

function main() {
  if (policy === 'off') {
    process.stdout.write(JSON.stringify({ policy: 'off', skipped: true }) + '\n');
    process.exit(0);
  }

  const testsDir = resolve(projectDir, 'tests');
  if (!existsSync(testsDir)) {
    process.stdout.write(JSON.stringify({ policy, skipped: true, reason: 'no tests dir' }) + '\n');
    process.exit(0);
  }

  // 상위 계층 테스트에서 하위 계층을 mock하는지 검사
  // 상위 = api, ui / 하위 mock 대상 = db, infra
  const violations = [];

  for (let i = 1; i < LAYER_DIRS.length; i++) {
    const upperLayer = LAYER_DIRS[i];
    const upperDir = resolve(testsDir, upperLayer);
    const testFiles = collectTestFiles(upperDir);

    for (const file of testFiles) {
      const mocks = detectMocks(file);
      if (mocks.length > 0) {
        // 하위 계층 import/참조 확인 (간이 — 파일명/경로에 하위 계층명 포함)
        const content = readFileSync(file, 'utf8');
        for (let j = 0; j < i; j++) {
          const lowerLayer = LAYER_DIRS[j];
          if (content.includes(lowerLayer) || content.includes(`/${lowerLayer}/`)) {
            violations.push({
              upper_layer: upperLayer,
              lower_layer: lowerLayer,
              file: relative(projectDir, file),
              mock_patterns: mocks,
            });
          }
        }
      }
    }
  }

  const result = {
    policy,
    violations_count: violations.length,
    violations,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (violations.length > 0 && policy === 'strict_lower_real') {
    process.stderr.write(`⛔ mock_guard 위반: ${violations.length}건 (strict_lower_real)\n`);
    for (const v of violations) {
      process.stderr.write(`   - ${v.upper_layer} → mocks ${v.lower_layer}: ${v.file}\n`);
    }
    process.exit(2);
  }

  if (violations.length > 0 && policy === 'warn') {
    process.stderr.write(`⚠️ mock_guard 경고: ${violations.length}건 (confidence 저하)\n`);
    for (const v of violations) {
      process.stderr.write(`   - ${v.upper_layer} → mocks ${v.lower_layer}: ${v.file}\n`);
    }
  }

  process.exit(0);
}

main();
