// scripts/qa/attribution.mjs
//
// [Model Limit Assumption]
// LLM은 "UI가 실패했다"고 보고하지만 실제 원인이 API 계층인 경우를 놓친다.
// → stack-runner 결과에서 실패 계층을 결정론적으로 식별하여 귀인 리포트 산출.
//
// [Exit Protocol]
// exit(0) = 귀인 리포트 생성 (stdout JSON)
// exit(1) = 런타임 에러

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

async function main() {
  // stdin에서 stack-runner 결과 읽기
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    process.stderr.write('attribution: 빈 입력\n');
    process.exit(1);
  }

  let stackResult;
  try {
    stackResult = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`attribution: JSON 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  const layers = stackResult.layers || [];
  const mode = stackResult.mode || 'unknown';

  // 실패한 레이어 식별
  const failedLayers = layers.filter((l) => l.status === 'fail');
  const passedLayers = layers.filter((l) => l.status === 'pass');
  const skippedLayers = layers.filter((l) => l.status === 'skipped' || l.status === 'skip');

  let verdict;
  let failedLayer = null;
  let confidence = 'low';

  if (failedLayers.length === 0) {
    verdict = 'all_green';
    confidence = 'high';
  } else if (failedLayers.length === 1 && mode === 'sequential_bottom_up') {
    // sequential_bottom_up에서 단일 실패 → pure_{layer}_issue
    failedLayer = failedLayers[0].name;
    verdict = `pure_${failedLayer}_issue`;
    confidence = 'high';
  } else if (failedLayers.length === 1) {
    failedLayer = failedLayers[0].name;
    verdict = `pure_${failedLayer}_issue`;
    confidence = 'medium'; // parallel 모드에서는 신뢰도 중간
  } else {
    // 다중 레이어 실패
    const names = failedLayers.map((l) => l.name);
    verdict = `multi_layer: [${names.join(', ')}]`;
    failedLayer = names[0]; // 최하위 실패 레이어
    confidence = 'low';
  }

  const report = {
    feature: featureName || stackResult.feature,
    mode,
    verdict,
    failed_layer: failedLayer,
    confidence,
    layers: layers.map((l) => ({
      name: l.name,
      status: l.status,
      reason: l.reason || null,
    })),
    summary: {
      passed: passedLayers.length,
      failed: failedLayers.length,
      skipped: skippedLayers.length,
    },
  };

  // 리포트 저장
  const feature = featureName || stackResult.feature || 'unknown';
  const reportPath = resolve(projectDir, '.harness/state', `qa-attribution-${feature.replace(/\//g, '-')}.json`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`attribution: ${e.message}\n`);
  process.exit(1);
});
