// skills/ux/scripts/check-accessibility.mjs
//
// [Model Limit Assumption]
// LLM은 접근성 요구사항을 간과할 수 있다.
// → Spec AC에서 UI 관련 항목을 추출하고 WCAG 2.1 접근성 키워드를 결정론적으로 검사.
//
// [Exit Protocol]
// exit(0) = 접근성 리포트 (stdout JSON)
// exit(1) = 런타임 에러

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
const featureName = process.env.HARNESS_FEATURE || '';
const platform = process.env.HARNESS_PLATFORM || 'web';

const WCAG_CHECKS = [
  { id: 'contrast', pattern: /색상|color|contrast|대비/i, desc: 'WCAG 1.4.3: 텍스트 대비 비율 4.5:1 이상' },
  { id: 'keyboard', pattern: /키보드|keyboard|tab|focus/i, desc: 'WCAG 2.1.1: 모든 기능 키보드 접근 가능' },
  { id: 'alt-text', pattern: /이미지|image|img|아이콘|icon/i, desc: 'WCAG 1.1.1: 모든 이미지에 대체 텍스트' },
  { id: 'form-label', pattern: /폼|form|입력|input|label/i, desc: 'WCAG 1.3.1: 모든 입력 필드에 레이블' },
  { id: 'aria', pattern: /모달|modal|dialog|드롭다운|dropdown|팝업|popup/i, desc: 'WCAG 4.1.2: ARIA 역할 및 상태' },
  { id: 'motion', pattern: /애니메이션|animation|transition|모션/i, desc: 'WCAG 2.3.3: 모션 비활성화 옵션' },
];

function findSpec() {
  if (!featureName) return null;
  const parts = featureName.split('/');
  const candidates = [
    resolve(projectDir, '.harness/specs', ...parts.slice(0, -1), `${parts[parts.length - 1]}.spec.yaml`),
    resolve(projectDir, '.harness/specs', `${featureName.replace(/\//g, '-')}.spec.yaml`),
  ];
  return candidates.find(existsSync) || null;
}

function main() {
  if (!featureName) {
    process.stderr.write('check-accessibility: HARNESS_FEATURE 필요\n');
    process.exit(1);
  }

  const specPath = findSpec();
  if (!specPath) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'no spec' }) + '\n');
    process.exit(0);
  }

  const specContent = readFileSync(specPath, 'utf8');
  const findings = [];

  for (const check of WCAG_CHECKS) {
    if (check.pattern.test(specContent)) {
      findings.push({
        id: check.id,
        desc: check.desc,
        relevant: true,
      });
    }
  }

  const result = {
    feature: featureName,
    platform,
    wcag_checks: findings,
    findings_count: findings.length,
    has_ui_elements: findings.length > 0,
  };

  process.stdout.write(JSON.stringify(result) + '\n');

  if (findings.length > 0) {
    process.stderr.write(`ux: ${findings.length}건 WCAG 관련 항목:\n`);
    for (const f of findings) {
      process.stderr.write(`  - ${f.id}: ${f.desc}\n`);
    }
  }

  process.exit(0);
}

main();
