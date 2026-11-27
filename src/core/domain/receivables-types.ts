export type ReceivableStatus = 'open' | 'closed';
export type ReceivableEventKind = 'lent' | 'repaid';

export type ReceivableRow = {
  id: string;
  user_id: string;
  name: string;
  principal_minor: number;
  remaining_minor: number;
  status: ReceivableStatus;
  /** The person this debt is with, when it was made from People. */
  person_id?: string | null;
  created_at: string;
};

export type ReceivableEventRow = {
  id: string;
  receivable_id: string;
  user_id: string;
  kind: ReceivableEventKind;
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  /** The bank transfer this payment is, when linked. */
  transaction_id?: string | null;
  created_at: string;
};
