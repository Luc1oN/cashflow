import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useTable } from '../lib/useTable'
import { money, titleCase } from '../lib/format'
import type { Bill, BillCategory, BillFrequency } from '../lib/types'
import { aggregateByCategory, categoryColor } from '../lib/categories'
import { CategorySummary } from '../components/viz'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const FREQUENCIES: BillFrequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual', 'one_off']
const CATEGORIES: BillCategory[] = ['housing', 'utilities', 'insurance', 'transport', 'subscriptions', 'food', 'health', 'education', 'other']

const MONTHLY_FACTOR: Record<BillFrequency, number> = {
  weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12, one_off: 0,
}

const blank = {
  name: '', amount: '', next_due_date: format(new Date(), 'yyyy-MM-dd'),
  frequency: 'monthly' as BillFrequency, category: 'other' as BillCategory, is_active: true, notes: '',
}

export default function Bills() {
  const { rows, loading, insert, update, remove } = useTable<Bill>('bills', 'next_due_date', true)
  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const [form, setForm] = useState(blank)

  const monthlyTotal = rows
    .filter((b) => b.is_active)
    .reduce((s, b) => s + Number(b.amount) * MONTHLY_FACTOR[b.frequency], 0)

  const byCategory = aggregateByCategory(
    rows.filter((b) => b.is_active),
    (b) => b.category,
    (b) => Number(b.amount) * MONTHLY_FACTOR[b.frequency],
  )

  const open = (b: Bill | 'new') => {
    setEditing(b)
    setForm(b === 'new' ? blank : {
      name: b.name, amount: String(b.amount), next_due_date: b.next_due_date,
      frequency: b.frequency, category: b.category, is_active: b.is_active, notes: b.notes ?? '',
    })
  }

  const save = async () => {
    const values = {
      name: form.name, amount: Number(form.amount), next_due_date: form.next_due_date,
      frequency: form.frequency, category: form.category, is_active: form.is_active, notes: form.notes || null,
    }
    if (editing === 'new') await insert(values)
    else if (editing) await update(editing.id, values)
    setEditing(null)
  }

  return (
    <div>
      <PageHeader
        title="Bills"
        subtitle={`Roughly ${money(monthlyTotal)} a month across active bills`}
        action={<Button onClick={() => open('new')}>Add bill</Button>}
      />
      {loading ? <p className="text-slate2">Loading…</p> : rows.length === 0 ? (
        <EmptyState message="No bills yet. Add rent, utilities, and subscriptions so the forecast can subtract them." />
      ) : (
        <div className="space-y-[18px]">
          {byCategory.length > 0 && (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-ink">By category</h2>
                <span className="font-num text-sm text-slate2">{money(monthlyTotal)} / month</span>
              </div>
              <CategorySummary slices={byCategory} />
            </Card>
          )}
          <Card>
            <ul className="divide-y divide-line">
              {rows.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] font-num text-sm font-semibold text-white" style={{ background: categoryColor(b.category) }}>
                      {b.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {b.name} <Badge>{titleCase(b.category)}</Badge>{' '}
                        {!b.is_active && <Badge tone="warn">Paused</Badge>}
                      </p>
                      <p className="text-xs text-slate2">{titleCase(b.frequency)} · next due {format(parseISO(b.next_due_date), 'd MMM yyyy')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-num font-semibold text-ink">−{money(Number(b.amount))}</span>
                    <button onClick={() => open(b)} className="text-sm text-slate2 hover:text-ink">Edit</button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Modal title={editing === 'new' ? 'Add bill' : 'Edit bill'} open={editing !== null} onClose={() => setEditing(null)}>
        <EntityForm onSubmit={save} onDelete={editing !== 'new' && editing ? async () => { await remove(editing.id); setEditing(null) } : undefined}>
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><TextInput type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Next due"><TextInput type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as BillFrequency })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{titleCase(f)}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BillCategory })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </Select>
            </Field>
          </div>
          <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Active" />
          <Field label="Notes"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </EntityForm>
      </Modal>
    </div>
  )
}
