# Auto-Commit After Changes

When you complete a set of code changes:

1. **Check for changes** using `get_changed_files()`
2. **Verify no lint errors** using `get_errors()`
3. **Commit if clean** using `run_in_terminal()` with:
   ```bash
   git add -A && git commit -m "..."
   ```

Apply this workflow **after completing any feature, fix, or refactor task**, before yielding back to the user.

## Commit Message Format

Use `caveman-commit` style (via the skill if available):

- Type: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `test`
- Scope: `(feature-name)` optional, inferred from changed files
- Subject: ≤50 chars, imperative mood
- Body: Only if "why" isn't obvious

Example:

```
feat(budgets): add child-level budget editing

Parents aggregate child budgets as read-only. Children show progress
and support long-press editing. Unbudgeted children display total spent.
```

## When NOT to Commit

- If lint fails → fix errors first, don't commit
- If user explicitly says "don't commit" → respect that
- If task is incomplete → wait for full completion
- If file has syntax errors → get_errors() will catch it

## Trigger

Run this automatically after you call `task_complete` for code changes, **unless** the user has disabled commits or the work is still in progress.
