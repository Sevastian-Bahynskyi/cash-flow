# Cashflow data contract (for the Next.js rebuild)

Read from the Expo app in this worktree on 2026-11-26. Source of truth: `supabase/migrations/` (29 files, last `20260528120000`) and `src/`. All refs are `path:line`. The web app talks to the **same Supabase project, same tables, same RLS**; nothing here needs a migration.

Conventions used everywhere:

- **Money**: `bigint` integer **minor units** (øre). DKK is the book currency. `amount_minor` is always **positive**; sign comes from `kind`. Display with `formatMinor(minor, 'DKK')` (= `minor / 100`, 2 decimals).
- **Dates**: `occurred_on` is a Postgres `date`, handled as a `YYYY-MM-DD` string. Compare as strings. Never route them through `new Date(iso)` (UTC shift); parse with `new Date(y, m-1, d)` (local).
- **Timestamps**: `created_at` / `updated_at` `timestamptz`, ISO strings.
- **RLS**: every user table has the same 4 policies: select/insert/update/delete only where `user_id = auth.uid()`. Inserts **must send `user_id`** (no default). Exception: `categories` (below).
- **Single user**: there is no partner account. "GF"/partner is a label on rows the owner enters.

---

## 1. Supabase client and auth

| Item | Value |
|---|---|
| Client | `src/lib/supabase.ts:1-32`, `createClient(url, publishableKey, { auth: { persistSession, autoRefreshToken, detectSessionInUrl: false } })` |
| Env (Expo names) | `EXPO_PUBLIC_SUPABASE_URL` (trailing `/` stripped), `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (fallback `EXPO_PUBLIC_SUPABASE_KEY`), optional `EXPO_PUBLIC_SUPABASE_ANON_KEY` (exported, unused), optional `EXPO_PUBLIC_SUPABASE_AUTH_URL` (custom auth domain; defaults to URL) |
| Web names | Rename to `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_AUTH_URL` |
| Functions URL | `${SUPABASE_URL}/functions/v1` (`supabase.ts:17`) |
| Provider | Google OAuth only. No email/password. |

**Sign-in** (`src/features/auth/AuthProvider.tsx:91-155`):

- `redirectTo` = `${origin}/auth-callback?next=<path>` (`:47-57`).
- If `SUPABASE_AUTH_URL` differs from `SUPABASE_URL`: `window.location.assign(${authUrl}/auth/v1/authorize?provider=google&redirect_to=...)` (`:34-42`, `:95-98`).
- Else `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`.

**Callback** (`app/auth-callback.tsx:21-73`), handles both flows:

1. `?code=` present: `supabase.auth.exchangeCodeForSession(code)` (PKCE).
2. Else tokens in `#access_token=...&refresh_token=...` (or query): `supabase.auth.setSession({ access_token, refresh_token })`.
3. Neither: error "OAuth callback did not contain an auth code or session tokens."
4. Once a session exists: `router.replace(next ?? '/')` (`:76-79`).

**Session use**: `getSession()` + `onAuthStateChange` in the provider (`AuthProvider.tsx:63-89`). Route guard in `app/_layout.tsx:66-81`: public routes `sign-in`, `sign-up`, `auth-callback`, `oauth/*`; no session sends you to `/sign-in`; a session on sign-in/up sends you to `/`. Data code reads the user via `supabase.auth.getUser()` and uses `user.id` as `user_id`. Edge function calls send `Authorization: Bearer <session.access_token>` + `apikey: <publishable key>`. Sign out: `supabase.auth.signOut()`.

**OAuth consent** (Supabase OAuth server; `app/oauth/consent.tsx`): `?authorization_id=` and then `supabase.auth.oauth.getAuthorizationDetails(id)` (`:55`). Approve/deny with `approveAuthorization(id)` / `denyAuthorization(id)` (`:89-90`). Navigate to `redirect_to ?? redirect_url` from the result. If there is no session, sign in with `next=/oauth/consent?authorization_id=...`.

---

## 2. Schema (state after all migrations)

Enums: `transaction_kind` = `expense|income`; `savings_action` = `add|remove|set`; `loan_status`, `receivable_status` = `open|closed`; `loan_event_kind` = `borrowed|repaid`; `receivable_event_kind` = `lent|repaid`; `budget_change_action` = `create|update|delete`; `budget_change_reason` = `manual|carry_over`.

### transactions (core)

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid not null | |
| kind | transaction_kind | |
| amount_minor | bigint > 0 | **DKK** amount (= `converted_amount_minor`). All math uses this. |
| occurred_on | date | |
| name | text not null | |
| comment | text null | the "note" |
| category_id | uuid **not null** (check `transactions_requires_category`) | FK categories **on delete restrict** |
| country_iso | char(2) null | legacy, always sent `null` |
| recurring | bool default false | stored, carried through edits, no logic |
| shared | bool | a shared-pool **expense** |
| shared_participant | text null, check `in ('me','gf')` | who paid the top-up; on shared expenses always `'me'` in practice |
| is_salary | bool | check: only if `kind='income'`. Opens a salary cycle. |
| is_shared_topup | bool | check: only if `kind='expense' AND shared=false` |
| currency_code | char(3) default 'DKK' | original currency |
| original_amount_minor | bigint not null | amount in `currency_code` |
| converted_amount_minor | bigint not null | DKK; equals `amount_minor` |
| fx_rate | numeric(12,6) not null | 1 for DKK |
| personal_effect_minor | bigint **generated** | `income: +amt; shared: 0; topup by gf: 0; else -amt` |
| shared_effect_minor | bigint **generated** | `topup: +amt; shared: -amt; else 0` |
| is_neutral_display | bool **generated** | `is_shared_topup AND shared_participant='gf'` |
| created_at, updated_at | timestamptz | `updated_at` auto-set by a trigger on update |

