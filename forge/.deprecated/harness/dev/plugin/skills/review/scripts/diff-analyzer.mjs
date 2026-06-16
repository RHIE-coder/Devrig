// skills/review/scripts/diff-analyzer.mjs
//
// [Model Limit Assumption]
// LLM은 변경 범위를 과소/과대 평가하여 리뷰 깊이를 잘못 조절할 수 있다.
// → git diff에서 변경 파일 수, 추가/삭제 줄 수, 영향 모듈을 결정론적으로 분석.
//
// [Exit Protocol]
// exit(0) = 분석 완료 (stdout JSON)
// exit(1) = 런타임 에러

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const baseBranch = process.env.HARNESS_BASE_BRANCH || 'main';

function main() {
  if (!featureName) {
    process.stderr.write('diff-analyzer: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  let diffStat;
  try {
    diffStat = execSync(`git diff --stat ${baseBranch}...HEAD`, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // git diff 실패 시 (예: 비git, base branch 없음) 빈 분석 반환
    process.stdout.write(JSON.stringify({
      feature: featureName,
      files_changed: 0,
      insertions: 0,
      deletions: 0,
      modules: [],
      complexity: 'unknown',
    }) + '\n');
    process.exit(0);
  }

  // --stat 파싱
  const lines = diffStat.trim().split('\n');
  const fileLines = lines.slice(0, -1); // 마지막 줄은 summary
  const summaryLine = lines[lines.length - 1] || '';

  const filesChanged = fileLines.length;

  // summary 파싱: "3 files changed, 45 insertions(+), 12 deletions(-)"
  const insMatch = summaryLine.match(/(\d+)\s+insertion/);
  const delMatch = summaryLine.match(/(\d+)\s+deletion/);
  const insertions = insMatch ? parseInt(insMatch[1], 10) : 0;
  const deletions = delMatch ? parseInt(delMatch[1], 10) : 0;

  // 모듈 추출 (첫 디렉토리 레벨)
  const modules = new Set();
  for (const line of fileLines) {
    const fileMatch = line.match(/^\s*(\S+)/);
    if (fileMatch) {
      const parts = fileMatch[1].split('/');
      if (parts.length > 1) {
        modules.add(parts[0]);
      }
    }
  }

  // 복잡도 추정
  const totalLines = insertions + deletions;
  let complexity = 'low';
  if (totalLines > 500 || filesChanged > 20) complexity = 'high';
  else if (totalLines > 100 || filesChanged > 5) complexity = 'medium';

  const result = {
    feature: featureName,
    files_changed: filesChanged,
    insertions,
    deletions,
    total_lines: totalLines,
    modules: [...modules],
    complexity,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
