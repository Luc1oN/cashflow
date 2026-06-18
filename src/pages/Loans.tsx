import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTable } from '../lib/useTable'
import { buildLoanForecast } from '../lib/forecast'
import { money, moneyShort, titleCase } from '../lib/format'
import type { Loan, LoanFrequency, OneOffLoanPayment } from '../lib/types'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const FREQUENCIES: LoanFrequency[] = ['weekly', 'fortnightly', 'monthly']

const blankLoan = {
  name: '', starting_balance: '', interest_rate: '0', payment_amount: '',
  payment_frequency: 'monthly' as LoanFrequency, start_date: format(new Date(), 'yyyy-MM-dd'),
  is_active: true, notes: '',
}
const blankLump = { amount: '', payment_date: format(new Date(), 'yyyy-MM-dd'), label: '' }

export default function Loans() {
  const loans = useTable<Loan>('loans', 'name', true)
  const lumps = useTable<OneOffLoanPayment>('one_off_loan_payments', 'payment_date', true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Loan | 'new' | null>(null)
  const [form, setForm] = useState(blankLoan)
  const [lumpFor, setLumpFor] = useState<Loan | null>(null)
  const [lumpForm, setLumpForm] = useState(blankLump)

  const selected = loans.rows.find((l) => l.id === selectedId) ?? loans.rows.find((l) => l.is_active) ?? loans.rows[0] ?? null
  const selectedLumps = useMemo(() => lumps.rows.filter((p) => p.loan_id === selected?.id), [lumps.rows, selected])
  const forecast = useMemo(() => (selected ? buildLoanForecast(selected, selectedLumps) : null), [selected, selectedLumps])

  const open = (l: Loan | 'new') => {
    setEditing(l)
    setForm(l === 'new' ? blankLoan : {
      name: l.name, starting_balance: String(l.starting_balance), interest_rate: String(l.interest_rate),
      payment_amount: String(l.payment_amount), payment_frequency: l.payment_frequency,
      start_date: l.start_date, is_active: l.is_active, notes: l.notes ?? '',
    })
  }

  const save = async () => {
    const values = {
      name: form.name, starting_balance: Number(form.starting_balance), interest_rate: Number(form.interest_rate || 0),
      payment_amount: Number(form.payment_amount), payment_frequency: form.payment_frequency,
      start_date: form.start_date, is_active: form.is_active, notes: form.notes || null,
    }
    if (editing === 'new') await loans.insert(values)
    else if (editing) await loans.update(editing.id, values)
    setEditing(null)
  }

  const saveLump = async () => {
    if (!lumpFor) return
    await lumps.insert({ loan_id: lumpFor.id, amount: Number(lumpForm.amount), payment_date: lumpForm.payment_date, label: lumpForm.label || null })
    setLumpFor(null)
    setLumpForm(blankLump)
  }

  return (
    <div>
      <PageHeader title="Loans" subtitle="See your payoff date and what a lump sum would change" action={<Button onClick={() => open('new')}>Add loan</Button>} />
      {loans.loading ? <p className="text-slate2">Loading…</p> : loans.rows.length === 0 ? (
        <EmptyState message="No loans tracked. Add one to forecast its payoff date and total interest." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {loans.rows.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${selected?.id === l.id ? 'border-moss bg-moss/10 text-mossdeep' : 'border-line bg-surface text-slate2 hover:text-ink'}`}
              >
                {l.name}{!l.is_active && ' (inactive)'}
              </button>
            ))}
          </div>

          {selected && forecast && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Payoff date</p>
                  <p className="mt-1 font-num text-xl font-semibold text-ink">
                    {forecast.payoffDate ? format(parseISO(forecast.payoffDate), 'd MMM yyyy') : '30+ years'}
                  </p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Total interest</p>
                  <p className="mt-1 font-num text-xl font-semibold text-amber2">{money(forecast.totalInterest)}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate2">Total to repay</p>
                  <p className="mt-1 font-num text-xl font-semibold text-ink">{money(forecast.totalPaid)}</p>
                </Card>
              </div>

              <Card className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">{selected.name} — balance over time</h2>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => { setLumpFor(selected); setLumpForm(blankLump) }}>Add lump sum</Button>
                    <Button variant="ghost" onClick={() => open(selected)}>Edit loan</Button>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecast.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <defs>
                        <linearGradient id="loanFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgb(var(--amber2))" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="rgb(var(--amber2))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d: string) => format(parseISO(d), 'MMM yy')} tick={{ fontSize: 11, fill: 'rgb(var(--slate2))' }} tickLine={false} axisLine={{ stroke: 'rgb(var(--line))' }} minTickGap={48} />
                      <YAxis tickFormatter={(v: number) => moneyShort(v)} tick={{ fontSize: 11, fill: 'rgb(var(--slate2))', fontFamily: 'IBM Plex Mono' }} tickLine={false} axisLine={false} width={72} />
                      <Tooltip formatter={(v) => [money(Number(v)), 'Balance']} labelFormatter={(d) => format(parseISO(String(d)), 'd MMM yyyy')} contentStyle={{ borderRadius: 8, border: '1px solid rgb(var(--line))', fontSize: 12, background: 'rgb(var(--surface))', color: 'rgb(var(--ink))' }} />
                      <Area type="monotone" dataKey="balance" stroke="rgb(var(--amber2))" strokeWidth={2} fill="url(#loanFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 text-xs text-slate2">
                  {money(Number(selected.payment_amount))} {titleCase(selected.payment_frequency).toLowerCase()} at {Number(selected.interest_rate)}% APR from {format(parseISO(selected.start_date), 'd MMM yyyy')}
                </p>
              </Card>

              {selectedLumps.length > 0 && (
                <Card>
                  <h2 className="px-5 pt-4 font-display text-lg font-semibold text-ink">One-off payments</h2>
                  <ul className="divide-y divide-line">
                    {selectedLumps.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <div>
                          <p className="font-medium text-ink">{p.label || 'Lump sum'} <Badge tone="good">Extra payment</Badge></p>
                          <p className="text-xs text-slate2">{format(parseISO(p.payment_date), 'd MMM yyyy')}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-num font-semibold text-mossdeep">−{money(Number(p.amount))}</span>
                          <button onClick={() => lumps.remove(p.id)} className="text-xs text-claret hover:underline">Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      <Modal title={editing === 'new' ? 'Add loan' : 'Edit loan'} open={editing !== null} onClose={() => setEditing(null)}>
        <EntityForm onSubmit={save} onDelete={editing !== 'new' && editing ? async () => { await loans.remove(editing.id); setEditing(null) } : undefined}>
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Outstanding balance"><TextInput type="number" step="0.01" min="0" value={form.starting_balance} onChange={(e) => setForm({ ...form, starting_balance: e.target.value })} required /></Field>
            <Field label="APR %"><TextInput type="number" step="0.001" min="0" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment amount"><TextInput type="number" step="0.01" min="0" value={form.payment_amount} onChange={(e) => setForm({ ...form, payment_amount: e.target.value })} required /></Field>
            <Field label="Frequency">
              <Select value={form.payment_frequency} onChange={(e) => setForm({ ...form, payment_frequency: e.target.value as LoanFrequency })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{titleCase(f)}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Forecast starts"><TextInput type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></Field>
          <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Active" />
          <Field label="Notes"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </EntityForm>
      </Modal>

      <Modal title={`Add lump sum — ${lumpFor?.name ?? ''}`} open={lumpFor !== null} onClose={() => setLumpFor(null)}>
        <EntityForm onSubmit={saveLump} submitLabel="Add payment">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><TextInput type="number" step="0.01" min="0" value={lumpForm.amount} onChange={(e) => setLumpForm({ ...lumpForm, amount: e.target.value })} required /></Field>
            <Field label="Date"><TextInput type="date" value={lumpForm.payment_date} onChange={(e) => setLumpForm({ ...lumpForm, payment_date: e.target.value })} required /></Field>
          </div>
          <Field label="Label (optional)"><TextInput value={lumpForm.label} onChange={(e) => setLumpForm({ ...lumpForm, label: e.target.value })} placeholder="Tax refund, bonus…" /></Field>
        </EntityForm>
      </Modal>
    </div>
  )
}
