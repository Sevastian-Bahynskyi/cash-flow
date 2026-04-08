# Context

## System Philosophy
This app is a behavioral awareness tool, not an accounting system.
Its job is to reduce logging friction, enforce useful categorization, and surface spending patterns without noise.
Every decision must preserve: speed over completeness, clarity over flexibility, predictability over automation.

## Transactions
Intent: make logging fast enough that users do not avoid it.
Required fields: name, amount, date, category.
Optional fields: comment, auto country, recurring flag, shared toggle.
Rules: amount is always positive integer minor units; category is mandatory for `expense`; income is its own transaction kind; location stores ISO country code only and never changes currency; default order in the modal is amount, category, name, then everything else.
Constraint: saving a transaction must be possible in under 15 seconds with no secondary screens unless category search is opened.

## Categories
Intent: categories are the main behavioral lens.
Structure: exactly two levels, parent category plus subcategory.
Rules: no subcategory without a parent; no nesting beyond two levels; system categories are immutable; custom categories may be added but never deeper than level two.
Ordering: show the user’s most-used categories from the last 90 days first, tie-break alphabetically.
Search: instant client-side search against the full prefetched category list.
Constraint: category selection must never depend on network round-trips.

## Balances
Intent: provide orientation, not ledger-grade accounting.
Two balances exist: personal balance and shared balance.
Personal balance = incomes - personal expenses - shared top-ups - savings adds + savings removes + loan borrowed - loan repaid.
Shared balance = user shared top-ups - user effective share of shared expenses for the active salary cycle.
Constraint: both balances are always derived from stored rows and deterministic formulas; there are no manual balance edits and no hidden mutations.

## Shared Account
Intent: reduce fairness anxiety without requiring partner bookkeeping.
User logs only their own shared top-ups and shared expenses.
Partner contribution is inferred per active salary cycle as `max(shared_expense_total - user_shared_topup_total, 0)`.
User share ratio for the cycle = `user_shared_topup_total / (user_shared_topup_total + partner_inferred_total)`; if both totals are zero, use `0.5`.
User effective share of each shared expense is calculated from the current cycle ratio.
Rules: ratio recalculates after every shared top-up; ratio never asks for manual input; only the user’s effective share appears in personal summaries.
Output: a dedicated Shared Expenses screen shows raw shared spend, inferred ratio, and the user’s effective share.

## Salary Cycles
Intent: match real budgeting behavior instead of calendar months.
A new cycle starts on each `income` transaction marked as salary.
If the salary date day-of-month is `25` or later, label the cycle as the next month; otherwise label the current month.
All analytics, budgets, alerts, and shared calculations must group by salary cycle id, never by calendar month.
Constraint: there is no automatic fallback to month-based grouping.

## Budgets and Alerts
Intent: nudge awareness, not restrict spending.
Budgets apply per category per salary cycle.
Thresholds: 80% = warning, 100% = critical.
Rules: alerts are passive banners or badges only; spending is never blocked; each threshold is emitted once per category per cycle unless the budget changes.

## Savings
Intent: make saving feel deliberate.
Use explicit `add`, `remove`, and `set` actions with history.
Current savings balance is derived from savings events.
Constraint: savings changes must never be mixed into normal expense categories.

## Loans
Intent: track obligations simply.
Store principal and remaining amount only.
Allow `loan_borrowed` and `loan_repaid` events; no interest, schedules, or amortization.
A loan is closed when remaining amount reaches zero.

## AI Categorization
Intent: reduce repeated manual categorization.
Flow: local history match first, Groq fallback second, both non-blocking.
Input: transaction name, optional comment, and the user’s correction history.
Rules: AI may preselect a category suggestion, but the user can always override it; the user override becomes the new training example; save must not wait on Groq.
Technical note: call Groq only through a Supabase Edge Function to keep secrets off-device.

## UX System
Intent: speed and clarity dominate the entire product.
Rules: global `+` is always reachable; add transaction uses a full-screen modal; first screen shows only the minimum fields; category picker uses a searchable bottom sheet; amount uses numeric keyboard; subtle animation only, never on the critical path.
Constraint: the happy path for a new expense is amount -> category -> name -> save.
