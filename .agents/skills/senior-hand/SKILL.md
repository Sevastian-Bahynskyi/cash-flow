---
name: senior-hand
description: Conservative modernization orchestrator for React Native and TypeScript repositories. Use when Codex needs to reduce code smells, tighten error handling, add or enforce lint rules, split large cleanup work into safe slices, improve hook usage, or modernize existing code without introducing speculative architecture.
---

# Senior Hand

## Overview

Modernize the repo conservatively. Scan first, group findings into a few safe slices, implement one slice at a time, and validate after each slice so quality improves without losing the existing product shape.

Open [references/refactor-policy.md](./references/refactor-policy.md) before changing architecture. Open [references/smell-checklist.md](./references/smell-checklist.md) when triaging debt or choosing the next slice.

## Workflow

1. Scan before editing.
2. Group the work into 2-5 safe slices.
3. Modernize one slice at a time.
4. Run `pnpm lint:changed` after each slice and `pnpm typecheck` whenever TypeScript or config changed.
5. Summarize remaining debt, not only completed edits.

## Scan First

Start with repo truth, not assumptions:

- Run `pnpm scan:smells` for a fast smell inventory.
- Read the affected files before proposing extraction or reuse.
- Check whether the issue is local duplication, mixed responsibilities, promise handling, or missing user-visible error states.
- Prefer small direct fixes over framework layers.

## Slice Work Safely

Use slices that can be reviewed and validated independently:

- one screen or hook family
- one async or error-handling path
- one lint-policy adoption step
- one duplicated pattern that can be extracted without broad fallout

Do not mix architecture reshaping, UI redesign, and data flow changes in the same slice unless they are tightly coupled.

## Refactor Rules

- Preserve flat feature folders and direct Supabase access.
- Extract hooks only when logic is reused or a screen mixes unrelated responsibilities.
- Prefer tiny focused helpers over generic infrastructure.
- Replace swallowed failures with either a clear user-facing error state or `reportDevError(...)` plus a documented safe fallback.
- Replace raw `void someAsync()` in app code with `runDetached(...)` or `await`.
- Do not add repository layers, service layers, or speculative abstractions.

## Validation Rules

- Treat lint and typecheck as part of the slice, not a later cleanup.
- If `react-hooks/exhaustive-deps` warns, either fix the dependency story or leave an intentional, justified suppression.
- If a non-blocking async flow falls back safely, make the fallback explicit and log enough development detail to debug it.
- Keep the diff understandable for another engineer scanning the repo quickly.

## Companion Skills

- After editing multiple TSX files, run `react-best-practices` for a React-specific review pass.
- For network, cache, and async data-loading slices, follow Expo-native data-fetching guidance if the Expo skill pack is available in the environment.
- Keep `senior-hand` as the orchestrator. Use companion skills to sharpen a slice, not to replace the conservative modernization workflow.

## Example Prompts

- `Use $senior-hand to modernize overview loading and error handling.`
- `Use $senior-hand to reduce hook smells in transaction flows without changing product behavior.`
- `Use $senior-hand to add staged lint enforcement for promise handling and swallowed errors.`
