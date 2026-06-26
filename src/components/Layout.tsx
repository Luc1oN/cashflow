import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Sparkles, Receipt, Wallet, FileText, CalendarClock, Banknote,
  PiggyBank, Landmark, History, Settings, Sun, Moon, LogOut, TrendingUp, Menu, X, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

type NavItem = { to: string; label: string; Icon: LucideIcon; exact?: boolean }

// Spec destinations (+ our Advisor). Order mirrors the README sidebar.
const nav: NavItem[] = [
  { to: '/', label: 'Home', Icon: LayoutGrid, exact: true },
  { to: '/advisor', label: 'Advisor', Icon: Sparkles },
  { to: '/spending', label: 'Spending', Icon: Receipt },
  { to: '/accounts', label: 'Cards', Icon: Wallet },
  { to: '/bills', label: 'Bills', Icon: FileText },
  { to: '/planned', label: 'Planned', Icon: CalendarClock },
  { to: '/income', label: 'Income', Icon: Banknote },
  { to: '/savings', label: 'Goals', Icon: PiggyBank },
  { to: '/loans', label: 'Loans', Icon: Landmark },
  { to: '/history', label: 'Activity', Icon: History },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

// The four pinned to the mobile bottom tab bar (the rest live in the menu).
const primaryPaths = ['/', '/planned', '/accounts', '/savings']
const primary = primaryPaths
  .map((p) => nav.find((n) => n.to === p))
  .filter((n): n is NavItem => Boolean(n))

export default function Layout() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the drawer on navigation.
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  // Lock scroll + Escape-to-close while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [drawerOpen])

  const BrandMark = (
    <span className="grad-accent grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-white">
      <TrendingUp size={18} strokeWidth={2.6} aria-hidden />
    </span>
  )
  const Wordmark = <span className="font-display text-lg font-bold text-ink">Cash<span className="grad-accent-text">Flow</span></span>

  const railLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors rail:justify-center full:justify-start ${
      isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface2 hover:text-ink'
    }`

  return (
    <div className="min-h-screen bg-paper">
      {/* Mobile top bar with the menu (drawer) button */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-bg2/80 px-4 py-3 backdrop-blur-[18px] rail:hidden">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="rounded-[12px] border border-line p-2 text-ink hover:bg-surface2">
          <Menu size={20} aria-hidden />
        </button>
        <NavLink to="/" className="flex items-center gap-2">{BrandMark}{Wordmark}</NavLink>
        <button onClick={toggle} aria-label={theme === 'midnight' ? 'Switch to Daylight' : 'Switch to Midnight'} className="ml-auto rounded-[12px] border border-line p-2 text-muted hover:bg-surface2 hover:text-ink">
          {theme === 'midnight' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </button>
      </header>

      <div className="rail:flex">
        {/* Desktop sidebar: 248px (≥1140) → 84px icon rail (860–1140) → hidden (<860) */}
        <aside className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col gap-1 border-r border-line bg-bg2 px-3 py-5 rail:flex full:w-[248px]">
          <div className="mb-3 flex items-center justify-center gap-2.5 px-1 full:justify-start">
            <NavLink to="/" className="flex items-center gap-2.5">{BrandMark}<span className="hidden full:inline">{Wordmark}</span></NavLink>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.exact} title={item.label} className={railLink}>
                <item.Icon size={20} strokeWidth={2} aria-hidden className="shrink-0" />
                <span className="hidden full:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="space-y-1 border-t border-line pt-3">
            <button onClick={toggle} aria-label={theme === 'midnight' ? 'Switch to Daylight' : 'Switch to Midnight'} title={theme === 'midnight' ? 'Daylight' : 'Midnight'}
              className="flex w-full items-center justify-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface2 hover:text-ink full:justify-start">
              {theme === 'midnight' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
              <span className="hidden full:inline">{theme === 'midnight' ? 'Daylight' : 'Midnight'}</span>
            </button>
            {user?.email && <div className="hidden truncate px-3 pt-1 text-xs text-muted full:block" title={user.email}>{user.email}</div>}
            <button onClick={signOut} aria-label="Sign out" title="Sign out"
              className="flex w-full items-center justify-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface2 full:justify-start">
              <LogOut size={20} aria-hidden />
              <span className="hidden full:inline">Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[1160px] px-4 pb-[92px] pt-6 rail:px-[42px] rail:pb-10 rail:pt-[34px]">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile slide-out menu (full navigation) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 rail:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-bg2 shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <NavLink to="/" className="flex items-center gap-2">{BrandMark}{Wordmark}</NavLink>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="rounded-[12px] border border-line p-2 text-ink hover:bg-surface2">
                <X size={20} aria-hidden />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="All pages">
              {nav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.exact}
                  className={({ isActive }) => `flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink hover:bg-surface2'}`}>
                  <item.Icon size={20} strokeWidth={2} aria-hidden className="shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-line p-2">
              {user?.email && <div className="truncate px-3 py-1 text-xs text-muted" title={user.email}>{user.email}</div>}
              <button onClick={signOut} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium text-neg hover:bg-surface2">
                <LogOut size={20} aria-hidden className="shrink-0" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar — 4 primary destinations */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg2/80 backdrop-blur-[18px] rail:hidden" aria-label="Quick navigation">
        <div className="grid grid-cols-4">
          {primary.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.exact}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-accent-strong' : 'text-muted'}`}>
              <item.Icon size={20} strokeWidth={2} aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
