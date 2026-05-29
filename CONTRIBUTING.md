# Contributing

## Dependencies

Use pnpm for all dependency changes.

- Add packages with `pnpm add <package>`.
- Remove packages with `pnpm remove <package>`.
- After editing dependency fields manually, run `pnpm install`.
- Before opening a PR, run `pnpm lockfile:check`.

Do not commit `package-lock.json` or `yarn.lock`. `pnpm-lock.yaml` is the only dependency lockfile for this repo.
