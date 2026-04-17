# Auto-Commit After Changes

Copilot workflow: Automatically commit after completing code changes.

## Workflow

When you complete a set of code changes:

1. **Check for changes** using `get_changed_files()`
2. **Verify no lint errors** using `get_errors()`
3. **Commit if clean** using `run_in_terminal()` with:
   ```bash
   git add -A && git commit -m "..."
   ```

Apply this **after completing any feature, fix, or refactor task**, before calling `task_complete()`.

## Commit Message Format

Use caveman-commit style (terse, conventional format):

- Type: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `test`
- Scope: `(feature-name)` optional
- Subject: ≤50 chars, imperative mood
- Body: Only if "why" isn't obvious

Example:

```
feat(budgets): add child-level budget editing

Parents aggregate child budgets as read-only. Children show progress
and support long-press editing. Unbudgeted children display total spent.
```

## Guard Clauses

- If lint fails → fix errors first, don't commit
- If user says "don't commit" → respect that
- If task is incomplete → wait for full completion
- If syntax errors exist → `get_errors()` will catch it
