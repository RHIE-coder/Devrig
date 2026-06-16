// skills/qa/scripts/attribution.mjs
//
// Skill wrapper: 공용 scripts/qa/attribution.mjs 호출
//
// [Exit Protocol]
// exit(0) = 귀인 리포트 생성

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '../../..');
const enginePath = resolve(pluginRoot, 'scripts/qa/attribution.mjs');

try {
  const stdout = execFileSync('node', [enginePath], {
    env: process.env,
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  process.stdout.write(stdout);
  process.exit(0);
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  process.exit(e.status || 1);
}