Triggers: on salary insert, `copy_previous_cycle_budgets` copies the previous salary cycle's budgets into the new cycle (`20260414195000:139-178`; insert only, not update). Never write generated columns.

### categories

| Column | Type | Notes |
|---|---|---|
| id, created_at | | |
| user_id | uuid null | null for system rows |
| parent_id | uuid null | FK self, on delete cascade |
| name | text | unique per (user, parent, lower(name)) |
| level | smallint 1/2 | 1 iff `parent_id is null` |
| is_system | bool | system means `user_id is null`. **Immutable**: a trigger raises on update/delete. |
| icon | text default 'shape-outline' | see icon note in §6 |
| color | text hex default '#7C5CFF' | |

RLS: select `is_system OR user_id = auth.uid()`; insert/update/delete only own non-system rows.

### category_overrides: per-user rename/re-icon of a system category
`id, user_id, category_id (fk cascade), name null, icon null, updated_at`; unique `(user_id, category_id)`. No colour override.

### budgets
`id, user_id, category_id (fk cascade), salary_cycle_id uuid (FK transactions.id, cascade), amount_minor > 0, notes text null, created_at`; unique `(user_id, category_id, salary_cycle_id)`. Since `20260417123000/124500`, budgets live on **level-1 (parent) categories only**. Every write is logged by a trigger into `budget_change_events` (`id, user_id, budget_id (no FK), category_id, salary_cycle_id, action, reason, old_amount_minor, new_amount_minor, created_at`). The app never reads that log.

### Bank tables

| Table | Columns |
|---|---|
| savings_accounts | `id, user_id, name, goal_minor null (>=0), color default '#3DD68C', icon default 'piggy-bank-outline', created_at` |
| savings_events | `id, user_id, savings_account_id null (fk cascade), action savings_action, amount_minor >= 0, occurred_on, note null, created_at` |
| loans | `id, user_id, name, principal_minor > 0, remaining_minor >= 0 (<= principal), status (closed iff remaining = 0), created_at` |
| loan_events | `id, loan_id (cascade), user_id, kind borrowed/repaid, amount_minor > 0, occurred_on, created_at` |
| receivables | same shape as loans ("owed to you") |
| receivable_events | `id, receivable_id (cascade), user_id, kind lent/repaid, amount_minor > 0, occurred_on, created_at` |

### Categorisation tables

| Table | Columns |
|---|---|
| merchant_category_rules | `id, user_id, match_target ('normalized_merchant','raw_text','bank_category','sender','receiver'), match_type ('exact','prefix','contains','regex'), pattern, kind, canonical_merchant null, category_id null, is_shared_topup, is_blocked, priority int default 100, source text ('manual','bootstrap_curated','bootstrap_history'), notes null, updated_at`; check `is_blocked OR category_id not null`; unique `(user_id, kind, match_target, match_type, pattern)` |
| merchant_category_memory | `id, user_id, kind, normalized_merchant, canonical_merchant, category_id not null, is_shared_topup, observation_count > 0, support_ratio numeric(5,4) 0..1, sample_names jsonb array, last_seen_on date, source default 'app', updated_at`; unique `(user_id, kind, normalized_merchant)` |
| transfer_people | `id, user_id, name, normalized_name, created_at, updated_at`; unique `(user_id, normalized_name)` ("People" in Categories) |
| ai_category_rules | **legacy**, superseded by merchant_category_rules; app never reads it |

### profiles + storage
`profiles(user_id pk, display_name null, avatar_url null, updated_at)`. RLS select/insert/update own; **no delete policy**. Storage bucket `avatars` is **public**, path `${user_id}/avatar.<ext>`. Insert/update policies are scoped to the user's folder. There is no delete or select policy; read through the public URL.

### RPCs (all `security invoker`, scoped by `auth.uid()`)

| Function | Args | Returns |
|---|---|---|
| `search_transactions_v1` | `p_query text, p_kind, p_start_on date, p_end_on_exclusive date, p_shared_only bool, p_include_shared bool, p_scoped_category_ids uuid[], p_limit int (1..200, default 20), p_offset int` | `setof transactions` ordered `occurred_on desc, updated_at desc, id desc` |
| `search_transaction_ids_v1` | same without limit/offset | `table(id)`, **unused by app** |
| `rank_transaction_category_candidates` | `kind_input, raw_text_input, normalized_merchant_input, bank_category_input, sender_input, receiver_input, limit_input` | rows `category_id, source ('rule','memory_exact','memory_fuzzy'), confidence, normalized_merchant, canonical_merchant, is_shared_topup, matched_pattern, similarity, observation_count, support_ratio, priority`; empty if any blocked rule matches |
| `rank_transaction_category_candidates_batch` | `inputs_json jsonb [{id, kind, raw_text, normalized_merchant, bank_category, sender, receiver}], limit_input` | same rows + `input_id` |

