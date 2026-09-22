import { describe, expect, it } from 'vitest'
import { addDays, format, startOfDay } from 'date-fns'
import { buildForecast } from './forecast'
import { buildVerdict, nextPayday, safeToSpend } from './verdict'
import type { Account, Bill, BudgetAlert, Expense, Income, PlannedExpense, SavingsGoal } from './types'

const base = { id: 'x', user_id: 'u', created_at: '', updated_at: '', notes: null }
const today = startOfDay(new Date())
const d = (offset: number) => format(addDays(today, offset), 'yyyy-MM-dd')

const card = (over: Partial<Account> = {}): Account =>
  ({ ...base, name: 'Visa', balance: 1000, type: 'credit_card', credit_limit: 4000, is_primary: true, ...over }) as Account
const current = (over: Partial<Account> = {}): Account =>
  ({ ...base, name: 'Current', balance: 500, type: 'current', credit_limit: null, is_primary: false, ...over }) as Account
const income = (over: Partial<Income> = {}): Income =>
  ({ ...base, name: 'Salary', amount: 1500, frequency: 'fortnightly', income_type: 'salary', next_date: d(10), is_active: true, ...over }) as Income
const bill = (over: Partial<Bill> = {}): Bill =>
  ({ ...base, name: 'Rent', amount: 800, frequency: 'monthly', category: 'housing', next_due_date: d(2), is_active: true, ...over }) as Bill
const planned = (over: Partial<PlannedExpense> = {}): PlannedExpense =>
  ({ ...base, name: 'Sofa', amount: 600, date: d(4), category: 'home', is_completed: false, ...over }) as PlannedExpense
const budget = (over: Partial<BudgetAlert> = {}): BudgetAlert =>
  ({ ...base, type: 'safe_to_spend', label: 'Monthly', monthly_limit: 400, category: null, is_active: true, ...over }) as BudgetAlert
const expense = (over: Partial<Expense> = {}): Expense =>
  ({ ...base, name: 'Lunch', amount: 10, date: d(0), category: 'food_drink', merchant: null, receipt_url: null, ...over }) as Expense

const noGoals: SavingsGoal[] = []
const forecastOf = (over: {
  accounts?: Account[]; bills?: Bill[]; income?: Income[]; plannedExpenses?: PlannedExpense[]; horizonDays?: number
} = {}) =>
  buildForecast({
    accounts: over.accounts ?? [card()],
    bills: over.bills ?? [],
    income: over.income ?? [],
    savingsGoals: noGoals,
    plannedExpenses: over.plannedExpenses ?? [],
    horizonDays: over.horizonDays ?? 90,
  })

describe('nextPayday', () => {
  it('finds the next salary date strictly after today', () => {
    expect(nextPayday([income({ next_date: d(6) })], 90)).toBe(d(6))
  })
  it('skips a payday that is today and rolls to the next occurrence', () => {
    expect(nextPayday([income({ next_date: d(0), frequency: 'fortnightly' })], 90)).toBe(d(14))
  })
  it('ignores non-salary income and paused streams', () => {
    expect(nextPayday([income({ income_type: 'other', next_date: d(3) })], 90)).toBeNull()
    expect(nextPayday([income({ is_active: false, next_date: d(3) })], 90)).toBeNull()
  })
  it('returns the earliest of several salary streams', () => {
    expect(nextPayday([income({ next_date: d(12) }), income({ id: 'b', next_date: d(5) })], 90)).toBe(d(5))
  })
  it('returns null when the next payday is beyond the horizon', () => {
    expect(nextPayday([income({ next_date: d(40), frequency: 'monthly' })], 30)).toBeNull()
  })
})

