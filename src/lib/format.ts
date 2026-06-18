export type CurrencyCode = 'GBP' | 'EUR' | 'USD'

const LOCALES: Record<CurrencyCode, string> = { GBP: 'en-GB', EUR: 'en-IE', USD: 'en-US' }

// Set from the signed-in profile at startup (see CurrencyGate in App.tsx).
let currency: CurrencyCode = 'GBP'
export function setCurrency(code: CurrencyCode) { currency = code }
export function getCurrency(): CurrencyCode { return currency }

export function money(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts,
  }).format(n)
}

export function moneyShort(n: number): string {
  return money(n, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
