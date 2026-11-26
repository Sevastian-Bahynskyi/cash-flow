import type { TransactionRow, TransactionInsert } from '@/lib/domain/transaction-types'
import type { CategoryRow, CategoryOverrideRow } from '@/lib/domain/categories-types'
import type { SavingsAccountRow, SavingsEventRow } from '@/lib/domain/savings-types'
import type { LoanRow, LoanEventRow } from '@/lib/domain/loans-types'
import type { ReceivableRow, ReceivableEventRow } from '@/lib/domain/receivables-types'
import type { BudgetRow, MerchantRuleRow, TransferPersonRow, ProfileRow } from '@/lib/domain/rows'

export type { TransactionRow, TransactionInsert, CategoryRow, CategoryOverrideRow, SavingsAccountRow, SavingsEventRow, LoanRow, LoanEventRow, ReceivableRow, ReceivableEventRow, BudgetRow, MerchantRuleRow, TransferPersonRow, ProfileRow }

/** Everything the screens read, loaded once per session (docs/redesign/DATA.md § 3, "useOverview"). */
export type Tables = {
  transactions: TransactionRow[]
  categories: CategoryRow[]
  category_overrides: CategoryOverrideRow[]
  budgets: BudgetRow[]
  savings_accounts: SavingsAccountRow[]
  savings_events: SavingsEventRow[]
  loans: LoanRow[]
  loan_events: LoanEventRow[]
  receivables: ReceivableRow[]
  receivable_events: ReceivableEventRow[]
  merchant_category_rules: MerchantRuleRow[]
  transfer_people: TransferPersonRow[]
  profile: ProfileRow | null
}
export type TableName = keyof Tables
