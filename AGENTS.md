# AGENTS.md

## Communication
- Use caveman mode (full) by default. Drop articles, filler, hedging. Fragments OK. Technical terms exact. Code unchanged.
- No trailing summaries — user reads diffs.

## Project Purpose
- Behavioral budgeting tool, not accounting system.
- Priorities: speed > completeness, clarity > flexibility, predictability > automation.

## Read First
- [context.md](./context.md) for product logic.
- [step1.md](./step1.md), [step2.md](./step2.md), [step3.md](./step3.md) for delivery order.
- [codex.md](./codex.md) for coding constraints.
- [agent-orchestration.md](./agent-orchestration.md) for skill/plugin policy.
- `.Codex/skills/react-native.md` for app code, `.Codex/skills/supabase.md` for DB/backend.

## Agent Orchestration
- Skills and plugins opt-in only. Do not auto-use newly added ones.
- Default behavior: tool-first, direct, unless user explicitly asks for skill/plugin.

## Stack
- Expo-managed React Native, TypeScript strict, Supabase JS v2.
- Single base currency v1. Amounts = integer minor units.

## Product Rules (must not drift)
- Transaction path: amount -> category -> name -> save.
- Category mandatory for expenses. Income = separate type.
- Salary cycles drive analytics/budgets, not calendar months.
- Shared fairness inferred from topups + shared spending, never manual ratio.
- AI suggestions assistive only, never block saving.

## Engineering
- Functional components + hooks only. No class components.
- Flat source structure. Local state preferred; global only when distant screens need shared state.
- async/await only. No `any`, no speculative abstractions, no generic framework layers.
- Prefer direct implementation over reusable infrastructure.

## React Native
- Fewest taps, lowest cognitive load. Controlled inputs for transaction flow.
- Full-screen fast add-transaction. Subtle animation only if no interaction delay.
- Prefer Expo-supported packages.

## Supabase
- Simple explicit schema + RLS. Query directly from feature code.
- One edge function for Groq category suggestions.
- No RPCs/background jobs/complex triggers unless truly needed.
- Local gitignored `.mcp.json` from `.mcp.example.json` with `CASHFLOW_SUPABASE_PROJECT_REF` and `CASHFLOW_SUPABASE_ACCESS_TOKEN`.

## When Unsure
- Simpler implementation. Deterministic data. Fewer taps.
