import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'cosmic' | 'midnight'
const THEMES: Theme[] = ['cosmic', 'midnight']
const STORAGE_KEY = 'cashflow-theme'

interface ThemeState { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }
const ThemeContext = createContext<ThemeState>({ theme: 'cosmic', setTheme: () => {}, toggle: () => {} })

function readStored(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'midnight' || saved === 'dark') return 'midnight' // migrate old 'dark'
  // anything else (incl. old 'light') falls back to the default Cosmic theme
  return 'cosmic'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStored)

  useEffect(() => {
    // Cosmic lives on :root; Midnight is applied via the .midnight class.
    document.documentElement.classList.toggle('midnight', theme === 'midnight')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'cosmic' ? 'midnight' : 'cosmic'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
export const THEME_OPTIONS = THEMES

/** Resolved chart colors that follow the active theme (Recharts needs concrete values). */
export function useChartColors() {
  const { theme } = useTheme()
  const get = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(' ').join(',')})`
  // theme in deps so charts re-read on switch
  void theme
  return {
    moss: get('--moss'),
    mossdeep: get('--mossdeep'),
    accent: get('--accent'),
    amber: get('--amber2'),
    claret: get('--claret'),
    violet: get('--violet'),
    line: get('--line'),
    slate: get('--slate2'),
  }
}
