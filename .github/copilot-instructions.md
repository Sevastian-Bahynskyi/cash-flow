# Copilot Instructions

## Auto-Commit After Changes

After completing code changes, automatically commit if no lint errors exist.

See `.github/instructions/auto-commit.md` for full workflow details.

**Quick checklist:**

1. Check for changes via `get_changed_files()`
2. Verify no lint errors via `get_errors()`
3. Commit with caveman-style message if clean
4. Do this before calling `task_complete()` for code work

Guard clauses:

- Skip if user says "don't commit"
- Skip if lint fails (user must fix first)
- Skip if task incomplete
