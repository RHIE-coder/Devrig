// skills/implement/scripts/run-tests.mjs
//
// [Model Limit Assumption]
// LLM은 테스트 실행 결과를 정확하게 해석하지 못할 수 있다.
// → node:test 러너 실행 후 종료 코드와 결과를 구조화된 JSON으로 반환.
//
// [Exit Protocol]
// exit(0) = 모든 테스트 통과
// exit(2) = 테스트 실패 있음
// exit(1) = 런타임 에러

import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const testFile = process.env.HARNESS_TEST_FILE || '';

function discoverTestFiles() {
  // 명시 지정된 파일
  if (testFile) {
    const abs = resolve(projectDir, testFile);
    if (!existsSync(abs)) {
      process.stderr.write(`run-tests: 테스트 파일 없음 — ${testFile}\n`);
      process.exit(1);
    }
    return [abs];
  }

  // feature 기반 탐색
  if (!featureName) {
    process.stderr.write('run-tests: HARNESS_FEATURE 또는 HARNESS_TEST_FILE 필요\n');
    process.exit(1);
  }

  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, 'tests', ...parts.slice(0, -1), `${parts[parts.length - 1]}.test.mjs`),
    resolve(projectDir, 'tests', `${featureName.replace(/\//g, '-')}.test.mjs`),
  ];

  // 디렉토리 단위 glob
  const testDir = resolve(projectDir, 'tests', ...parts.slice(0, -1));
  if (existsSync(testDir) && statSync(testDir).isDirectory()) {
    const files = readdirSync(testDir)
      .filter((f) => f.endsWith('.test.mjs'))
      .map((f) => join(testDir, f));
    if (files.length > 0) return files;
  }

  const found = candidates.filter(existsSync);
  if (found.length === 0) {
    process.stderr.write(`run-tests: 테스트 파일 탐색 실패 — ${featureName}\n`);
    process.exit(1);
  }
  return found;
}

function main() {
  const files = discoverTestFiles();

  process.stderr.write(`run-tests: ${files.length}개 테스트 파일 실행\n`);
  for (const f of files) {
    process.stderr.write(`  - ${f}\n`);
  }

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const file of files) {
    try {
      // NODE_TEST_CONTEXT 제거 — 외부 test runner에서 호출 시 IPC 간섭 방지
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;

      const output = execSync(`node --test ${file}`, {
        cwd: projectDir,
        encoding: 'utf8',
        timeout: 60_000,
        env: cleanEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      passed++;
      results.push({ file, status: 'pass', output: output.slice(0, 500) });
    } catch (err) {
      failed++;
      const output = (err.stdout || '') + (err.stderr || '');
      results.push({ file, status: 'fail', output: output.slice(0, 1000) });
    }
  }

  const summary = {
    feature: featureName,
    total: files.length,
    passed,
    failed,
    results,
  };

  process.stdout.write(JSON.stringify(summary) + '\n');

  if (failed > 0) {
    process.stderr.write(`⛔ run-tests: ${failed}/${files.length} 파일 실패\n`);
    process.exit(2);
  }

  process.stderr.write(`✅ run-tests: ${passed}/${files.length} 파일 통과\n`);
  process.exit(0);
}

main();
