// skills/migrate/scripts/detect-stack.mjs
//
// [Model Limit Assumption]
// LLM은 프로젝트 스택을 추정할 수 있으나 일관성이 없다.
// → 매니페스트 파일 기반으로 언어/프레임워크를 결정론적으로 감지.
//
// [Exit Protocol]
// exit(0) = 스택 정보 (stdout JSON)
// exit(1) = 런타임 에러

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';

// 언어 감지 — 매니페스트 파일 기반
const LANGUAGE_MARKERS = [
  { file: 'package.json', lang: 'javascript' },
  { file: 'tsconfig.json', lang: 'typescript' },
  { file: 'requirements.txt', lang: 'python' },
  { file: 'setup.py', lang: 'python' },
  { file: 'pyproject.toml', lang: 'python' },
  { file: 'go.mod', lang: 'go' },
  { file: 'Cargo.toml', lang: 'rust' },
  { file: 'Gemfile', lang: 'ruby' },
  { file: 'pom.xml', lang: 'java' },
  { file: 'build.gradle', lang: 'java' },
];

// 프레임워크 감지 — package.json dependencies 또는 파일 패턴
const FRAMEWORK_MARKERS = {
  javascript: [
    { dep: 'express', fw: 'express' },
    { dep: 'fastify', fw: 'fastify' },
    { dep: 'koa', fw: 'koa' },
    { dep: 'next', fw: 'nextjs' },
    { dep: 'react', fw: 'react' },
    { dep: 'vue', fw: 'vue' },
    { dep: 'svelte', fw: 'svelte' },
    { dep: 'nest', fw: 'nestjs' },
    { dep: '@nestjs/core', fw: 'nestjs' },
  ],
  typescript: [
    { dep: 'next', fw: 'nextjs' },
    { dep: '@nestjs/core', fw: 'nestjs' },
    { dep: 'express', fw: 'express' },
  ],
  python: [
    { dep: 'flask', fw: 'flask' },
    { dep: 'django', fw: 'django' },
    { dep: 'fastapi', fw: 'fastapi' },
  ],
};

function detectLanguage() {
  const detected = [];
  for (const marker of LANGUAGE_MARKERS) {
    if (existsSync(resolve(projectDir, marker.file))) {
      detected.push(marker.lang);
    }
  }
  // tsconfig.json이 있으면 typescript 우선
  if (detected.includes('typescript')) return 'typescript';
  return detected[0] || 'unknown';
}

function detectFramework(lang) {
  const markers = FRAMEWORK_MARKERS[lang] || [];

  if (lang === 'javascript' || lang === 'typescript') {
    const pkgPath = resolve(projectDir, 'package.json');
    if (!existsSync(pkgPath)) return 'unknown';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const m of markers) {
        if (allDeps[m.dep]) return m.fw;
      }
    } catch {
      return 'unknown';
    }
  }

  if (lang === 'python') {
    const reqPath = resolve(projectDir, 'requirements.txt');
    if (existsSync(reqPath)) {
      const content = readFileSync(reqPath, 'utf8').toLowerCase();
      for (const m of markers) {
        if (content.includes(m.dep)) return m.fw;
      }
    }
  }

  return 'unknown';
}

function countFiles() {
  let count = 0;
  const skip = ['node_modules', '.git', '.harness', 'dist', 'build', '__pycache__'];
  const walk = (dir) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skip.includes(entry.name)) continue;
        if (entry.isDirectory()) walk(resolve(dir, entry.name));
        else count++;
      }
    } catch { /* skip */ }
  };
  walk(projectDir);
  return count;
}

function detectTestPresence() {
  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  for (const d of testDirs) {
    if (existsSync(resolve(projectDir, d))) return { present: true, dir: d };
  }
  // test files in root
  try {
    const rootFiles = readdirSync(projectDir);
    const testFiles = rootFiles.filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f));
    if (testFiles.length > 0) return { present: true, dir: '.' };
  } catch { /* skip */ }
  return { present: false, dir: null };
}

function main() {
  const language = detectLanguage();
  const framework = detectFramework(language);
  const fileCount = countFiles();
  const tests = detectTestPresence();

  const result = {
    language,
    framework,
    file_count: fileCount,
    tests,
    has_package_json: existsSync(resolve(projectDir, 'package.json')),
    has_git: existsSync(resolve(projectDir, '.git')),
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.stderr.write(`detect-stack: ${language}/${framework}, ${fileCount} files, tests=${tests.present}\n`);
  process.exit(0);
}

main();
