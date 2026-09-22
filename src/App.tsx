import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import { setCurrency, type CurrencyCode } from './lib/format'
import AuthPage from './pages/AuthPage'
import UpdatePassword from './pages/UpdatePassword'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Advisor = lazy(() => import('./pages/Advisor'))
const Accounts = lazy(() => import('./pages/Accounts'))
const IncomePage = lazy(() => import('./pages/IncomePage'))
const Bills = lazy(() => import('./pages/Bills'))
const Savings = lazy(() => import('./pages/Savings'))
const Planned = lazy(() => import('./pages/Planned'))
const Spending = lazy(() => import('./pages/Spending'))
const Loans = lazy(() => import('./pages/Loans'))
const History = lazy(() => import('./pages/History'))
const Settings = lazy(() => import('./pages/Settings'))

function PageFallback() {
  return <div className="py-12 text-center text-sm text-slate2">Loading…</div>
}

/**
 * Loads the profile currency before rendering money anywhere.
 *
 * This gate blocks the entire app on one network call, so it must never be able
 * to hang: a rejected promise used to leave `ready` false forever and the user
 * staring at "Loading…" with no way out. The currency is only a display
 * preference — if it can't be read, fall through on the default rather than
 * hold the whole app hostage, and say so quietly.
 */
function CurrencyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  const [degraded, setDegraded] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    // async/await, not .then().catch(): the Supabase builder's .then() returns a
    // bare PromiseLike with no .catch, and a transport failure rejects rather
    // than resolving with an `error` — so without catching it the gate never
    // lifts and the app sits on "Loading…" forever.
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles').select('currency').eq('id', user.id).single()
        if (cancelled) return
        if (data?.currency) setCurrency(data.currency as CurrencyCode)
        if (error) setDegraded(true)
      } catch {
        if (cancelled) return
        setDegraded(true)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    // And if the request neither resolves nor rejects, don't strand the user.
    const failsafe = setTimeout(() => {
      if (!cancelled) { setDegraded(true); setReady(true) }
    }, 8000)
    return () => { cancelled = true; clearTimeout(failsafe) }
  }, [user])

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-paper text-slate2">Loading…</div>
  return (
    <>
      {degraded && (
        <p role="status" className="bg-amber2/10 px-4 py-2 text-center text-xs text-amber2">
          Couldn't load your settings, so amounts are shown in the default currency. Reload to try again.
        </p>
      )}
      {children}
    </>
  )
}

export default function App() {
  const { session, loading, recovering } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-paper text-slate2">Loading…</div>
  }
  if (!session) return <AuthPage />
  // Checked before the app renders: a reset link creates a real session, so
  // without this gate it would just log the user in and never reset anything.
  if (recovering) return <UpdatePassword />
  return (
    <CurrencyGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
          <Route path="advisor" element={<Suspense fallback={<PageFallback />}><Advisor /></Suspense>} />
          <Route path="accounts" element={<Suspense fallback={<PageFallback />}><Accounts /></Suspense>} />
          <Route path="income" element={<Suspense fallback={<PageFallback />}><IncomePage /></Suspense>} />
          <Route path="bills" element={<Suspense fallback={<PageFallback />}><Bills /></Suspense>} />
          <Route path="savings" element={<Suspense fallback={<PageFallback />}><Savings /></Suspense>} />
          <Route path="planned" element={<Suspense fallback={<PageFallback />}><Planned /></Suspense>} />
          <Route path="spending" element={<Suspense fallback={<PageFallback />}><Spending /></Suspense>} />
          <Route path="loans" element={<Suspense fallback={<PageFallback />}><Loans /></Suspense>} />
          <Route path="history" element={<Suspense fallback={<PageFallback />}><History /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CurrencyGate>
  )
}
