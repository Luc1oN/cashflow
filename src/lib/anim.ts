import { useEffect, useRef, useState } from 'react'

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** True on touch devices — used to skip autoFocus so the on-screen keyboard
 *  doesn't cover a freshly-opened dialog. */
export const isCoarsePointer = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

/**
 * Count a figure up to `value`, writing straight to the element's textContent.
 *
 * Deliberately imperative: a state-driven count-up re-renders the whole page ~60
 * times a second (and with it every chart on screen), which is the main source
 * of jank on the dashboard. Attach the returned ref to the element and render
 * the *final* formatted value as its children — that stays the resting state, so
 * the figure is correct even if the animation never runs.
 */
export function useCountUp<T extends HTMLElement = HTMLElement>(
  value: number,
  format: (n: number) => string,
  duration = 950,
) {
  const ref = useRef<T>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    const el = ref.current
    const from = fromRef.current
    const to = value
    fromRef.current = to
    if (!el) return
    if (from === to || duration <= 0 || reducedMotion()) {
      el.textContent = format(to)
      return
    }
    let raf = 0
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      el.textContent = format(from + (to - from) * ease(t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, format])

  return ref
}

/** True after the first paint — drives grow-in transitions (width/scaleX 0→target). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}
