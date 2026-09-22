import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, TextInput } from '../components/ui'

type Mode = 'sign_in' | 'sign_up' | 'reset'

// Supabase enforces 6 by default; a personal finance app deserves more. Kept in
// one place so the input's minLength and the copy below can't drift apart.
const MIN_PASSWORD = 10

/** Where the reset email should send people back to: this app, at the sign-in
 *  screen. HashRouter means the app lives under BASE_URL with routes in the
 *  fragment, so a bare origin would land on the wrong page (or a 404 on Pages). */
const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      // Deliberately the same reply either way: a different message for a
      // missing address would let anyone test which emails have accounts here.
      setMessage(
        error && !/rate/i.test(error.message)
          ? { text: error.message, tone: 'error' }
          : { text: 'If that address has an account, a reset link is on its way. Check your inbox and spam folder.', tone: 'info' },
      )
      setBusy(false)
      return
    }

    const { error } =
      mode === 'sign_in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })

    if (error) setMessage({ text: error.message, tone: 'error' })
    else if (mode === 'sign_up') {
      setMessage({ text: 'Account created. Check your email if confirmation is enabled, then sign in.', tone: 'info' })
    }
    setBusy(false)
  }

  const title = mode === 'reset' ? 'Reset your password' : mode === 'sign_up' ? 'Create account' : 'Sign in'

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center font-display text-4xl font-semibold text-ink">
          Cash<span className="text-accent">Flow</span>
        </h1>
        <p className="mb-8 text-center text-sm text-slate2">Know where every payday goes.</p>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>

          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          {mode === 'reset' ? (
            <p className="text-xs text-slate2">We'll email you a link to choose a new password.</p>
          ) : (
            <Field label="Password">
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'sign_up' ? MIN_PASSWORD : undefined}
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              />
            </Field>
          )}

          {mode === 'sign_up' && (
            <p className="text-xs text-slate2">
              At least {MIN_PASSWORD} characters. This account holds your balances, bills and income — use a password
              you don't use anywhere else.
            </p>
          )}

          {message && (
            <p className={`text-sm ${message.tone === 'error' ? 'text-claret' : 'text-amber2'}`} role="alert">
              {message.text}
            </p>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Working…' : mode === 'sign_in' ? 'Sign in' : mode === 'sign_up' ? 'Create account' : 'Email me a reset link'}
          </Button>

          <div className="space-y-2 pt-1 text-center text-sm">
            {mode === 'sign_in' && (
              <button
                type="button"
                onClick={() => { setMode('reset'); setMessage(null) }}
                className="block w-full py-1 text-slate2 hover:text-ink"
              >
                Forgot your password?
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in'); setMessage(null) }}
              className="block w-full py-1 text-slate2 hover:text-ink"
            >
              {mode === 'sign_in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
