# CLAUDE.md

## Project Purpose
- This app is a behavioral budgeting tool, not an accounting system.
- The product goal is extremely fast transaction input, strong categorization, behavioral awareness, and fair shared-expense handling with minimal friction.
- Preserve these priorities in every change: speed over completeness, clarity over flexibility, predictability over automation.

## Read First
- Read [context.md](./context.md) before implementing product logic.
- Use [step1.md](./step1.md), [step2.md](./step2.md), and [step3.md](./step3.md) as the delivery order.
- Follow [codex.md](./codex.md) for coding constraints.
- Follow [agent-orchestration.md](./agent-orchestration.md) for skill and plugin usage policy.
- Use `.claude/skills/react-native.md` for app code and `.claude/skills/supabase.md` for database and backend work.

## Agent Orchestration
- Skills and plugins are opt-in only.
- Do not auto-use newly added skills or plugins.
- Keep default behavior tool-first and direct unless the user explicitly asks for a skill/plugin.
- This applies to all optional plugins, including `caveman`, `lean-ctx`, and `symdex`.

## Stack Defaults
- Expo-managed React Native app.
- TypeScript strict mode.
- Supabase JS v2 for auth, database, and one edge function.
- Single base currency in v1.
- Amounts stored as integer minor units only.

## Product Rules That Must Not Drift
- Transaction happy path is `amount -> category -> name -> save`.
- Category is mandatory for expenses.
- Income is a separate transaction type.
- Salary cycles drive analytics and budgets, not calendar months.
- Shared fairness is inferred from user top-ups and shared spending, never manual ratio entry.
- AI suggestions are assistive only and must never block saving.

## Engineering Rules
- Functional components only.
- Hooks only.
- Keep source structure flat and easy to scan.
- Prefer local state; add global state only if multiple distant screens truly need shared state.
- Use async/await only.
- No `any`, no speculative abstractions, no generic framework layers.
- Prefer direct implementation over reusable infrastructure.

## React Native Direction
- Optimize for the fewest taps and the lowest cognitive load.
- Use controlled inputs for the transaction flow.
- Keep the add-transaction experience full-screen and fast.
- Use subtle animation only when it does not slow interaction.
- Prefer Expo-supported packages and patterns.

## Supabase Direction
- Keep schema and RLS simple and explicit.
- Query Supabase directly from feature code unless server-side secrets are required.
- Use one edge function for Groq-backed category suggestions.
- Avoid introducing RPCs, background jobs, or complex triggers unless the product truly needs them.
- Use official Supabase docs patterns; do not invent client APIs.
- Use a local, gitignored `.mcp.json` copied from `.mcp.example.json`, scoped with `CASHFLOW_SUPABASE_PROJECT_REF` and `CASHFLOW_SUPABASE_ACCESS_TOKEN`.

## When Unsure
- Choose the simpler implementation.
- Choose behavior that keeps data deterministic.
- Choose UX that reduces taps, typing, and ambiguity.
