import {
  addDays, addMonths, addYears, differenceInCalendarDays,
  format, isAfter, isBefore, parseISO, startOfDay,
} from 'date-fns'
import type {
  Account, Bill, Income, Loan, OneOffLoanPayment, PlannedExpense, SavingsGoal,
} from './types'

export interface ForecastEvent {
  date: string // yyyy-MM-dd
  label: string
  // Effect on available credit: positive frees credit (pays the card down),
  // negative consumes it (a charge to the card).
  amount: number
  kind: 'income' | 'bill' | 'planned' | 'savings'
}

export interface ForecastDay {
  date: string
  available: number // credit limit minus balance owed
  owed: number
  // Surplus that has accumulated once the card is fully paid: any payment beyond
  // a zero balance spills into the "vault" instead of being lost. It sits there
  // (savings / debt snowball / spending — decided later) and only ever grows.
  vault: number
  events: ForecastEvent[]
}

export interface ForecastResult {
  days: ForecastDay[]
  limit: number
  startOwed: number
  startAvailable: number
  endOwed: number
  endAvailable: number
  lowestAvailable: { date: string; available: number }
  firstOverLimit: string | null
  endVault: number
  upcoming: ForecastEvent[]
}

function next(date: Date, frequency: string): Date | null {
  switch (frequency) {
    case 'weekly': return addDays(date, 7)
    case 'fortnightly': return addDays(date, 14)
    case 'monthly': return addMonths(date, 1)
    case 'quarterly': return addMonths(date, 3)
    case 'annual': return addYears(date, 1)
    case 'one_off': return null
    default: return null
  }
}

const PERIODS_PER_YEAR: Record<string, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annual: 1 }

/** Normalise a recurring amount to a per-month figure (one-offs excluded). */
export function perMonth(amount: number, frequency: string): number {
  const p = PERIODS_PER_YEAR[frequency]
  return p ? (amount * p) / 12 : 0
}

/** Expand a recurring item into occurrence dates within [from, to]. */
export function occurrences(firstDate: string, frequency: string, from: Date, to: Date): Date[] {
  const out: Date[] = []
  let d: Date | null = startOfDay(parseISO(firstDate))
  // Roll forward past dates so a stale next date still recurs correctly.
  let guard = 0
  while (d && isBefore(d, from) && guard < 2000) {
    d = next(d, frequency)
    guard++
  }
  while (d && !isAfter(d, to) && guard < 4000) {
    if (!isBefore(d, from)) out.push(d)
    d = next(d, frequency)
    guard++
  }
  return out
}

/** The hub credit card (primary if flagged, else the first card). */
export function creditCard(accounts: Account[]): Account | null {
  const cards = accounts.filter((a) => a.type === 'credit_card')
  if (cards.length === 0) return null
  return cards.find((c) => c.is_primary) ?? cards[0]
}

/** Net cash position: non-card balances minus card balances. */
export function cashPosition(accounts: Account[]): number {
  return accounts.reduce((sum, a) => (
    a.type === 'credit_card' ? sum - Number(a.balance) : sum + Number(a.balance)
  ), 0)
}

export interface NetWorth {
  assets: number
  debts: number
  net: number
  cashAssets: number
  savingsAssets: number
  cardDebt: number
  loanDebt: number
}

/** True net worth: cash + savings pots, minus credit-card and loan debt. */
export function netWorth(accounts: Account[], savingsGoals: SavingsGoal[], loans: Loan[]): NetWorth {
  const cashAssets = accounts.filter((a) => a.type !== 'credit_card').reduce((s, a) => s + Number(a.balance), 0)
  const savingsAssets = savingsGoals.filter((g) => g.is_active).reduce((s, g) => s + Number(g.current_saved), 0)
  const cardDebt = accounts.filter((a) => a.type === 'credit_card').reduce((s, a) => s + Number(a.balance), 0)
  const loanDebt = loans.filter((l) => l.is_active).reduce((s, l) => s + Number(l.starting_balance), 0)
  const assets = Math.round((cashAssets + savingsAssets) * 100) / 100
  const debts = Math.round((cardDebt + loanDebt) * 100) / 100
  return { assets, debts, net: Math.round((assets - debts) * 100) / 100, cashAssets, savingsAssets, cardDebt, loanDebt }
}

