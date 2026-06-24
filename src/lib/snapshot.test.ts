import { describe, expect, it } from 'vitest'
import { addDays, format, startOfDay } from 'date-fns'
import { buildForecastSummary } from './snapshot'
import type { Account, Bill, Income, Loan } from './types'

const base = { id: 'x', user_id: 'u', created_at: '', updated_at: '', notes: null }
const today = startOfDay(new Date())
const d = (offset: number) => format(addDays(today, offset), 'yyyy-MM-dd')

const card = (over: Partial<Account> = {}): Account =>
  ({ ...base, name: 'Visa', balance: 1000, type: 'credit_card', credit_limit: 4000, is_primary: true, ...over }) as Account
const salary = (over: Partial<Income> = {}): Income =>
  ({ ...base, name: 'Salary', amount: 2000, frequency: 'monthly', income_type: 'salary', next_date: d(5), is_active: true, ...over }) as Income
const bill = (over: Partial<Bill> = {}): Bill =>
  ({ ...base, name: 'Rent', amount: 900, frequency: 'monthly', category: 'housing', next_due_date: d(2), is_active: true, ...over }) as Bill
const loan = (over: Partial<Loan> = {}): Loan =>
  ({ ...base, name: 'Car', starting_balance: 5000, interest_rate: 6, payment_amount: 200, payment_frequency: 'monthly', start_date: d(0), is_active: true, ...over }) as Loan

describe('buildForecastSummary', () => {
  it('summarises forecast, monthly figures, net worth and loans', () => {
    const s = buildForecastSummary({
      accounts: [card({ balance: 1000 })],
      bills: [bill({ amount: 900 })],
      income: [salary({ amount: 2000 })],
      savingsGoals: [],
      plannedExpenses: [],
      loans: [loan()],
      horizonDays: 90,
    })

    expect(s.limit).toBe(4000)
    expect(s.startOwed).toBe(1000)
    expect(s.startAvailable).toBe(3000)
    expect(s.monthlyIncome).toBe(2000)
    expect(s.monthlyBills).toBe(900)
    expect(s.netWorth.cardDebt).toBe(1000)
    expect(s.netWorth.loanDebt).toBe(5000)
    expect(s.loans).toHaveLength(1)
    expect(s.loans[0].name).toBe('Car')
    expect(s.loans[0].payoffDate).not.toBeNull()
    expect(s.lowestAvailable).toHaveProperty('available')
    expect(typeof s.endVault).toBe('number')
  })

  it('excludes inactive loans from the loan summary', () => {
    const s = buildForecastSummary({
      accounts: [card()],
      bills: [],
      income: [],
      savingsGoals: [],
      plannedExpenses: [],
      loans: [loan({ is_active: false })],
      horizonDays: 30,
    })
    expect(s.loans).toHaveLength(0)
  })
})
