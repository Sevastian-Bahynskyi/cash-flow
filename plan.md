# Next Feature Plan

## Purpose

This plan uses [context.md](./context.md) as the product contract and focuses on the next major step for the app:

- stronger UI quality
- faster and clearer UX
- richer user-facing features
- minimal drift from the existing mental model

The app already has:
- auth
- basic home overview
- shared overview
- add transaction modal
- category picker
- derived salary/shared/budget logic

The app does **not** yet feel like a complete consumer product. The next work should make it feel polished, obvious, and useful every day.

## Non-Negotiables

- Preserve one-screen transaction entry.
- Keep the happy path `amount -> category -> name -> save`.
- Do not add accounting-style complexity.
- Do not create manual state for balances, ratios, or analytics.
- Shared data must stay separate from personal data.
- New features must reduce friction or improve awareness. If they do neither, skip them.

## Current Gaps To Solve

### UX
- Home is functional but visually thin.
- Shared is a stats page, not a real dashboard.
- There is no Bank screen yet.
- The app has no strong navigation model besides direct routes.
- Empty, loading, and success states are still developer-grade.

### Transaction flow
- No edit transaction flow.
- No recent transaction list.
- No quick re-entry or repeat-entry shortcuts.
- No currency support.
- No participant chips for shared entries.
- No country auto-fill.

### Feature completeness
- No category management UI.
- No budget management UI.
- No savings management UI.
- No loan management UI.
- No weekly summary push flow.
- No explicit AI correction memory UI.

## Target Product Shape

## Navigation Model

Use a 3-tab app shell with a global floating add action:

- `Home`
  - personal dashboard
  - recent personal transactions
  - budget warnings
  - top categories
- `Shared`
  - shared dashboard
  - contribution and spending breakdown
  - shared transaction history
- `Bank`
  - savings
  - loans

Global behavior:
- the `+` button remains visible above tabs
- add transaction opens as a full-screen modal from any tab
- category and transaction editing use bottom sheets or full-screen modals only

This keeps the app fast while making the main mental buckets explicit.

## Visual Direction

The current UI is structurally correct but too flat. Upgrade it with:

- stronger type scale and spacing rhythm
- gradient or layered background treatment, not just flat dark panels
- visually distinct card types for money, alerts, history, and management items
- meaningful progress bars for budgets, savings, and loans
- chip-based interaction for filters, shared participants, and quick actions
- subtle motion for modal open, sheet open, save success, and card refresh

Do not add decorative motion that delays input.

## Delivery Order

## Phase 1: App Shell, Navigation, and Screen Architecture

### Goal
- Make the app feel like a complete product before adding more logic.

### Changes
- Replace the current route structure with a tab shell:
  - `app/(tabs)/index.tsx` for Home
  - `app/(tabs)/shared.tsx` for Shared
  - `app/(tabs)/bank.tsx` for Bank
- Keep auth routes outside the tab group.
- Keep the global floating add button mounted in the tab layout.
- Add consistent screen headers, safe spacing, pull-to-refresh, and loading skeletons.
- Add a small layout primitive layer only if it reduces repeated screen chrome.

### Acceptance
- A signed-in user lands in a real tabbed app shell.
- Switching between Home, Shared, and Bank is instant.
- The `+` action is always reachable.
- Every main screen has usable loading, empty, and error states.

## Phase 2: Transaction Flow 2.0

### Goal
- Turn transaction creation into the strongest part of the app.

### UX changes
- Redesign the modal around:
  - large amount hero
  - visible quick category state
  - primary action always visible
  - reduced vertical dead space
- Show inline shared participant chips when shared is enabled:
  - `Me`
  - `GF`
- Add a compact currency selector near amount.
- Autofill country where possible and keep it editable only if needed.
- Add quick actions after save:
  - `Done`
  - `Save and add another`
  - `Duplicate last`
- Add edit mode using the same screen with existing values prefilled.
- Add recent transaction suggestions beneath the name field when typing starts.

### Data changes
- Extend transactions with:
  - `shared_participant`
  - `currency_code`
  - `original_amount_minor`
  - `converted_amount_minor`
  - `fx_rate`
- Keep `converted_amount_minor` as the analytics source of truth.
- Keep the original entered amount for trust and editing.

### Acceptance
- A repeat expense can be logged in under 10 seconds.
- Shared transactions can be assigned to `Me` or `GF` without extra screens.
- Foreign currency entry saves correctly and stores fixed DKK conversion.
- Existing transaction rows can be edited from the app.

## Phase 3: Category System Upgrade

### Goal
- Make categories fast to use and pleasant to manage.

### UX changes
- Rebuild the category picker as a true bottom sheet:
  - drag handle
  - search pinned at top
  - frequently used section first
  - clear parent/subcategory grouping
- Add category icons and parent color swatches in the picker.
- Surface “last used” and “frequent” categories separately when query is empty.
- Show small budget state indicators next to categories when a budget exists.

### Management UI
- Add a category management screen reachable from Home or a header action.
- Allow:
  - create category
  - create subcategory
  - edit category name
  - edit parent color
  - edit icon
- Prevent:
  - deleting system categories
  - deeper nesting
  - subcategory color override

### Data changes
- Extend categories with:
  - `icon`
  - `color`

### Acceptance
- Picking a category is faster than the current flat list.
- Users can manage categories without leaving the app.
- Parent/subcategory hierarchy is visually obvious.