/**
 * Credit-card-centric forecast. Tracks available credit (limit minus balance
 * owed) over the horizon:
 *  - bills and planned expenses are charged to the card (available falls)
 *  - on each salary payday, post-tax savings come out first and the remainder
 *    pays the card down (available rises); paying past zero just maxes the card
 *  - other income pays the card down directly
 * Flags the first day the card would go over its limit.
 */
export function buildForecast(params: {
  accounts: Account[]
  bills: Bill[]
  income: Income[]
  savingsGoals: SavingsGoal[]
  plannedExpenses: PlannedExpense[]
  horizonDays: number
}): ForecastResult {
  const { accounts, bills, income, savingsGoals, plannedExpenses, horizonDays } = params
  const from = startOfDay(new Date())
  const to = addDays(from, horizonDays)
  const card = creditCard(accounts)
  const limit = card ? Number(card.credit_limit ?? 0) : 0
  const startOwed = card ? Number(card.balance) : 0

  const byDate = new Map<string, ForecastEvent[]>()
  const push = (d: Date, e: Omit<ForecastEvent, 'date'>) => {
    const key = format(d, 'yyyy-MM-dd')
    const list = byDate.get(key) ?? []
    list.push({ ...e, date: key })
    byDate.set(key, list)
  }

  const activeIncome = income.filter((i) => i.is_active)
  const salaryStreams = activeIncome.filter((i) => i.income_type === 'salary')
  const otherIncome = activeIncome.filter((i) => i.income_type !== 'salary')
  const postTaxGoals = savingsGoals.filter((g) => g.is_active && g.deduction_type === 'post_tax')

  // Salary paydays: show the real movement of money — the full salary lands as
  // income, then each post-tax savings deduction moves out as its own event. The
  // net (salary minus savings) is what actually pays the card down, so the
  // forecast line is unchanged while the breakdown stays fully transparent.
  for (const stream of salaryStreams) {
    for (const d of occurrences(stream.next_date, stream.frequency, from, to)) {
      push(d, { label: stream.name, amount: Number(stream.amount), kind: 'income' })
      for (const goal of postTaxGoals) {
        if (goal.start_date && isBefore(d, startOfDay(parseISO(goal.start_date)))) continue
        if (goal.end_date && isAfter(d, startOfDay(parseISO(goal.end_date)))) continue
        push(d, { label: goal.name, amount: -Number(goal.amount_per_payslip), kind: 'savings' })
      }
    }
  }

  // Other income pays the card down directly.
  for (const inc of otherIncome) {
    for (const d of occurrences(inc.next_date, inc.frequency, from, to)) {
      push(d, { label: inc.name, amount: Number(inc.amount), kind: 'income' })
    }
  }

  // Bills charge the card.
  for (const bill of bills.filter((b) => b.is_active)) {
    for (const d of occurrences(bill.next_due_date, bill.frequency, from, to)) {
      push(d, { label: bill.name, amount: -Number(bill.amount), kind: 'bill' })
    }
  }

  // Planned one-off expenses not yet paid, charged to the card.
  for (const pe of plannedExpenses.filter((p) => !p.is_completed)) {
    const d = startOfDay(parseISO(pe.date))
    if (!isBefore(d, from) && !isAfter(d, to)) {
      push(d, { label: pe.name, amount: -Number(pe.amount), kind: 'planned' })
    }
  }

  // Walk day by day, tracking the balance owed and the accumulated vault.
  let owed = startOwed
  let vault = 0
  const days: ForecastDay[] = []
  let lowestAvailable = { date: format(from, 'yyyy-MM-dd'), available: Math.round((limit - owed) * 100) / 100 }
  let firstOverLimit: string | null = null
  const total = differenceInCalendarDays(to, from)

  for (let i = 0; i <= total; i++) {
    const d = addDays(from, i)
    const key = format(d, 'yyyy-MM-dd')
    const events = byDate.get(key) ?? []
    const delta = events.reduce((s, e) => s + e.amount, 0)
    owed = owed - delta // positive event frees credit (less owed); negative charges it
    if (owed < 0) { vault += -owed; owed = 0 } // paying past zero pushes the surplus into the vault
    const available = Math.round((limit - owed) * 100) / 100
    days.push({ date: key, owed: Math.round(owed * 100) / 100, available, vault: Math.round(vault * 100) / 100, events })
    if (available < lowestAvailable.available) lowestAvailable = { date: key, available }
    if (available < 0 && !firstOverLimit) firstOverLimit = key
  }

  return {
    days,
    limit,
    startOwed,
    startAvailable: Math.round((limit - startOwed) * 100) / 100,
    endOwed: Math.round(owed * 100) / 100,
    endAvailable: Math.round((limit - owed) * 100) / 100,
    lowestAvailable,
    firstOverLimit,
    endVault: Math.round(vault * 100) / 100,
    upcoming: days.flatMap((d) => d.events).slice(0, 12),
  }
}

