# Supabase Skill — Cash Flow

## Project Posture
- Keep Supabase usage direct, explicit, and boring.
- Favor simple tables, simple RLS, and direct client queries.
- This project is greenfield, so do not add complexity for future scenarios we do not have yet.
- Use the repo-local MCP config in `.mcp.json`, with `CASHFLOW_SUPABASE_PROJECT_REF` and `CASHFLOW_SUPABASE_ACCESS_TOKEN` so this project stays isolated from any other Supabase setup.

## Core Rules
- Use official `@supabase/supabase-js` v2 patterns.
- Query tables directly from feature code when secrets are not involved.
- Use explicit selected columns and explicit result types.
- Store money as integer minor units, never floats.
- Keep migrations readable and deterministic.

## What To Verify
- If the schema already exists, inspect the current tables and policies before changing them.
- If the schema does not exist yet, write the simplest migration that matches `context.md` and the step docs.
- Re-check details when working on RLS, foreign keys, indexes, or edge functions.
- Do not block simple feature work on excessive schema ceremony.
- The access token determines which organizations are reachable; the project ref in `.mcp.json` is what scopes this repo to the intended Supabase project.

## Types
- Prefer generated Supabase types if the project sets them up.
- If generated types are not available yet, use small explicit DTOs and row shapes locally.
- Do not introduce giant hand-maintained type layers.

## Migration Conventions
- Put migrations in `supabase/migrations/`.
- Use timestamped filenames.
- Prefer additive changes.
- Do not drop tables or columns unless explicitly requested.
- Keep constraints close to the data rules from `context.md`.

## RLS Guidance
- Start with simple owner-scoped policies: users can read and write only their own rows.
- Avoid clever policy logic in v1.
- Use service-role access only inside edge functions when a secret or privileged operation truly requires it.
- Do not move normal app logic into the database just because it is possible.

## Edge Functions
- Use edge functions only when the client must not hold a secret.
- In this project, the primary edge function is `suggest-category` for Groq-backed categorization.
- Keep edge functions small, typed, and easy to trace.
- Return structured JSON and clear error states.

## Query Guidance
- Prefer straightforward `select`, `insert`, `update`, and `delete` calls.
- Avoid RPCs unless they remove real duplication or enforce an important server-side rule.
- Keep filtering and ordering explicit.
- Never hide important business logic behind a generic database helper layer.

## Project-Specific Reminders
- Expenses require categories.
- Income is separate from expenses.
- Salary cycles drive analytics and budgets.
- Shared ratios are derived from top-ups and shared expenses, not manual input.
- AI suggestions must not block transaction creation.
