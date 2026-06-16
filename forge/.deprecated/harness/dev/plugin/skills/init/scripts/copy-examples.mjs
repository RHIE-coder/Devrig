// skills/init/scripts/copy-examples.mjs
//
// [Model Limit Assumption]
// LLM은 example 파일을 올바른 위치에 복사하지 못할 수 있다.
// → 결정론적으로 examples/ → 프로젝트 루트에 복사.
//
// [Exit Protocol]
// exit(0) = 복사 완료 (또는 skip)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '../../..');
const skipCopy = process.env.HARNESS_SKIP_EXAMPLES === 'true';

function main() {
  if (skipCopy) {
    process.stderr.write('copy-examples: skip (HARNESS_SKIP_EXAMPLES=true)\n');
    process.exit(0);
  }

  const examplesDir = resolve(pluginRoot, 'skills/init/examples');
  if (!existsSync(examplesDir)) {
    process.stderr.write('copy-examples: examples/ 없음 — skip\n');
    process.exit(0);
  }

  const copied = [];
  const skipped = [];

  function copyTree(srcDir, destDir) {
    const entries = readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      if (entry.isDirectory()) {
        const destSubDir = join(destDir, entry.name);
        mkdirSync(destSubDir, { recursive: true });
        copyTree(srcPath, destSubDir);
      } else {
        // .example 확장자 제거
        const destName = entry.name.replace(/\.example$/, '');
        const destPath = join(destDir, destName);

        if (existsSync(destPath)) {
          skipped.push(relative(projectDir, destPath));
        } else {
          const content = readFileSync(srcPath, 'utf8');
          mkdirSync(dirname(destPath), { recursive: true });
          writeFileSync(destPath, content, 'utf8');
          copied.push(relative(projectDir, destPath));
        }
      }
    }
  }

  copyTree(examplesDir, projectDir);

  const result = { copied, skipped };
  if (copied.length > 0) {
    process.stderr.write(`copy-examples: ${copied.length}개 복사 완료\n`);
  }
  if (skipped.length > 0) {
    process.stderr.write(`copy-examples: ${skipped.length}개 이미 존재 — skip\n`);
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main();
