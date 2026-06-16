// skills/qa/scripts/coverage-trend.mjs
//
// Skill wrapper: 공용 scripts/qa/coverage-trend.mjs 호출
//
// [Exit Protocol]
// exit(0) = trend 리포트 생성

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '../../..');
const enginePath = resolve(pluginRoot, 'scripts/qa/coverage-trend.mjs');

try {
  const stdout = execFileSync('node', [enginePath], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  process.stdout.write(stdout);
  process.exit(0);
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  process.exit(e.status || 1);
}
