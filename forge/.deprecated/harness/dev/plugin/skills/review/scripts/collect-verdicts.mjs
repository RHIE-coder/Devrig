// skills/review/scripts/collect-verdicts.mjs
//
// [Model Limit Assumption]
// LLM은 여러 리뷰어의 판단을 종합할 때 심각도를 혼동하거나 BLOCK을 누락할 수 있다.
// → Verdict 종합을 결정론적으로 수행: ANY BLOCK → BLOCK, ANY NEEDS_CHANGE → feedback.
//
// [Exit Protocol]
// exit(0) = 종합 완료 (stdout JSON), 결과가 PASS인 경우
// exit(2) = BLOCK 발견 (리뷰 차단)

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

/**
 * stdin에서 verdict 배열 읽기
 * 형식: [{ reviewer, verdict, findings, confidence }]
 */
async function readVerdicts() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function main() {
  if (!featureName) {
    process.stderr.write('collect-verdicts: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  return readVerdicts().then((verdicts) => {
    if (verdicts.length === 0) {
      process.stderr.write('collect-verdicts: verdict 입력 없음\n');
      process.stdout.write(JSON.stringify({ feature: featureName, overall: 'NO_INPUT', verdicts: [] }) + '\n');
      process.exit(0);
    }

    const blocks = verdicts.filter((v) => v.verdict === 'BLOCK');
    const needsChange = verdicts.filter((v) => v.verdict === 'NEEDS_CHANGE');
    const passes = verdicts.filter((v) => v.verdict === 'PASS');

    let overall;
    if (blocks.length > 0) {
      overall = 'BLOCK';
    } else if (needsChange.length > 0) {
      overall = 'NEEDS_CHANGE';
    } else {
      overall = 'PASS';
    }

    // 결과 저장
    const resultPath = resolve(projectDir, '.harness/state', `review-${featureName.replace(/\//g, '-')}.json`);
    mkdirSync(dirname(resultPath), { recursive: true });

    const result = {
      feature: featureName,
      overall,
      total: verdicts.length,
      pass_count: passes.length,
      needs_change_count: needsChange.length,
      block_count: blocks.length,
      verdicts: verdicts.map((v) => ({
        reviewer: v.reviewer,
        verdict: v.verdict,
        findings_count: v.findings?.length || 0,
        confidence: v.confidence || 'unknown',
      })),
      blocks: blocks.map((b) => ({
        reviewer: b.reviewer,
        findings: b.findings || [],
      })),
      feedback: needsChange.map((nc) => ({
        reviewer: nc.reviewer,
        findings: nc.findings || [],
      })),
    };

    writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify(result) + '\n');

    if (overall === 'BLOCK') {
      process.stderr.write(`⛔ review BLOCK: ${blocks.length}건 치명적 발견\n`);
      for (const b of blocks) {
        process.stderr.write(`   - ${b.reviewer}: ${(b.findings || []).length}건\n`);
      }
      process.exit(2);
    }

    if (overall === 'NEEDS_CHANGE') {
      process.stderr.write(`⚠️ review NEEDS_CHANGE: ${needsChange.length}건 수정 필요\n`);
      process.exit(0);
    }

    process.stderr.write(`✅ review PASS: ${passes.length}/${verdicts.length} 리뷰어 통과\n`);
    process.exit(0);
  });
}

main();
