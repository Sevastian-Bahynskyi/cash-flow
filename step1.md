# Step 1 - Foundation

## Goal
Set up the minimum structure needed to enter and persist transactions without business calculations.

## Build
- Initialize Expo React Native with TypeScript `strict`.
- Create a flat source layout: `app`, `src/ui`, `src/features`, `src/lib`, `supabase/migrations`.
- Add a small token file for spacing, radius, colors, and typography only.
- Configure Supabase client and environment handling.
- Create `categories` table with parent-child support, immutable system rows, and indexes for `(user_id, parent_id, name)`.
- Create `transactions` table with explicit `kind`, positive `amount_minor`, `occurred_on`, nullable comment, ISO country, recurring flag, shared flag, and category constraint for expenses.
- Add simple RLS so users can read and write only their own rows.
- Seed a small immutable system category set with two levels.
- Build the add-transaction full-screen modal with controlled inputs and direct Supabase insert.
- Build the searchable category bottom sheet with prefetched categories.

## Acceptance
- A user can create an expense with amount, category, name, and date.
- Expense save rejects missing category and non-positive amount.
- Category search returns results instantly offline after initial fetch.
- No balance, budget, savings, loan, or AI logic is implemented yet.
