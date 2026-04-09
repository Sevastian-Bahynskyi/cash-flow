#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const baselinePath = path.join(process.cwd(), '.codex', 'validation-baseline.json');

const runGit = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const tracked = runGit(['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD', '--']);
const untracked = runGit(['ls-files', '--others', '--exclude-standard']);
const ignoredFiles = fs.existsSync(baselinePath)
  ? new Set(JSON.parse(fs.readFileSync(baselinePath, 'utf8')).ignored_files ?? [])
  : new Set();

const files = [...new Set([...tracked.split('\n'), ...untracked.split('\n')].filter(Boolean))].filter((file) =>
  /\.(cjs|mjs|js|jsx|ts|tsx)$/.test(file) && !ignoredFiles.has(file),
);

if (files.length === 0) {
  console.log('No changed lintable files outside the staged validation baseline.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', ...files], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
