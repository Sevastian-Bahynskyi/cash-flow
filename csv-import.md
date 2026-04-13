# CSV Import Merchant Intelligence

## Purpose
- This project used to categorize imported CSV transactions with an `LLM-first` approach.
- The main failure mode was obvious merchants being mislabeled as `MobilePay` because the model overfit to payment rails instead of merchant identity.
- The system was replaced with a `deterministic-first` pipeline:
  - `merchant rules`
  - `curated heuristics`
  - `transfer_people`
  - `exact merchant memory`
  - `fuzzy merchant memory`
  - `LLM fallback only for unresolved leftovers`
- Core principle: `missing category is better than wrong category`.

## Current architecture
- Source of truth for app-side categorization logic:
  - [src/features/transactions/merchantIntelligence.ts](/Users/seva/Developer/cash-flow/src/features/transactions/merchantIntelligence.ts)
  - [src/features/transactions/suggestions.ts](/Users/seva/Developer/cash-flow/src/features/transactions/suggestions.ts)
- Edge functions:
  - CSV parsing: [supabase/functions/parse-transaction-csv/index.ts](/Users/seva/Developer/cash-flow/supabase/functions/parse-transaction-csv/index.ts)
  - AI fallback categorization: [supabase/functions/suggest-category/index.ts](/Users/seva/Developer/cash-flow/supabase/functions/suggest-category/index.ts)
  - Shared edge normalization helpers: [supabase/functions/_shared/merchant-intelligence.ts](/Users/seva/Developer/cash-flow/supabase/functions/_shared/merchant-intelligence.ts)
- Supabase schema:
  - [supabase/migrations/20260411170000_merchant_intelligence.sql](/Users/seva/Developer/cash-flow/supabase/migrations/20260411170000_merchant_intelligence.sql)
- Bootstrap/history seeding:
  - [scripts/bootstrap-merchant-intelligence.cjs](/Users/seva/Developer/cash-flow/scripts/bootstrap-merchant-intelligence.cjs)
- Import UI:
  - [src/features/transactions/imageImport.ts](/Users/seva/Developer/cash-flow/src/features/transactions/imageImport.ts)
  - [src/features/transactions/composer/hooks/useImportReviewState.ts](/Users/seva/Developer/cash-flow/src/features/transactions/composer/hooks/useImportReviewState.ts)
  - [src/features/transactions/composer/components/ImportReviewTransactionCard.tsx](/Users/seva/Developer/cash-flow/src/features/transactions/composer/components/ImportReviewTransactionCard.tsx)
- Manual rule management UI:
  - [src/features/ai/AiRulesScreen.tsx](/Users/seva/Developer/cash-flow/src/features/ai/AiRulesScreen.tsx)
  - Despite the filename, this screen is now a `Merchant Rules` screen.

## End-to-end runtime flow

### 1. CSV upload and parsing
- Import enters through the existing import flow and calls `parse-transaction-csv`.
- The parser now has 3 layers:
  - Dedicated parser for the provided bank export format
  - Heuristic generic CSV parser
  - LLM fallback parser only if deterministic parsing fails
- Dedicated bank export headers expected:
  - `Date`
  - `Date of posting`
  - `Text`
  - `Message`
  - `Transaction type`
  - `Amount`
  - `Currency`
  - `Sender`
  - `Receiver`
  - `Note`
  - `Category`
- The parser returns rich row metadata, not just name/amount/category.
- For expenses, parser output is intentionally conservative. It does not force an expense category during parsing.
- For obvious income cases, parser may set category immediately:
  - salary
  - benefits
  - interest
  - transfer income

### 2. Import draft construction
- `imageImport.ts` converts parser output into `ImportedTransactionDraft`.
- Added fields:
  - `rawText`
  - `message`
  - `transactionType`
  - `sender`
  - `receiver`
  - `bankCategory`
  - `normalizedMerchant`
  - `categorySource`
  - `categoryConfidence`
  - `suggestedSharedTopup`
- Important behavior:
  - income category suggestions are trusted only if they match allowed income categories
  - expense categories are not blindly trusted from parser output
  - unresolved expense rows remain uncategorized for review

### 3. Import review categorization
- `useImportReviewState.ts` watches visible import rows.
- When there are uncategorized rows, it automatically runs batch categorization with `resolveBatchCategoryResults(...)`.
- The categorization result can be partial.
- Rows with no high-confidence suggestion remain uncategorized.
- UI behavior:
  - category field shows a skeleton/spinner while categorization is running
  - after resolution, the card shows source label and confidence
  - source labels come from `formatMerchantCategorySource(...)`

