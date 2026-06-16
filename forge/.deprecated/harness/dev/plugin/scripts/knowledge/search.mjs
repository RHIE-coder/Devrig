// scripts/knowledge/search.mjs
//
// [Model Limit Assumption]
// LLM은 과거 해결 경험을 대화 간 일관되게 기억하지 못한다.
// → 솔루션 아카이브를 domain tag 기반으로 검색하여 관련 지식을 결정론적으로 반환.
//
// [Exit Protocol]
// exit(0) = 검색 완료 (stdout JSON — 결과 0건도 정상)
// exit(1) = 런타임 에러

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const domain = process.env.HARNESS_DOMAIN || '';
const keywords = (process.env.HARNESS_KEYWORDS || '').split(',').map((k) => k.trim()).filter(Boolean);
const maxResults = parseInt(process.env.HARNESS_MAX_RESULTS || '3', 10);

/**
 * 솔루션 파일에서 YAML frontmatter 추출 (간이 파서)
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const raw = match[1];
  const meta = {};

  // 간이 YAML 파싱 — 필요한 키만 추출
  const idMatch = raw.match(/^id:\s*(.+)/m);
  if (idMatch) meta.id = idMatch[1].trim();

  const domainMatch = raw.match(/^domain:\s*(.+)/m);
  if (domainMatch) meta.domain = domainMatch[1].trim();

  const tagsMatch = raw.match(/^tags:\s*\[([^\]]*)\]/m);
  if (tagsMatch) {
    meta.tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/['"]/g, '')).filter(Boolean);
  }

  const refCountMatch = raw.match(/^ref_count:\s*(\d+)/m);
  if (refCountMatch) meta.ref_count = parseInt(refCountMatch[1], 10);

  const createdMatch = raw.match(/^created:\s*(.+)/m);
  if (createdMatch) meta.created = createdMatch[1].trim();

  const specsMatch = raw.match(/^related_specs:\s*\[([^\]]*)\]/m);
  if (specsMatch) {
    meta.related_specs = specsMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  }

  const acsMatch = raw.match(/^related_acs:\s*\[([^\]]*)\]/m);
  if (acsMatch) {
    meta.related_acs = acsMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  }

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
          solutions.push({ path: full, meta, content });
        }
      } catch {
        // 읽기 실패 무시
      }
    }
  }
  return solutions;
}

/**
 * 점수 계산: domain 일치 + tag/keyword 매칭
 */
function score(solution, targetDomain, targetKeywords) {
  let s = 0;

  // domain 정확 일치
  if (solution.meta.domain === targetDomain) s += 10;

  // tag 매칭
  const tags = solution.meta.tags || [];
  for (const kw of targetKeywords) {
    if (tags.some((t) => t.toLowerCase().includes(kw.toLowerCase()))) s += 3;
  }

  // 본문 keyword 매칭
  for (const kw of targetKeywords) {
    if (solution.content.toLowerCase().includes(kw.toLowerCase())) s += 1;
  }

  // ref_count 가산 (자주 참조된 솔루션 우선)
  s += Math.min(solution.meta.ref_count || 0, 5);

  return s;
}

function main() {
  const solutionsDir = resolve(projectDir, '.harness/knowledge/solutions');

  if (!existsSync(solutionsDir)) {
    process.stdout.write(JSON.stringify({ results: [], total: 0 }) + '\n');
    process.exit(0);
  }

  const all = collectSolutions(solutionsDir);

  if (all.length === 0) {
    process.stdout.write(JSON.stringify({ results: [], total: 0 }) + '\n');
    process.exit(0);
  }

  // 점수 계산 및 정렬
  const scored = all
    .map((sol) => ({ ...sol, score: score(sol, domain, keywords) }))
    .filter((sol) => sol.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const results = scored.map((sol) => ({
    id: sol.meta.id,
    domain: sol.meta.domain,
    tags: sol.meta.tags || [],
    path: sol.path,
    score: sol.score,
    content: sol.content,
  }));

  process.stdout.write(JSON.stringify({
    query: { domain, keywords },
    results,
    total: results.length,
  }) + '\n');
  process.exit(0);
}

main();