// ---------------------------------------------------------------------------
// Loan amortisation (unchanged)
// ---------------------------------------------------------------------------
export interface LoanForecastPoint { date: string; balance: number }
export interface LoanForecast {
  points: LoanForecastPoint[]
  payoffDate: string | null
  totalInterest: number
  totalPaid: number
}

export function buildLoanForecast(loan: Loan, oneOffs: OneOffLoanPayment[], maxYears = 30): LoanForecast {
  const periodsPerYear = PERIODS_PER_YEAR[loan.payment_frequency] ?? 12
  const periodRate = Number(loan.interest_rate) / 100 / periodsPerYear
  let balance = Number(loan.starting_balance)
  let date = startOfDay(parseISO(loan.start_date))
  const points: LoanForecastPoint[] = [{ date: format(date, 'yyyy-MM-dd'), balance }]
  let totalInterest = 0
  let totalPaid = 0
  let payoffDate: string | null = null

  const lumps = [...oneOffs].sort((a, b) => a.payment_date.localeCompare(b.payment_date))
  let lumpIdx = 0
  const maxPeriods = periodsPerYear * maxYears

  for (let i = 0; i < maxPeriods && balance > 0.005; i++) {
    const nextDate = next(date, loan.payment_frequency)!
    while (lumpIdx < lumps.length && lumps[lumpIdx].payment_date <= format(nextDate, 'yyyy-MM-dd')) {
      const lump = Math.min(Number(lumps[lumpIdx].amount), balance)
      balance -= lump
      totalPaid += lump
      points.push({ date: lumps[lumpIdx].payment_date, balance: Math.round(balance * 100) / 100 })
      lumpIdx++
      if (balance <= 0.005) { payoffDate = lumps[lumpIdx - 1].payment_date; break }
    }
    if (balance <= 0.005) break

    const interest = balance * periodRate
    totalInterest += interest
    const payment = Math.min(Number(loan.payment_amount), balance + interest)
    balance = balance + interest - payment
    totalPaid += payment
    date = nextDate
    points.push({ date: format(date, 'yyyy-MM-dd'), balance: Math.round(Math.max(balance, 0) * 100) / 100 })
    if (balance <= 0.005) payoffDate = format(date, 'yyyy-MM-dd')
  }

  return { points, payoffDate, totalInterest: Math.round(totalInterest * 100) / 100, totalPaid: Math.round(totalPaid * 100) / 100 }
}
