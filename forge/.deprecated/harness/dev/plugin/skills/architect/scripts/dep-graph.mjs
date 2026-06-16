// skills/architect/scripts/dep-graph.mjs
//
// [Model Limit Assumption]
// LLM은 프로젝트 의존성 구조를 전체적으로 파악하지 못할 수 있다.
// → import/require 문을 정적 분석하여 모듈 의존 그래프를 결정론적으로 생성.
//
// [Exit Protocol]
// exit(0) = 의존 그래프 출력 (stdout JSON)
// exit(1) = 런타임 에러

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, relative, dirname, extname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

const SOURCE_EXTS = ['.js', '.mjs', '.ts', '.tsx', '.jsx'];
const SKIP_DIRS = ['node_modules', '.git', '.harness', 'dist', 'build', '.next'];

function collectSourceFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectSourceFiles(full));
      } else if (SOURCE_EXTS.includes(extname(entry.name))) {
        files.push(full);
      }
    }
  } catch {
    // permission errors etc
  }
  return files;
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const imports = [];

  // ESM: import ... from '...'
  const esmPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = esmPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CJS: require('...')
  const cjsPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

function main() {
  const sourceFiles = collectSourceFiles(resolve(projectDir, 'src'));
  // also check root-level source files
  sourceFiles.push(...collectSourceFiles(resolve(projectDir, 'lib')));

  if (sourceFiles.length === 0) {
    process.stdout.write(JSON.stringify({
      nodes: [],
      edges: [],
      circular: [],
      total_files: 0,
    }) + '\n');
    process.exit(0);
  }

  const edges = [];
  const nodeSet = new Set();

  for (const file of sourceFiles) {
    const rel = relative(projectDir, file);
    nodeSet.add(rel);

    const imports = extractImports(file);
    for (const imp of imports) {
      // 로컬 import만 (./나 ../로 시작)
      if (!imp.startsWith('.')) continue;
      const resolved = relative(projectDir, resolve(dirname(file), imp));
      edges.push({ from: rel, to: resolved });
    }
  }

  // 순환 의존성 탐지 (간이 DFS)
  const adj = {};
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  }

  const circular = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        circular.push(path.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const next of (adj[node] || [])) {
      dfs(next, [...path, node]);
    }
    stack.delete(node);
  }

  for (const node of nodeSet) {
    dfs(node, []);
  }

  const result = {
    nodes: [...nodeSet],
    edges,
    total_files: sourceFiles.length,
    total_edges: edges.length,
    circular: circular.slice(0, 10), // 최대 10개
    has_circular: circular.length > 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (circular.length > 0) {
    process.stderr.write(`⚠️ 순환 의존성 ${circular.length}건 탐지\n`);
  }

  process.exit(0);
}

main();
