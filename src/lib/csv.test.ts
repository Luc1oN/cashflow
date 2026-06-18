import { describe, expect, it } from 'vitest'
import { isRevolutCsv, parseRevolutCsv, parseExpensesCsv } from './csv'

const REVOLUT = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-05-01 08:14:22,2026-05-02 09:00:00,Tesco Dublin,-42.50,0.00,EUR,COMPLETED,1957.50
CARD_PAYMENT,Current,2026-05-03 19:00:00,2026-05-03 19:05:00,Netflix.com,-12.99,0.00,EUR,COMPLETED,1944.51
TOPUP,Current,2026-05-05 09:00:00,2026-05-05 09:00:00,Payment from Acme Payroll,2400.00,0.00,EUR,COMPLETED,4344.51
CARD_PAYMENT,Current,2026-05-06 12:00:00,2026-05-06 12:01:00,Uber trip,-15.20,0.30,EUR,COMPLETED,4329.01
ATM,Current,2026-05-07 17:00:00,2026-05-07 17:00:00,Cash withdrawal,-100.00,2.00,EUR,COMPLETED,4227.01
CARD_PAYMENT,Current,2026-05-08 10:00:00,,Pending coffee,-3.50,0.00,EUR,PENDING,
EXCHANGE,Current,2026-05-09 11:00:00,2026-05-09 11:00:00,Exchanged to USD,-50.00,0.00,EUR,COMPLETED,4177.01`

describe('isRevolutCsv', () => {
  it('detects a Revolut statement by its headers', () => {
    expect(isRevolutCsv(REVOLUT)).toBe(true)
  })
  it('rejects a generic expenses CSV', () => {
    expect(isRevolutCsv('name,amount,date\nCoffee,3.50,2026-05-01')).toBe(false)
  })
})

describe('parseRevolutCsv', () => {
  const { expenses, income, skipped } = parseRevolutCsv(REVOLUT)

  it('splits expenses from income on the sign', () => {
    expect(income).toHaveLength(1)
    expect(income[0].amount).toBe(2400)
    expect(income[0].date).toBe('2026-05-05')
    // 4 card/atm/exchange debits become expenses
    expect(expenses.map((e) => e.name)).toContain('Tesco Dublin')
  })

  it('folds fees into the spend amount', () => {
    const uber = expenses.find((e) => e.name === 'Uber trip')!
    expect(uber.amount).toBeCloseTo(15.5, 2) // 15.20 + 0.30 fee
    const atm = expenses.find((e) => e.name === 'Cash withdrawal')!
    expect(atm.amount).toBeCloseTo(102, 2) // 100 + 2 fee
  })

  it('categorises from description and type', () => {
    expect(expenses.find((e) => e.name === 'Tesco Dublin')!.category).toBe('food_drink')
    expect(expenses.find((e) => e.name === 'Netflix.com')!.category).toBe('subscriptions')
    expect(expenses.find((e) => e.name === 'Uber trip')!.category).toBe('transport')
  })

  it('strips the time portion from dates', () => {
    expect(expenses.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))).toBe(true)
  })

  it('skips non-completed rows', () => {
    expect(expenses.find((e) => e.name === 'Pending coffee')).toBeUndefined()
    expect(skipped.some((s) => s.includes('pending'))).toBe(true)
  })

  it('keeps the merchant description', () => {
    expect(expenses.find((e) => e.name === 'Tesco Dublin')!.merchant).toBe('Tesco Dublin')
  })
})

describe('parseExpensesCsv still works for generic files', () => {
  it('parses a plain CSV with £ symbols and dd/mm/yyyy dates', () => {
    const { rows, skipped } = parseExpensesCsv('description,amount,date\nLunch,£8.50,03/05/2026')
    expect(skipped).toHaveLength(0)
    expect(rows[0]).toMatchObject({ name: 'Lunch', amount: 8.5, date: '2026-05-03', category: 'other' })
  })
})