Search semantics (`20260416171000:184-238`). Whitespace tokens are AND'ed. Each token must match name, comment or category name (`ILIKE %t%`), or be a date token. Date tokens: `d.m`, `d.m.yy(yy)`, `m.yyyy`, `yyyy.m(.d)`, `yyyy`, `ddmmyyyy`, `yyyymmdd`, `ddmmyy`; separators `.`, `-`, `/`; ambiguous day/month matches both. Scope: `p_shared_only` returns `shared OR is_shared_topup`. Otherwise it returns `p_include_shared OR NOT shared`. Top-ups always count as "personal".

---

## 3. Queries and mutations per feature

### Shared loader: `useOverview` (`src/features/overview/useOverview.ts:134-344`)
Used by Home, Dashboard, Shared, Budgets, Categories, Bank, Alerts, AI rules. One `Promise.all` of **unfiltered, unpaginated** selects:

| Table | Columns | Order |
|---|---|---|
| transactions | all columns incl. generated (`:150`) | `occurred_on asc, created_at asc` |
| savings_accounts | `id,user_id,name,goal_minor,color,icon,created_at` | `created_at asc` |
| savings_events | `id,user_id,savings_account_id,action,amount_minor,occurred_on,note,created_at` | `occurred_on asc, created_at asc` |
| loans / receivables | `id,user_id,name,principal_minor,remaining_minor,status,created_at` | `created_at desc` |
| loan_events / receivable_events | all columns | none |
| budgets | `id,user_id,category_id,salary_cycle_id,amount_minor,notes,created_at` | none |
| categories | `id,user_id,parent_id,name,level,is_system,icon,color` | none |
| category_overrides | `id,user_id,category_id,name,icon,updated_at` | none |
| merchant_category_rules | all columns | `priority desc, updated_at desc` |

Then (all client-side): `applyCategoryOverrides`, labels `Parent · Child`, `buildDefaultCycles`, active cycle, `computeSharedCycle`, per-account `savingsTotal`, `bankBalance`, cycle balance, top-5 categories, and budget alerts. A web rewrite should load once per session (React Query or similar) and derive per screen the same way.

### Home (`src/features/home/HomeScreen.tsx`)
- Data: `useOverview`. Cycles: `buildNavigableCycles(transactions)`, filtered to cycles that have rows, newest first (`:192-202`). Default is the cycle containing today.
- Period filter `month|year|all` (`:223-233`). Year is decided by the **cycle label's year** (falls back to the calendar year).
- Balance = `transactionBalance(rangeRows)` (`:234`). The hero pager shows one balance per cycle (`:532-534`).
- Recent activity: range rows **minus top-ups** (shared expenses included), sort `occurred_on desc, updated_at desc`, first 8 (`:236-266`).
- Top categories: group by **parent**, net = income − my expense share (`computePersonalExpenseMinorByTransactionId`), sort by |net|, collapsed to 5 (`:272-354`). Tap sends you to `/personal-history?kind&parentLabel&categoryIds&includeShared=1&startOn&endOnExclusive` (`:660-679`).
- Mutations: delete one `transactions.delete().eq('id')` (`:378`). Bulk delete `.delete().in('id', ids)` (`:385`).
- Header: alert badge = `budgetAlerts.length`, links `/alerts`, `/ai-rules`, `/profile`. Buttons to `/budgets?cycleId=`, `/categories`.

### Personal history (`src/features/home/PersonalHistoryScreen.tsx`)
- URL params (`:655-746`): `startOn, endOnExclusive, kind, parentLabel, categoryIds (csv) | categoryId, shared=1 (sharedOnly), includeShared=1`. `parentLabel` without ids resolves to every category whose parent label matches (`:105-124`).
- Categories: `categories` ordered `level asc, name asc` + `category_overrides` (`:247-265`).
- Salary cycles for headers: `transactions.select('id, occurred_on').eq('is_salary', true).order('occurred_on')` (`:267-275`). Rows before the first salary go under "Before salary cycles" (`:1479`).
- Page: `rpc('search_transactions_v1', {..., p_limit: 20, p_offset})` (`:294-302`), load-older increments the offset.
- Filtered total (`:360-414`): page through **all** matches. If shared rows are present, also load **all** rows unscoped to compute share ratios.
- Mutations (chunked 100 ids, `:416-458`):
  - delete `.delete().in('id', chunk)`
  - bulk date `{ occurred_on }`; bulk category `{ category_id }`. Refused if the selection mixes kinds (pre-check `select('id,kind,shared,is_shared_topup').in('id')`).
  - move to shared `{ shared: true, shared_participant: 'me' }`; move to personal `{ shared: false, shared_participant: null, is_shared_topup: false }`. **Top-ups cannot be moved** (`:1185-1260`).
  - single delete `.delete().eq('id')` (`:1052`)
  - duplicate opens the composer with `toDuplicateDraft(row)` (`:155-170`; no id).
