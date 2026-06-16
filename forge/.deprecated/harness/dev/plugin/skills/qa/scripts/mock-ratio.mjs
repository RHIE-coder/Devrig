// skills/qa/scripts/mock-ratio.mjs
//
// Skill wrapper: 공용 scripts/qa/mock-ratio.mjs 호출
//
// [Exit Protocol]
// exit(0) = mock_guard 통과
// exit(2) = mock_guard 위반 (strict_lower_real)

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '../../..');
const enginePath = resolve(pluginRoot, 'scripts/qa/mock-ratio.mjs');

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