### 4. Saving imported rows
- `AddTransactionModal.tsx` saves imported rows into `transactions`.
- After successful insert, it writes merchant learning data via `saveMerchantMemoryObservation(...)`.
- Shared top-up behavior:
  - imported expense rows can auto-mark `is_shared_topup`
  - currently `Revolut` is the main hardcoded top-up signal

### 5. Ongoing learning from normal app usage
- Manual and normal transaction saves also call:
  - `resolveSuggestedCategory(...)`
  - `saveMerchantMemoryObservation(...)`
  - `upsertMerchantRule(...)`
- Result: import improvements should compound over time from actual user corrections, not just one-off CSV bootstrap.

## Deterministic categorization order
- Implemented in `suggestions.ts` and `merchantIntelligence.ts`.
- Order is:
  1. Curated deterministic rules in code
  2. Transfer-person detection from `transfer_people`
  3. Supabase RPC ranking from `merchant_category_rules` and `merchant_category_memory`
  4. AI fallback edge function for unresolved rows only
- Important nuance:
  - curated code rules run before database-ranked candidates
  - manual merchant rules in Supabase are still used by the RPC layer
  - transfer-person detection exists to preserve true peer-to-peer MobilePay classification

## Normalization model
- Normalization is intentionally merchant-first, not payment-rail-first.
- Shared concepts exist both in app TS and edge TS.
- Main normalization steps:
  - fold accents
  - transliterate Danish letters: `æ -> ae`, `ø -> o`, `å -> a`
  - lowercase and collapse whitespace
  - remove payment rails:
    - `MobilePay`
    - `Mob.Pay`
    - `Apple Pay`
    - `Google Pay`
    - `MP`
  - remove card/bank noise:
    - `Visa`
    - `Mastercard`
    - `Debit`
    - `Credit`
    - `Card`
    - `www`
    - `http`
  - split compound strings on separators like `-`, `*`, `/`, `:`
  - collapse repeated merchant names
  - trim suffix/noise tokens like `aps`, `as`, `com`, `bill`, `dk`, city/noise fragments
  - prefer canonical merchant alias if matched
- The goal is to convert noisy strings like:
  - `OiSTER - Mob.Pay*OiSTER` -> `oister`
  - `Easy Park - EasyPark A/S` -> `easy park`
  - `Apple - APPLE.COM/BILL` -> `apple`
  - `MONO*SEVASTIAN BAHYNSKYI` -> `mono`
  - `Revolut**1821*` -> `revolut`

## Curated merchant knowledge
- Implemented in code via:
  - `merchantAliases`
  - `curatedCategories`
- These are high-confidence, deterministic merchant mappings.
- Not exhaustive list, but important current examples:
  - `LØNOVERFØRSEL` -> `Income / Salary`
  - `SU` -> `Income / Benefits`
  - `Interest` -> `Income / Interest`
  - `Easy Park` -> `Transport / Parking`
  - `OiSTER`, `Lebara`, `Lyca Mobile` -> `Household / Phone`
  - `Revolut`, `MONO`, `TransferGo` -> `Transfers / Transfer`
  - `Banken Food Hall` -> `Food / Restaurants`
  - `Apple`, `Spotify`, `Claude`, `Disney`, `DAZN` -> `Entertainment / Subscriptions`
  - `DSB`, `Midttrafik`, `Rejsekort` -> `Transport / Public transit`
  - `Ingo`, `OK`, `Q8`, `F24`, `Circle K` -> `Transport / Fuel`
  - `Tryg`, `IF` -> `Household / Insurance`
  - `PureGym`, `Fitness World`, `FitnessX` -> `Health / Fitness`
  - `Normal`, `Matas` -> `Shopping / Personal care`
  - `Zalando`, `HM`, `Shein`, `Temu` -> `Shopping / Clothes`
  - `Elgiganten`, `Power`, `Proshop`, `Harald Nyborg`, `Jysk` -> `Shopping / Electronics`
  - `BS AB ALBO` -> `Household / Rent`
  - `Nortec` -> `Household / Internet`

## Transfer-person logic
- MobilePay should only survive as a category for real person-to-person transfers.
- Transfer-person detection:
  - looks for `MobilePay` or `Mob.Pay` in the source text
  - strips rail terms and transfer words
  - extracts a probable person name
  - requires that normalized name to already exist in `transfer_people`
- If matched:
  - category becomes `Transfers / MobilePay`
  - source becomes `transfer_person`
- If a merchant is clearly known, it should not become `MobilePay`.