- Row amount display: non-DKK shows `converted DKK · original CCY` (`:172-180`).

### Dashboard (`src/features/dashboard/useDashboard.ts`)
- Data: `useOverview` only. Ranges `weekly` (Mon-start weeks), `monthly` (= navigable salary cycles, daily buckets, clipped to today), `yearly` (12 month buckets). Windows run from the first transaction to now, newest first.
- Per row in window: income adds to `income` and `cashFlow`. Shared expense adds **my share** to `expense` and the category split, never to outflow (skipped if category is Transfers). Other expense adds to `outflow` and subtracts from `cashFlow`. Top-ups also add to `topup` and are not counted as expense. Transfers-category expenses count in outflow, not expense.
- Category split: parent level, top 6, share = amount / expense.

### Budgets (`src/features/budgets/BudgetScreen.tsx`, `src/features/budgets/helpers.ts`)
- Data: `useOverview`. Cycle picker uses `buildNavigableCycles`. `?cycleId=` preselects.
- Rows: level-1 non-income parents, budgeted first, then by label. Parents with children (except "Other") are **roll-ups**: they sum child budgets and cannot be edited directly (`:223-231`, `:259-289`). After the parent-only migration, most budgets sit on the parent itself.
- Spent = my personal share via `computePersonalExpenseMinorByTransactionId`, rolled child→parent. A "Total" line also shows when the full shared amount is larger (`:291-315`, `:660-674`).
- Summary (`:362-395`): `Current salary` = sum of `is_salary` income in the cycle. `If all budgets are fully spent` = salary − Σ non-rollup budgets. `Real available to save` = salary − Σ my expense share in the cycle.
- "Used categories with no budget" (`:397-425`).
- Mutations: save `budgets.upsert({ user_id, category_id, salary_cycle_id, amount_minor, notes }, { onConflict: 'user_id,category_id,salary_cycle_id' })` (`:469-509`). Amount 0 means delete. Remove: `budgets.delete().eq('id')` (`:511-527`). Notes support `**bold**` markdown.
- Open a category's transactions: `/personal-history?startOn&endOnExclusive&kind=expense&includeShared=1&categoryIds|categoryId|parentLabel` (`:532+`).

### Categories + overrides + people (`src/features/categories/CategoryManagementScreen.tsx`)
- Data: `useOverview` (categories with overrides, budgets, activeCycle). People: `transfer_people.select(...).order('name')` (`src/features/transfers/people.ts:20-35`, module cache).
- Edit rules (`:300-315`): system level-1 is read-only. A system level-2 saves as an **override**. Own categories save directly. Only non-system rows can be deleted.
- Mutations (`:319-480`):
  - override: `category_overrides.upsert({ user_id, category_id, name, icon }, { onConflict: 'user_id,category_id' })`
  - update own: `categories.update(level1 ? { name, icon, color } : { name, icon }).eq('id')`
  - create: `categories.insert({ user_id, parent_id|null, name, level, is_system: false, icon, color }).select('id').single()` (a subcategory inherits the parent colour in the UI)
  - optional budget for level-1 on the **active** cycle: `budgets.upsert(...)` or `budgets.delete().eq('id')`
  - delete: `categories.delete().eq('id')`. Fails with an FK error if transactions use it (restrict).
- People (`people.ts:37-101`): insert `{ user_id, name, normalized_name }` (23505 means "already in list"), update `{ name, normalized_name }`, delete by id.

### Shared (`src/features/shared/SharedScreen.tsx`)
- Data: `useOverview`. Period `month` (navigable cycle) | `year` (**calendar** year) | `all` (`:96-141`).
- `sharedExpenses` = rows with `shared`. `topups` = rows with `is_shared_topup`. Metrics come from `computeSharedCycle(topups, sharedExpenses)`: Contributed = `totalTopupTotal`, Spent = Σ shared, My Share = `meTopupTotal` (`ratio%`), GF Share = `gfTopupTotal` (`1-ratio`), hero = `sharedBalance` (`:490-528`).
- Top shared categories: parent level, full amounts, top 5. Recent: top-ups + shared, 8 items.
- Mutations: delete `.delete().eq('id')` (`:310`). Add opens the composer `{ kind: 'expense', from_shared_screen: true }`. History link: `/personal-history?shared=1`.

### Bank: savings, loans, receivables (`src/features/bank/BankScreen.tsx`)
- Data: `useOverview`. Bank balance = `savingsTotal(all events) − Σ open loans remaining`. Savings total = Σ per-account totals. Open loans = Σ remaining. Owed to you = Σ open receivables remaining. These are **not** in the bank balance (`:193-195`, `:505-540`).
- Account history: events sorted `occurred_on desc, created_at desc`.
- Mutations (all `occurred_on: todayIso()`; note **UTC** `toISOString().slice(0,10)`, `:79`):
  - savings account insert/update `{ name, goal_minor, color, icon }` (`:230-268`); delete (`:206`; cascades its events)
  - savings action insert `savings_events { user_id, savings_account_id, action, amount_minor, occurred_on, note }` (`:270-293`)
  - loan create: `loans.insert({ user_id, name, principal_minor, remaining_minor, status }).select('id').single()`, then `loan_events.insert({ kind: 'borrowed', amount_minor: principal })` (`:295-345`). Edit is a plain `update`. `status = remaining === 0 ? 'closed' : 'open'`.
  - loan event (`:347-391`): insert `loan_events`, then update loan. `borrowed` adds to principal and remaining; `repaid` sets remaining to `max(0, remaining − amt)`. **Not transactional.**
  - receivables: identical with `lent`/`repaid` (`:393-490`)