## Phase 4: Home Dashboard Upgrade

### Goal
- Make Home the daily behavioral awareness screen.

### Changes
- Convert the current overview into a layered personal dashboard:
  - current personal balance hero
  - current cycle spend summary
  - budget warnings
  - top categories with progress bars
  - recent personal transactions list
  - quick links to budgets and categories
- Add filter chips:
  - current cycle
  - last cycle
  - all time
- Add lightweight charts:
  - category breakdown bar list first
  - donut chart only if it stays readable
- Add transaction list interactions:
  - tap to edit
  - long press for delete or duplicate

### Acceptance
- A user can understand current spending state from the first screen.
- Budget pressure is visible without opening a second screen.
- Recent activity is easy to review and edit.

## Phase 5: Shared Dashboard Upgrade

### Goal
- Make shared finances transparent and emotionally legible.

### Changes
- Replace the current stat-only screen with:
  - shared balance hero
  - current cycle contribution summary
  - your share vs inferred GF share
  - top shared categories
  - shared transaction history
  - top-up CTA
- Add a contribution timeline for the current cycle.
- Add a ratio explanation card that clearly states:
  - how the ratio is calculated
  - when it changes
  - that no manual ratio exists
- Add filters for:
  - current cycle
  - previous cycle

### Acceptance
- A user can explain shared balance and fairness from this screen alone.
- Shared history is visible without polluting Home.
- The ratio model feels understandable rather than hidden.

## Phase 6: Bank Screen

### Goal
- Make savings and loans first-class, intentional objects.

### Savings
- Add savings list cards with:
  - name
  - current amount
  - progress bar
  - latest action
- Add create/edit modal from the Bank screen only.
- Add history view per savings item.
- Support actions:
  - add
  - subtract
  - set

### Loans
- Add loan cards with:
  - name
  - remaining amount
  - progress bar toward closed state
  - last payment date
- Add create/edit modal from the Bank screen only.
- Show repayment history.

### Acceptance
- A user can create and maintain savings and loans without touching transaction screens.
- Savings and loans feel purposeful, not like hidden rows in the database.

## Phase 7: Budgeting, Alerts, and Weekly Summary

### Goal
- Turn budget awareness into an active product feature.

### Changes
- Add a budget management screen:
  - set personal budgets per category or subcategory
  - view current cycle progress
  - edit amount
  - remove budget
- Show budget state in:
  - Home
  - category picker
  - category management
- Add in-app alert center with:
  - warning state at `80%`
  - critical state at `100%+`
- Add weekly summary push payload generation and scheduling:
  - top overspend categories
  - biggest movement versus last cycle
  - savings and loan snapshot

### Acceptance
- Budget setup is possible without SQL or hidden admin tooling.
- Alerts are visible, calm, and never blocking.
- Weekly summary is useful at a glance and fits the behavioral model.

## Phase 8: AI and Smart Assist

### Goal
- Make the app smarter without feeling opinionated or invasive.

### Changes
- Improve AI categorization with:
  - visible “suggested category” state
  - confidence threshold before auto-fill
  - correction memory saved per normalized transaction pattern
- Add a small “Don’t suggest this again” action when users override.
- Use local history first, remote model second.
- Keep remote suggestions behind a debounce and never on save.
- Add quick rename patterns for recurring merchants.

### Acceptance
- Suggestions feel helpful, not random.
- Corrections improve future suggestions.
- The app never blocks on AI.

## Phase 9: Polish, Trust, and Micro-Interactions

### Goal
- Make the app feel reliable and premium.

### Changes
- Add haptics on save, approve, and destructive actions.
- Add optimistic UI for save with rollback only on real failure.
- Add inline validation instead of alert-heavy interruption where possible.
- Add transaction success feedback:
  - short check animation
  - “saved” state
- Improve money formatting:
  - DKK formatting
  - original currency display when relevant
- Add lightweight onboarding hints for:
  - first transaction
  - first shared top-up
  - first budget

### Acceptance
- The app feels responsive and trustworthy.
- Validation is clear without becoming noisy.
- First-time use does not require explanation from outside the app.

## Minimal Data And Backend Work Required

Keep backend changes narrow and only support the features above.

### Transactions
- add `shared_participant`
- add `currency_code`
- add `original_amount_minor`
- add `converted_amount_minor`
- add `fx_rate`

### Categories
- add `icon`
- add `color`

### Optional support tables
- `exchange_rates_daily`
  - only if live rate lookup cannot stay external and ephemeral
- `ai_category_rules`
  - only if storing correction rules separately is cleaner than deriving from transactions

Do not add complex automation, background workers, or generalized rules engines.

## Recommended Implementation Sequence

1. App shell and navigation
2. Transaction flow 2.0
3. Category system upgrade
4. Home dashboard
5. Shared dashboard
6. Bank screen
7. Budget management and weekly summary
8. AI refinement and polish

This order keeps the product feeling better after each release, instead of hiding UX improvements behind backend completeness.

## Done Definition

This plan is complete when the app has:

- a polished 3-tab shell
- a fast and satisfying transaction flow
- editable categories with icons and colors
- strong personal and shared dashboards
- a usable Bank screen
- visible budget management and alerts
- reliable AI suggestions with correction memory
- clear separation between personal and shared behavior

Most importantly, the app should feel like a fast daily money companion, not a prototype with data on it.
