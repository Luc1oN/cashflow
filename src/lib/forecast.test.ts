import { describe, expect, it } from 'vitest'
import { addDays, format, startOfDay } from 'date-fns'
import { buildForecast, buildLoanForecast, cashPosition, creditCard, netWorth, occurrences, perMonth } from './forecast'
import type { Account, Bill, Income, Loan, PlannedExpense, SavingsGoal } from './types'

const base = { id: 'x', user_id: 'u', created_at: '', updated_at: '', notes: null }
const today = startOfDay(new Date())
const d = (offset: number) => format(addDays(today, offset), 'yyyy-MM-dd')

const card = (over: Partial<Account> = {}): Account =>
  ({ ...base, name: 'Visa', balance: 1000, type: 'credit_card', credit_limit: 4000, is_primary: true, ...over }) as Account
const current = (over: Partial<Account> = {}): Account =>
  ({ ...base, name: 'Current', balance: 500, type: 'current', credit_limit: null, is_primary: false, ...over }) as Account
const income = (over: Partial<Income> = {}): Income =>
  ({ ...base, name: 'Salary', amount: 1500, frequency: 'fortnightly', income_type: 'salary', next_date: d(5), is_active: true, ...over }) as Income
const bill = (over: Partial<Bill> = {}): Bill =>
  ({ ...base, name: 'Rent', amount: 800, frequency: 'monthly', category: 'housing', next_due_date: d(2), is_active: true, ...over }) as Bill
const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal =>
  ({ ...base, name: 'Pot', amount_per_payslip: 500, current_saved: 0, target_amount: null, start_date: null, end_date: null, deduction_type: 'post_tax', is_active: true, is_disposable_pot: false, ...over }) as SavingsGoal
const planned = (over: Partial<PlannedExpense> = {}): PlannedExpense =>
  ({ ...base, name: 'Gift', amount: 50, date: d(3), category: 'gift', is_completed: false, ...over }) as PlannedExpense

const empty = { bills: [], income: [], savingsGoals: [], plannedExpenses: [] }

describe('occurrences', () => {
  it('expands weekly recurrence inside the window', () => {
    expect(occurrences(d(0), 'weekly', today, addDays(today, 28)).length).toBe(5)
  })
  it('rolls stale start dates forward', () => {
    expect(occurrences(d(-30), 'fortnightly', today, addDays(today, 27)).length).toBe(2)
  })
  it('keeps a one_off only if inside the window', () => {
    expect(occurrences(d(5), 'one_off', today, addDays(today, 30)).length).toBe(1)
    expect(occurrences(d(-1), 'one_off', today, addDays(today, 30)).length).toBe(0)
  })
})

describe('perMonth', () => {
  it('normalises frequencies to a monthly figure', () => {
    expect(perMonth(1531, 'fortnightly')).toBeCloseTo(3317.17, 2)
    expect(perMonth(100, 'monthly')).toBe(100)
    expect(perMonth(1200, 'annual')).toBe(100)
    expect(perMonth(300, 'quarterly')).toBe(100)
    expect(perMonth(500, 'one_off')).toBe(0)
  })
})

describe('creditCard', () => {
  it('prefers the primary card', () => {
    const cards = [card({ id: 'a', is_primary: false }), card({ id: 'b', name: 'Amex', is_primary: true })]
    expect(creditCard(cards)?.id).toBe('b')
  })
  it('returns null when there is no card', () => {
    expect(creditCard([current()])).toBeNull()
  })
})

describe('cashPosition', () => {
  it('subtracts credit card balances from cash', () => {
    expect(cashPosition([current({ balance: 1000 }), card({ balance: 300 })])).toBe(700)
  })
})

describe('netWorth', () => {
  it('nets cash + savings against card + loan debt, ignoring inactive', () => {
    const accounts = [current({ balance: 1000 }), card({ balance: 2000 })]
    const goals = [goal({ current_saved: 500 }), goal({ id: 'g2', current_saved: 999, is_active: false })]
    const loans: Loan[] = [
      ({ ...base, name: 'L1', starting_balance: 3000, interest_rate: 5, payment_amount: 100, payment_frequency: 'monthly', start_date: d(0), is_active: true }) as Loan,
      ({ ...base, id: 'l2', name: 'L2', starting_balance: 5000, interest_rate: 5, payment_amount: 100, payment_frequency: 'monthly', start_date: d(0), is_active: false }) as Loan,
    ]
    const nw = netWorth(accounts, goals, loans)
    expect(nw.cashAssets).toBe(1000)
    expect(nw.savingsAssets).toBe(500)
    expect(nw.cardDebt).toBe(2000)
    expect(nw.loanDebt).toBe(3000)
    expect(nw.assets).toBe(1500)
    expect(nw.debts).toBe(5000)
    expect(nw.net).toBe(-3500)
  })
})

