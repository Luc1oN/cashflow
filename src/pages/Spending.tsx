import { useMemo, useRef, useState } from 'react'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { receiptUrl, uploadReceipt } from '../lib/receipts'
import { useTable } from '../lib/useTable'
import { money, titleCase } from '../lib/format'
import type { BudgetAlert, BudgetAlertType, Expense, ExpenseCategory } from '../lib/types'
import { Badge, Button, Card, EmptyState, EntityForm, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui'

const CATEGORIES: ExpenseCategory[] = ['food_drink', 'transport', 'shopping', 'entertainment', 'health', 'travel', 'bills', 'subscriptions', 'home', 'other']

const blankExpense = { name: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), category: 'other' as ExpenseCategory, merchant: '', notes: '' }
const blankBudget = { type: 'safe_to_spend' as BudgetAlertType, label: '', monthly_limit: '', category: 'food_drink', is_active: true }

export default function Spending() {
  const { user } = useAuth()
  const { toast } = useToast()
  const receiptInput = useRef<HTMLInputElement>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const expenses = useTable<Expense>('expenses', 'date')
  const budgets = useTable<BudgetAlert>('budget_alerts', 'label', true)
  const [editingExpense, setEditingExpense] = useState<Expense | 'new' | null>(null)
  const [expenseForm, setExpenseForm] = useState(blankExpense)
  const [editingBudget, setEditingBudget] = useState<BudgetAlert | 'new' | null>(null)
  const [budgetForm, setBudgetForm] = useState(blankBudget)

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const lastMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
  const monthSpend = expenses.rows.filter((e) => e.date >= monthStart)
  const lastMonthSpend = expenses.rows.filter((e) => e.date >= lastMonthStart && e.date < monthStart)
  const monthTotal = monthSpend.reduce((s, e) => s + Number(e.amount), 0)
  const lastMonthTotal = lastMonthSpend.reduce((s, e) => s + Number(e.amount), 0)

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of monthSpend) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [monthSpend])
  const topCategoryTotal = byCategory[0]?.[1] ?? 0

  const openExpense = (x: Expense | 'new') => {
    setEditingExpense(x)
    setReceiptFile(null)
    setExpenseForm(x === 'new' ? blankExpense : {
      name: x.name, amount: String(x.amount), date: x.date, category: x.category,
      merchant: x.merchant ?? '', notes: x.notes ?? '',
    })
  }

  const saveExpense = async () => {
    let receipt_url: string | undefined
    if (receiptFile && user) {
      receipt_url = await uploadReceipt(user.id, receiptFile)
    }
    const values = {
      name: expenseForm.name, amount: Number(expenseForm.amount), date: expenseForm.date,
      category: expenseForm.category, merchant: expenseForm.merchant || null, notes: expenseForm.notes || null,
      ...(receipt_url ? { receipt_url } : {}),
    }
    if (editingExpense === 'new') await expenses.insert(values)
    else if (editingExpense) await expenses.update(editingExpense.id, values)
    setEditingExpense(null)
  }

  const viewReceipt = async (path: string) => {
    try {
      const url = await receiptUrl(path)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open receipt', 'bad')
    }
  }

  const openBudget = (b: BudgetAlert | 'new') => {
    setEditingBudget(b)
    setBudgetForm(b === 'new' ? blankBudget : {
      type: b.type, label: b.label, monthly_limit: String(b.monthly_limit),
      category: b.category ?? 'food_drink', is_active: b.is_active,
    })
  }

  const saveBudget = async () => {
    const values = {
      type: budgetForm.type, label: budgetForm.label, monthly_limit: Number(budgetForm.monthly_limit),
      category: budgetForm.type === 'category' ? budgetForm.category : null, is_active: budgetForm.is_active,
    }
    if (editingBudget === 'new') await budgets.insert(values)
    else if (editingBudget) await budgets.update(editingBudget.id, values)
    setEditingBudget(null)
  }

  return (
    <div>
      <PageHeader
        title="Spending"
        subtitle={`${money(monthTotal)} spent so far this month`}
        action={<Button onClick={() => openExpense('new')}>Log expense</Button>}
      />

      {(monthSpend.length > 0 || lastMonthTotal > 0) && (
        <Card className="mb-6 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">This month at a glance</h2>
            {lastMonthTotal > 0 && (
              <p className="text-sm text-slate2">
                Last month: <span className="font-num">{money(lastMonthTotal)}</span>
                {' · '}
                <span className={monthTotal > lastMonthTotal ? 'text-amber2' : 'text-mossdeep'}>
                  {monthTotal > lastMonthTotal ? '▲' : '▼'} {money(Math.abs(monthTotal - lastMonthTotal))} vs last month so far
                </span>
              </p>
            )}
          </div>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate2">Nothing logged yet this month.</p>
          ) : (
            <ul className="space-y-2">
              {byCategory.map(([cat, total]) => (
                <li key={cat} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate2">{titleCase(cat)}</span>
                  <span className="h-3 rounded-full bg-moss/70 transition-all duration-500" style={{ width: `${Math.max((total / topCategoryTotal) * 100, 4)}%` }} />
                  <span className="font-num text-xs text-ink">{money(total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {expenses.loading ? <p className="text-slate2">Loading…</p> : expenses.rows.length === 0 ? (
            <EmptyState message="No expenses logged yet. Track day-to-day spending here to power your budgets." />
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {expenses.rows.slice(0, 50).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {x.name} <Badge>{titleCase(x.category)}</Badge>
                      </p>
                      <p className="text-xs text-slate2">
                        {format(parseISO(x.date), 'd MMM yyyy')}{x.merchant ? ` · ${x.merchant}` : ''}
                        {x.receipt_url && (
                          <>
                            {' · '}
                            <button onClick={() => viewReceipt(x.receipt_url!)} className="font-medium text-accent hover:underline">Receipt</button>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-num font-semibold text-ink">−{money(Number(x.amount))}</span>
                      <button onClick={() => openExpense(x)} className="text-sm text-slate2 hover:text-ink">Edit</button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Budgets</h2>
            <Button variant="ghost" onClick={() => openBudget('new')}>Add budget</Button>
          </div>
          {budgets.rows.length === 0 ? (
            <EmptyState message="Set a safe-to-spend or category limit to get warned before you overshoot." />
          ) : (
            <div className="space-y-3">
              {budgets.rows.map((b) => {
                const spent = b.type === 'safe_to_spend'
                  ? monthTotal
                  : monthSpend.filter((e) => e.category === b.category).reduce((s, e) => s + Number(e.amount), 0)
                const limit = Number(b.monthly_limit)
                const pct = Math.min((spent / limit) * 100, 100)
                const over = spent > limit
                return (
                  <Card key={b.id} className="p-4">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-ink">
                        {b.label} {!b.is_active && <Badge>Off</Badge>}
                      </span>
                      <button onClick={() => openBudget(b)} className="text-xs text-slate2 hover:text-ink">Edit</button>
                    </div>
                    <p className="mb-2 font-num text-xs text-slate2">{money(spent)} of {money(limit)} {over && <Badge tone="bad">Over</Badge>}</p>
                    <div className="h-2 overflow-hidden rounded-full bg-mist">
                      <div className={`h-full rounded-full ${over ? 'bg-claret' : pct > 80 ? 'bg-amber2' : 'bg-moss'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal title={editingExpense === 'new' ? 'Log expense' : 'Edit expense'} open={editingExpense !== null} onClose={() => setEditingExpense(null)}>
        <EntityForm onSubmit={saveExpense} onDelete={editingExpense !== 'new' && editingExpense ? async () => { await expenses.remove(editingExpense.id); setEditingExpense(null) } : undefined}>
          <Field label="Description"><TextInput value={expenseForm.name} onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><TextInput type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required /></Field>
            <Field label="Date"><TextInput type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </Select>
            </Field>
            <Field label="Merchant (optional)"><TextInput value={expenseForm.merchant} onChange={(e) => setExpenseForm({ ...expenseForm, merchant: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><TextArea value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} /></Field>
          <div>
            <input
              ref={receiptInput}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="ghost" onClick={() => receiptInput.current?.click()}>
              {receiptFile ? `Receipt: ${receiptFile.name}` : editingExpense !== 'new' && editingExpense?.receipt_url ? 'Replace receipt' : 'Attach receipt'}
            </Button>
          </div>
        </EntityForm>
      </Modal>

      <Modal title={editingBudget === 'new' ? 'Add budget' : 'Edit budget'} open={editingBudget !== null} onClose={() => setEditingBudget(null)}>
        <EntityForm onSubmit={saveBudget} onDelete={editingBudget !== 'new' && editingBudget ? async () => { await budgets.remove(editingBudget.id); setEditingBudget(null) } : undefined}>
          <Field label="Type">
            <Select value={budgetForm.type} onChange={(e) => setBudgetForm({ ...budgetForm, type: e.target.value as BudgetAlertType })}>
              <option value="safe_to_spend">Safe to spend — all spending this month</option>
              <option value="category">Category limit</option>
            </Select>
          </Field>
          <Field label="Label"><TextInput value={budgetForm.label} onChange={(e) => setBudgetForm({ ...budgetForm, label: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly limit"><TextInput type="number" step="0.01" min="0" value={budgetForm.monthly_limit} onChange={(e) => setBudgetForm({ ...budgetForm, monthly_limit: e.target.value })} required /></Field>
            {budgetForm.type === 'category' && (
              <Field label="Category">
                <Select value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Toggle checked={budgetForm.is_active} onChange={(v) => setBudgetForm({ ...budgetForm, is_active: v })} label="Active" />
        </EntityForm>
      </Modal>
    </div>
  )
}
