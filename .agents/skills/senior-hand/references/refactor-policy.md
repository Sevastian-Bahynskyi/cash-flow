# Refactor Policy

## Keep The Shape Conservative

- Preserve the flat feature structure.
- Keep Supabase access direct and explicit.
- Use hooks only when reuse is real or a screen mixes distinct responsibilities.
- Prefer local state unless distant screens genuinely share the same state.

## Ban Speculative Architecture

- Do not add repository layers.
- Do not add service layers unless secrets require them.
- Do not add generic framework wrappers to hide direct behavior.
- Do not introduce abstractions before duplication pressure is visible.

## Tighten Error Handling

- Never swallow errors with empty catches, ignored promise rejections, or silent `return null` in network or persistence paths.
- For blocking flows, surface a clear user-facing error state.
- For non-blocking flows, keep the fallback explicit and call `reportDevError(...)` with enough context to debug.

## Modernize In Slices

- Change one concern at a time.
- Validate with `pnpm lint:changed` and `pnpm typecheck`.
- Leave the repo easier to scan than before the slice started.