describe('safeToSpend', () => {
  it('is the lowest headroom between now and payday', () => {
    // Limit 4000, owed 1000 -> 3000 today. Rent 800 on day 2 -> 2200.
    // Payday is day 10, so the 800 bill is the binding constraint.
    const accounts = [card()]
    const inc = [income({ next_date: d(10) })]
    const s = safeToSpend({ forecast: forecastOf({ accounts, bills: [bill()], income: inc }), accounts, income: inc })
    expect(s.total).toBe(2200)
    expect(s.until).toBe(d(10))
    expect(s.untilIsPayday).toBe(true)
    expect(s.limitedBy).toBe('cashflow')
  })

  it('spends exactly its own answer without breaching the limit', () => {
    // The promise this number makes: spend `total` today and the forecast still
    // never goes below zero before the window ends.
    const accounts = [card()]
    const inc = [income({ next_date: d(10) })]
    const s = safeToSpend({ forecast: forecastOf({ accounts, bills: [bill()], income: inc }), accounts, income: inc })

    const after = buildForecast({
      accounts,
      bills: [bill()],
      income: inc,
      savingsGoals: noGoals,
      plannedExpenses: [planned({ amount: s.total, date: d(0) })],
      horizonDays: 90,
    })
    const lowestInWindow = Math.min(...after.days.filter((x) => x.date <= s.until).map((x) => x.available))
    expect(lowestInWindow).toBeGreaterThanOrEqual(0)
    expect(lowestInWindow).toBeCloseTo(0, 2)
  })

  it('ignores dips that fall after payday', () => {
    // A big spend on day 20 must not shrink what is safe to spend before the
    // day-10 payday.
    const accounts = [card()]
    const inc = [income({ next_date: d(10) })]
    const s = safeToSpend({
      forecast: forecastOf({ accounts, income: inc, plannedExpenses: [planned({ amount: 2900, date: d(20) })] }),
      accounts,
      income: inc,
    })
    expect(s.total).toBe(3000)
  })

  it('never goes negative when already over the limit', () => {
    const accounts = [card({ balance: 5000 })] // owed > limit
    const inc = [income({ next_date: d(10) })]
    const s = safeToSpend({ forecast: forecastOf({ accounts, income: inc }), accounts, income: inc })
    expect(s.total).toBe(0)
    expect(s.perDay).toBe(0)
  })

  it('falls back to a 30-day window with no salary stream', () => {
    const accounts = [card()]
    const s = safeToSpend({ forecast: forecastOf({ accounts }), accounts, income: [] })
    expect(s.untilIsPayday).toBe(false)
    expect(s.until).toBe(d(30))
    expect(s.days).toBe(31)
  })

  it('clips the fallback window to a short horizon', () => {
    const accounts = [card()]
    const s = safeToSpend({ forecast: forecastOf({ accounts, horizonDays: 7 }), accounts, income: [] })
    expect(s.until).toBe(d(7))
  })

  it('divides across the days left, inclusive of today', () => {
    const accounts = [card()]
    const inc = [income({ next_date: d(9) })]
    const s = safeToSpend({ forecast: forecastOf({ accounts, income: inc }), accounts, income: inc })
    expect(s.days).toBe(10)
    expect(s.perDay).toBe(300) // 3000 over 10 days
  })

  it('lets a tighter monthly budget cap the cashflow figure', () => {
    const accounts = [card()]
    const inc = [income({ next_date: d(10) })]
    const s = safeToSpend({
      forecast: forecastOf({ accounts, income: inc }),
      accounts,
      income: inc,
      budgets: [budget({ monthly_limit: 400 })],
      expenses: [expense({ amount: 150 })],
    })
    expect(s.cashflowSlack).toBe(3000)
    expect(s.budgetRemaining).toBe(250)
    expect(s.total).toBe(250)
    expect(s.limitedBy).toBe('budget')
  })

  it('keeps the cashflow figure when the budget is the looser bound', () => {
    const accounts = [card({ balance: 3900 })] // only 100 of headroom
    const inc = [income({ next_date: d(10) })]
    const s = safeToSpend({
      forecast: forecastOf({ accounts, income: inc }),
      accounts,
      income: inc,
      budgets: [budget({ monthly_limit: 400 })],
    })
    expect(s.total).toBe(100)
    expect(s.limitedBy).toBe('cashflow')
  })

  it('ignores an inactive budget', () => {
    const accounts = [card()]
    const s = safeToSpend({
      forecast: forecastOf({ accounts }),
      accounts,
      income: [],
      budgets: [budget({ is_active: false, monthly_limit: 50 })],
    })
    expect(s.budgetRemaining).toBeNull()
    expect(s.limitedBy).toBe('cashflow')
  })

  it('uses cash in the bank when there is no credit card', () => {
    // No card: the forecast tracks spend only, so the current account balance
    // has to be added back for the number to mean anything.
    const accounts = [current({ balance: 900 })]
    const s = safeToSpend({
      forecast: forecastOf({ accounts, bills: [bill({ amount: 200, next_due_date: d(3) })] }),
      accounts,
      income: [],
    })
    expect(s.total).toBe(700)
  })
})

