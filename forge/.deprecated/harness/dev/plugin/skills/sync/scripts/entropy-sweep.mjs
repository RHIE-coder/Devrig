// skills/sync/scripts/entropy-sweep.mjs
//
// [Model Limit Assumption]
// LLM은 프로젝트 엔트로피(TODO 누적, bypass 남용, 커버리지 하락)를 자발적으로 추적하지 못한다.
// → 엔트로피 지표를 결정론적으로 수집하여 정리 필요 항목 리스트 생성.
//
// [Exit Protocol]
// exit(0) = 엔트로피 리포트 (stdout JSON)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

const SOURCE_EXTS = ['.js', '.mjs', '.ts', '.tsx', '.jsx'];
const SKIP_DIRS = ['node_modules', '.git', '.harness', 'dist', 'build'];

function scanTodos(dir) {
  const todos = [];
  if (!existsSync(dir)) return todos;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        todos.push(...scanTodos(full));
      } else if (SOURCE_EXTS.includes(extname(entry.name))) {
        try {
          const content = readFileSync(full, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(lines[i])) {
              todos.push({
                file: full.replace(projectDir + '/', ''),
                line: i + 1,
                text: lines[i].trim().slice(0, 120),
              });
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  } catch {
    // skip
  }
  return todos;
}

function countBypassEvents() {
  const eventsDir = resolve(projectDir, '.harness/state/events');
  if (!existsSync(eventsDir)) return 0;

  let count = 0;
  try {
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.jsonl')) continue;
        const content = readFileSync(full, 'utf8');
        for (const line of content.split('\n')) {
          if (line.includes('"bypass"') || line.includes('"bypassed"')) count++;
        }
      }
    };
    walk(eventsDir);
  } catch {
    // skip
  }
  return count;
}

function main() {
  const todos = scanTodos(projectDir);
  const bypassCount = countBypassEvents();

  // coverage 추세 (있으면)
  let coverageDecline = false;
  const trendFiles = [];
  const stateDir = resolve(projectDir, '.harness/state');
  if (existsSync(stateDir)) {
    for (const f of readdirSync(stateDir).filter((f) => f.startsWith('coverage-trend-'))) {
      try {
        const trend = JSON.parse(readFileSync(join(stateDir, f), 'utf8'));
        const h = trend.history || [];
        if (h.length >= 2 && h[h.length - 1].percentage < h[h.length - 2].percentage) {
          coverageDecline = true;
          trendFiles.push(f);
        }
      } catch {
        // skip
      }
    }
  }

  const result = {
    todos: { count: todos.length, items: todos.slice(0, 20) },
    bypass_events: bypassCount,
    coverage_decline: coverageDecline,
    declining_features: trendFiles,
    entropy_score: todos.length + bypassCount * 3 + (coverageDecline ? 10 : 0),
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  process.stderr.write(`entropy-sweep: TODO=${todos.length}, bypass=${bypassCount}, coverage_decline=${coverageDecline}\n`);
  if (result.entropy_score > 20) {
    process.stderr.write('⚠️ 엔트로피 높음 — 정리가 필요합니다.\n');
  }

  process.exit(0);
}

main();
