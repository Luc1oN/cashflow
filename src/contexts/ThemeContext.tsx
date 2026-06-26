import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'midnight' | 'daylight'
const THEMES: Theme[] = ['midnight', 'daylight']
const STORAGE_KEY = 'cashflow-theme'

interface ThemeState { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }
const ThemeContext = createContext<ThemeState>({ theme: 'midnight', setTheme: () => {}, toggle: () => {} })

function readStored(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  // Daylight only when explicitly chosen (incl. the old light-ish 'cosmic'/'light').
  if (saved === 'daylight' || saved === 'cosmic' || saved === 'light') return 'daylight'
  return 'midnight' // default
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStored)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'midnight' ? 'daylight' : 'midnight'))

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
    moss: get('--pos'),
    mossdeep: get('--pos'),
    pos: get('--pos'),
    accent: get('--accent'),
    accent2: get('--accent2'),
    amber: get('--warn'),
    claret: get('--neg'),
    violet: get('--accent2'),
    grid: get('--grid'),
    line: get('--border'),
    slate: get('--muted'),
  }
}
