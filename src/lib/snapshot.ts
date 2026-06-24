import { buildForecast, buildLoanForecast, netWorth, perMonth, type NetWorth } from './forecast'
import type { Account, Bill, Income, Loan, OneOffLoanPayment, PlannedExpense, SavingsGoal } from './types'

const round = (n: number) => Math.round(n * 100) / 100

export interface AdvisorLoanSummary {
  name: string
  balance: number
  interestRate: number
  payment: number
  frequency: string
  payoffDate: string | null
  totalInterest: number
}

export interface AdvisorForecastSummary {
  horizonDays: number
  limit: number
  startOwed: number
  startAvailable: number
  endAvailable: number
  lowestAvailable: { date: string; available: number }
  firstOverLimit: string | null
  endVault: number
  monthlyIncome: number
  monthlyBills: number
  netWorth: NetWorth
  loans: AdvisorLoanSummary[]
}

/**
 * The one piece of *derived* context the client sends to the advisor function:
 * a compact summary of the computed forecast, monthly figures, net worth and
 * loan payoff projections. Raw rows are fetched authoritatively server-side.
 * Reuses the same forecast utilities the Dashboard uses, so the numbers match
 * exactly what the user sees.
 */
export function buildForecastSummary(params: {
  accounts: Account[]
  bills: Bill[]
  income: Income[]
  savingsGoals: SavingsGoal[]
  plannedExpenses: PlannedExpense[]
  loans: Loan[]
  oneOffPayments?: OneOffLoanPayment[]
  horizonDays: number
}): AdvisorForecastSummary {
  const { accounts, bills, income, savingsGoals, plannedExpenses, loans, oneOffPayments = [], horizonDays } = params

  const f = buildForecast({ accounts, bills, income, savingsGoals, plannedExpenses, horizonDays })
  const nw = netWorth(accounts, savingsGoals, loans)
  const monthlyIncome = income.filter((i) => i.is_active).reduce((s, i) => s + perMonth(Number(i.amount), i.frequency), 0)
  const monthlyBills = bills.filter((b) => b.is_active).reduce((s, b) => s + perMonth(Number(b.amount), b.frequency), 0)

  const loanSummaries: AdvisorLoanSummary[] = loans
    .filter((l) => l.is_active)
    .map((l) => {
      const lf = buildLoanForecast(l, oneOffPayments.filter((o) => o.loan_id === l.id))
      return {
        name: l.name,
        balance: round(Number(l.starting_balance)),
        interestRate: Number(l.interest_rate),
        payment: round(Number(l.payment_amount)),
        frequency: l.payment_frequency,
        payoffDate: lf.payoffDate,
        totalInterest: lf.totalInterest,
      }
    })

  return {
    horizonDays,
    limit: f.limit,
    startOwed: f.startOwed,
    startAvailable: f.startAvailable,
    endAvailable: f.endAvailable,
    lowestAvailable: f.lowestAvailable,
    firstOverLimit: f.firstOverLimit,
    endVault: f.endVault,
    monthlyIncome: round(monthlyIncome),
    monthlyBills: round(monthlyBills),
    netWorth: nw,
    loans: loanSummaries,
  }
}
