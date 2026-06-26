import { titleCase } from './format'

// Shared category color palette (README) — kept consistent across Spending,
// Bills and Planned. Explicit hexes for the named categories; anything else
// falls back deterministically to the base palette.
const BASE = ['#5b8cff', '#9d6bff', '#3ddc97', '#ffb454', '#ff6b81', '#7c8aa8']

const EXPLICIT: Record<string, string> = {
  subscriptions: '#5b8cff',
  utilities: '#9d6bff',
  transport: '#3ddc97',
  health: '#ffb454',
  insurance: '#ff6b81',
  other: '#7c8aa8',
  holiday: '#9d6bff',
  gift: '#3ddc97',
  car: '#ffb454',
  housing: '#5b8cff',
  food: '#3ddc97',
  food_drink: '#3ddc97',
  education: '#9d6bff',
  shopping: '#5b8cff',
  entertainment: '#9d6bff',
  travel: '#5b8cff',
  bills: '#5b8cff',
  home: '#ffb454',
  event: '#ff6b81',
}

export function categoryColor(category: string): string {
  const key = category.toLowerCase()
  if (EXPLICIT[key]) return EXPLICIT[key]
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return BASE[h % BASE.length]
}

export interface CategorySlice {
  key: string
  label: string
  amount: number
  count: number
  pct: number
  color: string
}

/** Aggregate a list into category slices, sorted by amount descending. */
export function aggregateByCategory<T>(
  items: T[],
  getCategory: (item: T) => string,
  getAmount: (item: T) => number,
): CategorySlice[] {
  const map = new Map<string, { amount: number; count: number }>()
  for (const it of items) {
    const key = getCategory(it)
    const cur = map.get(key) ?? { amount: 0, count: 0 }
    cur.amount += getAmount(it)
    cur.count += 1
    map.set(key, cur)
  }
  const total = [...map.values()].reduce((s, v) => s + v.amount, 0) || 1
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: titleCase(key),
      amount: v.amount,
      count: v.count,
      pct: (v.amount / total) * 100,
      color: categoryColor(key),
    }))
    .sort((a, b) => b.amount - a.amount)
}
