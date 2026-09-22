import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button, Field, TextInput } from '../components/ui'

const MIN_PASSWORD = 10

/**
 * Shown when the user arrives from a password-reset email. Supabase has already
 * signed them in with a recovery session at this point, so this screen must be
 * reached before the app proper — otherwise the link silently logs them in and
 * never changes the password it was sent to change.
 */
export default function UpdatePassword() {
  const { endRecovery, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Those two passwords don’t match.'); return }
    if (password.length < MIN_PASSWORD) { setError(`Use at least ${MIN_PASSWORD} characters.`); return }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setBusy(false); return }
    setBusy(false)
    endRecovery()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center font-display text-4xl font-semibold text-ink">
          Cash<span className="text-accent">Flow</span>
        </h1>
        <p className="mb-8 text-center text-sm text-slate2">Choose a new password.</p>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
          <Field label="New password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
            />
          </Field>
          <p className="text-xs text-slate2">At least {MIN_PASSWORD} characters.</p>
          {error && <p className="text-sm text-claret" role="alert">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
          <button
            type="button"
            onClick={async () => { endRecovery(); await signOut() }}
            className="block w-full py-1 text-center text-sm text-slate2 hover:text-ink"
          >
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  )
}
