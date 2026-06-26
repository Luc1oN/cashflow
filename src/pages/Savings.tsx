import { useMemo, useState } from 'react'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTable } from '../lib/useTable'
import { useChartColors } from '../contexts/ThemeContext'
import { money, moneyShort } from '../lib/format'
import { Sparkline } from '../components/viz'
import type { DeductionType, SavingsGoal } from '../lib/types'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const FORTNIGHTS_PER_YEAR = 26

const blank = {
  name: '', amount_per_payslip: '', current_saved: '0', target_amount: '',
  start_date: '', end_date: '', deduction_type: 'post_tax' as DeductionType,
  is_active: true, is_disposable_pot: false, notes: '',
}

const round = (n: number) => Math.round(n * 100) / 100

/** Project a pot's balance forward, adding the per-payslip amount every 14 days. */
function projectPot(g: SavingsGoal) {
  const start = Number(g.current_saved)
  const per = Number(g.amount_per_payslip)
  const target = g.target_amount != null ? Number(g.target_amount) : null
  const today = startOfDay(new Date())

  let reachDate: string | null = target != null && start >= target ? format(today, 'yyyy-MM-dd') : null
  const maxSteps = target != null && per > 0 && start < target ? 520 : FORTNIGHTS_PER_YEAR

  const points = [{ date: format(today, 'yyyy-MM-dd'), balance: round(start) }]
  let bal = start
  for (let i = 1; i <= maxSteps; i++) {
    bal += per
    const d = addDays(today, i * 14)
    points.push({ date: format(d, 'yyyy-MM-dd'), balance: round(bal) })
    if (target != null && reachDate === null && bal >= target) {
      reachDate = format(d, 'yyyy-MM-dd')
      break
    }
  }

  const in12 = round(start + per * FORTNIGHTS_PER_YEAR)
  const pct = target != null && target > 0 ? Math.min((start / target) * 100, 100) : null
  const maxBalance = Math.max(...points.map((p) => p.balance))
  return { points, reachDate, in12, target, pct, start, per, maxBalance }
}

