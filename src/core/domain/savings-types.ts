export type SavingsAction = 'add' | 'remove' | 'set';

export type SavingsAccountRow = {
  id: string;
  user_id: string;
  name: string;
  goal_minor: number | null;
  color: string;
  icon: string;
  /** Bank sync (v2): the goal's balance comes from this synced savings account. */
  bank_account_id?: string | null;
  created_at: string;
};

export type SavingsEventRow = {
  id: string;
  user_id: string;
  savings_account_id: string | null;
  action: SavingsAction;
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
};
