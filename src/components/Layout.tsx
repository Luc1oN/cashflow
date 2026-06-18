import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const primary = [
  { to: '/', label: 'Dashboard', icon: '◈', exact: true },
  { to: '/spending', label: 'Spending', icon: '✦' },
  { to: '/bills', label: 'Bills', icon: '▤' },
  { to: '/planned', label: 'Planned', icon: '◷' },
]
const secondary = [
  { to: '/accounts', label: 'Accounts' },
  { to: '/income', label: 'Income' },
  { to: '/savings', label: 'Savings' },
  { to: '/loans', label: 'Loans' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 font-medium transition-colors ${isActive ? 'bg-moss/10 text-mossdeep' : 'text-slate2 hover:bg-mist hover:text-ink'}`

  return (
    <div className="min-h-screen bg-paper pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <NavLink to="/" className="font-display text-xl font-semibold text-ink">
            Cash<span className="text-moss">Flow</span>
          </NavLink>
          <nav className="hidden flex-1 flex-wrap gap-1 text-sm sm:flex" aria-label="Main">
            {[...primary, ...secondary].map((item) => (
              <NavLink key={item.to} to={item.to} end={(item as { exact?: boolean }).exact} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-lg border border-line px-2.5 py-1.5 text-slate2 hover:bg-mist hover:text-ink"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <span className="hidden text-slate2 lg:inline">{user?.email}</span>
            <button onClick={signOut} className="hidden rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:bg-mist sm:block">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur sm:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-mossdeep' : 'text-slate2'}`
              }
            >
              <span aria-hidden className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <MoreMenu />
        </div>
      </nav>
    </div>
  )
}

function MoreMenu() {
  return (
    <div className="group relative flex flex-col items-center">
      <button className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate2" aria-haspopup="true">
        <span aria-hidden className="text-base leading-none">⋯</span>
        More
      </button>
      <div className="invisible absolute bottom-full right-2 mb-2 w-40 rounded-xl border border-line bg-surface p-1 shadow-card opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100">
        {secondary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-moss/10 text-mossdeep' : 'text-ink hover:bg-mist'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
