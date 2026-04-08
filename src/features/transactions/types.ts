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
  country_iso?: string | null;
};

export type TransactionRow = TransactionInsert & {
  id: string;
  created_at: string;
  updated_at: string;
};
