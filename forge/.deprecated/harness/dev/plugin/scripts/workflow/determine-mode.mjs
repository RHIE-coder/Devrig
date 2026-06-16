// scripts/workflow/determine-mode.mjs
//
// [Model Limit Assumption]
// LLM은 세션의 의도(standard/prototype/explore)를 일관되게 판단하지 못한다.
// → opt-in 시 SessionStart에서 config 기반으로 mode를 결정론적으로 판정.
//
// [Exit Protocol]
// exit(0) = mode 판정 완료 또는 skip (stdout으로 결과 JSON)
// exit(1) = 런타임 에러

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const workflowPath = resolve(projectDir, '.harness/state/workflow.json');
const configPath = resolve(projectDir, '.harness/config.yaml');

/**
 * config.yaml에서 mode 설정을 추출 (간이 YAML 파서 — mode: 값만 필요)
 */
function readModeFromConfig() {
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, 'utf8');
    // mode: auto | standard | prototype | explore
    const match = raw.match(/^\s*mode:\s*(\S+)/m);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function main() {
  // .harness/ 미존재 → skip
  if (!existsSync(resolve(projectDir, '.harness'))) {
    process.exit(0);
  }

  const configMode = readModeFromConfig();

  // opt-in 아닌 경우 (mode 미설정 또는 auto가 아닌 명시 모드)
  if (!configMode || configMode === 'auto') {
    // auto 모드: 현재 Phase에서는 classifier 미구현
    // → default standard로 설정
    if (configMode === 'auto') {
      process.stderr.write('determine-mode: auto classifier 미구현 — standard 기본 적용\n');
    }
    // mode 설정이 없으면 기존 모드 유지 → skip
    if (!configMode) {
      process.exit(0);
    }
  }

  // workflow.json에 mode 반영
  if (!existsSync(workflowPath)) {
    process.exit(0);
  }

  try {
    const raw = readFileSync(workflowPath, 'utf8');
    const workflow = JSON.parse(raw);

    const targetMode = configMode === 'auto' ? 'standard' : configMode;
    const validModes = ['standard', 'prototype', 'explore'];

    if (!validModes.includes(targetMode)) {
      process.stderr.write(`determine-mode: 유효하지 않은 mode "${targetMode}" — standard 적용\n`);
      workflow.session.mode = 'standard';
    } else {
      workflow.session.mode = targetMode;
    }

    workflow.last_updated = new Date().toISOString();
    writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');

    // stdout에 결과 출력
    const result = {
      mode: workflow.session.mode,
      source: configMode === 'auto' ? 'auto(default)' : 'config',
    };
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (e) {
    process.stderr.write(`determine-mode: ${e.message}\n`);
    process.exit(1);
  }

  process.exit(0);
}

main();
