// skills/brainstorm/scripts/suggest-personas.mjs
//
// [Model Limit Assumption]
// LLM은 주제에 적합한 페르소나를 선별하지 못하고 전체를 사용할 수 있다.
// → 주제 키워드와 페르소나 도메인/태그 매칭으로 적합한 페르소나를 결정론적으로 추천.
//
// [Exit Protocol]
// exit(0) = 추천 목록 출력 (stdout JSON)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const topic = process.env.HARNESS_TOPIC || '';

// 주제 키워드 → 관련 도메인 매핑
const DOMAIN_KEYWORDS = {
  security: ['인증', '보안', 'auth', 'security', 'token', 'jwt', '암호', 'ssl', 'tls', 'oauth'],
  payment: ['결제', 'payment', 'billing', '구독', 'subscription', 'stripe', '정산'],
  performance: ['성능', 'performance', '캐시', 'cache', '최적화', 'optimization', 'latency'],
  database: ['db', 'database', '데이터베이스', 'sql', 'query', '마이그레이션', 'migration'],
  ui: ['ui', 'ux', '디자인', 'design', '화면', '컴포넌트', 'component', 'css'],
  api: ['api', 'rest', 'graphql', 'endpoint', '엔드포인트'],
  infra: ['인프라', 'infra', 'docker', 'k8s', 'kubernetes', 'ci', 'cd', 'deploy', '배포'],
};

function main() {
  if (!topic) {
    process.stdout.write(JSON.stringify({ suggestions: [], reason: 'no topic' }) + '\n');
    process.exit(0);
  }

  const topicLower = topic.toLowerCase();

  // 주제에서 관련 도메인 추출
  const matchedDomains = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (topicLower.includes(kw)) {
        matchedDomains.push(domain);
        break;
      }
    }
  }

  // 페르소나 스캔 + 도메인 매칭
  const agentsDir = resolve(projectDir, '.claude/agents');
  const suggestions = [];

  if (existsSync(agentsDir)) {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const content = readFileSync(join(agentsDir, file), 'utf8').toLowerCase();
      const nameMatch = content.match(/^#\s+(.+)/m);
      const name = nameMatch ? nameMatch[1].trim() : file.replace('.md', '');

      let score = 0;
      for (const domain of matchedDomains) {
        if (content.includes(domain)) score += 3;
      }
      // 주제 키워드 직접 매칭
      const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 1);
      for (const word of topicWords) {
        if (content.includes(word)) score += 1;
      }

      if (score > 0) {
        suggestions.push({ file, name, score, matched_domains: matchedDomains });
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  const result = {
    topic,
    matched_domains: matchedDomains,
    suggestions: suggestions.slice(0, 5),
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
