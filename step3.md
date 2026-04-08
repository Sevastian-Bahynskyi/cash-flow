# Step 3 - UX and Intelligence

## Goal
Make the core flow fast, clear, and behaviorally useful.

## Build
- Reduce the add-transaction flow to the minimum tap sequence with smart defaults.
- Keep amount focused first and auto-open numeric keyboard.
- Show frequently used categories before the full search list.
- Build the home dashboard with current cycle spend, top categories, personal balance, shared balance, savings, and open loans.
- Build the Shared Expenses screen with raw shared spend, inferred ratio, and user effective share.
- Add budget warning and critical indicators at 80% and 100%.
- Add local history-based category suggestions.
- Add Supabase Edge Function `suggest-category` using Groq free API as fallback when history has no confident match.
- Persist user corrections so later suggestions prefer corrected categories.

## Acceptance
- A repeat expense can be logged in under 15 seconds.
- Category suggestions never block save.
- User override always wins over AI.
- Budget alerts are visible but never block a transaction.
- Shared details are visible on their own screen without cluttering the main home view.
