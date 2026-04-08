export type TransactionKind = 'expense' | 'income';

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
  is_salary: boolean;
  is_shared_topup: boolean;
};
