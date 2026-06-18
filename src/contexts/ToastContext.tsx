import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Toast { id: number; message: string; tone: 'good' | 'bad' | 'neutral' }
const ToastContext = createContext<{ toast: (message: string, tone?: Toast['tone']) => void }>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const toast = useCallback((message: string, tone: Toast['tone'] = 'good') => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 sm:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toastIn rounded-lg border px-4 py-2 text-sm font-medium shadow-card ${
              t.tone === 'bad' ? 'border-claret/30 bg-surface text-claret' : t.tone === 'neutral' ? 'border-line bg-surface text-ink' : 'border-moss/30 bg-surface text-mossdeep'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
