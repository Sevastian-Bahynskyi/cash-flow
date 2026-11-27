export type LoanStatus = 'open' | 'closed';
export type LoanEventKind = 'borrowed' | 'repaid';

export type LoanRow = {
  id: string;
  user_id: string;
  name: string;
  principal_minor: number;
  remaining_minor: number;
  status: LoanStatus;
  created_at: string;
};

export type LoanEventRow = {
  id: string;
  loan_id: string;
  user_id: string;
  kind: LoanEventKind;
  amount_minor: number;
  occurred_on: string; // YYYY-MM-DD
  created_at: string;
};
