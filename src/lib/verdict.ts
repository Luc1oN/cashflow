import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { cashPosition, creditCard, occurrences, type ForecastResult } from './forecast'
import type { Account, BudgetAlert, Expense, Income } from './types'

/**
 * Dashboard headline maths: "am I OK?" and "what can I spend?".
 *
 * Both are derived from the forecast the chart already draws, so the answer can
 * never disagree with the picture underneath it. Everything here returns plain
 * data — no currency or date formatting — so the numbers can be unit-tested
 * without pinning the wording, and the wording can change without touching the
 * maths.
 */

// ---------------------------------------------------------------------------
// Headroom
// ---------------------------------------------------------------------------

/**
 * "Headroom" on a given day: how much you could spend before hitting the wall.
 *
 * With a credit card that's available credit (limit − owed), which is exactly
 * what `buildForecast` tracks. Without one the forecast degenerates — it starts
 * from zero owed, so `available` becomes the *negative* of everything spent
 * since today and ignores the money actually in the bank. Adding the current
 * cash position back turns the same series into a projected cash balance, so
 * the rest of this module works identically in both modes.
 */
export function headroomOffset(accounts: Account[]): number {
  return creditCard(accounts) ? 0 : cashPosition(accounts)
}

// ---------------------------------------------------------------------------
// Paydays
// ---------------------------------------------------------------------------

/**
 * The next salary payday strictly after today, within the horizon.
 * Only `salary` streams count — that's what the app treats as a payday
 * everywhere else (savings deductions key off the same set).
 */
export function nextPayday(income: Income[], horizonDays: number, from = startOfDay(new Date())): string | null {
  const tomorrow = addDays(from, 1)
  const to = addDays(from, horizonDays)
  let earliest: Date | null = null
  for (const stream of income) {
    if (!stream.is_active || stream.income_type !== 'salary') continue
    const [first] = occurrences(stream.next_date, stream.frequency, tomorrow, to)
    if (first && (!earliest || first < earliest)) earliest = first
  }
  return earliest ? format(earliest, 'yyyy-MM-dd') : null
}

// ---------------------------------------------------------------------------
// Safe to spend
// ---------------------------------------------------------------------------

export type SafeToSpendLimiter = 'cashflow' | 'budget'

export interface SafeToSpend {
  /** Extra you could spend today and still clear the window. Never negative. */
  total: number
  /** `total` spread over the days left in the window. */
  perDay: number
  /** Days from today to the end of the window, inclusive of today. */
  days: number
  /** Last day of the window (yyyy-MM-dd). */
  until: string
  /** True when the window ends at a payday rather than a fallback horizon. */
  untilIsPayday: boolean
  /** Which constraint produced `total`. */
  limitedBy: SafeToSpendLimiter
  /** Cashflow-only figure, before any monthly budget was applied. */
  cashflowSlack: number
  /** What's left of an active "safe to spend" budget this month, if one is set. */
  budgetRemaining: number | null
}

/** Window used when there's no salary stream to anchor on. */
const FALLBACK_WINDOW_DAYS = 30

/**
 * How much more you could spend today without the forecast hitting the wall
 * before your next payday.
 *
 * Spending X today pushes every later day's headroom down by X, so the largest
 * safe X is simply the *lowest* headroom between now and the end of the window.
 * (When a surplus has already built up — the forecast's "vault" — the true
 * figure is a little higher, because the surplus absorbs the first slice of
 * spending. Erring low is the right way to be wrong here.)
 *
 * If a "safe to spend" budget is set on the Spending page, whatever is left of
 * it this month caps the answer too, and `limitedBy` says which bound won.
 */
export function safeToSpend(params: {
  forecast: ForecastResult
  accounts: Account[]
  income: Income[]
  budgets?: BudgetAlert[]
  expenses?: Expense[]
  today?: Date
}): SafeToSpend {
  const { forecast, accounts, income, budgets = [], expenses = [], today = startOfDay(new Date()) } = params
  const offset = headroomOffset(accounts)
  const horizonDays = Math.max(forecast.days.length - 1, 0)

  const payday = nextPayday(income, horizonDays, today)
  // Clip the fallback to the horizon so a 7-day forecast can't be asked about
  // day 30, and never let the window run past the days we actually have.
  const fallbackEnd = format(addDays(today, Math.min(FALLBACK_WINDOW_DAYS, horizonDays)), 'yyyy-MM-dd')
  const until = payday ?? fallbackEnd

  const window = forecast.days.filter((day) => day.date <= until)
  const series = (window.length > 0 ? window : forecast.days.slice(0, 1)).map((day) => day.available + offset)
  const cashflowSlack = series.length > 0 ? Math.max(Math.min(...series), 0) : 0

  const budgetRemaining = remainingSafeToSpendBudget(budgets, expenses, today)
  const useBudget = budgetRemaining !== null && budgetRemaining < cashflowSlack

  const total = round2(useBudget ? budgetRemaining : cashflowSlack)
  // Inclusive of today: a window ending tomorrow is two days of spending.
  const days = Math.max(differenceInCalendarDays(parseISO(until), today) + 1, 1)

  return {
    total,
    perDay: round2(total / days),
    days,
    until,
    untilIsPayday: payday !== null,
    limitedBy: useBudget ? 'budget' : 'cashflow',
    cashflowSlack: round2(cashflowSlack),
    budgetRemaining: budgetRemaining === null ? null : round2(budgetRemaining),
  }
}

