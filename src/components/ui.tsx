import { type ReactNode, type FormEvent, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { money } from '../lib/format'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] border border-line bg-surface shadow-card ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate2">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Button({ children, onClick, type = 'button', variant = 'primary', disabled = false, className = '' }: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary: 'grad-accent text-white shadow-[0_6px_18px_-6px_rgb(var(--accent)/0.55)] hover:brightness-110 active:translate-y-px',
    ghost: 'border border-line bg-surface text-ink hover:bg-surface2',
    danger: 'bg-surface border border-line text-neg hover:border-neg/40',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[12px] px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-claret" role="alert">{error}</span>}
    </label>
  )
}

// min-h-[44px]: a comfortable touch target on phone/tablet. The 16px font size
// that stops iOS zooming on focus is applied globally in index.css, so it also
// covers inputs that don't come through this kit.
const inputClass = 'block w-full min-h-[44px] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate2/70 focus:outline-none focus:ring-2 focus:ring-accent/40'

export function TextInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  // A decimal keypad for money fields on iOS/Android, unless the caller says
  // otherwise. type="number" alone gives a keypad with no decimal point on some
  // Android keyboards, which makes entering "12.50" impossible.
  const inputMode = props.inputMode ?? (props.type === 'number' ? 'decimal' : undefined)
  return <input {...props} inputMode={inputMode} className={`${inputClass} ${className}`} />
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${className}`} />
}

export function TextArea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={`${inputClass} ${className}`} />
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {label}
    </label>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const styles = {
    neutral: 'bg-mist text-slate2',
    good: 'bg-moss/10 text-mossdeep',
    warn: 'bg-amber2/10 text-amber2',
    bad: 'bg-claret/10 text-claret',
  }[tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Accessible modal: focus trap, Escape to close, focus restored to the trigger. Full-screen sheet on mobile. */
export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  // Keep the latest onClose without making it an effect dependency — otherwise
  // the focus-trap effect re-runs on every render (each render passes a new
  // onClose), stealing focus back to the first element after each keystroke.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current() }
      if (e.key === 'Tab' && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previousFocus.current?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-[2px]"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
      // Only dismiss when the press *starts* on the backdrop: otherwise selecting
      // text inside the form and releasing outside it throws the form away.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // dvh (not vh) so mobile browser chrome / the on-screen keyboard can't
        // push the actions off-screen; my-auto keeps it centred but lets a tall
        // form scroll inside the overlay.
        className="my-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-card animate-rise"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate2 hover:bg-mist hover:text-ink">
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Modal form wrapper: submit state, error display, two-step delete confirmation. */
export function EntityForm({ onSubmit, onDelete, children, submitLabel = 'Save' }: {
  onSubmit: () => Promise<void>
  onDelete?: () => Promise<void>
  children: ReactNode
  submitLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Disarm the delete confirmation by itself. Without this the button stays in
  // "Really delete?" state indefinitely, so a stray tap now and an absent-minded
  // tap later combine into a deletion the user never consciously confirmed.
  useEffect(() => {
    if (!confirmingDelete) return
    const id = setTimeout(() => setConfirmingDelete(false), 5000)
    return () => clearTimeout(id)
  }, [confirmingDelete])

  const handle = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try { await onSubmit() } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    setBusy(false)
  }

  const handleDelete = async () => {
    if (!confirmingDelete) { setConfirmingDelete(true); return }
    setBusy(true)
    try { await onDelete?.() } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed') }
    setBusy(false)
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      {children}
      {error && <p className="text-sm text-claret" role="alert">{error}</p>}
      <div className="flex items-center justify-between pt-2">
        {onDelete ? (
          <div className="flex items-center gap-2">
            <Button variant="danger" onClick={handleDelete} disabled={busy}>
              {confirmingDelete ? 'Really delete?' : 'Delete'}
            </Button>
            {confirmingDelete && (
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</Button>
            )}
          </div>
        ) : <span />}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  )
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-10 text-center">
      <p className="mx-auto max-w-sm text-sm text-slate2">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Money({ value, signed = false }: { value: number; signed?: boolean }) {
  const cls = value < 0 ? 'text-claret' : signed && value > 0 ? 'text-mossdeep' : 'text-ink'
  return <span className={`font-num ${cls}`}>{signed && value > 0 ? '+' : ''}{money(value)}</span>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-mist ${className}`} />
}