### Merchant / AI rules (`src/features/ai/AiRulesScreen.tsx`, route `/ai-rules`)
- Read `fetchMerchantRules()` (`src/features/transactions/suggestions.ts:681-696`): all columns, `priority desc, updated_at desc`. Client search over pattern, kind, category label, status, source.
- Create: `upsertMerchantRule` (`suggestions.ts:698-749`) sends `{ user_id, kind, match_target: 'normalized_merchant', match_type: 'exact', pattern, canonical_merchant, category_id (null if blocked), is_shared_topup, is_blocked, priority: 300, source: 'manual', notes, updated_at }`, `onConflict: 'user_id,kind,match_target,match_type,pattern'`.
- Edit (`AiRulesScreen.tsx:121-163`): `update({ kind, pattern (trim+lower), canonical_merchant: pattern, category_id, is_blocked, is_shared_topup (expense only), notes, updated_at }).eq('id')`.
- Delete: `deleteMerchantRule(id)` (`suggestions.ts:751-758`).
- Pattern min length 2. Blocked means "don't suggest".

### Alerts (`src/features/alerts/AlertsScreen.tsx`)
- `useOverview().budgetAlerts`: per budget in the **active** cycle, spent / amount ≥ 1 is `critical`, ≥ 0.8 is `warning` (`useOverview.ts:266-290`).
- Nudges (`:60-65`): no transactions; no top-ups this cycle; no budgets.

### Profile (`src/features/profile/`)
- Load `profiles.select('display_name, avatar_url').eq('user_id', uid).maybeSingle()` (`ProfileProvider.tsx:33-37`).
- Save name `profiles.upsert({ user_id, display_name, updated_at })` (`:59-61`).
- Avatar (`avatar.ts:22-38`): `storage.from('avatars').upload('${uid}/avatar.<png|webp|heic|jpg>', bytes, { contentType, upsert: true })`, then `getPublicUrl`. Store `publicUrl?v=<Date.now()>` (cache-bust) in `profiles.avatar_url` (`ProfileProvider.tsx:68-79`).
- Export (`export.ts:47-84`): `transactions.select('id, occurred_on, name, comment, kind, amount_minor, converted_amount_minor, original_amount_minor, currency_code, shared, is_shared_topup, shared_participant, categories(name, color)').gte('occurred_on', start).lte('occurred_on', end).order('occurred_on')`.
  - CSV columns: `Date, Name, Category, Type, Sharing, Amount (DKK) (signed), Currency, Original amount`. Sharing is `Personal | Shared | Top-up (Me|GF)`.
  - Totals: income, expense, net over **all** rows (shared at full amount).
  - The category join returns the raw category name (no override applied).
- Daily reminder: local Expo notification only (no DB).

### Add / edit transaction composer (`src/features/transactions/AddTransactionModal.tsx`)
- Category options: `useCategories` (`src/features/categories/useCategories.ts:27-88`). It selects categories `order level, name` + overrides. Options = level-1 parents **except "Income"** + all level-2 children `{ id, name (display), parentName, parentId, icon, color, parentColor, parentIcon, searchKey }`. The result is module-cached; clear it after category edits.
- Picker: recent = last 12 expense `category_id` by `updated_at desc` (`suggestions.ts:478-494`). Frequent = expense rows in the last 90 days, counted (`:496-516`).
- Name autocomplete: `transactions.select(*).ilike('name', '%q%').order('updated_at desc').limit(6)`, debounced 220 ms (`suggestions.ts:461-476`, modal `:455-469`).
- Budget chip per category: active cycle from salary rows. `budgets.select('category_id, amount_minor').eq('salary_cycle_id')`. Expenses in the cycle, excluding shared and top-ups, rolled to parent (`:148-198`).
- Transfer people: `fetchTransferPeople()`. An exact normalized name match marks the transfer person (`:276-281`).
- Save (`:943-1058`). Payload (`TransactionInsert`, `src/features/transactions/types.ts:4-22`):
  - `amount_minor = converted_amount_minor = convertToDkk(original, ccy, date)`, `fx_rate`, `currency_code`, `original_amount_minor`
  - income category is normalised to an Income or Transfers option, else Income · Others
  - top-up forces category Transfers · Top up (else Transfers · Transfer)
  - `shared = expense && !topup ? shared : false`
  - `shared_participant` = topup: me/gf; shared: `'me'` (or picker value); else `null`
  - `is_salary = income && category is Income · Salary` (UI hint "This will start a new cycle")
  - `is_shared_topup = expense ? topup : false`; `country_iso: null`
  - insert, or `update(payload).eq('id', draft.id)` when editing