## Confidence thresholds
- Deterministic selection lives in `pickDeterministicRankedCandidate(...)`.
- Current thresholds:
  - `rule`: always apply
  - `memory_exact`: apply only if
    - `observationCount >= 2`
    - `supportRatio >= 0.85`
  - `memory_fuzzy`: apply only if
    - `similarity >= 0.82`
    - `observationCount >= 3`
    - `supportRatio >= 0.90`
  - `AI fallback`: only accepted if
    - `confidence >= 0.92`
- If nothing clears threshold, leave category empty.

## Supabase schema

### Extensions
- `pg_trgm`
- `unaccent`

### Categories added in migration
- `Entertainment / Subscriptions`
- `Income / Benefits`
- `Household / Insurance`
- `Health / Fitness`
- `Shopping / Personal care`
- `Other / Travel`

### Tables

#### `merchant_category_rules`
- User-scoped merchant override table.
- Important columns:
  - `user_id`
  - `match_target`
    - `normalized_merchant`
    - `raw_text`
    - `bank_category`
    - `sender`
    - `receiver`
  - `match_type`
    - `exact`
    - `prefix`
    - `contains`
    - `regex`
  - `pattern`
  - `kind`
  - `canonical_merchant`
  - `category_id`
  - `is_shared_topup`
  - `is_blocked`
  - `priority`
  - `source`
  - `notes`
  - `updated_at`
- Unique index:
  - `(user_id, kind, match_target, match_type, pattern)`

#### `merchant_category_memory`
- User-scoped merchant history table.
- Important columns:
  - `user_id`
  - `kind`
  - `normalized_merchant`
  - `canonical_merchant`
  - `category_id`
  - `is_shared_topup`
  - `observation_count`
  - `support_ratio`
  - `sample_names`
  - `last_seen_on`
  - `source`
  - `updated_at`
- Unique index:
  - `(user_id, kind, normalized_merchant)`
- Trigram GIN index on `normalized_merchant`

### RPC
- `rank_transaction_category_candidates(...)`
- Inputs:
  - kind
  - raw text
  - normalized merchant
  - bank category
  - sender
  - receiver
  - limit
- Output fields include:
  - `category_id`
  - `source`
  - `confidence`
  - `normalized_merchant`
  - `canonical_merchant`
  - `is_shared_topup`
  - `matched_pattern`
  - `similarity`
  - `observation_count`
  - `support_ratio`
  - `priority`
- RPC behavior:
  - user-scoped through `auth.uid()`
  - checks blocked rules first
  - ranks rule matches, exact memory matches, then fuzzy memory matches

## Row-level security
- Both merchant tables have RLS.
- Policies are user-owned only.
- Reads/writes are scoped to `auth.uid() = user_id`.

## Edge function behavior

### `parse-transaction-csv`
- Purpose:
  - deterministic row extraction
  - dedicated bank-export parsing
  - generic fallback parsing
  - last-resort LLM parsing
- Returns structured rows with rich source-bank metadata.
- Important design choice:
  - parser is not the main categorizer for expenses
  - it only does obvious deterministic income classification

### `suggest-category`
- Purpose:
  - fallback categorization only
  - single-row or batch unresolved rows
- Prompt includes:
  - name
  - raw text
  - comment/message
  - transaction type
  - sender/receiver
  - bank category hint
  - normalized merchant
  - deterministic candidates
  - allowed categories
- There is also a verifier pass.
- Prompt explicitly forbids common bad behavior:
  - assigning `MobilePay` just because the rail appears
  - treating `Apple.com/BILL` as transfer-like
  - missing obvious mappings like `Easy Park`, `OiSTER`, `Revolut`, `Banken Food Hall`

### Auth note
- Deployed functions currently have `verify_jwt = false`.
- They still manually validate auth by calling Supabase Auth with the `Authorization` header.
- This is how the live deployment is currently working.

## Merchant learning behavior

### `saveMerchantMemoryObservation(...)`
- Called after saving imported and normal transactions.
- If merchant is unseen:
  - inserts a new memory row with `observation_count = 1`, `support_ratio = 1`
- If merchant exists with the same category:
  - increments observation count
  - recalculates support ratio
  - updates sample names and last seen date
- Important limitation:
  - if merchant already exists with a different category, current code returns early and does not reconcile competing categories
  - memory is effectively `one merchant + one category`, not a full distribution
- This is likely one of the best places to improve next.

### `upsertMerchantRule(...)`
- Saves exact normalized merchant rules for the current user.
- Used for manual overrides / preference saves.
- Writes to `merchant_category_rules` with:
  - `match_target = normalized_merchant`
  - `match_type = exact`
  - `source = manual`

