import { describe, expect, it } from 'vitest'
import { addDays, format, startOfDay } from 'date-fns'
import { buildSettlementPlan } from './settle'
import type { Account, Bill, Income, PlannedExpense, SavingsGoal } from './types'

const base = { id: 'x', user_id: 'u', created_at: '', updated_at: '', notes: null }
const today = startOfDay(new Date())
const d = (offset: number) => format(addDays(today, offset), 'yyyy-MM-dd')

const account = (over: Partial<Account> = {}): Account =>
  ({ ...base, name: 'Main', balance: 1000, type: 'current', credit_limit: null, is_primary: true, ...over }) as Account
const income = (over: Partial<Income> = {}): Income =>
  ({ ...base, name: 'Salary', amount: 2000, frequency: 'monthly', income_type: 'salary', next_date: d(0), is_active: true, ...over }) as Income
const bill = (over: Partial<Bill> = {}): Bill =>
  ({ ...base, name: 'Rent', amount: 800, frequency: 'monthly', category: 'housing', next_due_date: d(0), is_active: true, ...over }) as Bill
const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal =>
  ({ ...base, name: 'Pot', amount_per_payslip: 100, current_saved: 0, target_amount: null, start_date: null, end_date: null, deduction_type: 'post_tax', is_active: true, is_disposable_pot: false, ...over }) as SavingsGoal
const planned = (over: Partial<PlannedExpense> = {}): PlannedExpense =>
  ({ ...base, name: 'Gift', amount: 50, date: d(0), category: 'gift', is_completed: false, ...over }) as PlannedExpense

const empty = { accounts: [account()], bills: [], income: [], savingsGoals: [], plannedExpenses: [] }

describe('buildSettlementPlan', () => {
  it('first-time settle covers today only', () => {
    const plan = buildSettlementPlan({ ...empty, lastSettledDate: null, bills: [bill({ next_due_date: d(-2) })] })
    expect(plan.from).toBe(d(0))
    expect(plan.to).toBe(d(0))
    // A bill stale-dated 2 days ago rolls forward; its next occurrence may not be today
    expect(plan.net).toBeLessThanOrEqual(0)
  })

  it('catches up multiple missed occurrences', () => {
    const plan = buildSettlementPlan({
      ...empty,
      lastSettledDate: d(-15),
      bills: [bill({ frequency: 'weekly', next_due_date: d(-14) })],
    })
    const item = plan.items.find((i) => i.label === 'Rent')!
    expect(item.count).toBe(3) // d-14, d-7, d0
    expect(item.amount).toBe(-2400)
  })

  it('nets income, bills, savings, and planned correctly', () => {
    const plan = buildSettlementPlan({
      accounts: [account()],
      lastSettledDate: d(-1),
      income: [income()],
      bills: [bill()],
      savingsGoals: [goal()],
      plannedExpenses: [planned()],
    })
    // +2000 - 800 - 100 - 50
    expect(plan.net).toBe(1050)
    expect(plan._plannedDone.length).toBe(1)
    expect(plan._goalAdds[0].add).toBe(100)
  })

  it('rolls recurring dates strictly past today and deactivates one-offs', () => {
    const plan = buildSettlementPlan({
      ...empty,
      lastSettledDate: d(-1),
      income: [income(), income({ id: 'i2', name: 'Refund', frequency: 'one_off', income_type: 'other', next_date: d(0) })],
    })
    const salaryRoll = plan._incomeRolls.find((r) => r.id === 'x')!
    expect(salaryRoll.deactivate).toBe(false)
    expect(salaryRoll.next_date > d(0)).toBe(true)
    const oneOffRoll = plan._incomeRolls.find((r) => r.id === 'i2')!
    expect(oneOffRoll.deactivate).toBe(true)
  })

  it('prefers the primary account', () => {
    const plan = buildSettlementPlan({
      ...empty,
      accounts: [account({ id: 'a', is_primary: false }), account({ id: 'b', name: 'Joint', is_primary: true })],
      lastSettledDate: d(-1),
    })
    expect(plan.account?.id).toBe('b')
  })
})