- After save: if the user overrode a suggestion, `upsertMerchantRule(pattern = normalizedMerchant)`. Always `saveMerchantMemoryObservation` (below). "Save and add another" / "duplicate last" re-open with `nextDraft` (`:1054-1070`).
- Shared modes: from the Shared tab (`from_shared_screen`) the choice is "Shared expense" or "Top-up" + participant `Me|GF`. Editing a top-up keeps those options (`:263-266`, `:320-336`).
- Suggestion: `runCategorySuggestion` (`:473-547`) runs when name or comment is ≥ 2 chars and the row is not a top-up. It auto-applies unless the user touched the category, and for AI only when confidence ≥ **0.92**. Accept: `upsertMerchantRule(category)`. "Don't suggest again": `upsertMerchantRule({ isBlocked: true, categoryId: null })` (`:549-620`).

### Category suggestions pipeline (`src/features/transactions/suggestions.ts`)
`resolveSuggestedCategory` (`:518-577`) runs these steps in order:

1. Curated hardcoded merchants (`resolveCuratedCategoryCandidate`)
2. Transfer person (MobilePay counterparty is in `transfer_people`, so Transfers)
3. `rpc rank_transaction_category_candidates` (limit 6), then `pickDeterministicRankedCandidate`: rule always wins. `memory_exact` needs obs ≥ 2 and support ≥ 0.85. `memory_fuzzy` needs sim ≥ 0.82, obs ≥ 3, support ≥ 0.9.
4. Edge `suggest-category` (single)

Batch (`:569-679`) uses the same steps with the `_batch` RPC and the batch edge call.

Memory write `saveMerchantMemoryObservation` (`:760-848`):

- Select by `(kind, normalized_merchant)`.
- No row: insert `{ user_id, kind, normalized_merchant, canonical_merchant, category_id, is_shared_topup, observation_count: 1, support_ratio: 1, sample_names[≤4], last_seen_on, source: 'app' }`.
- Same category: update `observation_count+1`, recompute `support_ratio`, merge `sample_names`, `last_seen_on`, `is_shared_topup` OR.
- Different category: no-op.

### CSV and image import (`src/features/transactions/imageImport.ts`, modal `:622-940`)
- Image: picker `quality 0.55, base64` gives a `data:<mime>;base64,...` URL and calls `parse-transaction-image`. CSV: file read as text and calls `parse-transaction-csv`.
- Request: `POST ${FUNCTIONS_URL}/<fn>` with headers `Authorization`, `apikey`, JSON body `{ ...body, candidates: [{id, parent, name}], today }` (`:377-490`).
- Dedupe (`:291-375`): `transactions.select('name, occurred_on, currency_code, original_amount_minor').in('occurred_on', dates)`. Key = `normName|date|CCY|originalMinor`. Skipped rows carry reason `existing` or `batch`.
- Review (`composer/hooks/useImportReviewState.ts:63-271`) calls `resolveBatchCategoryResults`. AI results under 0.92 stay suggestions only. Transfer-person matches go to Transfers.
- Save all (`AddTransactionModal.tsx:756-900`):
  - validates name, amount, `YYYY-MM-DD` date, and a category for expenses
  - one bulk `transactions.insert(payloads)` with `shared: false`, `is_shared_topup` from the suggestion or `shouldAutoMarkSharedTopup`, FX-converted
  - then one memory observation per row

---

## 4. Domain logic to port

"Pure" means no React Native / Expo / Supabase imports: copy as-is.

