import type { TransactionRow, TransactionInsert } from '@/core/domain/transaction-types'
import type { CategoryRow, CategoryOverrideRow } from '@/core/domain/categories-types'
import type { SavingsAccountRow, SavingsEventRow } from '@/core/domain/savings-types'
import type { LoanRow, LoanEventRow } from '@/core/domain/loans-types'
import type { ReceivableRow, ReceivableEventRow } from '@/core/domain/receivables-types'
import type { BudgetRow, MerchantRuleRow, TransferPersonRow, ProfileRow, BankConnectionRow, BankAccountRow, SyncRunRow, SplitRow, PaybackRow, MerchantLogoRow } from '@/core/domain/rows'

export type { TransactionRow, TransactionInsert, CategoryRow, CategoryOverrideRow, SavingsAccountRow, SavingsEventRow, LoanRow, LoanEventRow, ReceivableRow, ReceivableEventRow, BudgetRow, MerchantRuleRow, TransferPersonRow, ProfileRow, BankConnectionRow, BankAccountRow, SyncRunRow, SplitRow, PaybackRow, MerchantLogoRow }

/** Everything the screens read, loaded once per session (docs/redesign/DATA.md § 3, "useOverview"). */
export type Tables = {
  transactions: TransactionRow[]
  categories: CategoryRow[]
  category_overrides: CategoryOverrideRow[]
  budgets: BudgetRow[]
  /** Category limits for the joint account; same shape as the personal ones in `budgets`. */
  shared_budgets: BudgetRow[]
  savings_accounts: SavingsAccountRow[]
  savings_events: SavingsEventRow[]
  loans: LoanRow[]
  loan_events: LoanEventRow[]
  receivables: ReceivableRow[]
  receivable_events: ReceivableEventRow[]
  merchant_category_rules: MerchantRuleRow[]
  transfer_people: TransferPersonRow[]
  profile: ProfileRow | null
  bank_connections: BankConnectionRow[]
  bank_accounts: BankAccountRow[]
  sync_runs: SyncRunRow[]
  transaction_splits: SplitRow[]
  paybacks: PaybackRow[]
  /** Only merchants that have a logo; filled by scripts/logos.ts. */
  merchant_logos: MerchantLogoRow[]
}
export type TableName = keyof Tables
