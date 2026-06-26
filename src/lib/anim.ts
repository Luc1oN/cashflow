import { useEffect, useRef, useState } from 'react'

/**
 * Animate a number from 0 (on mount) or its previous value up to `value` with a
 * cubic ease-out. Render the result with a tabular/mono font so width is stable.
 * Resting state is always the real value — if the effect never runs the number
 * still shows correctly.
 */
export function useCountUp(value: number, duration = 950): number {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) {
      setDisplay(to)
      return
    }
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setDisplay(from + (to - from) * ease(t))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return display
}

/** True after the first paint — use to drive grow-in transitions (width/scaleX 0→target). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}