describe('buildVerdict', () => {
  const clearSetup = { accounts: [card()], income: [income({ next_date: d(10) })] }

  it('says clear when nothing threatens the limit', () => {
    const v = buildVerdict({
      forecast: forecastOf({ ...clearSetup, bills: [bill({ amount: 100 })] }),
      ...clearSetup,
      monthlyBills: 100,
    })
    expect(v.kind).toBe('clear')
    expect(v.breachDate).toBeNull()
    expect(v.basis).toBe('credit')
  })

  it('flags the first day the limit is breached', () => {
    const v = buildVerdict({
      forecast: forecastOf({ ...clearSetup, plannedExpenses: [planned({ amount: 3500, date: d(4) })] }),
      ...clearSetup,
      monthlyBills: 0,
    })
    expect(v.kind).toBe('breach')
    expect(v.breachDate).toBe(d(4))
    expect(v.daysToBreach).toBe(4)
    expect(v.worstOverrun).toBeLessThan(0)
  })

  it('warns when headroom survives but drops below a week of outgoings', () => {
    // 3000 of headroom, a 2900 spend leaves 100 — under both a tenth of the
    // starting headroom (300) and a week of a 2000/month outgoing (~461).
    const v = buildVerdict({
      forecast: forecastOf({ ...clearSetup, plannedExpenses: [planned({ amount: 2900, date: d(4) })] }),
      ...clearSetup,
      monthlyBills: 2000,
    })
    expect(v.kind).toBe('tight')
    expect(v.lowest.headroom).toBe(100)
    expect(v.lowest.date).toBe(d(4))
  })

  it('scales "tight" with the size of the limit, not a fixed figure', () => {
    // Same 100 left, but on a small limit with small outgoings that is fine.
    const small = { accounts: [card({ credit_limit: 200, balance: 0 })], income: [income({ next_date: d(10) })] }
    const v = buildVerdict({
      forecast: forecastOf({ ...small, plannedExpenses: [planned({ amount: 100, date: d(4) })] }),
      ...small,
      monthlyBills: 0,
    })
    expect(v.kind).toBe('clear')
  })

  it('reports insufficient data rather than guessing', () => {
    const accounts = [card()]
    expect(buildVerdict({ forecast: forecastOf({ accounts }), accounts, income: [], monthlyBills: 0 }).kind)
      .toBe('insufficient')
  })

  it('notes whether the tightest day lands before payday', () => {
    const v = buildVerdict({
      forecast: forecastOf({ ...clearSetup, plannedExpenses: [planned({ amount: 500, date: d(3) })] }),
      ...clearSetup,
      monthlyBills: 0,
    })
    expect(v.payday).toBe(d(10))
    expect(v.lowestBeforePayday).toBe(true)
  })

  it('works off cash when there is no card', () => {
    const accounts = [current({ balance: 1000 })]
    const inc = [income({ next_date: d(10) })]
    const v = buildVerdict({
      forecast: forecastOf({ accounts, income: inc, bills: [bill({ amount: 1200, next_due_date: d(5) })] }),
      accounts,
      income: inc,
      monthlyBills: 1200,
    })
    expect(v.basis).toBe('cash')
    expect(v.kind).toBe('breach')
    expect(v.breachDate).toBe(d(5))
  })
})
