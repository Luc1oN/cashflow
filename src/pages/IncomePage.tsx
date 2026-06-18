import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useTable } from '../lib/useTable'
import { money, titleCase } from '../lib/format'
import type { Income, IncomeFrequency, IncomeType } from '../lib/types'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const FREQUENCIES: IncomeFrequency[] = ['weekly', 'fortnightly', 'monthly', 'one_off']

const blank = {
  name: '', amount: '', frequency: 'monthly' as IncomeFrequency,
  income_type: 'salary' as IncomeType, next_date: format(new Date(), 'yyyy-MM-dd'),
  is_active: true, notes: '',
}

export default function IncomePage() {
  const { rows, loading, insert, update, remove } = useTable<Income>('income', 'next_date', true)
  const [editing, setEditing] = useState<Income | 'new' | null>(null)
  const [form, setForm] = useState(blank)

  const open = (i: Income | 'new') => {
    setEditing(i)
    setForm(i === 'new' ? blank : {
      name: i.name, amount: String(i.amount), frequency: i.frequency,
      income_type: i.income_type, next_date: i.next_date, is_active: i.is_active, notes: i.notes ?? '',
    })
  }

  const save = async () => {
    const values = {
      name: form.name, amount: Number(form.amount), frequency: form.frequency,
      income_type: form.income_type, next_date: form.next_date,
      is_active: form.is_active, notes: form.notes || null,
    }
    if (editing === 'new') await insert(values)
    else if (editing) await update(editing.id, values)
    setEditing(null)
  }

  return (
    <div>
      <PageHeader title="Income" subtitle="Salary streams set your paydays — savings deductions follow them" action={<Button onClick={() => open('new')}>Add income</Button>} />
      {loading ? <p className="text-slate2">Loading…</p> : rows.length === 0 ? (
        <EmptyState message="No income yet. Add your salary so the forecast knows when payday lands." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {i.name}{' '}
                    {i.income_type === 'salary' && <Badge tone="good">Salary</Badge>}{' '}
                    {!i.is_active && <Badge>Paused</Badge>}
                  </p>
                  <p className="text-xs text-slate2">{titleCase(i.frequency)} · next {format(parseISO(i.next_date), 'd MMM yyyy')}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-num font-semibold text-mossdeep">+{money(Number(i.amount))}</span>
                  <button onClick={() => open(i)} className="text-sm text-slate2 hover:text-ink">Edit</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal title={editing === 'new' ? 'Add income' : 'Edit income'} open={editing !== null} onClose={() => setEditing(null)}>
        <EntityForm onSubmit={save} onDelete={editing !== 'new' && editing ? async () => { await remove(editing.id); setEditing(null) } : undefined}>
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><TextInput type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Frequency">
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as IncomeFrequency })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{titleCase(f)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.income_type} onChange={(e) => setForm({ ...form, income_type: e.target.value as IncomeType })}>
                <option value="salary">Salary / payday</option>
                <option value="other">Other income</option>
              </Select>
            </Field>
            <Field label="Next payment"><TextInput type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} required /></Field>
          </div>
          <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Active" />
          <Field label="Notes"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </EntityForm>
      </Modal>
    </div>
  )
}