/** What's left of the user's own monthly "safe to spend" cap, or null if unset. */
function remainingSafeToSpendBudget(budgets: BudgetAlert[], expenses: Expense[], today: Date): number | null {
  const budget = budgets.find((b) => b.is_active && b.type === 'safe_to_spend')
  if (!budget) return null
  const monthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd')
  const spent = expenses
    .filter((e) => e.date >= monthStart)
    .reduce((sum, e) => sum + Number(e.amount), 0)
  return Math.max(Number(budget.monthly_limit) - spent, 0)
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type VerdictKind = 'insufficient' | 'breach' | 'tight' | 'clear'

export interface Verdict {
  kind: VerdictKind
  /** Whether headroom is credit (a card is in play) or cash in the bank. */
  basis: 'credit' | 'cash'
  /** The tightest day in the horizon, with the card offset already applied. */
  lowest: { date: string; headroom: number }
  /** First day headroom goes negative, if any (yyyy-MM-dd). */
  breachDate: string | null
  /** Days from today until `breachDate`. */
  daysToBreach: number | null
  /** Worst headroom across the horizon when it goes negative (a negative number). */
  worstOverrun: number | null
  /** End of the horizon (yyyy-MM-dd). */
  horizonEnd: string
  /** Next payday within the horizon, if any. */
  payday: string | null
  /** True when the tightest day falls on or before that payday. */
  lowestBeforePayday: boolean
}

/**
 * The one-line answer to "am I OK?".
 *
 * `tight` is a judgement call, so it's pinned to two things the user can feel
 * rather than an arbitrary figure: less than a tenth of the headroom you start
 * with, or less than a week of outgoings in reserve. Whichever is larger wins,
 * so it scales with both the size of the limit and the size of the life.
 */
export function buildVerdict(params: {
  forecast: ForecastResult
  accounts: Account[]
  income: Income[]
  /** Monthly recurring outgoings, used to size "a week in reserve". */
  monthlyBills: number
  today?: Date
}): Verdict {
  const { forecast, accounts, income, monthlyBills, today = startOfDay(new Date()) } = params
  const offset = headroomOffset(accounts)
  const basis: Verdict['basis'] = creditCard(accounts) ? 'credit' : 'cash'
  const horizonDays = Math.max(forecast.days.length - 1, 0)
  const payday = nextPayday(income, horizonDays, today)

  const days = forecast.days
  const horizonEnd = days.length > 0 ? days[days.length - 1].date : format(today, 'yyyy-MM-dd')

  let lowest = { date: horizonEnd, headroom: 0 }
  let breachDate: string | null = null
  let worst = Infinity
  for (const day of days) {
    const headroom = round2(day.available + offset)
    if (headroom < worst) { worst = headroom; lowest = { date: day.date, headroom } }
    if (headroom < 0 && !breachDate) breachDate = day.date
  }
  if (days.length === 0) lowest = { date: horizonEnd, headroom: 0 }

  const startHeadroom = days.length > 0 ? days[0].available + offset : 0
  const weeklyOutgoings = (monthlyBills * 12) / 52
  const tightBelow = Math.max(startHeadroom * 0.1, weeklyOutgoings)

  // "Nothing to go on" beats a confident answer built from no data.
  const hasIncome = income.some((i) => i.is_active)
  const hasHeadroom = forecast.limit > 0 || offset !== 0
  const kind: VerdictKind =
    !hasIncome || !hasHeadroom ? 'insufficient'
      : breachDate ? 'breach'
        : lowest.headroom < tightBelow ? 'tight'
          : 'clear'

  return {
    kind,
    basis,
    lowest,
    breachDate,
    daysToBreach: breachDate ? differenceInCalendarDays(parseISO(breachDate), today) : null,
    worstOverrun: breachDate ? Math.min(worst, 0) : null,
    horizonEnd,
    payday,
    lowestBeforePayday: payday !== null && lowest.date <= payday,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
