// skills/refactor/scripts/verify-tests-identical.mjs
//
// [Model Limit Assumption]
// LLM은 리팩토링 후 테스트가 깨지는 것을 감지하지 못할 수 있다.
// → 리팩토링 후 테스트를 실행하여 전후 결과를 결정론적으로 비교.
//
// [Exit Protocol]
// exit(0) = 테스트 동등성 확인
// exit(2) = RED 테스트 발생
// exit(1) = 런타임 에러

import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

function collectTestFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.test.js')) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  if (!featureName) {
    process.stderr.write('verify-tests-identical: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  // feature 테스트 파일 탐색
  const parts = featureName.split('/');
  const testDir = resolve(projectDir, 'tests', ...parts.slice(0, -1));
  const testFiles = collectTestFiles(testDir);

  if (testFiles.length === 0) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no test files' }) + '\n');
    process.exit(0);
  }

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const file of testFiles) {
    try {
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;

      execSync(`node --test ${file}`, {
        cwd: projectDir,
        encoding: 'utf8',
        timeout: 60_000,
        env: cleanEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      passed++;
    } catch {
      failed++;
      failures.push(file.replace(projectDir + '/', ''));
    }
  }

  const result = {
    feature: featureName,
    total: testFiles.length,
    passed,
    failed,
    failures,
    identical: failed === 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (failed > 0) {
    process.stderr.write(`⛔ RED 테스트 ${failed}건! 마지막 변경을 rollback하세요.\n`);
    for (const f of failures) {
      process.stderr.write(`  - ${f}\n`);
    }
    process.exit(2);
  }

  process.stderr.write(`✅ 테스트 동등성 확인: ${passed}/${testFiles.length} 통과\n`);
  process.exit(0);
}

main();
