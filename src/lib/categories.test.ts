import { describe, expect, it } from 'vitest'
import { aggregateByCategory, categoryColor } from './categories'

describe('categoryColor', () => {
  it('uses the explicit palette for known categories (case-insensitive)', () => {
    expect(categoryColor('subscriptions')).toBe('#5b8cff')
    expect(categoryColor('Transport')).toBe('#3ddc97')
    expect(categoryColor('insurance')).toBe('#ff6b81')
  })
  it('is deterministic for unknown categories', () => {
    expect(categoryColor('mystery')).toBe(categoryColor('mystery'))
  })
})

describe('aggregateByCategory', () => {
  it('sums and counts per category, sorts by amount desc, and computes pct', () => {
    const items = [
      { cat: 'a', amt: 40 },
      { cat: 'b', amt: 40 },
      { cat: 'a', amt: 20 },
    ]
    const slices = aggregateByCategory(items, (i) => i.cat, (i) => i.amt)
    expect(slices.map((s) => s.key)).toEqual(['a', 'b'])
    expect(slices[0].amount).toBe(60)
    expect(slices[0].count).toBe(2)
    expect(slices[0].pct).toBeCloseTo(60, 5)
    expect(slices[1].pct).toBeCloseTo(40, 5)
  })

  it('returns an empty array for no items', () => {
    expect(aggregateByCategory([], () => 'x', () => 1)).toEqual([])
  })
})
