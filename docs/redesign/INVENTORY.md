# Coverage list: every screen, sheet, state and feature of the Expo app

Stage 3, step 3. Read from `app/` and `src/features/` on 2026-11-26. This list is the checklist for the prototype (step 4) and the rebuild (step 5): an item is ticked in a column only after looking at it rendered. Nothing here is new; nothing may be lost.

Columns: **P** prototype, **W** web app. Every screen also gets loading, empty, error and offline states, light and dark, phone and desktop.

## Places (tabs today: Home, Dashboard, Shared, Bank, plus the Add button)

| # | Screen | What it does today | P | W |
|---|---|---|---|---|
| 1 | Home | Balance with a period switch (month, year, all time), top categories, recent personal activity with see more/less, links to Budgets and Categories, header links to Alerts, Merchant rules, Profile; shared summary (`Overview`) | | |
| 2 | Dashboard (Spending) | Period switch (weekly, monthly, yearly) with previous/next; income, money out, net cash flow; running cash-flow chart; expense split (waffle) by category | | |
| 3 | Shared | Shared balance with period switch; contributed, spent, top-ups; my share, partner's share and ratio inferred from top-ups; top shared categories; recent shared activity; add shared transaction | | |
| 4 | Bank | Bank balance, savings total; savings accounts (name, goal, colour, icon, add/remove/set, history); loans (principal, remaining, repayment, borrow more, settled); owed to you (lend more, money returned); open/closed | | |
| 5 | History (personal / shared / all) | Full timeline by salary cycle and "before salary cycles"; search by date, name, note; filters from Home, Budgets, Shared; load older; row actions duplicate, delete; selection mode: move to shared/personal, set category, set date, delete; shared top-ups cannot be moved | | |
| 6 | Budgets | Per salary cycle (cycle picker); current salary; cycle target; budget per category (set amount); cycle budget check: if all budgets are fully spent, real available to save; used categories with no budget; notes with bold; search categories; no-cycle state "Add a salary transaction to start budgeting"; open a category's transactions | | |
| 7 | Categories | Expense and income lists with subcategories; system categories read-only; new/edit category (name, icon, colour, budget), new subcategory (inherits colour); delete; people (add, edit, delete) for shared participants | | |
| 8 | Merchant rules | List and search rules; create/edit: pattern, match type (exact, prefix, contains), mapped category, expense or income, block suggestions, mark as shared top-up, notes; delete | | |
| 9 | Alerts | Budget alerts per category (warning, critical), heads-up nudges | | |
| 10 | Profile | Name, profile picture (upload); daily expense reminder at 18:00; export transactions (date range, CSV or PDF); sign out | | |
| 11 | Sign in / Sign up | Google only; welcome copy | | |
| 12 | Auth callback | Finishes sign-in; error when the callback URL is missing | | |
| 13 | OAuth consent | Third-party app asks for scopes: approve, deny, sign in to continue | | |

## Sheets and flows

| # | Sheet | What it does today | P | W |
|---|---|---|---|---|
| 14 | Add / edit transaction | Amount first (keypad), category, name; expense, income, shared top-up; date (today default), note; shared expense with participant; duplicate last; save and add another; salary "will start a new cycle"; category suggestion with "Don't suggest again" | | |
| 15 | Category picker | Search, recent, frequent, all categories, no matches | | |
| 16 | Import from image | Screenshot or receipt, analysing, then review | | |
| 17 | Import bank CSV | Pick a statement file, analysing, then review | | |
| 18 | Review import | Card per transaction: name, amount, currency, date, type, category (needs category, categorising…), note; remove; save all; nothing to save | | |
| 19 | Merchant rule sheet | Quick rule from a transaction (same fields as 8) | | |
| 20 | Budget editor | Set one category's budget, or the cycle target | | |
| 21 | Savings / loan / owed editors | New and edit for each; savings action; repayment, borrow more, money returned, lend more | | |
| 22 | Transaction detail and row actions | Open, edit, duplicate, delete with confirm, move to shared/personal | | |
| 23 | Undo after save, confirm before delete | | | |

## Rules the redesign applies to these (owner rules, not new features)

- **Cycles, not months.** Home's and Shared's period switch becomes cycle, year, all time; Dashboard's weekly/monthly/yearly becomes week, cycle, year (`tells.md` D5).
- Home's "Top categories" and Dashboard's split answer one question each (`dashboards.md`).
- Brand-logo category icons map to the nearest own icon (owner, 26 Nov).

## Native-only today: web equivalents (ADR 0001)

| Today (Expo) | Web |
|---|---|
| Daily reminder via Expo notifications | Web push from the installed PWA (iOS 16.4+), off until turned on |
| Export through the share sheet | Download the file; Web Share where the browser has it |
| Image picker for receipt and avatar | File input with camera capture |
| Native date picker | `<input type="date">` |
| Haptics | None |
