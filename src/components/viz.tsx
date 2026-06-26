import { type ReactNode } from 'react'
import { money } from '../lib/format'
import type { CategorySlice } from '../lib/categories'

/** Stacked proportion bar + legend (counts / % / amount) for Bills & Planned. */
export function CategorySummary({ slices }: { slices: CategorySlice[] }) {
  if (slices.length === 0) return null
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
        {slices.map((s) => (
          <div key={s.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${Math.max(s.pct, 1)}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="font-medium text-ink">{s.label}</span>
            <span className="text-slate2">{s.count} · {Math.round(s.pct)}%</span>
            <span className="font-num text-ink">{money(s.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** SVG donut. Center content passed as children. */
export function Donut({ slices, size = 220, thickness = 26, children }: {
  slices: { key: string; color: string; amount: number }[]
  size?: number
  thickness?: number
  children?: ReactNode
}) {
  const total = slices.reduce((s, x) => s + x.amount, 0) || 1
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface2))" strokeWidth={thickness} />
          {slices.map((s) => {
            const len = (s.amount / total) * C
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += len
            return el
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/** Lightweight area+line sparkline with an optional dashed target line. */
export function Sparkline({ values, target, color = 'rgb(var(--accent))', height = 56 }: {
  values: number[]
  target?: number | null
  color?: string
  height?: number
}) {
  if (values.length < 2) return <div style={{ height }} />
  const max = Math.max(...values, target ?? -Infinity)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const W = 100, H = 100
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - ((v - min) / range) * H] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  const area = `${line} L${W} ${H} L0 ${H} Z`
  const ty = target != null ? H - ((target - min) / range) * H : null
  const id = 'sp' + Math.round((values[0] + values.length) * 97).toString(36)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {ty != null && <line x1="0" y1={ty} x2={W} y2={ty} stroke="rgb(var(--muted))" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/** A realistic Visa credit-card visual (CSS/SVG mock). */
export function CreditCardVisual({ name, holder, last4 }: { name: string; holder: string; last4: string }) {
  return (
    <div
      className="relative aspect-[1.586] w-full overflow-hidden rounded-[18px] p-5 text-white shadow-card"
      style={{ background: 'linear-gradient(125deg, #1b2440, #3a2a6b 60%, rgb(var(--accent2)))' }}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold tracking-wide">{name}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M8.5 8.5a5 5 0 0 1 0 7" /><path d="M11.5 6a8 8 0 0 1 0 12" /><path d="M14.5 3.5a11 11 0 0 1 0 17" />
        </svg>
      </div>
      <div className="mt-3 h-7 w-10 rounded-md" style={{ background: 'linear-gradient(135deg, #f6dd86, #c6a23a)' }} />
      <p className="mt-4 font-num text-lg tracking-[0.22em]">•••• •••• •••• {last4}</p>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-xs uppercase tracking-wide text-white/85">{holder}</span>
        <span className="font-display text-xl font-bold italic">VISA</span>
      </div>
    </div>
  )
}
