import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Receipt, FileText, CalendarClock, Wallet, Banknote,
  PiggyBank, Landmark, History, Settings, Menu, X, Sun, Moon, LogOut,
  PanelLeftClose, PanelLeftOpen, Sparkles, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

type NavItem = { to: string; label: string; Icon: LucideIcon; exact?: boolean }

// Single source of truth for navigation. Order here is the order shown in the
// desktop sidebar and the mobile slide-out menu.
const nav: NavItem[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid, exact: true },
  { to: '/advisor', label: 'Advisor', Icon: Sparkles },
  { to: '/spending', label: 'Spending', Icon: Receipt },
  { to: '/bills', label: 'Bills', Icon: FileText },
  { to: '/planned', label: 'Planned', Icon: CalendarClock },
  { to: '/accounts', label: 'Accounts', Icon: Wallet },
  { to: '/income', label: 'Income', Icon: Banknote },
  { to: '/savings', label: 'Savings', Icon: PiggyBank },
  { to: '/loans', label: 'Loans', Icon: Landmark },
  { to: '/history', label: 'History', Icon: History },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

// The four items pinned to the mobile bottom tab bar (in this order).
const bottomBarPaths = ['/', '/planned', '/accounts', '/savings']
const bottomBar = bottomBarPaths
  .map((p) => nav.find((n) => n.to === p))
  .filter((n): n is NavItem => Boolean(n))

const COLLAPSE_KEY = 'cf_sidebar_collapsed'

export default function Layout() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const location = useLocation()

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Persist the desktop collapsed/expanded preference.
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Lock background scroll while the mobile drawer is open, and allow Escape to close.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  const sideLink = (collapsedRail: boolean) => ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-accent-soft text-accent' : 'text-slate2 hover:bg-mist hover:text-ink'
    } ${collapsedRail ? 'justify-center' : ''}`

  const Logo = (
    <NavLink to="/" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
      <img src={`${import.meta.env.BASE_URL}cashflow-icon.svg`} alt="CashFlow" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
      <span>Cash<span className="text-accent">Flow</span></span>
    </NavLink>
  )

  return (
    <div className="min-h-screen bg-paper">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur sm:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="rounded-lg border border-line p-2 text-ink hover:bg-mist"
        >
          <Menu size={20} aria-hidden />
        </button>
        {Logo}
        <button
          onClick={toggle}
          aria-label={theme === 'midnight' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ml-auto rounded-lg border border-line p-2 text-slate2 hover:bg-mist hover:text-ink"
        >
          {theme === 'midnight' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </button>
      </header>

      <div className="sm:flex">
        {/* Desktop collapsible sidebar */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 sm:flex ${
            collapsed ? 'sm:w-16' : 'sm:w-56'
          }`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-3.5">
            {!collapsed && Logo}
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand' : 'Collapse'}
              className={`rounded-lg border border-line p-1.5 text-slate2 hover:bg-mist hover:text-ink ${
                collapsed ? 'mx-auto' : 'ml-auto'
              }`}
            >
              {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Main">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                title={collapsed ? item.label : undefined}
                className={sideLink(collapsed)}
              >
                <item.Icon size={18} strokeWidth={2} aria-hidden className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-1 border-t border-line p-2">
            <button
              onClick={toggle}
              aria-label={theme === 'midnight' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={collapsed ? (theme === 'midnight' ? 'Light mode' : 'Dark mode') : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate2 hover:bg-mist hover:text-ink ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              {theme === 'midnight' ? <Sun size={18} aria-hidden className="shrink-0" /> : <Moon size={18} aria-hidden className="shrink-0" />}
              {!collapsed && <span>{theme === 'midnight' ? 'Light mode' : 'Dark mode'}</span>}
            </button>
            {!collapsed && user?.email && (
              <div className="truncate px-3 text-xs text-slate2" title={user.email}>
                {user.email}
              </div>
            )}
            <button
              onClick={signOut}
              title={collapsed ? 'Sign out' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-mist ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <LogOut size={18} aria-hidden className="shrink-0" />
              {!collapsed && <span>Sign out</span>}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pb-10 sm:pt-8">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile slide-out menu (full navigation) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              {Logo}
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-lg border border-line p-2 text-ink hover:bg-mist"
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="All pages">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-mist'
                    }`
                  }
                >
                  <item.Icon size={18} strokeWidth={2} aria-hidden className="shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-line p-2">
              {user?.email && (
                <div className="truncate px-3 py-1 text-xs text-slate2" title={user.email}>
                  {user.email}
                </div>
              )}
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-mist"
              >
                <LogOut size={18} aria-hidden className="shrink-0" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur sm:hidden"
        aria-label="Quick navigation"
      >
        <div className="grid grid-cols-4">
          {bottomBar.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  isActive ? 'text-accent' : 'text-slate2'
                }`
              }
            >
              <item.Icon size={20} strokeWidth={2} aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
