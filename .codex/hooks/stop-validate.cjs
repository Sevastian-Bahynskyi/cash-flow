#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');

const readStdin = async () =>
  new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      resolve(input);
    });
    process.stdin.on('error', reject);
  });

const runGit = (cwd, args) => {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const getChangedFiles = (cwd) => {
  const tracked = runGit(cwd, ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD', '--']);
  const untracked = runGit(cwd, ['ls-files', '--others', '--exclude-standard']);

  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')].filter(Boolean))];
};

const hasValidationRelevantChanges = (files) =>
  files.some((file) =>
    /(^|\/)(app|src|scripts|\.codex\/hooks)\/.*\.(cjs|mjs|js|jsx|ts|tsx)$/.test(file)
    || /(^|\/)(eslint\.config\.js|package\.json|pnpm-lock\.yaml|tsconfig\.json)$/.test(file),
  );

const hasTypecheckRelevantChanges = (files) =>
  files.some((file) =>
    /\.(ts|tsx)$/.test(file)
    || /(^|\/)(package\.json|pnpm-lock\.yaml|tsconfig\.json)$/.test(file),
  );

const summarizeOutput = (result) => {
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return combined.slice(-12).join('\n');
};

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
};

const main = async () => {
  const rawInput = await readStdin();
  const payload = rawInput.trim().length > 0 ? JSON.parse(rawInput) : {};

  if (payload.stop_hook_active) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const cwd = payload.cwd || process.cwd();
  const repoRoot = runGit(cwd, ['rev-parse', '--show-toplevel']) || cwd;
  const changedFiles = getChangedFiles(repoRoot);

  if (!hasValidationRelevantChanges(changedFiles)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const lintResult = spawnSync('pnpm', ['lint:changed'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (lintResult.status !== 0) {
    block(
      `Run one more pass over the lint failures from \`pnpm lint:changed\` and then finish the task.\n\n${summarizeOutput(lintResult)}`,
    );
    return;
  }

  if (!hasTypecheckRelevantChanges(changedFiles)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const typecheckResult = spawnSync('pnpm', ['typecheck'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (typecheckResult.status !== 0) {
    block(
      `Run one more pass over the typecheck failures from \`pnpm typecheck\` and then finish the task.\n\n${summarizeOutput(typecheckResult)}`,
    );
    return;
  }

  process.stdout.write(JSON.stringify({ continue: true }));
};

main().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `The staged validation hook crashed. Fix the hook or the validation command before finishing.\n\n${error instanceof Error ? error.message : String(error)}`,
    }),
  );
});
