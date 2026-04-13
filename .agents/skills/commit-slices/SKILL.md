---
name: commit-slices
description: Split current workspace changes into N coherent commits with optional extra instructions (include/exclude paths, message style, restore paths).
---

# Commit Slices

Use this skill to turn the current git diff into a small sequence of clean commits.

## Inputs

- `commit_count` (required): number of commits to create from the current working tree.
- `additional_instructions` (optional): extra constraints such as:
  - restore specific files before committing
  - include or exclude certain paths
  - preferred commit message style
  - ordering hints for commit topics

## Workflow

1. Inspect current state.

- Run `git status --short` and `git log --oneline -10`.
- If requested, restore files first (example: `git restore --staged --worktree <path>`).

2. Partition changes into `commit_count` coherent slices.

- Group by behavior, not by file type.
- Keep each commit reviewable and independent.
- Do not mix unrelated concerns when avoidable.

3. Create commits in order.

- Stage only files for the current slice.
- Commit with concise conventional-style messages.
- Repeat until all requested commits are created.

4. Verify and report.

- Run `git status --short` and `git log --oneline -<commit_count+3>`.
- Report created commit hashes and any intentionally uncommitted leftovers.

## Safety Rules

- Never use destructive commands like `git reset --hard`.
- Do not revert unrelated user changes unless explicitly requested.
- Avoid committing ephemeral/editor artifacts unless explicitly requested:
  - `.codex/`
  - `.cursor/`
  - `supabase/.temp/`

## Output Contract

Return:

- list of created commits (hash + subject)
- list of remaining modified/untracked files (if any)
- note of any requested restores that were applied
