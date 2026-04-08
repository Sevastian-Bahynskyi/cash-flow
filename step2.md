# Step 2 - Core Logic

## Goal
Make calculations correct and deterministic before polishing UX.

## Build
- Add salary detection on income rows and derive salary cycles from salary dates.
- Build cycle grouping utilities directly from transaction rows; no calendar-month fallback.
- Implement personal balance calculation from transaction kinds.
- Implement shared cycle calculation using user top-ups, inferred partner contribution, ratio, and effective share.
- Add `budgets` table keyed by user, category, and salary cycle scope.
- Add `savings_events` table with `add`, `remove`, and `set` actions plus derived current total.
- Add `loans` table with principal, remaining amount, status, and repayment events.
- Expose simple derived selectors/screens for personal balance, shared balance, savings total, and open loans.

## Acceptance
- Logging a salary starts a new active cycle.
- A salary on day `25` or later labels the next cycle.
- Shared ratio changes only when current-cycle top-ups or shared expenses change.
- Savings total matches the full savings event history.
- Loan remaining amount never drops below zero.
