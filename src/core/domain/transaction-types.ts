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
  /** Left out of the trip it falls in ("Not part of the trip"). */
  trip_exclude?: boolean;
  /** Counted in the trip it falls in although it looks like home or online ("Count it in the trip"). */
  trip_include?: boolean;
  /** The bank text of the shop's branch; places are looked up by it (see trips.ts placeKey). */
  place_key?: string | null;
  budget_effect_minor?: number;
  personal_effect_minor?: number;
  shared_effect_minor?: number;
  is_neutral_display?: boolean;
  created_at: string;
  updated_at: string;
};