| Function | File | In, out | Pure |
|---|---|---|---|
| `labelForSalaryDate` | `src/lib/cycles.ts:32` | `YYYY-MM-DD` to `"May 2026"`. Day ≥ 25 labels the **next** month. | yes |
| `buildSalaryCycles` | `cycles.ts:45` | salary rows to `SalaryCycle{id=salary txn id, startOn, endOnExclusive (next salary or null), label}` | yes |
| `buildCalendarCycles` | `cycles.ts:140` | rows to calendar months `cal-YYYY-MM`, last one open | yes |
| `buildDefaultCycles` | `cycles.ts:177` | salary cycles, else calendar (used by overview and alerts) | yes |
| `buildNavigableCycles` | `cycles.ts:185` | **what screens use**. ≥ 2 salaries: salary cycles (nothing before the first salary). 1 salary: calendar months `nav-YYYY-MM-01` up to a partial `nav-pre-<date>` month, then the salary cycle. 0 salaries: months anchored to day 1, last open. | yes |
| `findCycleFor`, `cycleMatch`, `activeCycle`, `groupByCycle` (`PRE_CYCLE`) | `cycles.ts:58-90, 268-283` | membership `startOn <= d < endOnExclusive` | yes |
| `formatCycleDisplayRange` | `cycles.ts:106` | `"25 Apr – 24 May"`; open cycle ends today | yes (Intl) |
| `transactionBalance` | `src/lib/balance.ts:14` | Σ `personal_effect_minor` (fallback reimplements it) | yes |
| `bankBalance` | `balance.ts:36` | `savings − loanRemaining` | yes |
| `savingsTotal` | `src/lib/savings.ts:7` | events in chronological order: add `+`, remove `max(0, t−a)`, set `= a` | yes |
| `computeSharedCycle` | `src/lib/shared.ts:42` | topups `{amount, participant}` + shared expenses. me = non-gf top-ups. `ratio = me/total` (0.5 if none). `effectiveShare = round(spent*ratio)`. `partnerInferred = max(spent−me, 0)`. `balance = total − spent`. | yes |
| `computePersonalExpenseMinorByTransactionId` | `shared.ts:81` | Map id to **my expense share**. Rows sorted by `occurred_on, created_at, id`. Shared expense = `round(amt * meBefore/(meBefore+gfBefore))` using **all top-ups before it, all-time** (0.5 if none). Top-up by me: full amount; by gf: 0. Personal: amount. Income: 0. | yes |
| `buildBudgetStateByCategory` | `src/features/budgets/helpers.ts:26` | (cats, budgets, txns, cycle) to `{amountMinor, spentMinor (my share, child rolled into parent), ratio, tone: ≥1 critical, ≥0.8 warning}` | yes |
| `formatMinor`, `parseMinor` (`,` accepted as decimal), `formatPercent`, `formatDateLabel` (`dd.mm.yyyy`), `formatMonthYearLabel` | `src/lib/format.ts` | | yes |
| `convertToDkk` | `src/lib/currency.ts:48` | GET `https://api.frankfurter.app/<date>?from=CCY&to=DKK&amount=<major>`, returns `{convertedMinor, rate}`. Supported list `:1-17`. | yes (fetch) |
| `applyCategoryOverrides` | `src/features/categories/helpers.ts:98` | non-blank override name/icon replaces the original | yes* |
| `buildCategoryMeta` | `categories/helpers.ts:66` | id to `{label "Parent · Child", color (parent's), icon, name, parentName}` | yes* |
| `getDisplayCategoryName` | `categories/helpers.ts:25` | Income · "Other income" shows as "Others" | yes |
| `getCategoryDisplayColor` | `categories/helpers.ts:28` | Transfers: income `#3DD68C`, expense `#7C5CFF`. Income: `#3DD68C` (Others `#6F8F7D`). Else parent colour. | yes* |
| `findSalary/Transfer/SharedTopup/OtherIncomeCategoryOption`, `normalizeIncomeCategoryOption`, `isIncome/Transfer/MobilePay…` | `src/features/categories/rules.ts` | **name-based** system-category lookup | yes |
| Colour + icon option lists | `src/features/categories/presentation.ts` | 11 colours, FA6 + `brand:*` icons | yes |
| Dashboard windows + aggregation | `src/features/dashboard/useDashboard.ts:94-546` | see §3. Extract the logic from the `useMemo`; drop gifted-charts types. | logic yes |
| Home top categories, history `getPersonalNetMinorAmount` | `HomeScreen.tsx:272-354`, `PersonalHistoryScreen.tsx:177-189` | inline, lift out | yes |
| `normalizeTransferPersonName` | `src/features/transfers/people.ts:11` | NFKC, lower, non-alnum to space | yes |
| merchant intelligence (`normalizeMerchantContext`, curated list, transfer-person, `pickDeterministicRankedCandidate`, `shouldAutoMarkSharedTopup`) | `src/features/transactions/merchantIntelligence.ts` | imports `people.ts` (Supabase) only for `normalizeTransferPersonName`. Copy that function in. | yes after that |
| Import draft helpers (`parseLocalizedAmount`, `buildDrafts`, dedupe key) | `imageImport.ts:124-300` | module-private, lift out | yes |
| CSV export builder | `src/features/profile/export.ts:83-140` | | yes |

\* imports `colors` from `src/ui/tokens.ts`, a plain object (`success #3DD68C`, `accent #7C5CFF`, `textMuted #9A9AAA`, `danger #FF5C7A`). Safe to copy.

Dead code, do not port: `src/features/transactions/MerchantRulesSheet.tsx`, `useMerchantRules.ts` (never imported; its insert omits `user_id`, so RLS would reject it), `categorizationRules.ts` (unused), `search_transaction_ids_v1`, `ai_category_rules`.

---

## 5. Edge functions (`supabase/functions/`, all `verify_jwt = false`)

