import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutGrid, Sparkles, Receipt, Wallet, FileText, CalendarClock, Banknote,
  PiggyBank, Landmark, History, Settings, Sun, Moon, LogOut, TrendingUp, type LucideIcon,
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

export default function Layout() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  const Brand = (
    <NavLink to="/" className="flex items-center gap-2.5">
      <span className="grad-accent grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-white">
        <TrendingUp size={18} strokeWidth={2.6} aria-hidden />
      </span>
      <span className="hidden font-display text-lg font-bold text-ink full:inline">
        Cash<span className="grad-accent-text">Flow</span>
      </span>
    </NavLink>
  )

  const railLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors full:justify-start rail:justify-center full:rail:justify-start ${
      isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface2 hover:text-ink'
    }`

  return (
    <div className="min-h-screen bg-paper">
      <div className="rail:flex">
        {/* Desktop sidebar: 248px (≥1140) → 84px icon rail (860–1140) → hidden (<860) */}
        <aside className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col gap-1 border-r border-line bg-bg2 px-3 py-5 rail:flex full:w-[248px]">
          <div className="mb-3 flex justify-center px-1 full:justify-start">{Brand}</div>

          <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.exact} title={item.label} className={railLink}>
                <item.Icon size={20} strokeWidth={2} aria-hidden className="shrink-0" />
                <span className="hidden full:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="space-y-1 border-t border-line pt-3">
            <button
              onClick={toggle}
              aria-label={theme === 'midnight' ? 'Switch to Daylight' : 'Switch to Midnight'}
              title={theme === 'midnight' ? 'Daylight' : 'Midnight'}
              className="flex w-full items-center justify-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface2 hover:text-ink full:justify-start"
            >
              {theme === 'midnight' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
              <span className="hidden full:inline">{theme === 'midnight' ? 'Daylight' : 'Midnight'}</span>
            </button>
            {user?.email && (
              <div className="hidden truncate px-3 pt-1 text-xs text-muted full:block" title={user.email}>{user.email}</div>
            )}
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="flex w-full items-center justify-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface2 full:justify-start"
            >
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

      {/* Mobile glassy bottom tab bar (<860) — all destinations, horizontally scrollable */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg2/80 backdrop-blur-[18px] rail:hidden"
        aria-label="Main"
      >
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex min-w-[60px] shrink-0 flex-col items-center gap-1 rounded-[12px] px-2 py-1.5 text-[11px] font-medium ${
                  isActive ? 'text-accent-strong' : 'text-muted'
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
