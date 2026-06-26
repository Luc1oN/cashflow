import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useTable } from '../lib/useTable'
import { money, titleCase } from '../lib/format'
import type { PlannedExpense, PlannedExpenseCategory } from '../lib/types'
import { aggregateByCategory } from '../lib/categories'
import { CategorySummary } from '../components/viz'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput } from '../components/ui'

const CATEGORIES: PlannedExpenseCategory[] = ['holiday', 'shopping', 'gift', 'car', 'home', 'event', 'other']

const blank = { name: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), category: 'other' as PlannedExpenseCategory, notes: '' }

export default function Planned() {
  const { rows, loading, insert, update, remove } = useTable<PlannedExpense>('planned_expenses', 'date', true)
  const [editing, setEditing] = useState<PlannedExpense | 'new' | null>(null)
  const [form, setForm] = useState(blank)

  const upcoming = rows.filter((p) => !p.is_completed)
  const done = rows.filter((p) => p.is_completed)
  const plannedByCat = aggregateByCategory(upcoming, (p) => p.category, (p) => Number(p.amount))
  const plannedTotal = upcoming.reduce((s, p) => s + Number(p.amount), 0)

  const open = (p: PlannedExpense | 'new') => {
    setEditing(p)
    setForm(p === 'new' ? blank : { name: p.name, amount: String(p.amount), date: p.date, category: p.category, notes: p.notes ?? '' })
  }

  const save = async () => {
    const values = { name: form.name, amount: Number(form.amount), date: form.date, category: form.category, notes: form.notes || null }
    if (editing === 'new') await insert(values)
    else if (editing) await update(editing.id, values)
    setEditing(null)
  }

  const Row = ({ p }: { p: PlannedExpense }) => (
    <li className={`flex items-center justify-between gap-3 px-5 py-3 transition-opacity ${p.is_completed ? 'opacity-50' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        <input
          type="checkbox"
          checked={p.is_completed}
          onChange={() => update(p.id, { is_completed: !p.is_completed })}
          aria-label={p.is_completed ? `Mark ${p.name} as not paid` : `Mark ${p.name} as paid`}
          className="h-4 w-4 accent-accent"
        />
        <div className="min-w-0">
          <p className={`truncate font-medium ${p.is_completed ? 'text-slate2 line-through' : 'text-ink'}`}>
            {p.name} <Badge>{titleCase(p.category)}</Badge>
          </p>
          <p className="text-xs text-slate2">{format(parseISO(p.date), 'd MMM yyyy')}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-num font-semibold text-ink">−{money(Number(p.amount))}</span>
        <button onClick={() => open(p)} className="text-sm text-slate2 hover:text-ink">Edit</button>
      </div>
    </li>
  )

  return (
    <div>
      <PageHeader title="Planned expenses" subtitle="One-off spends the forecast subtracts until you tick them off" action={<Button onClick={() => open('new')}>Add planned expense</Button>} />
      {loading ? <p className="text-slate2">Loading…</p> : rows.length === 0 ? (
        <EmptyState message="Nothing planned. Add upcoming one-offs — a holiday, a gift, car service — so they show in the forecast." />
      ) : (
        <div className="space-y-[18px]">
          {plannedByCat.length > 0 && (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-ink">By category</h2>
                <span className="font-num text-sm text-slate2">{money(plannedTotal)} planned</span>
              </div>
              <CategorySummary slices={plannedByCat} />
            </Card>
          )}
          <Card><ul className="divide-y divide-line">{upcoming.map((p) => <Row key={p.id} p={p} />)}</ul>
            {upcoming.length === 0 && <p className="px-5 py-4 text-sm text-slate2">All planned expenses are paid.</p>}
          </Card>
          {done.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate2">Paid</h2>
              <Card><ul className="divide-y divide-line">{done.map((p) => <Row key={p.id} p={p} />)}</ul></Card>
            </div>
          )}
        </div>
      )}

      <Modal title={editing === 'new' ? 'Add planned expense' : 'Edit planned expense'} open={editing !== null} onClose={() => setEditing(null)}>
        <EntityForm onSubmit={save} onDelete={editing !== 'new' && editing ? async () => { await remove(editing.id); setEditing(null) } : undefined}>
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><TextInput type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
          </div>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PlannedExpenseCategory })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </Select>
          </Field>
          <Field label="Notes"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </EntityForm>
      </Modal>
    </div>
  )
}
