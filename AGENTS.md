# AGENTS.md

The one source of truth for Claude Code and Codex in this repository. `CLAUDE.md` only imports this file. Skills live in `.agents/skills/` (Codex reads them there); `.claude/skills/*/SKILL.md` are thin pointers to the same files.

## Communication

- Caveman mode (full) by default: no articles, filler or hedging; fragments fine; technical terms and code exact.
- No trailing summaries: the owner reads diffs.
- The owner is visual and not a designer. Show things (a page, a screenshot), don't describe them. Few words, one recommendation, at most three short questions.
- Plan first for anything large; start on the owner's go.

## Product

Cashflow is a behavioural budgeting tool, not an accounting system. Priorities: speed > completeness, clarity > flexibility, predictability > automation.

Scope, in the owner's words: track my money, create budgets, see whether I follow them, a good overview of my transactions, and an overview of our shared account. Automatic and smart: every transaction is clearly shared or personal, and a transfer to the shared account is not personal spending (issue #7). Liking a design is never a request for a feature: build only what the owner asks for.

Rules that must not drift:

- **Transactions come from bank sync.** Keep category corrections and split spending easy. Treat income, transfers and spending as separate movements.
- **Salary cycles** drive analytics and budgets, not calendar months (`src/core/domain/cycles.ts`).
- **Shared fairness** is inferred from top-ups and shared spending, never a typed ratio.
- **AI only assists.** Suggestions never block saving and are never the headline.
- Single base currency per account. Money is integer minor units end to end.

## Stack and direction

- **Cashflow is the native Aura app.** Expo 54 / React Native, Expo Router, TypeScript strict, Supabase JS v2. Use the [iPhone fixture workflow](docs/agents/ios-verification.md) for UI changes.
- pnpm only (`pnpm-lock.yaml`). Run `pnpm lockfile:check` before a PR. Never commit `package-lock.json` or `yarn.lock`.

## Engineering

- TypeScript strict. No `any`, implicit `any`, `@ts-ignore` or unsafe casts.
- Functional components and hooks only. async/await only.
- Flat, obvious structure. Local state first; shared state only when distant screens need it.
- Direct implementation over abstraction: no repository or service layer, event bus, generic form engine or "finance framework". Add a file only when it removes real duplication.
- Controlled inputs on edit flows. Category search instant from prefetched data. No expensive work per keystroke.
- Errors handled explicitly: never an empty `catch` or an ignored `error`. Blocking flows show a clear inline error; a typed amount is never lost.
- Every user-visible fetch has loading, empty and error states.
- Animation never delays input.

## Skill routing

Load only what the task needs; these load on their own when the task matches:

| Task | Skill |
|---|---|
| Any UI: a screen, flow, component, prototype, chart, dashboard, report, money copy, polish, design question | `ui-ux` (`.agents/skills/ui-ux/SKILL.md`) |
| SQL, schema, RLS, indexes, query performance | `supabase-postgres-best-practices` |
| Splitting a diff into commits, when asked | `commit-slices` |
| Native implementation and navigation | `react-native` |
| Simulator verification, state fixtures or screenshots | [iPhone verification](docs/agents/ios-verification.md) |

`frontend-design` and `dataviz` may help explore and draw; they never override `ui-ux`.

## Supabase

- Simple explicit schema and RLS. Query directly from feature code with explicit columns and row types.
- Edge functions only where a secret is needed (`bank-sync`, `bank-consent` in `supabase/functions/`). AI goes through OpenRouter (`OPENROUTER_API_KEY`).
- No RPCs, background jobs or triggers unless truly needed.
- **Migrations are additive only.** Never drop or rewrite data. Timestamped files in `supabase/migrations/`, tested on a local stack first. No remote schema change or edge-function deploy without the owner's go.
- MCP: local, gitignored `.mcp.json` from `.mcp.example.json`. The token comes from `SUPABASE_TOKEN_ACCOUNT2`, exported per repo by direnv (`.envrc`, gitignored); the same account serves `ordly`. Codex reads it via `bearer_token_env_var` in `.codex/config.toml`.
- No secrets in files, commits or output.

## Git and deploy

- Start from `main`, commit in small steps, push, and open a PR to `main`. Merge when the owner says so.
- The owner's uncommitted changes are theirs: never discard, stash away or commit them.

## Design work

- Visual work starts from references and a clickable prototype the owner picks, never from a checklist (`ui-ux/taste.md` § 7).
- Pages for the owner are published artifacts with fake data only. Never put real transactions or anything private on them. Never leave a local preview open in the owner's Chrome.
- Subagents: none by default. Use them only when the owner asks, with a short self-contained brief.

## When unsure

Simpler implementation. Deterministic data. Fewer taps.
