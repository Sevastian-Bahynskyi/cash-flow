export type SavingsAction = 'add' | 'remove' | 'set';

export type SavingsEventRow = {
  id: string;
  user_id: string;
  action: SavingsAction;
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
};
