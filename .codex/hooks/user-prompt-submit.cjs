#!/usr/bin/env node

process.stdin.resume();
process.stdin.setEncoding('utf8');

let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  if (input.trim().length > 0) {
    JSON.parse(input);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          'For modernization work in this repo: scan first, keep architecture conservative, preserve flat feature structure and direct Supabase access, extract hooks only when reuse or mixed responsibilities justify it, replace swallowed errors with clear user states or reportDevError(...), prefer runDetached(...) over raw void async calls, and validate each safe slice with pnpm lint:changed plus pnpm typecheck when TypeScript or config changed.',
      },
    }),
  );
});
