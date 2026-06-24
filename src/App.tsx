import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import { setCurrency, type CurrencyCode } from './lib/format'
import AuthPage from './pages/AuthPage'

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

/** Loads the profile currency before rendering money anywhere. */
function CurrencyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('currency').eq('id', user.id).single().then(({ data }) => {
      if (data?.currency) setCurrency(data.currency as CurrencyCode)
      setReady(true)
    })
  }, [user])
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-paper text-slate2">Loading…</div>
  return <>{children}</>
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-paper text-slate2">Loading…</div>
  }
  if (!session) return <AuthPage />
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