describe('buildForecast (credit-card-centric)', () => {
  it('starts at limit minus balance owed', () => {
    const r = buildForecast({ accounts: [card({ balance: 1000 })], ...empty, horizonDays: 10 })
    expect(r.limit).toBe(4000)
    expect(r.startOwed).toBe(1000)
    expect(r.startAvailable).toBe(3000)
  })

  it('charges bills to the card (available falls)', () => {
    const r = buildForecast({ accounts: [card({ balance: 1000 })], bills: [bill({ amount: 500, next_due_date: d(2) })], income: [], savingsGoals: [], plannedExpenses: [], horizonDays: 10 })
    expect(r.days[2].available).toBe(2500)
    expect(r.lowestAvailable.available).toBe(2500)
    expect(r.firstOverLimit).toBeNull()
  })

  it('flags going over the limit', () => {
    const r = buildForecast({ accounts: [card({ balance: 3800 })], bills: [bill({ amount: 500, next_due_date: d(2) })], income: [], savingsGoals: [], plannedExpenses: [], horizonDays: 10 })
    expect(r.firstOverLimit).toBe(d(2))
    expect(r.lowestAvailable.available).toBe(-300)
  })

  it('pays the card down on payday by salary minus post-tax savings', () => {
    const r = buildForecast({
      accounts: [card({ balance: 2000 })],
      bills: [],
      income: [income({ amount: 1500, next_date: d(5) })],
      savingsGoals: [goal({ amount_per_payslip: 500 })],
      plannedExpenses: [],
      horizonDays: 10,
    })
    // remainder 1500 - 500 = 1000 pays card down: owed 2000 -> 1000, available 2000 -> 3000
    expect(r.days[5].available).toBe(3000)
  })

  it('caps available at the limit when overpaid; ignores pre-tax goals', () => {
    const r = buildForecast({
      accounts: [card({ balance: 300 })],
      bills: [],
      income: [income({ amount: 1500, next_date: d(2) })],
      savingsGoals: [goal({ deduction_type: 'pre_tax', amount_per_payslip: 9999 })],
      plannedExpenses: [],
      horizonDays: 6,
    })
    // pre-tax goal ignored, remainder 1500 > 300 owed -> owed floors at 0, available caps at limit
    expect(r.days[2].available).toBe(4000)
  })

  it('charges planned expenses to the card', () => {
    const r = buildForecast({ accounts: [card({ balance: 1000 })], bills: [], income: [], savingsGoals: [], plannedExpenses: [planned({ amount: 50, date: d(3) })], horizonDays: 10 })
    expect(r.days[3].available).toBe(2950)
  })
})

describe('buildLoanForecast', () => {
  const loan = (over: Partial<Loan> = {}): Loan =>
    ({ ...base, name: 'Car', starting_balance: 1000, interest_rate: 0, payment_amount: 100, payment_frequency: 'monthly', start_date: d(0), is_active: true, ...over }) as Loan

  it('pays off a zero-interest loan', () => {
    const f = buildLoanForecast(loan(), [])
    expect(f.payoffDate).not.toBeNull()
    expect(f.totalInterest).toBe(0)
    expect(f.totalPaid).toBe(1000)
  })

  it('accrues interest', () => {
    const f = buildLoanForecast(loan({ interest_rate: 12 }), [])
    expect(f.totalInterest).toBeGreaterThan(0)
    expect(f.totalPaid).toBeCloseTo(1000 + f.totalInterest, 1)
  })

  it('lump sums shorten payoff', () => {
    const without = buildLoanForecast(loan({ starting_balance: 2000 }), [])
    const withLump = buildLoanForecast(loan({ starting_balance: 2000 }), [
      { ...base, loan_id: 'x', amount: 1000, payment_date: d(15), label: null } as never,
    ])
    expect(withLump.points.length).toBeLessThan(without.points.length)
  })
})
