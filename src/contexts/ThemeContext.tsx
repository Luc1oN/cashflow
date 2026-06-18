import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('cashflow-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('cashflow-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

/** Resolved chart colors that follow the active theme (Recharts needs concrete values). */
export function useChartColors() {
  const { theme } = useTheme()
  const get = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(' ').join(',')})`
  // theme in deps so charts re-read on toggle
  void theme
  return {
    moss: get('--moss'),
    amber: get('--amber2'),
    claret: get('--claret'),
    line: get('--line'),
    slate: get('--slate2'),
  }
}
