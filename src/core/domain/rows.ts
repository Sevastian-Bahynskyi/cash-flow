// Row types for the tables the app reads.
export type BudgetRow = { id: string; user_id: string; category_id: string; salary_cycle_id: string; amount_minor: number; notes: string | null; created_at: string }
export type MerchantRuleRow = {
  id: string; user_id: string
  match_target: 'normalized_merchant' | 'raw_text' | 'bank_category' | 'sender' | 'receiver'
  match_type: 'exact' | 'prefix' | 'contains' | 'regex'
  pattern: string; kind: 'expense' | 'income'; canonical_merchant: string | null; category_id: string | null
  is_shared_topup: boolean; is_blocked: boolean; priority: number; source: 'manual' | 'bootstrap_curated' | 'bootstrap_history'; notes: string | null; updated_at: string
}
export type PersonKind = 'self' | 'partner' | 'settle_up' | 'family' | 'ignore'
export type TransferPersonRow = { id: string; user_id: string; name: string; normalized_name: string; kind?: PersonKind; opening_balance_minor?: number; alias_of?: string | null; created_at: string; updated_at: string }
// Bank sync (v2). Clients only read these; the bank-sync function writes them.
export type BankConnectionRow = { id: string; aspsp_name: string; valid_until: string; status: string }
export type BankAccountRow = { id: string; connection_id: string; name: string | null; currency: string; role: 'personal' | 'joint' | 'savings'; balance_minor: number | null; balance_at: string | null; last_synced_at: string | null; last_error: string | null }
/** A merchant's cached logo: `path` is the object in the public merchant-logos bucket. */
export type MerchantLogoRow = { key: string; path: string }
export type SyncRunRow = { id: string; trigger: 'cron' | 'user'; started_at: string; finished_at: string | null; ok: boolean | null; error: string | null }
export type SplitRow = { id: string; user_id: string; transaction_id: string; category_id: string; amount_minor: number; note: string | null; created_at: string }
export type PaybackRow = { id: string; user_id: string; payment_transaction_id: string; expense_transaction_id: string; amount_minor: number; created_at: string }
export type ProfileRow = { display_name: string | null; avatar_url: string | null }

export const normalizeTransferPersonName = (value: string): string =>
  value.normalize('NFKC').trim().toLowerCase().replace(/[^0-9a-z\u00c0-\u024f]+/gi, ' ').replace(/\s+/g, ' ').trim()
