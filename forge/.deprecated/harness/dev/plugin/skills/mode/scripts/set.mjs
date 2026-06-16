// skills/mode/scripts/set.mjs
//
// [Model Limit Assumption]
// LLM은 mode 전환 시 유효성 검증 없이 임의 값을 설정할 수 있다.
// → 허용 mode 목록을 결정론적으로 검증, workflow.json 갱신.
//
// [Exit Protocol]
// exit(0) = mode 전환 완료 (stdout JSON)
// exit(2) = 유효하지 않은 mode
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const targetMode = process.env.HARNESS_MODE || '';

const VALID_MODES = ['standard', 'prototype', 'explore'];

function main() {
  const harnessDir = resolve(projectDir, '.harness');
  if (!existsSync(harnessDir)) {
    process.stderr.write('mode set: .harness/ 미초기화. /harness:init 을 먼저 실행하세요.\n');
    process.exit(1);
  }

  if (!targetMode) {
    process.stderr.write('mode set: HARNESS_MODE 환경변수 필요 (standard | prototype | explore)\n');
    process.exit(1);
  }

  const mode = targetMode.toLowerCase();

  if (mode === 'auto') {
    process.stderr.write('⛔ mode set: "auto"는 수동 설정 불가. SessionStart의 determine-mode.mjs 전용.\n');
    process.exit(2);
  }

  if (!VALID_MODES.includes(mode)) {
    process.stderr.write(`⛔ mode set: 유효하지 않은 mode "${mode}". 허용: ${VALID_MODES.join(', ')}\n`);
    process.exit(2);
  }

  const wfPath = resolve(projectDir, '.harness/state/workflow.json');
  if (!existsSync(wfPath)) {
    process.stderr.write('mode set: workflow.json 없음. /harness:init 을 먼저 실행하세요.\n');
    process.exit(1);
  }

  try {
    const workflow = JSON.parse(readFileSync(wfPath, 'utf8'));
    const prevMode = workflow.session?.mode || 'standard';

    if (!workflow.session) workflow.session = {};
    workflow.session.mode = mode;
    workflow.session.mode_source = 'manual';
    workflow.last_updated = new Date().toISOString();

    writeFileSync(wfPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');

    // config.yaml mode와 다를 경우 경고
    const cfgPath = resolve(projectDir, '.harness/config.yaml');
    let configMode = null;
    if (existsSync(cfgPath)) {
      const raw = readFileSync(cfgPath, 'utf8');
      const match = raw.match(/^\s*mode:\s*(\S+)/m);
      configMode = match ? match[1].toLowerCase() : null;
    }

    if (configMode && configMode !== 'auto' && configMode !== mode) {
      process.stderr.write(`⚠️ config.yaml의 mode(${configMode})와 다릅니다. 수동 설정이 우선 적용됩니다.\n`);
    }

    const result = {
      previous: prevMode,
      current: mode,
      source: 'manual',
      config_mode: configMode,
    };

    process.stdout.write(JSON.stringify(result) + '\n');
    process.stderr.write(`✅ mode 전환: ${prevMode} → ${mode}\n`);
  } catch (e) {
    process.stderr.write(`mode set: ${e.message}\n`);
    process.exit(1);
  }

  process.exit(0);
}

main();
