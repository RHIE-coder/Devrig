// scripts/knowledge/prune.mjs
//
// [Model Limit Assumption]
// LLM은 지식 아카이브의 노화를 자발적으로 관리하지 못한다.
// → ref_count=0 + 생성 후 90일 경과 솔루션을 결정론적으로 식별.
// 자동 삭제 아님 — 후보 목록만 제시 (User Sovereignty).
//
// [Exit Protocol]
// exit(0) = 정리 후보 목록 (stdout JSON, 0건도 정상)
// exit(1) = 런타임 에러

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const staleDays = parseInt(process.env.HARNESS_PRUNE_DAYS || '90', 10);
const autoDelete = process.env.HARNESS_PRUNE_AUTO === 'true'; // 기본: false (후보만 제시)

/**
 * frontmatter에서 메타데이터 추출
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const raw = match[1];
  const meta = {};

  const idMatch = raw.match(/^id:\s*(.+)/m);
  if (idMatch) meta.id = idMatch[1].trim();

  const domainMatch = raw.match(/^domain:\s*(.+)/m);
  if (domainMatch) meta.domain = domainMatch[1].trim();

  const refCountMatch = raw.match(/^ref_count:\s*(\d+)/m);
  meta.ref_count = refCountMatch ? parseInt(refCountMatch[1], 10) : 0;

  const createdMatch = raw.match(/^created:\s*(.+)/m);
  if (createdMatch) meta.created = createdMatch[1].trim();

  return meta;
}

/**
 * 솔루션 디렉토리 재귀 탐색
 */
function collectSolutions(dir) {
  const solutions = [];
  if (!existsSync(dir)) return solutions;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      solutions.push(...collectSolutions(full));
    } else if (entry.name.endsWith('.md')) {
      try {
        const content = readFileSync(full, 'utf8');
        const meta = parseFrontmatter(content);
        if (meta) {
          solutions.push({ path: full, meta });
        }
      } catch {
        // 읽기 실패 무시
      }
    }
  }
  return solutions;
}

function main() {
  const solutionsDir = resolve(projectDir, '.harness/knowledge/solutions');

  if (!existsSync(solutionsDir)) {
    process.stdout.write(JSON.stringify({ candidates: [], total: 0 }) + '\n');
    process.exit(0);
  }

  const all = collectSolutions(solutionsDir);
  const now = Date.now();
  const thresholdMs = staleDays * 24 * 60 * 60 * 1000;

  // ref_count=0 + 생성 후 staleDays 경과
  const candidates = all.filter((sol) => {
    if (sol.meta.ref_count > 0) return false;
    if (!sol.meta.created) return false;

    const created = new Date(sol.meta.created).getTime();
    if (isNaN(created)) return false;

    return (now - created) > thresholdMs;
  });

  if (autoDelete && candidates.length > 0) {
    // 자동 삭제 모드 (HARNESS_PRUNE_AUTO=true 일 때만)
    const deleted = [];
    for (const sol of candidates) {
      try {
        unlinkSync(sol.path);
        deleted.push({
          id: sol.meta.id,
          domain: sol.meta.domain,
          path: relative(projectDir, sol.path),
        });
      } catch {
        // 삭제 실패 무시
      }
    }
    process.stderr.write(`prune: ${deleted.length}개 솔루션 삭제 완료\n`);
    process.stdout.write(JSON.stringify({ deleted, total: deleted.length }) + '\n');
  } else {
    // 기본: 후보 목록만 제시
    const list = candidates.map((sol) => ({
      id: sol.meta.id,
      domain: sol.meta.domain,
      created: sol.meta.created,
      ref_count: sol.meta.ref_count,
      path: relative(projectDir, sol.path),
    }));

    if (list.length > 0) {
      process.stderr.write(`prune: ${list.length}개 정리 후보 (ref_count=0, ${staleDays}일 경과)\n`);
      for (const c of list) {
        process.stderr.write(`   - ${c.id} (${c.domain}) — ${c.path}\n`);
      }
    } else {
      process.stderr.write('prune: 정리 후보 없음\n');
    }

    process.stdout.write(JSON.stringify({ candidates: list, total: list.length }) + '\n');
  }

  process.exit(0);
}

main();
