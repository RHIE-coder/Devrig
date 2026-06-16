// skills/implement/scripts/check-side-effects.mjs
//
// [Model Limit Assumption]
// LLM은 새 코드가 기존 기능에 미치는 side-effect를 예측하지 못한다.
// → 기존 전체 테스트 스위트를 실행하여 깨진 테스트 결정론적 감지.
//
// [Exit Protocol]
// exit(0) = 기존 테스트 깨짐 없음
// exit(2) = 기존 테스트 깨짐 발견
// exit(1) = 런타임 에러

import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

/**
 * tests/ 디렉토리에서 모든 .test.mjs 재귀 탐색
 */
function collectTestFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (entry.name.endsWith('.test.mjs')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * 현재 feature의 테스트 파일 경로를 반환 (제외 대상)
 */
function currentFeatureTests() {
  if (!featureName) return new Set();
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, 'tests', ...parts.slice(0, -1), `${parts[parts.length - 1]}.test.mjs`),
    resolve(projectDir, 'tests', `${featureName.replace(/\//g, '-')}.test.mjs`),
  ];
  return new Set(candidates.filter(existsSync));
}

function main() {
  const testsDir = resolve(projectDir, 'tests');
  if (!existsSync(testsDir)) {
    process.stderr.write('check-side-effects: tests/ 디렉토리 없음, skip\n');
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no tests dir' }) + '\n');
    process.exit(0);
  }

  const allTests = collectTestFiles(testsDir);
  const currentTests = currentFeatureTests();

  // 현재 feature 테스트 제외 — 기존 테스트만 실행
  const existingTests = allTests.filter((f) => !currentTests.has(f));

  if (existingTests.length === 0) {
    process.stderr.write('check-side-effects: 기존 테스트 없음, skip\n');
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no existing tests' }) + '\n');
    process.exit(0);
  }

  process.stderr.write(`check-side-effects: 기존 테스트 ${existingTests.length}개 파일 실행\n`);

  let passed = 0;
  let failed = 0;
  const broken = [];

  for (const file of existingTests) {
    try {
      // NODE_TEST_CONTEXT 제거 — 외부 test runner에서 호출 시 IPC 간섭 방지
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
    } catch (err) {
      failed++;
      const output = (err.stdout || '') + (err.stderr || '');
      broken.push({
        file: relative(projectDir, file),
        output: output.slice(0, 500),
      });
    }
  }

  const summary = {
    feature: featureName,
    existing_tests: existingTests.length,
    passed,
    failed,
    broken,
  };

  process.stdout.write(JSON.stringify(summary) + '\n');

  if (failed > 0) {
    process.stderr.write(`⛔ side-effect 감지: ${failed}개 기존 테스트 깨짐\n`);
    for (const b of broken) {
      process.stderr.write(`   - ${b.file}\n`);
    }
    process.exit(2);
  }

  process.stderr.write(`✅ side-effect 없음: 기존 ${passed}개 테스트 모두 통과\n`);
  process.exit(0);
}

main();
