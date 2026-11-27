export type TransactionKind = 'expense' | 'income';
export type SharedParticipant = 'me' | 'gf';

export type TransactionInsert = {
  user_id: string;
  kind: TransactionKind;
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  name: string;
  comment: string | null;
  category_id: string | null;
  country_iso: string | null;
  recurring: boolean;
  shared: boolean;
  shared_participant: SharedParticipant | null;
  is_salary: boolean;
  is_shared_topup: boolean;
  currency_code: string;
  original_amount_minor: number;
  converted_amount_minor: number;
  fx_rate: number;
};

export type TransactionDraft = {
  id?: string;
  kind?: TransactionKind;
  amount_minor?: number;
  original_amount_minor?: number;
  currency_code?: string;
  category_id?: string | null;
  name?: string;
  comment?: string | null;
  occurred_on?: string;
  recurring?: boolean;
  shared?: boolean;
  shared_participant?: SharedParticipant | null;
  is_salary?: boolean;
  is_shared_topup?: boolean;
  /** When true, entry came from Shared tab: shared expense vs top-up fixed from draft. */
  from_shared_screen?: boolean;
  country_iso?: string | null;
};

export type Movement = 'spend' | 'income' | 'moved' | 'topup' | 'person' | 'refund' | 'ignore';
export type ReasonSource = 'transfer' | 'salary' | 'person' | 'rule' | 'memory' | 'mcc' | 'ai' | 'you' | 'manual';

export type TransactionRow = TransactionInsert & {
  id: string;
  /** Bank sync (v2): where the row came from, its bank status and why it got its labels. Manual history has nulls. */
  source?: 'manual' | 'bank';
  status?: 'booked' | 'pending' | 'void';
  bank_transaction_id?: string | null;
  merchant_key?: string | null;
  movement?: Movement | null;
  paid_by?: 'me' | 'partner' | null;
  reason?: string | null;
  reason_source?: ReasonSource | null;
  confidence?: number | null;
  needs_review?: boolean;
  counterparty_person_id?: string | null;
  budget_effect_minor?: number;
  personal_effect_minor?: number;
  shared_effect_minor?: number;
  is_neutral_display?: boolean;
  created_at: string;
  updated_at: string;
};
