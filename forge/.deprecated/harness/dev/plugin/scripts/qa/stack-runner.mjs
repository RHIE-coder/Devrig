// scripts/qa/stack-runner.mjs
//
// [Model Limit Assumption]
// LLM은 QA Stack 실행 순서와 하위 실패 시 상위 skip 로직을 일관되게 수행하지 못한다.
// → 계층 의존성 기반 topological 실행, 하위 FAIL 시 상위 halt.
//
// [Exit Protocol]
// exit(0) = 모든 레이어 PASS
// exit(2) = 하나 이상 FAIL
// exit(1) = 런타임 에러

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const modeOverride = process.env.HARNESS_QA_MODE || '';
const skipLayers = (process.env.HARNESS_QA_SKIP || '').split(',').filter(Boolean);
const onlyLayer = process.env.HARNESS_QA_ONLY || '';

// 기본 4-Layer 정의
const DEFAULT_LAYERS = [
  { name: 'infra', order: 0, depends_on: [] },
  { name: 'db', order: 1, depends_on: ['infra'] },
  { name: 'api', order: 2, depends_on: ['db'] },
  { name: 'ui', order: 3, depends_on: ['api'] },
];

function loadConfig() {
  const cfgPath = resolve(projectDir, '.harness/config.yaml');
  if (!existsSync(cfgPath)) return { mode: 'parallel', layers: DEFAULT_LAYERS, commands: {} };
  try {
    const raw = readFileSync(cfgPath, 'utf8');
    // 간이 파싱
    const modeMatch = raw.match(/qa_mode:\s*(\S+)/m);
    const mode = modeMatch?.[1] || 'parallel';
    return { mode, layers: DEFAULT_LAYERS, commands: {} };
  } catch {
    return { mode: 'parallel', layers: DEFAULT_LAYERS, commands: {} };
  }
}

function loadWorkflowSize() {
  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) return 'small';
  try {
    const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
    return wf.features?.[featureName]?.size || wf.session?.right_size || 'small';
  } catch {
    return 'small';
  }
}

function resolveMode(config) {
  if (modeOverride) return modeOverride;
  const size = loadWorkflowSize();
  if (size === 'large') return 'sequential_bottom_up';
  return config.mode || 'parallel';
}

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

function runLayer(layerName) {
  // 테스트 명령 탐색: config.testing.commands[layerName] 또는 기본값
  const testDir = resolve(projectDir, 'tests', layerName);
  if (!existsSync(testDir)) {
    return { name: layerName, status: 'skip', reason: `tests/${layerName}/ 없음` };
  }

  const testFiles = collectTestFiles(testDir);
  if (testFiles.length === 0) {
    return { name: layerName, status: 'skip', reason: `tests/${layerName}/ 테스트 파일 없음` };
  }

  try {
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;

    const fileArgs = testFiles.join(' ');
    const output = execSync(`node --test ${fileArgs}`, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 120_000,
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { name: layerName, status: 'pass', output: output.slice(0, 500) };
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    return { name: layerName, status: 'fail', output: output.slice(0, 1000) };
  }
}

function main() {
  if (!featureName) {
    process.stderr.write('stack-runner: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const config = loadConfig();
  const mode = resolveMode(config);
  let layers = config.layers.filter((l) => !skipLayers.includes(l.name));

  if (onlyLayer) {
    layers = layers.filter((l) => l.name === onlyLayer);
  }

  // 정렬 (topological)
  layers.sort((a, b) => a.order - b.order);

  process.stderr.write(`stack-runner: mode=${mode}, layers=${layers.map((l) => l.name).join(',')}\n`);

  const results = [];
  let halted = false;

  if (mode === 'sequential_bottom_up') {
    // Bottom-up 순차 실행 — 하위 FAIL → 상위 skip
    for (const layer of layers) {
      if (halted) {
        results.push({ name: layer.name, status: 'skipped', reason: 'lower layer failed' });
        continue;
      }

      const result = runLayer(layer.name);
      results.push(result);

      if (result.status === 'fail') {
        halted = true;
        process.stderr.write(`⛔ ${layer.name} FAIL → 상위 레이어 skip\n`);
      }
    }
  } else {
    // Parallel — 모든 레이어 실행
    for (const layer of layers) {
      const result = runLayer(layer.name);
      results.push(result);
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip' || r.status === 'skipped').length;

  const summary = {
    feature: featureName,
    mode,
    total: layers.length,
    passed,
    failed,
    skipped,
    halted,
    layers: results,
  };

  process.stdout.write(JSON.stringify(summary) + '\n');

  if (failed > 0) {
    process.stderr.write(`⛔ stack-runner: ${failed} 레이어 실패\n`);
    process.exit(2);
  }

  process.stderr.write(`✅ stack-runner: ${passed} 레이어 통과\n`);
  process.exit(0);
}

main();
