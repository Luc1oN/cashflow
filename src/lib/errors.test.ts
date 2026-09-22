import { describe, expect, it } from 'vitest'
import { friendlyError } from './errors'

describe('friendlyError', () => {
  it('translates the database errors this app actually produces', () => {
    expect(friendlyError(new Error('invalid input syntax for type numeric: "abc"')))
      .toMatch(/valid number/)
    expect(friendlyError(new Error('new row violates row-level security policy for table "bills"')))
      .toMatch(/permission/)
    expect(friendlyError(new Error('duplicate key value violates unique constraint "accounts_one_primary_per_user"')))
      .toMatch(/already have a primary account/)
    expect(friendlyError(new Error('Failed to fetch')))
      .toMatch(/Couldn't reach the server/)
  })

  it('prefers the most specific rule', () => {
    // Also matches /duplicate key value/, but the primary-account rule is the
    // one that tells the user what to do.
    expect(friendlyError(new Error('duplicate key value violates unique constraint "accounts_one_primary_per_user"')))
      .not.toMatch(/already exists/)
  })

  it('passes through messages the server wrote for a human', () => {
    const msg = 'Settlement rejected: net -5000 does not match the sum of its 1 items (-3)'
    expect(friendlyError(new Error(msg))).toBe(msg)
    expect(friendlyError(new Error('Daily limit reached (50 messages). Try again tomorrow.')))
      .toMatch(/^Daily limit reached/)
  })

  it('leaves anything unrecognised intact so real bugs stay diagnosable', () => {
    expect(friendlyError(new Error('some unmapped postgres failure'))).toBe('some unmapped postgres failure')
  })

  it('falls back when there is no message at all', () => {
    expect(friendlyError(null)).toBe('Something went wrong')
    expect(friendlyError(undefined, 'Delete failed')).toBe('Delete failed')
  })
})
