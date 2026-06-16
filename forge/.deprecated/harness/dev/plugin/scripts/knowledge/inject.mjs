// scripts/knowledge/inject.mjs
//
// [Model Limit Assumption]
// LLM은 과거 솔루션을 자발적으로 참조하지 못한다.
// → 검색 결과를 token budget 이내로 truncate하여 Skill context에 결정론적 주입.
//
// [Exit Protocol]
// exit(0) = 주입 완료 (stdout에 주입 내용)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const maxTokens = parseInt(process.env.HARNESS_MAX_INJECT_TOKENS || '800', 10);

/**
 * 토큰 추정: 4 characters ≈ 1 token (영어 기준 근사)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * 솔루션 본문에서 frontmatter 제외한 내용 추출
 */
function extractBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

/**
 * frontmatter에서 ref_count, last_referenced 갱신
 */
function updateRefCount(content) {
  const today = new Date().toISOString().split('T')[0];

  let updated = content.replace(
    /^(ref_count:\s*)(\d+)/m,
    (_, prefix, count) => `${prefix}${parseInt(count, 10) + 1}`
  );
  updated = updated.replace(
    /^(last_referenced:\s*).+/m,
    `$1${today}`
  );
  return updated;
}

async function main() {
  // stdin에서 search.mjs 결과 읽기
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    process.stdout.write(JSON.stringify({ injected: false, reason: 'empty input' }) + '\n');
    process.exit(0);
  }

  let searchResult;
  try {
    searchResult = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`inject: JSON 파싱 실패 — ${e.message}\n`);
    process.exit(1);
  }

  const results = searchResult.results || [];
  if (results.length === 0) {
    process.stdout.write(JSON.stringify({ injected: false, reason: 'no results' }) + '\n');
    process.exit(0);
  }

  // token budget 이내로 솔루션 본문 수집
  let totalTokens = 0;
  const injected = [];

  for (const sol of results) {
    const body = extractBody(sol.content);
    const tokens = estimateTokens(body);

    if (totalTokens + tokens > maxTokens) {
      // 남은 budget으로 truncate
      const remainBudget = maxTokens - totalTokens;
      if (remainBudget > 50) {
        const truncated = body.slice(0, remainBudget * 4);
        injected.push({
          id: sol.id,
          domain: sol.domain,
          body: truncated + '\n... (truncated)',
          tokens: remainBudget,
          truncated: true,
        });
        totalTokens += remainBudget;
      }
      break;
    }

    injected.push({
      id: sol.id,
      domain: sol.domain,
      body,
      tokens,
      truncated: false,
    });
    totalTokens += tokens;

    // ref_count / last_referenced 갱신
    if (sol.path && existsSync(sol.path)) {
      try {
        const original = readFileSync(sol.path, 'utf8');
        const updated = updateRefCount(original);
        if (updated !== original) {
          writeFileSync(sol.path, updated, 'utf8');
        }
      } catch {
        // 갱신 실패는 무시 (주입은 계속)
      }
    }
  }

  // 주입 컨텍스트 포맷
  let contextBlock = '## Related Solutions (Knowledge Layer)\n\n';
  for (const item of injected) {
    contextBlock += `### ${item.id} (${item.domain})\n`;
    contextBlock += item.body + '\n\n';
  }

  const output = {
    injected: true,
    count: injected.length,
    total_tokens: totalTokens,
    max_tokens: maxTokens,
    context: contextBlock,
    solutions: injected.map((i) => ({ id: i.id, tokens: i.tokens, truncated: i.truncated })),
  };

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`inject: ${e.message}\n`);
  process.exit(1);
});
