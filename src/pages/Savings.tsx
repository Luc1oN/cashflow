import { useState } from 'react'
import { useTable } from '../lib/useTable'
import { money } from '../lib/format'
import type { DeductionType, SavingsGoal } from '../lib/types'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const blank = {
  name: '', amount_per_payslip: '', current_saved: '0', target_amount: '',
  start_date: '', end_date: '', deduction_type: 'post_tax' as DeductionType,
  is_active: true, is_disposable_pot: false, notes: '',
}

export default function Savings() {
  const { rows, loading, insert, update, remove } = useTable<SavingsGoal>('savings_goals', 'name', true)
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null)
  const [form, setForm] = useState(blank)

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

  return (
    <div>
      <PageHeader title="Savings goals" subtitle="Post-tax goals come off each payday in the forecast; pre-tax goals never touch net cash" action={<Button onClick={() => open('new')}>Add goal</Button>} />
      {loading ? <p className="text-slate2">Loading…</p> : rows.length === 0 ? (
        <EmptyState message="No savings goals yet. Add one to put money aside automatically each payslip." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((g) => {
            const pct = g.target_amount ? Math.min((Number(g.current_saved) / Number(g.target_amount)) * 100, 100) : null
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{g.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.is_disposable_pot && <Badge tone="good">Disposable pot</Badge>}
                      <Badge tone={g.deduction_type === 'pre_tax' ? 'warn' : 'neutral'}>{g.deduction_type === 'pre_tax' ? 'Pre-tax' : 'Post-tax'}</Badge>
                      {!g.is_active && <Badge>Paused</Badge>}
                    </div>
                  </div>
                  <button onClick={() => open(g)} className="text-sm text-slate2 hover:text-ink">Edit</button>
                </div>
                <p className="mt-3 font-num text-xl font-semibold text-ink">
                  {money(Number(g.current_saved))}
                  {g.target_amount != null && <span className="text-sm font-normal text-slate2"> / {money(Number(g.target_amount))}</span>}
                </p>
                {pct != null && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-moss" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <p className="mt-2 text-xs text-slate2">{money(Number(g.amount_per_payslip))} per payslip</p>
              </Card>
            )
          })}
        </div>
      )}

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
    </div>
  )
}