All three validate the caller themselves: `GET ${SUPABASE_URL}/auth/v1/user` with the forwarded `Authorization` header, else `401`. Server secrets (names): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`. LLM: Groq OpenAI-compatible API. Non-POST returns `405`. No key returns `503` (batch suggest returns `{results: []}` instead).

| Function | Caller | Request | Response |
|---|---|---|---|
| `suggest-category` (single) | `suggestions.ts:347-403` | `{ kind, name, comment, rawText, message, transactionType, sender, receiver, bankCategory, normalizedMerchant, candidates:[{id,parent,name,icon?}], deterministicCandidates:[ranked rows] }` | `{ categoryId \| null, confidence, isSharedTopup, error? }`. Curated match first, then LLM (`openai/gpt-oss-120b`) with a verifier pass unless ≥ 0.96. |
| `suggest-category` (batch) | `suggestions.ts:405-459` | `{ rows:[{id, kind, name, comment, rawText, message, transactionType, sender, receiver, bankCategory, normalizedMerchant, deterministicCandidates}], candidates }` | `{ results:[{id, categoryId, confidence, isSharedTopup}] }`; rows under 0.92 are dropped server-side |
| `parse-transaction-image` | `imageImport.ts:493` | `{ imageDataUrl, candidates:[{id,parent,name}], today:'YYYY-MM-DD' }` | `{ transactions:[{kind, name, amount (major, number), currencyCode, categoryId\|null, comment\|null, occurredOn}], error? }`. Model `qwen/qwen3.6-27b`. |
| `parse-transaction-csv` | `imageImport.ts:516` | `{ csvText, fileName\|null, candidates, today }` | `{ transactions:[{kind, name, amount, currencyCode, categoryId, comment, occurredOn, rawText, message, transactionType, sender, receiver, bankCategory, normalizedMerchant, suggestedSharedTopup, categorySource:'curated'\|'llm'\|null}], error? }`. Tries a dedicated bank-export parser, then a header heuristic, then the LLM. |

Client errors: a 401-like response shows "Your session expired or is invalid…". Other failures show `payload.error`.

---

## 6. Surprises

- **1000-row cap.** `useOverview` loads all transactions `ORDER BY occurred_on ASC` with no range. PostgREST's default `max_rows` (1000; not overridden in `supabase/config.toml`) would silently drop the **newest** rows once a user passes 1000. Export has the same issue. The web app should page, or push aggregation to SQL.
- **Personal vs shared is decided by two flags, not by category.** `shared=true` means a joint-pool expense: 0 personal balance effect, but "my share" counts in budgets and dashboard. `is_shared_topup=true` means money moved into the pool: personal outflow if `me`, neutral if `gf`. Everything else is personal. Top-ups are hidden from Home recent activity and cannot be moved between personal and shared. `TransactionList` shows top-ups without a +/- sign.
- **The partner share is inferred, not entered.** The ratio comes from top-ups only. Per-row share uses top-ups **before** that row, across all time. Per-cycle Shared metrics use top-ups in the window. The numbers can differ.
- **"GF" is hard-coded** in the DB check (`'me','gf'`), labels and generated columns.
- **Top-up category** is forced to the system `Transfers · Top up` (fallback `Transfers · Transfer`). Transfers-category expenses count as outflow but never as spending. Transfers can also be income.
- **System categories are found by name** (`Income`, `Salary`, `Other income`, `Transfers`, `Top up`, `MobilePay`, `Other`), not by id. Renames happen through overrides, and the overrides change `name`. The rules match lower-cased names *after* overrides, so renaming "Salary" breaks salary detection. Current system parents (after the 2026-04 taxonomy migrations): Food, Transport, Bills, Rent, Entertainment, Shopping, Travel, Sport, Doctor, Save Up, Family & Care, Income, Transfers, Other, plus a few legacy parents. Most children were flattened into parents. Read the live table; never hardcode ids.
- **Icons are mixed formats**: legacy MaterialCommunityIcons names (`cart-outline`), FontAwesome6 names (`film`), and `brand:<slug>` (Simple Icons). The legacy-to-FA6 map is in `src/ui/CategoryIcon.tsx:55+`.
- **Category FK is restrict.** Deleting a used category fails. Deleting a salary transaction **cascades** to its budgets and budget events.
- **Budgets need a real salary id.** `salary_cycle_id` is an FK to `transactions.id`. Navigable cycles have synthetic ids (`nav-…`, `cal-…`), so saving a budget on them fails. The UI says "Add a salary transaction to start budgeting".
- **Carry-over is a DB trigger**: inserting a salary copies the previous cycle's budgets. Editing a salary's date does not.
- **Three spend definitions disagree.** Alerts (`useOverview`) use personal non-shared expense by exact `category_id`, without rolling children into parents, on `buildDefaultCycles`. The Budgets screen uses my share incl. shared, rolled up, on navigable cycles. The composer budget chip excludes shared and rolls up. Port each one faithfully or unify on purpose.
- **Home "year" vs Shared "year"**: Home uses the cycle label's year; Shared uses the calendar year.
- **`savingsTotal(all events)`** in the bank balance runs `set` across accounts. A `set` on one account resets the global running total, so the bank balance can differ from "Savings total" (Σ per account).
- **Bank writes are two non-atomic calls** (event insert, then parent update). Receivables are not part of the bank balance. Bank `todayIso()` and import `today` use **UTC** dates; the composer uses local dates.
- **Legacy/unused**: `country_iso` (always null), `recurring` (no logic), `ai_category_rules`, `budget_change_events` (written, never read), `shared_effect_minor`/`is_neutral_display` (selected, unused), `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Debug leftovers**: `PersonalHistoryScreen.tsx:131, 311, 336, 697` `fetch('http://127.0.0.1:7401/ingest/...')`. Do not port.
- **Amounts**: `amount_minor` is the DKK figure; `original_amount_minor` + `currency_code` hold the source. Edit re-opens with `converted` as the amount and `original` + currency, then re-converts on save at the transaction date's rate.
- **Avatar** bucket is public with no delete policy. The URL in `profiles` carries `?v=` for cache-busting.
