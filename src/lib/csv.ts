import Papa from 'papaparse'
import { supabase } from './supabase'

/** Download any of the user's tables as CSV (RLS limits rows to their own). */
export async function exportTableCsv(table: string): Promise<void> {
  const { data, error } = await supabase.from(table).select('*').order('created_at')
  if (error) throw new Error(error.message)
  const rows = (data ?? []).map((row) => {
    const { user_id, ...rest } = row as Record<string, unknown>
    void user_id
    return rest
  })
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cashflow-${table}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ParsedExpenseRow {
  name: string
  amount: number
  date: string
  category: string
  merchant: string | null
}

export interface ParsedIncomeRow {
  name: string
  amount: number
  date: string
}

const VALID_CATEGORIES = ['food_drink', 'transport', 'shopping', 'entertainment', 'health', 'travel', 'bills', 'subscriptions', 'home', 'other']

// ---------------------------------------------------------------------------
// Revolut statement import
//
// Personal-account CSV exports carry these columns:
//   Type, Product, Started Date, Completed Date, Description, Amount, Fee,
//   Currency, State, Balance
// Amount is signed (negative = money out). Fees sit in their own column.
// We import only COMPLETED rows, fold the fee into the spend, split income
// from expenses on the sign, and guess a category from the transaction Type.
// ---------------------------------------------------------------------------

const REVOLUT_HEADERS = ['type', 'product', 'started date', 'completed date', 'description', 'amount', 'fee', 'currency', 'state', 'balance']

/** Detect a Revolut statement by its header signature. */
export function isRevolutCsv(text: string): boolean {
  const firstLine = text.slice(0, text.indexOf('\n')).toLowerCase()
  return REVOLUT_HEADERS.filter((h) => firstLine.includes(h)).length >= 6
}

/** Map a Revolut transaction Type to one of our expense categories. */
function categoryFromType(type: string, description: string): string {
  const t = type.toUpperCase()
  const d = description.toLowerCase()
  if (t === 'ATM') return 'other'
  if (t === 'TRANSFER' || t === 'EXCHANGE' || t === 'TOPUP') return 'other'
  if (t === 'FEE') return 'bills'
  if (t === 'CARD_REFUND') return 'shopping'
  // CARD_PAYMENT and the rest: sniff the description for common merchants
  if (/uber|bolt|free ?now|taxi|train|irish rail|luas|dublin bus|aircoach|petrol|circle k|applegreen/.test(d)) return 'transport'
  if (/tesco|lidl|aldi|dunnes|spar|centra|supervalu|restaurant|cafe|coffee|deliveroo|just ?eat|mcdonald|burger|pizza/.test(d)) return 'food_drink'
  if (/netflix|spotify|disney|youtube|prime|apple\.com|google|icloud|subscription/.test(d)) return 'subscriptions'
  if (/pharmacy|chemist|doctor|hospital|boots|dental/.test(d)) return 'health'
  if (/electric|gas|water|broadband|eir|vodafone|three|virgin|sky|bin charge|insurance/.test(d)) return 'bills'
  if (/cinema|theatre|ticket|bar|pub|guinness/.test(d)) return 'entertainment'
  if (/ryanair|aer lingus|hotel|airbnb|booking\.com|flight/.test(d)) return 'travel'
  if (/ikea|woodie|home|furniture|hardware/.test(d)) return 'home'
  return 'other'
}

function normaliseDate(raw: string): string | null {
  const date = raw.trim().split(' ')[0] // drop the time portion
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const dmy = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

/**
 * Parse a Revolut statement CSV. Splits into expenses (money out) and income
 * (money in), folds fees into the spend amount, skips non-completed rows, and
 * reports anything it skipped and why.
 */
export function parseRevolutCsv(text: string): { expenses: ParsedExpenseRow[]; income: ParsedIncomeRow[]; skipped: string[] } {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() })
  const expenses: ParsedExpenseRow[] = []
  const income: ParsedIncomeRow[] = []
  const skipped: string[] = []

  result.data.forEach((raw, i) => {
    const line = i + 2
    const state = (raw.state || '').trim().toUpperCase()
    if (state && state !== 'COMPLETED') { skipped.push(`Line ${line}: ${state.toLowerCase()} (not completed)`); return }

    const description = (raw.description || '').trim()
    const type = (raw.type || '').trim()
    const date = normaliseDate(raw['completed date'] || raw['started date'] || '')
    if (!date) { skipped.push(`Line ${line}: unrecognised date "${raw['completed date'] || raw['started date'] || ''}"`); return }

    const amount = Number((raw.amount || '').replace(/[£€$,]/g, '').trim())
    const fee = Number((raw.fee || '0').replace(/[£€$,]/g, '').trim()) || 0
    if (Number.isNaN(amount)) { skipped.push(`Line ${line}: invalid amount "${raw.amount ?? ''}"`); return }
    if (amount === 0 && fee === 0) { skipped.push(`Line ${line}: zero amount`); return }

    const name = description || (type ? titleFromType(type) : 'Revolut transaction')

    if (amount < 0) {
      // Money out: spend plus any fee.
      expenses.push({
        name,
        amount: Math.abs(amount) + fee,
        date,
        category: categoryFromType(type, description),
        merchant: description || null,
      })
    } else if (amount > 0) {
      // Money in. A standalone fee on a positive row still costs money.
      income.push({ name, amount, date })
      if (fee > 0) {
        expenses.push({ name: `${name} (fee)`, amount: fee, date, category: 'bills', merchant: 'Revolut' })
      }
    }
  })

  return { expenses, income, skipped }
}

function titleFromType(type: string): string {
  return type.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

/**
 * Parse an expenses CSV. Expects headers including name (or description),
 * amount, date (yyyy-mm-dd or dd/mm/yyyy); category and merchant optional.
 * Returns valid rows plus a list of skipped-line reasons.
 */
export function parseExpensesCsv(text: string): { rows: ParsedExpenseRow[]; skipped: string[] } {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() })
  const rows: ParsedExpenseRow[] = []
  const skipped: string[] = []

  result.data.forEach((raw, i) => {
    const line = i + 2 // 1-based + header
    const name = raw.name || raw.description || raw.label
    const amountStr = (raw.amount || raw.value || '').replace(/[£€$,]/g, '').trim()
    let date = (raw.date || '').trim()

    if (!name) { skipped.push(`Line ${line}: missing name/description`); return }
    const amount = Math.abs(Number(amountStr))
    if (!amountStr || Number.isNaN(amount)) { skipped.push(`Line ${line}: invalid amount "${raw.amount ?? ''}"`); return }

    // Accept dd/mm/yyyy and normalise to yyyy-mm-dd
    const dmy = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmy) date = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped.push(`Line ${line}: invalid date "${raw.date ?? ''}"`); return }

    const category = (raw.category || 'other').trim().toLowerCase().replace(/[ &]+/g, '_')
    rows.push({
      name: name.trim(),
      amount,
      date,
      category: VALID_CATEGORIES.includes(category) ? category : 'other',
      merchant: raw.merchant?.trim() || null,
    })
  })

  return { rows, skipped }
}
