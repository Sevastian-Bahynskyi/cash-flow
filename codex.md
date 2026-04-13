# Codex Rules

## Agent Orchestration
- Follow [agent-orchestration.md](./agent-orchestration.md) before deciding to use skills or plugins.
- Skills and plugins are opt-in only; do not auto-use them.
- Keep default behavior direct and local unless the user explicitly asks for specialized orchestration.
- This includes optional plugins such as `caveman`, `lean-ctx`, and `symdex`.

## Core Rules
- Use TypeScript `strict` everywhere.
- Do not use `any`, implicit `any`, or unsafe casts.
- Keep the project structure flat and obvious.
- Add files only when they remove real duplication.
- Prefer direct implementation over reusable abstractions.

## React Native
- Use functional components only.
- Use hooks only.
- Keep state local unless two or more distant screens truly need shared state.
- Use controlled inputs for all form fields.
- Use async/await only.

## Supabase
- Query Supabase directly from feature code.
- Use explicit row and DTO types for every query result.
- Keep SQL and RLS rules simple and readable.
- Store money as integer minor units, never floats.

## Architecture
- No repository layer.
- No service layer unless required for secret handling.
- No event bus, plugin system, or generic form engine.
- No speculative extensibility.
- No generic “finance framework” abstractions.

## UX Priorities
- Optimize transaction entry for speed first.
- Category selection must be fast and mandatory.
- Default flows must minimize taps and typing.
- Animations must never delay interaction.

## Error Handling
- Always handle errors explicitly.
- Never swallow errors with an empty `catch`, silent `return null`, or ignored `error` value.
- For non-blocking flows, log enough detail in development to debug the failure and return a safe fallback.
- For blocking flows, surface a clear user-facing error state instead of failing silently.

## Forbidden
- Overengineering.
- Unnecessary indirection.
- Premature optimization.
- Abstract base components without duplication pressure.
- Config-heavy patterns that hide behavior.
