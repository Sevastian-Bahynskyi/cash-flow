# Smell Checklist

Use this checklist to decide the next safe slice.

## Promise Handling

- Raw `void someAsync()` calls in effects, handlers, and refresh paths.
- Promise chains that silently collapse with `.catch(() => ...)`.
- Async JSX handlers that rely on implicit fire-and-forget behavior.

## Error Handling

- Data or auth flows that fail quietly without user feedback.
- Safe fallbacks that do not also report enough development detail.
- Console-only warnings where a shared `reportDevError(...)` helper would be clearer.

## Hook Hygiene

- `react-hooks/exhaustive-deps` suppressions that hide stale closure risk.
- Effects that both fetch data and coordinate unrelated UI behavior.
- Repeated async loading logic that should become one focused hook.

## File Shape

- Giant screen or controller files that blend data loading, transformation, UI state, and view rendering.
- Helpers that return too many sentinel values instead of making the fallback explicit.

## Repo-Specific Starting Points

- Transaction and category screens contain several fire-and-forget async paths.
- Overview and auth flows should report failures more consistently.
- Transfer people utilities currently fall back safely, but should use shared development reporting.
