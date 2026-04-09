#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const roots = [
  path.join(process.cwd(), 'app'),
  path.join(process.cwd(), 'src'),
  path.join(process.cwd(), 'supabase', 'functions'),
];

const patterns = [
  {
    label: 'raw void async call',
    regex: /\bvoid\s+(?:\(|[A-Za-z_$])/,
  },
  {
    label: 'silent catch callback',
    regex: /\.catch\(\s*\(\s*\)\s*=>/,
  },
  {
    label: 'react-hooks suppression',
    regex: /eslint-disable-next-line react-hooks\/exhaustive-deps/,
  },
];

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!/\.(cjs|mjs|js|jsx|ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
};

const relative = (filePath) => path.relative(process.cwd(), filePath);

const findings = [];

for (const filePath of roots.flatMap(walk)) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  patterns.forEach(({ label, regex }) => {
    lines.forEach((line, index) => {
      if (regex.test(line)) {
        findings.push(`${label}: ${relative(filePath)}:${index + 1}`);
      }
    });
  });

  if (lines.length > 400) {
    findings.push(`large file (${lines.length} lines): ${relative(filePath)}`);
  }
}

if (findings.length === 0) {
  console.log('No configured smells found.');
  process.exit(0);
}

console.log(findings.join('\n'));
