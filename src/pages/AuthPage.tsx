import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, TextInput } from '../components/ui'

export default function AuthPage() {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'sign_in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else if (mode === 'sign_up') setMessage('Account created. Check your email if confirmation is enabled, then sign in.')
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center font-display text-4xl font-semibold text-ink">
          Cash<span className="text-moss">Flow</span>
        </h1>
        <p className="mb-8 text-center text-sm text-slate2">Know where every payday goes.</p>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'} />
          </Field>
          {message && <p className="text-sm text-amber2">{message}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Working…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')}
            className="w-full text-center text-sm text-slate2 hover:text-ink"
          >
            {mode === 'sign_in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
