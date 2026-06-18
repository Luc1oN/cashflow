import { addDays, format, isAfter, parseISO, startOfDay } from 'date-fns'
import { supabase } from './supabase'
import { occurrences } from './forecast'
import type { Account, Bill, Income, PlannedExpense, SavingsGoal } from './types'

export interface SettlementItem {
  label: string
  amount: number // positive = in, negative = out
  kind: 'income' | 'bill' | 'savings' | 'planned'
  count: number
}

export interface SettlementPlan {
  from: string
  to: string
  items: SettlementItem[]
  net: number
  account: Account | null
  // internal: per-row changes to apply
  _incomeRolls: { id: string; next_date: string; deactivate: boolean }[]
  _billRolls: { id: string; next_due_date: string; deactivate: boolean }[]
  _goalAdds: { id: string; add: number }[]
  _plannedDone: string[]
}

function nextStrictlyAfter(firstDate: string, frequency: string, after: Date): string | null {
  if (frequency === 'one_off') return null
  // Walk forward from firstDate until strictly after `after` (bounded).
  const future = occurrences(firstDate, frequency, addDays(after, 1), addDays(after, 800))
  return future.length > 0 ? format(future[0], 'yyyy-MM-dd') : null
}

/**
 * Build everything that fell due since the last settle (exclusive) up to today
 * (inclusive). First-time settles apply today only.
 */
export function buildSettlementPlan(params: {
  lastSettledDate: string | null
  accounts: Account[]
  bills: Bill[]
  income: Income[]
  savingsGoals: SavingsGoal[]
  plannedExpenses: PlannedExpense[]
}): SettlementPlan {
  const { lastSettledDate, accounts, bills, income, savingsGoals, plannedExpenses } = params
  const today = startOfDay(new Date())
  const from = lastSettledDate ? addDays(startOfDay(parseISO(lastSettledDate)), 1) : today
  const account = accounts.find((a) => a.is_primary) ?? accounts.find((a) => a.type === 'current') ?? null

  const items: SettlementItem[] = []
  const _incomeRolls: SettlementPlan['_incomeRolls'] = []
  const _billRolls: SettlementPlan['_billRolls'] = []
  const _goalAdds: SettlementPlan['_goalAdds'] = []
  const _plannedDone: string[] = []

  const activeIncome = income.filter((i) => i.is_active)
  const salaryStreams = activeIncome.filter((i) => i.income_type === 'salary')

  for (const inc of activeIncome) {
    const occ = occurrences(inc.next_date, inc.frequency, from, today)
    if (occ.length > 0) {
      items.push({ label: inc.name, amount: Number(inc.amount) * occ.length, kind: 'income', count: occ.length })
      const next = nextStrictlyAfter(inc.next_date, inc.frequency, today)
      _incomeRolls.push({ id: inc.id, next_date: next ?? inc.next_date, deactivate: next === null })
    }
  }

  for (const bill of bills.filter((b) => b.is_active)) {
    const occ = occurrences(bill.next_due_date, bill.frequency, from, today)
    if (occ.length > 0) {
      items.push({ label: bill.name, amount: -Number(bill.amount) * occ.length, kind: 'bill', count: occ.length })
      const next = nextStrictlyAfter(bill.next_due_date, bill.frequency, today)
      _billRolls.push({ id: bill.id, next_due_date: next ?? bill.next_due_date, deactivate: next === null })
    }
  }

  for (const goal of savingsGoals.filter((g) => g.is_active && g.deduction_type === 'post_tax')) {
    let paydays = 0
    for (const stream of salaryStreams) {
      for (const d of occurrences(stream.next_date, stream.frequency, from, today)) {
        if (goal.start_date && d < startOfDay(parseISO(goal.start_date))) continue
        if (goal.end_date && isAfter(d, startOfDay(parseISO(goal.end_date)))) continue
        paydays++
      }
    }
    if (paydays > 0) {
      const total = Number(goal.amount_per_payslip) * paydays
      items.push({ label: `${goal.name} (into savings)`, amount: -total, kind: 'savings', count: paydays })
      _goalAdds.push({ id: goal.id, add: total })
    }
  }

  const fromKey = format(from, 'yyyy-MM-dd')
  const toKey = format(today, 'yyyy-MM-dd')
  for (const pe of plannedExpenses.filter((p) => !p.is_completed)) {
    if (pe.date >= fromKey && pe.date <= toKey) {
      items.push({ label: pe.name, amount: -Number(pe.amount), kind: 'planned', count: 1 })
      _plannedDone.push(pe.id)
    }
  }

  return {
    from: fromKey,
    to: toKey,
    items,
    net: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100,
    account,
    _incomeRolls,
    _billRolls,
    _goalAdds,
    _plannedDone,
  }
}

/**
 * Apply the plan atomically through the apply_settlement Postgres function:
 * ledger rows, balance change, date rolls, goal top-ups, planned tick-offs,
 * and the profile stamp all commit in one transaction — or none of them do.
 */
export async function applySettlement(plan: SettlementPlan): Promise<void> {
  const { error } = await supabase.rpc('apply_settlement', {
    p_account_id: plan.account?.id ?? null,
    p_net: plan.net,
    p_from_date: plan.from,
    p_to_date: plan.to,
    p_items: plan.items.map((i) => ({ label: i.count > 1 ? `${i.label} ×${i.count}` : i.label, amount: i.amount, kind: i.kind })),
    p_income_rolls: plan._incomeRolls,
    p_bill_rolls: plan._billRolls,
    p_goal_adds: plan._goalAdds,
    p_planned_done: plan._plannedDone,
  })
  if (error) throw new Error(error.message)
}
