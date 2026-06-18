import { useState } from 'react'
import { useTable } from '../lib/useTable'
import { money, titleCase } from '../lib/format'
import type { Account, AccountType } from '../lib/types'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const TYPES: AccountType[] = ['current', 'savings', 'credit_card', 'other']

const blank = { name: '', balance: '0', type: 'current' as AccountType, credit_limit: '', is_primary: false, notes: '' }

export default function Accounts() {
  const { rows, loading, insert, update, remove } = useTable<Account>('accounts', 'name', true)
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [form, setForm] = useState(blank)

  const open = (a: Account | 'new') => {
    setEditing(a)
    setForm(a === 'new' ? blank : {
      name: a.name, balance: String(a.balance), type: a.type,
      credit_limit: a.credit_limit != null ? String(a.credit_limit) : '',
      is_primary: a.is_primary, notes: a.notes ?? '',
    })
  }

  const save = async () => {
    const values = {
      name: form.name,
      balance: Number(form.balance),
      type: form.type,
      credit_limit: form.type === 'credit_card' && form.credit_limit !== '' ? Number(form.credit_limit) : null,
      is_primary: form.is_primary,
      notes: form.notes || null,
    }
    // Only one primary account: clear the flag on whichever account holds it now.
    if (form.is_primary) {
      const current = rows.find((r) => r.is_primary && (editing === 'new' || r.id !== editing?.id))
      if (current) await update(current.id, { is_primary: false })
    }
    if (editing === 'new') await insert(values)
    else if (editing) await update(editing.id, values)
    setEditing(null)
  }

  return (
    <div>
      <PageHeader title="Accounts" subtitle="Balances feed the starting point of your forecast" action={<Button onClick={() => open('new')}>Add account</Button>} />
      {loading ? <p className="text-slate2">Loading…</p> : rows.length === 0 ? (
        <EmptyState message="No accounts yet. Add your current account to anchor the forecast." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{a.name}</p>
                  <Badge tone={a.type === 'credit_card' ? 'warn' : 'neutral'}>{titleCase(a.type)}</Badge>{' '}
                  {a.is_primary && <Badge tone="good">Primary</Badge>}
                </div>
                <button onClick={() => open(a)} className="text-sm text-slate2 hover:text-ink">Edit</button>
              </div>
              <p className={`mt-3 font-num text-2xl font-semibold ${a.type === 'credit_card' && Number(a.balance) > 0 ? 'text-claret' : 'text-ink'}`}>
                {money(Number(a.balance))}
              </p>
              {a.type === 'credit_card' && a.credit_limit != null && (
                <p className="mt-1 text-xs text-slate2">Limit {money(Number(a.credit_limit))}</p>
              )}
              {a.notes && <p className="mt-2 text-xs text-slate2">{a.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal title={editing === 'new' ? 'Add account' : 'Edit account'} open={editing !== null} onClose={() => setEditing(null)}>
        <EntityForm onSubmit={save} onDelete={editing !== 'new' && editing ? async () => { await remove(editing.id); setEditing(null) } : undefined}>
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Balance"><TextInput type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} required /></Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
                {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </Select>
            </Field>
          </div>
          {form.type === 'credit_card' && (
            <Field label="Credit limit"><TextInput type="number" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></Field>
          )}
          <Toggle checked={form.is_primary} onChange={(v) => setForm({ ...form, is_primary: v })} label="Primary account — settle-the-day transactions apply here" />
          <Field label="Notes"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </EntityForm>
      </Modal>
    </div>
  )
}
