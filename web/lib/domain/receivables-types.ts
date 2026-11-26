export type ReceivableStatus = 'open' | 'closed';
export type ReceivableEventKind = 'lent' | 'repaid';

export type ReceivableRow = {
  id: string;
  user_id: string;
  name: string;
  principal_minor: number;
  remaining_minor: number;
  status: ReceivableStatus;
  created_at: string;
};

export type ReceivableEventRow = {
  id: string;
  receivable_id: string;
  user_id: string;
  kind: ReceivableEventKind;
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  created_at: string;
};
