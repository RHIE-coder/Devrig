// skills/architect/scripts/check-constraints.mjs
//
// [Model Limit Assumption]
// LLM은 Spec의 기술 제약을 간과하고 아키텍처를 결정할 수 있다.
// → Spec AC에서 기술 제약 키워드를 결정론적으로 추출, 기존 ADR 충돌 확인.
//
// [Exit Protocol]
// exit(0) = 제약 조건 출력 (stdout JSON)
// exit(1) = 런타임 에러

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';

const CONSTRAINT_KEYWORDS = {
  performance: ['latency', 'throughput', 'ms', '응답시간', '성능', '초 이내', 'p99', 'p95'],
  security: ['인증', '암호화', 'encryption', 'auth', 'OWASP', '토큰', '만료', 'csrf', 'xss'],
  compatibility: ['하위호환', 'backward', 'migration', '마이그레이션', 'v1', 'legacy', 'deprecated'],
  scalability: ['확장', 'scale', 'concurrent', '동시', 'sharding', 'partition'],
  reliability: ['가용성', 'availability', 'retry', '재시도', 'fallback', 'circuit'],
};

function findSpec() {
  if (!featureName) return null;
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/specs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`),
    resolve(projectDir, '.harness/specs', `${featureName.replace(/\//g, '-')}.spec.yaml`),
  ];
  return candidates.find(existsSync) || null;
}

function extractConstraints(specContent) {
  const constraints = [];
  const contentLower = specContent.toLowerCase();

  for (const [category, keywords] of Object.entries(CONSTRAINT_KEYWORDS)) {
    const found = keywords.filter((kw) => contentLower.includes(kw.toLowerCase()));
    if (found.length > 0) {
      constraints.push({ category, keywords: found, count: found.length });
    }
  }

  return constraints;
}

function loadExistingADRs() {
  const adrDir = resolve(projectDir, '.harness/adrs');
  if (!existsSync(adrDir)) return [];

  const adrs = [];
  for (const file of readdirSync(adrDir).filter((f) => f.endsWith('.md'))) {
    try {
      const content = readFileSync(join(adrDir, file), 'utf8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const statusMatch = content.match(/##\s*상태:\s*(\S+)/m) || content.match(/##\s*Status:\s*(\S+)/m);
      adrs.push({
        file,
        title: titleMatch ? titleMatch[1].trim() : file,
        status: statusMatch ? statusMatch[1].trim() : 'unknown',
      });
    } catch {
      // skip
    }
  }
  return adrs;
}

function main() {
  if (!featureName) {
    process.stderr.write('check-constraints: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const specPath = findSpec();
  if (!specPath) {
    process.stdout.write(JSON.stringify({ constraints: [], constraint_count: 0, existing_adrs: [], feature: featureName }) + '\n');
    process.exit(0);
  }

  const specContent = readFileSync(specPath, 'utf8');
  const constraints = extractConstraints(specContent);
  const existingADRs = loadExistingADRs();

  const result = {
    feature: featureName,
    constraints,
    constraint_count: constraints.length,
    existing_adrs: existingADRs,
    adr_count: existingADRs.length,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (constraints.length > 0) {
    process.stderr.write(`architect: ${constraints.length}개 제약 카테고리 발견\n`);
    for (const c of constraints) {
      process.stderr.write(`  - ${c.category}: ${c.keywords.join(', ')}\n`);
    }
  }

  process.exit(0);
}

main();
