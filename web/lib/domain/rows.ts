// Row types for tables the web app reads (docs/redesign/DATA.md § 2).
export type BudgetRow = { id: string; user_id: string; category_id: string; salary_cycle_id: string; amount_minor: number; notes: string | null; created_at: string }
export type MerchantRuleRow = {
  id: string; user_id: string
  match_target: 'normalized_merchant' | 'raw_text' | 'bank_category' | 'sender' | 'receiver'
  match_type: 'exact' | 'prefix' | 'contains' | 'regex'
  pattern: string; kind: 'expense' | 'income'; canonical_merchant: string | null; category_id: string | null
  is_shared_topup: boolean; is_blocked: boolean; priority: number; source: 'manual' | 'bootstrap_curated' | 'bootstrap_history'; notes: string | null; updated_at: string
}
export type TransferPersonRow = { id: string; user_id: string; name: string; normalized_name: string; created_at: string; updated_at: string }
export type ProfileRow = { display_name: string | null; avatar_url: string | null }

export const normalizeTransferPersonName = (value: string): string =>
  value.normalize('NFKC').trim().toLowerCase().replace(/[^0-9a-z\u00c0-\u024f]+/gi, ' ').replace(/\s+/g, ' ').trim()