## Merchant rules UI
- `AiRulesScreen.tsx` now renders `Merchant Rules`.
- It reads from `merchant_category_rules`.
- Supports:
  - category remapping
  - block/unblock
  - shared-topup toggle
  - delete rule
- The filename is legacy, but the functionality is no longer “AI rules”.

## Bootstrap from historical export

### Input
- Historical file used:
  - `/Users/seva/Downloads/export.csv`
- Important:
  - bootstrap does not insert those rows into `transactions`
  - it only derives merchant intelligence seeds

### Script
- [scripts/bootstrap-merchant-intelligence.cjs](/Users/seva/Developer/cash-flow/scripts/bootstrap-merchant-intelligence.cjs)
- Important CLI args:
  - `--input`
  - `--output`
  - `--sql-dir`
  - `--user-id`
- Current default `userId` in the script is hardcoded:
  - `9d3ee47b-93a9-465b-8274-3663f2d12cb5`
- If this script is reused for another user, that default should not be trusted blindly.

### Bootstrap heuristics
- Conservative seeding thresholds:
  - `MIN_MEMORY_OBSERVATIONS = 2`
  - `MIN_RULE_OBSERVATIONS = 3`
  - `MIN_RULE_SUPPORT_RATIO = 0.9`
  - `MIN_TRANSFER_PERSON_OCCURRENCES = 4`
- Explicit rule merchants are seeded even if they are mainly curated high-value merchants.
- Transfer-person names are only seeded if they repeat enough.
- `Not categorised` bank values are not treated as generic category truth.

### Seeded totals currently in Supabase
- `merchant_category_rules`: 73
- `merchant_category_memory`: 94
- `transfer_people`: 12

## Current import-review UX
- The review UI no longer pretends every row has a category.
- During categorization:
  - category field shows spinner/skeleton
- After categorization:
  - field shows chosen category
  - subtitle shows source and confidence
- If some rows remain unresolved:
  - user gets a review message instead of silent bad categorization

## Deployment status
- Migration applied:
  - [supabase/migrations/20260411170000_merchant_intelligence.sql](/Users/seva/Developer/cash-flow/supabase/migrations/20260411170000_merchant_intelligence.sql)
- Edge functions deployed and active:
  - `parse-transaction-csv`
  - `suggest-category`
- The live deploy was done by bundling TS source into single-file JS for MCP deployment.
- Source of truth remains the TS files in the repo, not the bundled deployed artifact.

## Validation status
- Last validation after implementation:
  - `pnpm lint:changed` passed
  - `pnpm typecheck` passed

## Legacy or deprecated paths
- `ai_category_rules` should be considered deprecated for categorization.
- Old files may still exist but are not the main path anymore:
  - [src/features/transactions/categorizationRules.ts](/Users/seva/Developer/cash-flow/src/features/transactions/categorizationRules.ts)
  - [supabase/functions/suggest-category/categorization.ts](/Users/seva/Developer/cash-flow/supabase/functions/suggest-category/categorization.ts)
- Improvements should target the merchant-intelligence path, not resurrect the old AI-first flow.

## Known weaknesses / likely improvement targets
- `merchant_category_memory` stores one row per normalized merchant and ignores conflicting recategorizations.
- Curated heuristics are still hardcoded in TS and partially duplicated in bootstrap logic.
- App runtime and edge runtime share the same normalization ideas, but duplication still exists across files.
- `transfer_people` detection depends on known names and only works after seeding or prior learning.
- Bootstrap script contains a hardcoded default user id.
- The live deploy path is a little awkward because local Supabase CLI was not linked during deployment.
- More merchant aliases and better canonicalization can still improve results significantly.
- Some merchants currently fall back to broad categories like `electronics`, `clothes`, or `personal care`; those could be refined if the taxonomy evolves.

## Safe invariants Claude should preserve
- Do not go back to `LLM-first`.
- Do not auto-assign low-confidence categories just to fill every row.
- Keep `MobilePay` restricted to real person transfers.
- Keep import review capable of leaving rows unresolved.
- Keep deterministic logic explainable and user-correctable.
- Preserve direct Supabase access and conservative flat feature structure.

## Good next steps for improvement
- Improve merchant memory to track multi-category evidence instead of one-row-per-merchant.
- Reduce duplication between:
  - app-side normalization
  - edge shared normalization
  - bootstrap script normalization
- Add more canonical aliases from real import failures.
- Improve rule generation from manual corrections.
- Add stronger diagnostics so unresolved rows can explain why they were left empty.
- Add tests/fixtures around the known tricky merchants and exact normalization outputs.
