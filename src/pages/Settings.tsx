import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { exportTableCsv, isRevolutCsv, parseExpensesCsv, parseRevolutCsv, type ParsedExpenseRow, type ParsedIncomeRow } from '../lib/csv'
import { getCurrency, titleCase } from '../lib/format'
import type { Profile } from '../lib/types'
import { Button, Card, Field, Modal, PageHeader, Select, Skeleton, TextInput, Toggle } from '../components/ui'

const EXPORT_TABLES = ['accounts', 'income', 'bills', 'savings_goals', 'planned_expenses', 'expenses', 'budget_alerts', 'loans', 'transactions']
const HORIZONS = [30, 60, 90, 180, 365]
const MIN_PASSWORD = 10

export default function Settings() {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

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

  const [importPreview, setImportPreview] = useState<{ source: 'generic' | 'revolut'; expenses: ParsedExpenseRow[]; income: ParsedIncomeRow[]; skipped: string[] } | null>(null)
  const [importIncome, setImportIncome] = useState(true)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [signOutAllOpen, setSignOutAllOpen] = useState(false)
  const [signOutAllBusy, setSignOutAllBusy] = useState(false)

  const changePassword = async () => {
    if (newPassword !== confirmPassword) { setPasswordError('Those two passwords don\u2019t match.'); return }
    if (newPassword.length < MIN_PASSWORD) { setPasswordError(`Use at least ${MIN_PASSWORD} characters.`); return }
    setPasswordBusy(true)
    setPasswordError(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordBusy(false)
    if (error) { setPasswordError(error.message); return }
    setPasswordOpen(false)
    toast('Password changed')
  }

  const signOutEverywhere = async () => {
    setSignOutAllBusy(true)
    // scope: 'global' revokes every refresh token for this user, so the other
    // devices are signed out too rather than just this browser forgetting.
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    setSignOutAllBusy(false)
    if (error) { toast(error.message, 'bad'); return }
    setSignOutAllOpen(false)
  }

  const updateProfile = async (values: Partial<Profile>, reload = false) => {
    const { error } = await supabase.from('profiles').update(values).eq('id', user!.id)
    if (error) { toast(error.message, 'bad'); return }
    toast('Settings saved')
    if (reload) {
      // Currency is read app-wide at startup; reload to re-render every figure.
      window.location.reload()
    } else {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  const onImportFile = async (file: File) => {
    const text = await file.text()
    setImportIncome(true)
    if (isRevolutCsv(text)) {
      const { expenses, income, skipped } = parseRevolutCsv(text)
      setImportPreview({ source: 'revolut', expenses, income, skipped })
    } else {
      const { rows, skipped } = parseExpensesCsv(text)
      setImportPreview({ source: 'generic', expenses: rows, income: [], skipped })
    }
  }

  const confirmImport = async () => {
    if (!importPreview || importPreview.expenses.length === 0) return
    setImporting(true)
    let importedIncome = 0
    if (importPreview.expenses.length > 0) {
      const { error } = await supabase.from('expenses').insert(importPreview.expenses)
      if (error) { setImporting(false); toast(error.message, 'bad'); return }
    }
    if (importPreview.source === 'revolut' && importIncome && importPreview.income.length > 0) {
      // Revolut statements have no recurrence info; import as one-off income events.
      const rows = importPreview.income.map((r) => ({
        name: r.name, amount: r.amount, frequency: 'one_off', income_type: 'other', next_date: r.date, is_active: false,
      }))
      const { error } = await supabase.from('income').insert(rows)
      if (error) { setImporting(false); toast(error.message, 'bad'); return }
      importedIncome = rows.length
    }
    setImporting(false)
    const parts = [`${importPreview.expenses.length} expense${importPreview.expenses.length === 1 ? '' : 's'}`]
    if (importedIncome > 0) parts.push(`${importedIncome} income item${importedIncome === 1 ? '' : 's'}`)
    toast(`Imported ${parts.join(' and ')}`)
    setImportPreview(null)
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
    queryClient.invalidateQueries({ queryKey: ['income'] })
  }

  if (profileQuery.isLoading || !profile) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Settings" subtitle={user?.email ?? ''} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Preferences</h2>
          <Field label="Currency">
            <Select
              defaultValue={getCurrency()}
              onChange={(e) => updateProfile({ currency: e.target.value as Profile['currency'] }, true)}
            >
              <option value="GBP">£ Pound sterling</option>
              <option value="EUR">€ Euro</option>
              <option value="USD">$ US dollar</option>
            </Select>
          </Field>
          <Field label="Default forecast horizon">
            <Select
              defaultValue={String(profile.default_horizon)}
              onChange={(e) => updateProfile({ default_horizon: Number(e.target.value) })}
            >
              {HORIZONS.map((h) => <option key={h} value={h}>{h} days</option>)}
            </Select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Appearance</span>
            <div className="grid grid-cols-2 gap-3">
              {([['midnight', 'linear-gradient(135deg,#5b8cff,#9d6bff)'], ['daylight', 'linear-gradient(135deg,#3b5bfd,#7c4dff)']] as const).map(([t, swatch]) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`rounded-[14px] border-2 p-3 text-left transition ${theme === t ? 'border-accent' : 'border-line hover:border-border2'}`}
                >
                  <span className="block h-10 w-full rounded-[10px]" style={{ background: swatch }} />
                  <span className="mt-2 block text-sm font-medium capitalize text-ink">{t}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Security</h2>

          <div>
            <p className="mb-1 text-sm font-medium text-ink">Password</p>
            <p className="mb-3 text-xs text-slate2">
              Signed in as {user?.email}. Changing your password does not sign out your other devices — use the button
              below for that.
            </p>
            <Button variant="ghost" onClick={() => { setPasswordOpen(true); setPasswordError(null); setNewPassword(''); setConfirmPassword('') }}>
              Change password
            </Button>
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-1 text-sm font-medium text-ink">Signed-in devices</p>
            <p className="mb-3 text-xs text-slate2">
              You use CashFlow on desktop, iPad and phone. If one of them is lost, stolen or shared, this ends every
              session everywhere — including this one.
            </p>
            <Button variant="ghost" onClick={() => setSignOutAllOpen(true)}>Sign out of all devices</Button>
          </div>

          <div className="border-t border-line pt-4">
            <button onClick={signOut} className="flex min-h-[44px] w-full items-center justify-between text-sm font-medium text-neg">
              Sign out on this device <span aria-hidden>›</span>
            </button>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Your data</h2>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Export as CSV</p>
            <div className="flex flex-wrap gap-2">
              {EXPORT_TABLES.map((t) => (
                <button
                  key={t}
                  disabled={exporting === t}
                  onClick={async () => {
                    setExporting(t)
                    try { await exportTableCsv(t) } catch (err) { toast(err instanceof Error ? err.message : 'Export failed', 'bad') }
                    setExporting(null)
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-mist disabled:opacity-50"
                >
                  {exporting === t ? 'Exporting…' : titleCase(t)}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <p className="mb-1 text-sm font-medium text-ink">Import transactions from CSV</p>
            <p className="mb-3 text-xs text-slate2">
              Drop in a <span className="font-medium text-ink">Revolut statement</span> (Account → Statement → Excel/CSV) and it's detected automatically — spending, fees, and income are split out and categorised. Other CSVs need: name (or description), amount, date (yyyy-mm-dd or dd/mm/yyyy); category and merchant optional.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = '' }}
            />
            <Button variant="ghost" onClick={() => fileInput.current?.click()}>Choose CSV file</Button>
          </div>
        </Card>
      </div>

      <Modal title="Change password" open={passwordOpen} onClose={() => setPasswordOpen(false)}>
        <div className="space-y-4 text-sm">
          <Field label="New password">
            <TextInput type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD} />
          </Field>
          <Field label="Confirm new password">
            <TextInput type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD} />
          </Field>
          <p className="text-xs text-slate2">At least {MIN_PASSWORD} characters.</p>
          {passwordError && <p className="text-claret" role="alert">{passwordError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button onClick={changePassword} disabled={passwordBusy}>{passwordBusy ? 'Saving…' : 'Change password'}</Button>
          </div>
        </div>
      </Modal>

      <Modal title="Sign out of all devices" open={signOutAllOpen} onClose={() => setSignOutAllOpen(false)}>
        <div className="space-y-4 text-sm">
          <p className="text-slate2">
            This ends every CashFlow session for {user?.email} — desktop, iPad and phone — and signs you out here too.
            Your data is untouched; you'll just need to sign in again.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSignOutAllOpen(false)}>Cancel</Button>
            <Button onClick={signOutEverywhere} disabled={signOutAllBusy}>{signOutAllBusy ? 'Signing out…' : 'Sign out everywhere'}</Button>
          </div>
        </div>
      </Modal>

      <Modal title={importPreview?.source === 'revolut' ? 'Import Revolut statement' : 'Import expenses'} open={importPreview !== null} onClose={() => setImportPreview(null)}>
        {importPreview && (
          <div className="space-y-4 text-sm">
            <p className="text-ink">
              <span className="font-semibold">{importPreview.expenses.length}</span> expense{importPreview.expenses.length === 1 ? '' : 's'}
              {importPreview.source === 'revolut' && importPreview.income.length > 0 && (
                <> and <span className="font-semibold">{importPreview.income.length}</span> income item{importPreview.income.length === 1 ? '' : 's'}</>
              )}
              {' '}ready to import
              {importPreview.skipped.length > 0 && <>, <span className="font-medium text-amber2">{importPreview.skipped.length} skipped</span></>}.
            </p>

            {importPreview.source === 'revolut' && importPreview.income.length > 0 && (
              <div className="rounded-lg border border-line p-3">
                <Toggle checked={importIncome} onChange={setImportIncome} label={`Also import ${importPreview.income.length} income item${importPreview.income.length === 1 ? '' : 's'}`} />
                <p className="mt-1 pl-11 text-xs text-slate2">Added as inactive one-off entries so they don't affect your forecast — turn the ones you want (like salary) into recurring income afterwards.</p>
              </div>
            )}

            {importPreview.expenses.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate2">Expenses</p>
                <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                  {importPreview.expenses.slice(0, 20).map((r, i) => (
                    <li key={i} className="flex justify-between gap-2 px-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate text-ink">{r.date} · {r.name} <span className="text-slate2">· {titleCase(r.category)}</span></span>
                      <span className="font-num text-claret">-{r.amount.toFixed(2)}</span>
                    </li>
                  ))}
                  {importPreview.expenses.length > 20 && <li className="px-3 py-1.5 text-xs text-slate2">…and {importPreview.expenses.length - 20} more</li>}
                </ul>
              </div>
            )}

            {importPreview.source === 'revolut' && importIncome && importPreview.income.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate2">Income</p>
                <ul className="max-h-32 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                  {importPreview.income.slice(0, 10).map((r, i) => (
                    <li key={i} className="flex justify-between gap-2 px-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate text-ink">{r.date} · {r.name}</span>
                      <span className="font-num text-mossdeep">+{r.amount.toFixed(2)}</span>
                    </li>
                  ))}
                  {importPreview.income.length > 10 && <li className="px-3 py-1.5 text-xs text-slate2">…and {importPreview.income.length - 10} more</li>}
                </ul>
              </div>
            )}

            {importPreview.skipped.length > 0 && (
              <details className="text-xs text-slate2">
                <summary className="cursor-pointer font-medium">Skipped lines</summary>
                <ul className="mt-1 list-inside space-y-0.5">
                  {importPreview.skipped.slice(0, 10).map((s, i) => <li key={i}>{s}</li>)}
                  {importPreview.skipped.length > 10 && <li>…and {importPreview.skipped.length - 10} more</li>}
                </ul>
              </details>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportPreview(null)}>Cancel</Button>
              <Button onClick={confirmImport} disabled={importing || importPreview.expenses.length === 0}>
                {importing ? 'Importing…' : 'Import'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
