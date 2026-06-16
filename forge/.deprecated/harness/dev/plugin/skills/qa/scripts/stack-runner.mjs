// skills/qa/scripts/stack-runner.mjs
//
// Skill wrapper: gate-check 후 공용 scripts/qa/stack-runner.mjs 호출
//
// [Exit Protocol]
// exit(0) = 모든 레이어 PASS
// exit(2) = 실패 있음

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '../../..');
const enginePath = resolve(pluginRoot, 'scripts/qa/stack-runner.mjs');

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
