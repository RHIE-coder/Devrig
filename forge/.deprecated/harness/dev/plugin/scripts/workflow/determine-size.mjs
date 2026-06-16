// scripts/workflow/determine-size.mjs
//
// [Model Limit Assumption]
// LLM은 프로젝트 규모를 일관되게 판단하지 못한다.
// → AC 수, 파일 수, LOC 3축으로 결정론적 판정.
//
// [Exit Protocol]
// exit(0) = 판정 완료 (stdout으로 결과 JSON)
// exit(1) = 런타임 에러

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

// --- 3축 임계값 ---
// small: AC ≤ 5, files ≤ 10, loc ≤ 500
// medium: AC ≤ 15, files ≤ 50, loc ≤ 3000
// large: 그 이상

const THRESHOLDS = {
  small: { ac: 5, files: 10, loc: 500 },
  medium: { ac: 15, files: 50, loc: 3000 },
};

/**
 * Spec에서 AC 수 추출
 */
function countACs() {
  if (!featureName) return 0;

  const specsDir = resolve(projectDir, '.harness/specs');
  const candidates = [
    resolve(specsDir, `${featureName}.spec.yaml`),
  ];
  const parts = featureName.split('/');
  if (parts.length === 2) {
    candidates.push(resolve(specsDir, parts[0], `${parts[1]}.spec.yaml`));
  }

  for (const specPath of candidates) {
    if (!existsSync(specPath)) continue;
    try {
      const raw = readFileSync(specPath, 'utf8');
      // 간이 AC 카운트 — "- id: AC-" 패턴
      const matches = raw.match(/^\s*-\s*id:\s*AC-/gm);
      return matches?.length || 0;
    } catch {
      continue;
    }
  }
  return 0;
}

/**
 * 프로젝트 소스 파일 수 카운트 (src/, lib/, app/ 하위)
 */
function countFiles() {
  const srcDirs = ['src', 'lib', 'app', 'pages', 'components'];
  let count = 0;

  for (const dir of srcDirs) {
    const fullDir = resolve(projectDir, dir);
    if (!existsSync(fullDir)) continue;

    function walk(d) {
      try {
        const entries = readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = join(d, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            count++;
          }
        }
      } catch { /* skip */ }
    }
    walk(fullDir);
  }

  return count;
}

/**
 * 대략적 LOC 카운트
 */
function countLOC() {
  const srcDirs = ['src', 'lib', 'app'];
  const codeExts = new Set(['.js', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java']);
  let loc = 0;

  for (const dir of srcDirs) {
    const fullDir = resolve(projectDir, dir);
    if (!existsSync(fullDir)) continue;

    function walk(d) {
      try {
        const entries = readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = join(d, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            const ext = entry.name.slice(entry.name.lastIndexOf('.'));
            if (codeExts.has(ext)) {
              try {
                const content = readFileSync(full, 'utf8');
                loc += content.split('\n').length;
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* skip */ }
    }
    walk(fullDir);
  }

  return loc;
}

function determineSize(ac, files, loc) {
  // 3축 중 하나라도 large 범위면 large
  if (ac > THRESHOLDS.medium.ac || files > THRESHOLDS.medium.files || loc > THRESHOLDS.medium.loc) {
    return 'large';
  }
  // 3축 모두 small 범위면 small
  if (ac <= THRESHOLDS.small.ac && files <= THRESHOLDS.small.files && loc <= THRESHOLDS.small.loc) {
    return 'small';
  }
  return 'medium';
}

function main() {
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const ac = countACs();
  const files = countFiles();
  const loc = countLOC();
  const size = determineSize(ac, files, loc);

  const result = {
    right_size: size,
    signals: { ac, files, loc },
    thresholds: THRESHOLDS,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