export default function Savings() {
  const { rows, loading, insert, update, remove } = useTable<SavingsGoal>('savings_goals', 'name', true)
  const colors = useChartColors()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [potView, setPotView] = useState<'overview' | 'detail'>('overview')
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null)
  const [form, setForm] = useState(blank)
  const [lumpFor, setLumpFor] = useState<SavingsGoal | null>(null)
  const [lumpAmount, setLumpAmount] = useState('')

  const active = rows.filter((g) => g.is_active)
  const selected = rows.find((g) => g.id === selectedId) ?? active[0] ?? rows[0] ?? null
  const projection = useMemo(() => (selected ? projectPot(selected) : null), [selected])

  const totalSaved = active.reduce((s, g) => s + Number(g.current_saved), 0)
  const perPayslipTotal = active.reduce((s, g) => s + Number(g.amount_per_payslip), 0)
  const targetPots = active.filter((g) => g.target_amount != null)
  const onTrack = targetPots.filter((g) => projectPot(g).reachDate).length

  const openDetail = (g: SavingsGoal) => { setSelectedId(g.id); setPotView('detail') }

  const open = (g: SavingsGoal | 'new') => {
    setEditing(g)
    setForm(g === 'new' ? blank : {
      name: g.name, amount_per_payslip: String(g.amount_per_payslip), current_saved: String(g.current_saved),
      target_amount: g.target_amount != null ? String(g.target_amount) : '',
      start_date: g.start_date ?? '', end_date: g.end_date ?? '',
      deduction_type: g.deduction_type, is_active: g.is_active, is_disposable_pot: g.is_disposable_pot, notes: g.notes ?? '',
    })
  }

  const save = async () => {
    const values = {
      name: form.name,
      amount_per_payslip: Number(form.amount_per_payslip),
      current_saved: Number(form.current_saved || 0),
      target_amount: form.target_amount !== '' ? Number(form.target_amount) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      deduction_type: form.deduction_type,
      is_active: form.is_active,
      is_disposable_pot: form.is_disposable_pot,
      notes: form.notes || null,
    }
    if (editing === 'new') await insert(values)
    else if (editing) await update(editing.id, values)
    setEditing(null)
  }

  const saveLump = async () => {
    if (!lumpFor) return
    const add = Number(lumpAmount)
    if (!Number.isFinite(add) || add === 0) return
    await update(lumpFor.id, { current_saved: round(Number(lumpFor.current_saved) + add) })
    setLumpFor(null)
    setLumpAmount('')
  }

  const taxChip = (g: SavingsGoal) => (
    <Badge tone={g.deduction_type === 'pre_tax' ? 'warn' : 'neutral'}>{g.deduction_type === 'pre_tax' ? 'Pre-tax' : 'Post-tax'}</Badge>
  )

  return (
    <div className="animate-rise">
      {potView === 'overview' || !selected ? (
        <>
          <PageHeader title="Goals" subtitle="Each pot, projected forward at your per-payslip rate" action={<Button onClick={() => open('new')}>Add goal</Button>} />
          {loading ? <p className="text-slate2">Loading…</p> : rows.length === 0 ? (
            <EmptyState message="No savings goals yet. Add one to put money aside automatically each payslip." />
          ) : (
            <div className="space-y-[18px]">
              {/* Summary strip */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Total saved</p>
                  <p className="mt-1 font-num text-2xl font-semibold text-ink">{money(totalSaved)}</p>
                  <p className="text-xs text-slate2">across {active.length} pot{active.length === 1 ? '' : 's'}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Per payslip</p>
                  <p className="mt-1 font-num text-2xl font-semibold text-ink">{money(perPayslipTotal)}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Goals on track</p>
                  <p className="mt-1 font-num text-2xl font-semibold text-pos">{onTrack} / {targetPots.length}</p>
                </Card>
              </div>

              {/* Goal grid */}
              <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                {rows.map((g) => {
                  const pr = projectPot(g)
                  return (
                    <button key={g.id} onClick={() => openDetail(g)} className="lift rounded-[22px] border border-line bg-surface p-5 text-left shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{g.name}{!g.is_active && ' (paused)'}</p>
                          <p className="text-xs text-slate2">{g.deduction_type === 'pre_tax' ? 'Pre-tax' : 'Post-tax'} · {money(Number(g.amount_per_payslip))}/payslip</p>
                        </div>
                        {taxChip(g)}
                      </div>
                      <p className="mt-3 font-num text-xl font-semibold text-ink">
                        {money(pr.start)}
                        {pr.target != null && <span className="text-sm font-normal text-slate2"> / {money(pr.target)}</span>}
                      </p>
                      <div className="mt-3">
                        <Sparkline values={pr.points.map((p) => p.balance)} target={pr.target} color={colors.accent} height={56} />
                      </div>
                      <div className="mt-3">
                        {pr.target != null ? (
                          <>
                            <div className="h-1.5 overflow-hidden rounded-full bg-mist">
                              <div className="grad-accent h-full rounded-full" style={{ width: `${pr.pct ?? 0}%` }} />
                            </div>
                            <p className="mt-1.5 text-xs text-slate2">
                              {Math.round(pr.pct ?? 0)}% there{pr.reachDate ? ` · ${format(parseISO(pr.reachDate), 'MMM yyyy')}` : ' · not on track'}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-slate2">Growing · {money(Number(g.amount_per_payslip))}/payslip</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        projection && (
          <>
            <button onClick={() => setPotView('overview')} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate2 hover:text-ink">
              <ArrowLeft size={16} aria-hidden /> All goals
            </button>

            <div className="space-y-[18px]">
              {/* KPI cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Current balance</p>
                  <p className="mt-1 font-num text-xl font-semibold text-ink">{money(projection.start)}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Per payslip</p>
                  <p className="mt-1 font-num text-xl font-semibold text-ink">{money(projection.per)}</p>
                </Card>
                <Card className="p-5">
                  {projection.target != null ? (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate2">On track for</p>
                      <p className="mt-1 font-num text-xl font-semibold text-ink">{projection.reachDate ? format(parseISO(projection.reachDate), 'd MMM yyyy') : 'Not on track'}</p>
                      <p className="text-xs text-slate2">{projection.reachDate ? `Target ${money(projection.target)}` : `Add a per-payslip amount to reach ${money(projection.target)}`}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate2">In 12 months</p>
                      <p className="mt-1 font-num text-xl font-semibold text-ink">{money(projection.in12)}</p>
                      <p className="text-xs text-slate2">At {money(projection.per)} per payslip</p>
                    </>
                  )}
                </Card>
              </div>

              {/* Forecast chart */}
              <Card className="p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-semibold text-ink">{selected.name} — projected balance</h2>
                    {taxChip(selected)}
                    {selected.is_disposable_pot && <Badge tone="good">Disposable pot</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => { setLumpFor(selected); setLumpAmount('') }}>Add lump sum</Button>
                    <Button variant="ghost" onClick={() => open(selected)}>Edit goal</Button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate2">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.accent }} /> Projected balance</span>
                  {projection.target != null && (
                    <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed align-middle" style={{ borderColor: colors.pos }} /> Target</span>
                  )}
                </div>

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={projection.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <defs>
                        <linearGradient id="potFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={colors.accent} stopOpacity={0.24} />
                          <stop offset="100%" stopColor={colors.accent} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d: string) => format(parseISO(d), 'MMM yy')} tick={{ fontSize: 11, fill: colors.slate }} tickLine={false} axisLine={{ stroke: colors.line }} minTickGap={60} />
                      <YAxis domain={[0, Math.ceil(Math.max(projection.maxBalance, projection.target ?? 0) * 1.05)]} tickFormatter={(v: number) => moneyShort(v)} tick={{ fontSize: 11, fill: colors.slate, fontFamily: 'Geist Mono' }} tickLine={false} axisLine={false} width={72} />
                      <Tooltip formatter={(v) => [money(Number(v)), 'Projected balance']} labelFormatter={(d) => format(parseISO(String(d)), 'd MMM yyyy')} contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--line))', fontSize: 12, background: 'rgb(var(--surface))', color: 'rgb(var(--ink))' }} />
                      {projection.target != null && (
                        <ReferenceLine y={projection.target} stroke={colors.pos} strokeDasharray="5 4" label={{ value: `Target ${moneyShort(projection.target)}`, position: 'insideTopRight', fontSize: 10, fill: colors.pos }} />
                      )}
                      <Area type="monotone" dataKey="balance" stroke={colors.accent} strokeWidth={2} fill="url(#potFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <p className="mt-3 text-xs text-slate2">
                  {projection.target != null ? (
                    projection.reachDate
                      ? <>Reaches the {money(projection.target)} target around <span className="font-medium text-ink">{format(parseISO(projection.reachDate), 'd MMM yyyy')}</span> — currently <span className="font-medium text-ink">{Math.round(projection.pct ?? 0)}%</span> there.</>
                      : <>Not on track to reach {money(projection.target)} at the current rate — currently <span className="font-medium text-ink">{Math.round(projection.pct ?? 0)}%</span> there.</>
                  ) : (
                    <>Projected to <span className="font-medium text-ink">{money(projection.in12)}</span> in 12 months at {money(projection.per)} every fortnight.</>
                  )}
                </p>
              </Card>
            </div>
          </>
        )
      )}

      {/* Edit / add goal */}
      <Modal title={editing === 'new' ? 'Add savings goal' : 'Edit savings goal'} open={editing !== null} onClose={() => setEditing(null)}>
        <EntityForm onSubmit={save} onDelete={editing !== 'new' && editing ? async () => { await remove(editing.id); setEditing(null) } : undefined}>
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Per payslip"><TextInput type="number" step="0.01" min="0" value={form.amount_per_payslip} onChange={(e) => setForm({ ...form, amount_per_payslip: e.target.value })} required /></Field>
            <Field label="Saved so far"><TextInput type="number" step="0.01" value={form.current_saved} onChange={(e) => setForm({ ...form, current_saved: e.target.value })} /></Field>
          </div>
          <Field label="Target amount (optional)"><TextInput type="number" step="0.01" min="0" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts (optional)"><TextInput type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="Ends (optional)"><TextInput type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
          </div>
          <Field label="Deduction">
            <Select value={form.deduction_type} onChange={(e) => setForm({ ...form, deduction_type: e.target.value as DeductionType })}>
              <option value="post_tax">Post-tax — comes off net income (affects forecast)</option>
              <option value="pre_tax">Pre-tax — taken before pay lands (no forecast impact)</option>
            </Select>
          </Field>
          <div className="flex gap-6">
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Active" />
            <Toggle checked={form.is_disposable_pot} onChange={(v) => setForm({ ...form, is_disposable_pot: v })} label="Disposable cash pot" />
          </div>
          <Field label="Notes"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </EntityForm>
      </Modal>

      {/* Add lump sum */}
      <Modal title={`Add lump sum — ${lumpFor?.name ?? ''}`} open={lumpFor !== null} onClose={() => setLumpFor(null)}>
        <EntityForm onSubmit={saveLump} submitLabel="Add to balance">
          <p className="text-sm text-slate2">A one-off top-up added straight to this pot's current balance.</p>
          <Field label="Amount"><TextInput type="number" step="0.01" autoFocus value={lumpAmount} onChange={(e) => setLumpAmount(e.target.value)} required /></Field>
        </EntityForm>
      </Modal>
    </div>
  )
}
