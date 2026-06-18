import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns'
import {
  Area, AreaChart, CartesianGrid, Line, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useChartColors } from '../contexts/ThemeContext'
import { useTable } from '../lib/useTable'
import { buildForecast, cashPosition, creditCard, netWorth, perMonth, type ForecastDay } from '../lib/forecast'
import { applySettlement, buildSettlementPlan, type SettlementPlan } from '../lib/settle'
import { money, moneyShort, titleCase } from '../lib/format'
import type { Account, Bill, BudgetAlert, Expense, Income, Loan, PlannedExpense, Profile, SavingsGoal } from '../lib/types'
import { Badge, Button, Card, Field, Modal, Money, PageHeader, Select, Skeleton, TextInput } from '../components/ui'

const HORIZONS = [30, 90, 180, 365]

interface ScenarioItem { id: number; name: string; amount: number; date: string; direction: 'out' | 'in' }

export default function Dashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const colors = useChartColors()

  const accounts = useTable<Account>('accounts')
  const bills = useTable<Bill>('bills')
  const income = useTable<Income>('income')
  const savings = useTable<SavingsGoal>('savings_goals')
  const planned = useTable<PlannedExpense>('planned_expenses')
  const loans = useTable<Loan>('loans')
  const budgets = useTable<BudgetAlert>('budget_alerts')
  const expenses = useTable<Expense>('expenses', 'date')

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw new Error(error.message)
      return data as Profile
    },
    enabled: !!user,
  })
  const profile = profileQuery.data ?? null

  const [horizon, setHorizon] = useState<number | null>(null)
  const activeHorizon = horizon ?? profile?.default_horizon ?? 90

  const [settlePlan, setSettlePlan] = useState<SettlementPlan | null>(null)
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)

  const [scenario, setScenario] = useState<ScenarioItem[]>([])
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [scenarioForm, setScenarioForm] = useState({ name: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), direction: 'out' as 'out' | 'in' })
  const nextScenarioId = useRef(0)

  const forecast = useMemo(
    () => buildForecast({
      accounts: accounts.rows, bills: bills.rows, income: income.rows,
      savingsGoals: savings.rows, plannedExpenses: planned.rows, horizonDays: activeHorizon,
    }),
    [accounts.rows, bills.rows, income.rows, savings.rows, planned.rows, activeHorizon],
  )

  const scenarioForecast = useMemo(() => {
    if (scenario.length === 0) return null
    const extras: PlannedExpense[] = scenario.map((s, i) => ({
      id: `scenario-${i}`, user_id: '', created_at: '', updated_at: '',
      name: s.name, amount: s.direction === 'out' ? s.amount : -s.amount,
      date: s.date, category: 'other', is_completed: false, notes: null,
    }))
    return buildForecast({
      accounts: accounts.rows, bills: bills.rows, income: income.rows,
      savingsGoals: savings.rows, plannedExpenses: [...planned.rows, ...extras], horizonDays: activeHorizon,
    })
  }, [scenario, accounts.rows, bills.rows, income.rows, savings.rows, planned.rows, activeHorizon])

  const chartData = useMemo(() => {
    if (!scenarioForecast) return forecast.days
    return forecast.days.map((d, i) => ({ ...d, scenarioAvailable: scenarioForecast.days[i]?.available }))
  }, [forecast, scenarioForecast])

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthSpend = expenses.rows.filter((e) => e.date >= monthStart)
  const monthTotal = monthSpend.reduce((s, e) => s + Number(e.amount), 0)

  const card = creditCard(accounts.rows)
  const nw = netWorth(accounts.rows, savings.rows, loans.rows)
  const monthlyIncome = income.rows.filter((i) => i.is_active).reduce((s, i) => s + perMonth(Number(i.amount), i.frequency), 0)
  const monthlyBills = bills.rows.filter((b) => b.is_active).reduce((s, b) => s + perMonth(Number(b.amount), b.frequency), 0)
  const pctUsed = card && Number(card.credit_limit) > 0 ? (Number(card.balance) / Number(card.credit_limit)) * 100 : 0

  const openSettle = () => {
    setSettleError(null)
    setSettlePlan(buildSettlementPlan({
      lastSettledDate: profile?.last_settled_date ?? null,
      accounts: accounts.rows, bills: bills.rows, income: income.rows,
      savingsGoals: savings.rows, plannedExpenses: planned.rows,
    }))
  }

  const confirmSettle = async () => {
    if (!settlePlan || !user) return
    setSettling(true)
    setSettleError(null)
    try {
      await applySettlement(settlePlan)
      setSettlePlan(null)
      toast(settlePlan.items.length > 0 ? `Settled — ${settlePlan.items.length} item${settlePlan.items.length === 1 ? '' : 's'} applied` : 'Settled')
      await queryClient.invalidateQueries()
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : 'Settlement failed')
    }
    setSettling(false)
  }

  const addScenarioItem = () => {
    if (!scenarioForm.name || !scenarioForm.amount) return
    setScenario((s) => [...s, { id: nextScenarioId.current++, name: scenarioForm.name, amount: Number(scenarioForm.amount), date: scenarioForm.date, direction: scenarioForm.direction }])
    setScenarioForm({ name: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), direction: 'out' })
  }

  const saveScenarioAsPlanned = async (item: ScenarioItem) => {
    if (item.direction === 'in') return
    await planned.insert({ name: item.name, amount: item.amount, date: item.date, category: 'other', notes: 'Saved from scenario' })
    setScenario((s) => s.filter((x) => x.id !== item.id))
  }

  const loading = accounts.loading || bills.loading || income.loading || loans.loading || profileQuery.isLoading
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const settledToday = profile?.last_settled_date === today
  const daysSinceSettle = profile?.last_settled_date ? differenceInCalendarDays(new Date(), parseISO(profile.last_settled_date)) : null
  const hasData = !!card && income.rows.some((i) => i.is_active)
  const showOnboarding = !profile?.onboarding_dismissed && (accounts.rows.length === 0 || income.rows.length === 0 || bills.rows.length === 0)

  const low = forecast.lowestAvailable
  const lowTone = low.available < 0 ? 'text-claret' : low.available < 200 ? 'text-amber2' : 'text-ink'

  return (
    <div className="animate-rise">
      <PageHeader
        title="Dashboard"
        subtitle={
          profile?.last_settled_date
            ? `Last settled ${format(parseISO(profile.last_settled_date), 'd MMM')}${daysSinceSettle && daysSinceSettle > 3 ? ` — ${daysSinceSettle} days ago` : ''}`
            : 'Your cashflow at a glance'
        }
        action={
          <Button variant={settledToday ? 'ghost' : 'primary'} onClick={openSettle} disabled={settledToday}>
            {settledToday ? 'Settled today ✓' : 'Settle the day'}
          </Button>
        }
      />

      {showOnboarding && (
        <OnboardingChecklist
          accounts={accounts.rows.length}
          income={income.rows.length}
          bills={bills.rows.length}
          onDismiss={async () => {
            await supabase.from('profiles').update({ onboarding_dismissed: true }).eq('id', user!.id)
            queryClient.invalidateQueries({ queryKey: ['profile'] })
          }}
        />
      )}

      {/* Hero: credit card */}
      <Card className="mb-6 p-6">
        {card ? (
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-[260px]">
              <p className="text-xs font-medium uppercase tracking-wide text-slate2">Credit card balance · {card.name}</p>
              <p className="mt-1 font-num text-5xl font-semibold tracking-tight text-ink">
                {money(Number(card.balance))} <span className="align-middle text-base font-normal text-slate2">owed</span>
              </p>
              <p className="mt-3 text-sm text-slate2">
                <span className="font-num font-semibold text-mossdeep">{money(forecast.startAvailable)}</span> available of {money(forecast.limit)} limit
              </p>
              <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-mist">
                <div className={`h-full rounded-full transition-all duration-500 ${pctUsed > 90 ? 'bg-claret' : pctUsed > 75 ? 'bg-amber2' : 'bg-moss'}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate2">{Math.round(pctUsed)}% used</p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate2">Monthly income</p>
                <p className="mt-1 font-num text-xl font-semibold text-mossdeep">{money(monthlyIncome)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate2">Monthly bills</p>
                <p className="mt-1 font-num text-xl font-semibold text-ink">{money(monthlyBills)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate2">{activeHorizon}d low point</p>
                <p className={`mt-1 font-num text-xl font-semibold ${lowTone}`}>{money(low.available)}</p>
                <p className="text-xs text-slate2">{format(parseISO(low.date), 'd MMM')}{low.available < 0 ? ' · over limit' : ' available'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate2">Cash position</p>
            <p className="mt-1 font-num text-5xl font-semibold tracking-tight text-ink">{money(cashPosition(accounts.rows))}</p>
            <p className="mt-2 text-sm text-slate2">Add a credit card on the <Link to="/accounts" className="font-medium text-mossdeep hover:underline">Accounts page</Link> to track it as your hub.</p>
          </div>
        )}
      </Card>

      {/* Forecast */}
      <Card className="mb-6 p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Available credit forecast</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setScenarioOpen(true)}>
              {scenario.length > 0 ? `Scenario (${scenario.length})` : 'Test a scenario'}
            </Button>
            <div className="flex gap-1">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${activeHorizon === h ? 'bg-moss text-paper' : 'bg-mist text-slate2 hover:text-ink'}`}
                >
                  {h}d
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate2">
          {!hasData
            ? 'Add your card, salary and bills to bring the forecast to life.'
            : forecast.firstOverLimit
              ? <>You'd go <span className="font-medium text-claret">over your {money(forecast.limit)} limit on {format(parseISO(forecast.firstOverLimit), 'EEEE d MMM')}</span> — move a planned expense or trim a bill.</>
              : <>You stay within your limit through {format(parseISO(forecast.days[forecast.days.length - 1].date), 'd MMM')}. Tightest day is {format(parseISO(low.date), 'd MMM')} with {money(low.available)} free.</>}
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.moss }} /> Available credit</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.violet }} /> Vault (surplus)</span>
          {forecast.limit > 0 && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed align-middle" style={{ borderColor: colors.amber }} /> CC limit ({money(forecast.limit)})</span>
          )}
          {scenarioForecast && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed align-middle" style={{ borderColor: colors.mossdeep }} /> Scenario</span>
          )}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="availFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.moss} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={colors.moss} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="vaultFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.violet} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colors.violet} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => format(parseISO(d), 'd MMM')} tick={{ fontSize: 11, fill: colors.slate }} tickLine={false} axisLine={{ stroke: colors.line }} minTickGap={48} />
              <YAxis tickFormatter={(v: number) => moneyShort(v)} tick={{ fontSize: 11, fill: colors.slate, fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} width={76} />
              <Tooltip cursor={{ stroke: colors.line }} content={<ForecastTooltip />} />
              <ReferenceLine y={0} stroke={colors.claret} strokeDasharray="4 4" label={{ value: 'Over limit', position: 'insideBottomRight', fontSize: 10, fill: colors.claret }} />
              {forecast.limit > 0 && (
                <ReferenceLine y={forecast.limit} stroke={colors.amber} strokeDasharray="5 4" label={{ value: `CC limit ${moneyShort(forecast.limit)}`, position: 'insideTopRight', fontSize: 10, fill: colors.amber }} />
              )}
              <Area type="monotone" dataKey="available" name="Available credit" stroke={colors.moss} strokeWidth={2} fill="url(#availFill)" />
              <Area type="monotone" dataKey="vault" name="Vault" stroke={colors.violet} strokeWidth={2} fill="url(#vaultFill)" dot={false} />
              {scenarioForecast && (
                <Line type="monotone" dataKey="scenarioAvailable" name="Scenario" stroke={colors.mossdeep} strokeWidth={2} strokeDasharray="6 4" dot={false} />
              )}
              <ReferenceDot x={low.date} y={low.available} r={4} fill={colors.amber} stroke="rgb(var(--surface))" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {scenarioForecast && (
          <p className="mt-3 text-xs text-slate2">
            Dashed line shows your scenario: lowest available becomes{' '}
            <span className={`font-num font-medium ${scenarioForecast.lowestAvailable.available < 0 ? 'text-claret' : 'text-ink'}`}>{money(scenarioForecast.lowestAvailable.available)}</span>
            {scenarioForecast.firstOverLimit && <> and you'd go over limit on {format(parseISO(scenarioForecast.firstOverLimit), 'd MMM')}</>}.
          </p>
        )}
      </Card>

      {/* Net worth */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-[220px]">
            <h2 className="font-display text-lg font-semibold text-ink">Net worth</h2>
            <p className={`mt-1 font-num text-4xl font-semibold tracking-tight ${nw.net < 0 ? 'text-claret' : 'text-ink'}`}>{money(nw.net)}</p>
            <p className="mt-1 text-xs text-slate2">Everything you own minus everything you owe</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-mossdeep">Assets {money(nw.assets)}</p>
              <p className="mt-1 text-slate2">Cash <span className="font-num text-ink">{money(nw.cashAssets)}</span></p>
              <p className="text-slate2">Savings <span className="font-num text-ink">{money(nw.savingsAssets)}</span></p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-claret">Debts {money(nw.debts)}</p>
              <p className="mt-1 text-slate2">Credit card <span className="font-num text-ink">{money(nw.cardDebt)}</span></p>
              <p className="text-slate2">Loans <span className="font-num text-ink">{money(nw.loanDebt)}</span></p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-mist" title="Assets vs debts">
          {nw.assets + nw.debts > 0 && (
            <>
              <div className="h-full bg-moss" style={{ width: `${(nw.assets / (nw.assets + nw.debts)) * 100}%` }} />
              <div className="h-full bg-claret" style={{ width: `${(nw.debts / (nw.assets + nw.debts)) * 100}%` }} />
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Coming up</h2>
          {forecast.upcoming.length === 0 ? (
            <p className="text-sm text-slate2">Nothing scheduled in this window yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {forecast.upcoming.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{e.label}</p>
                    <p className="text-xs text-slate2">{format(parseISO(e.date), 'EEE d MMM')} · {titleCase(e.kind)}</p>
                  </div>
                  <Money value={e.amount} signed />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Budgets this month</h2>
          {budgets.rows.filter((b) => b.is_active).length === 0 ? (
            <p className="text-sm text-slate2">
              No budgets yet — set a safe-to-spend cap on the <Link to="/spending" className="font-medium text-mossdeep hover:underline">Spending page</Link>.
            </p>
          ) : (
            <ul className="space-y-4">
              {budgets.rows.filter((b) => b.is_active).map((b) => {
                const spent = b.type === 'safe_to_spend' ? monthTotal : monthSpend.filter((e) => e.category === b.category).reduce((s, e) => s + Number(e.amount), 0)
                const pct = Math.min((spent / Number(b.monthly_limit)) * 100, 100)
                const over = spent > Number(b.monthly_limit)
                return (
                  <li key={b.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{b.label}</span>
                      <span className="font-num text-xs text-slate2">
                        {money(spent)} / {money(Number(b.monthly_limit))} {over ? <Badge tone="bad">Over</Badge> : pct > 80 ? <Badge tone="warn">Close</Badge> : null}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-mist">
                      <div className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-claret' : pct > 80 ? 'bg-amber2' : 'bg-moss'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Scenario modal */}
      <Modal title="Test a scenario" open={scenarioOpen} onClose={() => setScenarioOpen(false)}>
        <div className="space-y-4 text-sm">
          <p className="text-slate2">Add hypothetical money events and watch the dashed line on the forecast — nothing is saved unless you choose to.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="What"><TextInput value={scenarioForm.name} onChange={(e) => setScenarioForm({ ...scenarioForm, name: e.target.value })} placeholder="New sofa" /></Field>
            <Field label="Amount"><TextInput type="number" step="0.01" min="0" value={scenarioForm.amount} onChange={(e) => setScenarioForm({ ...scenarioForm, amount: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><TextInput type="date" value={scenarioForm.date} onChange={(e) => setScenarioForm({ ...scenarioForm, date: e.target.value })} /></Field>
            <Field label="Direction">
              <Select value={scenarioForm.direction} onChange={(e) => setScenarioForm({ ...scenarioForm, direction: e.target.value as 'out' | 'in' })}>
                <option value="out">Charge to card</option>
                <option value="in">Pay card down</option>
              </Select>
            </Field>
          </div>
          <Button variant="ghost" onClick={addScenarioItem} className="w-full">Add to scenario</Button>
          {scenario.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {scenario.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-ink">{item.name} · {format(parseISO(item.date), 'd MMM')}</span>
                  <span className="flex items-center gap-3">
                    <Money value={item.direction === 'out' ? -item.amount : item.amount} signed />
                    {item.direction === 'out' && (
                      <button onClick={() => saveScenarioAsPlanned(item)} className="text-xs font-medium text-mossdeep hover:underline">Save as planned</button>
                    )}
                    <button onClick={() => setScenario((s) => s.filter((x) => x.id !== item.id))} aria-label={`Remove ${item.name}`} className="text-slate2 hover:text-claret">✕</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => setScenario([])} disabled={scenario.length === 0}>Clear scenario</Button>
            <Button onClick={() => setScenarioOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Settle modal */}
      <Modal title="Settle the day" open={settlePlan !== null} onClose={() => setSettlePlan(null)}>
        {settlePlan && (
          <div className="space-y-4 text-sm">
            {settlePlan.items.length === 0 ? (
              <p className="text-slate2">
                Nothing fell due {settlePlan.from === settlePlan.to ? 'today' : `between ${format(parseISO(settlePlan.from), 'd MMM')} and ${format(parseISO(settlePlan.to), 'd MMM')}`}. Settling just stamps today as your last settled date.
              </p>
            ) : (
              <>
                <p className="text-slate2">
                  Applying everything due {settlePlan.from === settlePlan.to ? 'today' : `from ${format(parseISO(settlePlan.from), 'd MMM')} to ${format(parseISO(settlePlan.to), 'd MMM')}`}
                  {settlePlan.account ? <> to <span className="font-medium text-ink">{settlePlan.account.name}</span></> : null}:
                </p>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {settlePlan.items.map((item, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-ink">
                        {item.label}{item.count > 1 ? ` ×${item.count}` : ''} <Badge>{titleCase(item.kind)}</Badge>
                      </span>
                      <Money value={item.amount} signed />
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between rounded-lg bg-mist px-3 py-2 font-medium">
                  <span className="text-ink">Net change</span>
                  <Money value={settlePlan.net} signed />
                </div>
                {!settlePlan.account && (
                  <p className="text-amber2">No account to apply this to — add a current account (or mark one as primary) first. Recurring dates will still roll forward.</p>
                )}
                <p className="text-xs text-slate2">Everything is recorded in your transaction history and applies in a single, all-or-nothing step.</p>
              </>
            )}
            {settleError && <p className="text-claret" role="alert">{settleError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setSettlePlan(null)}>Cancel</Button>
              <Button onClick={confirmSettle} disabled={settling}>{settling ? 'Settling…' : 'Confirm settle'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// Custom forecast tooltip: shows the running available credit plus a breakdown
// of exactly what happens on the hovered day (salary in, bills/planned out, …),
// so peaks and troughs are self-explanatory.
function ForecastTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: ForecastDay & { scenarioAvailable?: number } }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const day = payload[0].payload
  const events = day.events ?? []
  const net = events.reduce((s, e) => s + e.amount, 0)
  const vault = day.vault ?? 0
  return (
    <div className="min-w-[210px] max-w-[290px] rounded-lg border border-line bg-surface p-3 text-xs shadow-card">
      <p className="mb-1.5 font-medium text-ink">{format(parseISO(day.date), 'EEEE d MMM yyyy')}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate2">Available credit</span>
        <span className="font-num font-semibold text-ink">{money(day.available)}</span>
      </div>
      {vault > 0 && (
        <>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate2">Vault (surplus)</span>
            <span className="font-num font-semibold text-violet">{money(vault)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-1">
            <span className="text-slate2">Net position</span>
            <span className="font-num font-semibold text-ink">{money(day.available + vault)}</span>
          </div>
        </>
      )}
      {typeof day.scenarioAvailable === 'number' && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber2">With scenario</span>
          <span className="font-num text-amber2">{money(day.scenarioAvailable)}</span>
        </div>
      )}
      {events.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-line pt-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate text-ink" title={`${e.label} · ${titleCase(e.kind)}`}>{e.label}</span>
              <Money value={e.amount} signed />
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-1 font-medium">
            <span className="text-slate2">Net change</span>
            <Money value={net} signed />
          </div>
        </div>
      ) : (
        <p className="mt-2 border-t border-line pt-2 text-slate2">No money events this day</p>
      )}
    </div>
  )
}

function OnboardingChecklist({ accounts, income, bills, onDismiss }: { accounts: number; income: number; bills: number; onDismiss: () => void }) {
  const steps = [
    { done: accounts > 0, label: 'Add your credit card', to: '/accounts', hint: 'Your card balance anchors everything' },
    { done: income > 0, label: 'Add your salary', to: '/income', hint: 'Paydays pay the card down' },
    { done: bills > 0, label: 'Add your biggest bills', to: '/bills', hint: 'Rent, utilities, subscriptions' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  return (
    <Card className="mb-6 border-moss/30 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Get set up — {doneCount} of {steps.length} done</h2>
        <button onClick={onDismiss} className="text-xs text-slate2 hover:text-ink">Dismiss</button>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className={`block rounded-lg border p-3 transition-colors ${s.done ? 'border-moss/30 bg-moss/5' : 'border-line hover:border-moss/40'}`}>
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span aria-hidden className={s.done ? 'text-mossdeep' : 'text-slate2'}>{s.done ? '✓' : '○'}</span>
                {s.label}
              </p>
              <p className="mt-1 text-xs text-slate2">{s.hint}</p>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}
