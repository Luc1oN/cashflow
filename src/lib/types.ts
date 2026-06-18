export type AccountType = 'current' | 'savings' | 'credit_card' | 'other'
export type BillFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual' | 'one_off'
export type BillCategory = 'housing' | 'utilities' | 'insurance' | 'transport' | 'subscriptions' | 'food' | 'health' | 'education' | 'other'
export type IncomeFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'one_off'
export type IncomeType = 'salary' | 'other'
export type DeductionType = 'post_tax' | 'pre_tax'
export type PlannedExpenseCategory = 'holiday' | 'shopping' | 'gift' | 'car' | 'home' | 'event' | 'other'
export type ExpenseCategory = 'food_drink' | 'transport' | 'shopping' | 'entertainment' | 'health' | 'travel' | 'bills' | 'subscriptions' | 'home' | 'other'
export type BudgetAlertType = 'safe_to_spend' | 'category'
export type LoanFrequency = 'weekly' | 'fortnightly' | 'monthly'

interface Base {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  last_settled_date: string | null
  currency: 'GBP' | 'EUR' | 'USD'
  default_horizon: number
  onboarding_dismissed: boolean
}

export interface Settlement {
  id: string
  user_id: string
  created_at: string
  from_date: string
  to_date: string
  net: number
  item_count: number
  account_id: string | null
}

export interface Transaction {
  id: string
  user_id: string
  created_at: string
  settlement_id: string | null
  account_id: string | null
  date: string
  label: string
  amount: number
  kind: 'income' | 'bill' | 'savings' | 'planned' | 'adjustment'
}

export interface Account extends Base {
  name: string
  balance: number
  type: AccountType
  credit_limit: number | null
  is_primary: boolean
  notes: string | null
}

export interface Bill extends Base {
  name: string
  amount: number
  next_due_date: string
  frequency: BillFrequency
  category: BillCategory
  is_active: boolean
  notes: string | null
}

export interface Income extends Base {
  name: string
  amount: number
  frequency: IncomeFrequency
  income_type: IncomeType
  next_date: string
  is_active: boolean
  notes: string | null
}

export interface SavingsGoal extends Base {
  name: string
  amount_per_payslip: number
  current_saved: number
  target_amount: number | null
  start_date: string | null
  end_date: string | null
  deduction_type: DeductionType
  is_active: boolean
  is_disposable_pot: boolean
  notes: string | null
}

export interface PlannedExpense extends Base {
  name: string
  amount: number
  date: string
  category: PlannedExpenseCategory
  is_completed: boolean
  notes: string | null
}

export interface Expense extends Base {
  name: string
  amount: number
  date: string
  category: ExpenseCategory
  merchant: string | null
  receipt_url: string | null
  notes: string | null
}

export interface BudgetAlert extends Base {
  type: BudgetAlertType
  label: string
  monthly_limit: number
  category: string | null
  is_active: boolean
}

export interface Loan extends Base {
  name: string
  starting_balance: number
  interest_rate: number
  payment_amount: number
  payment_frequency: LoanFrequency
  start_date: string
  is_active: boolean
  notes: string | null
}

export interface OneOffLoanPayment extends Base {
  loan_id: string
  amount: number
  payment_date: string
  label: string | null
}
