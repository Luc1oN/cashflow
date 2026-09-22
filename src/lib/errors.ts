/**
 * Turns a Postgres / PostgREST error into something a person can act on.
 *
 * Every mutation in the app surfaced `error.message` straight from the
 * database, so mistyping an amount produced "invalid input syntax for type
 * numeric" in a toast. These are the failures this app can actually produce;
 * anything unrecognised falls through unchanged rather than being swallowed
 * behind a vague catch-all, so genuine bugs stay diagnosable.
 */

const RULES: { match: RegExp; message: string }[] = [
  // Most specific first.
  {
    match: /accounts_one_primary_per_user/i,
    message: 'You already have a primary account. Clear that one first, or edit it instead.',
  },
  {
    match: /row-level security/i,
    message: "You don't have permission to change that.",
  },
  {
    match: /invalid input syntax for type numeric/i,
    message: "That amount isn't a valid number — use digits only, like 12.50.",
  },
  {
    match: /invalid input syntax for type date/i,
    message: "That date isn't valid.",
  },
  {
    match: /violates check constraint/i,
    message: "One of those values isn't allowed. Check the amounts and dates.",
  },
  {
    match: /violates foreign key constraint/i,
    message: "That's linked to something that no longer exists. Refresh and try again.",
  },
  {
    match: /violates not-null constraint/i,
    message: 'Something required was left blank.',
  },
  {
    match: /duplicate key value/i,
    message: 'That already exists.',
  },
  {
    match: /JWT expired|jwt expired|invalid claim/i,
    message: 'Your session expired. Sign in again.',
  },
  {
    match: /failed to fetch|network ?error|load failed/i,
    message: "Couldn't reach the server. Check your connection and try again.",
  },
]

export function friendlyError(err: unknown, fallback = 'Something went wrong'): string {
  const raw =
    err instanceof Error ? err.message
      : typeof err === 'string' ? err
        : ''
  if (!raw) return fallback

  // Messages the server already wrote for a human (the settlement guard, the
  // advisor's daily cap) start with a capital and read as a sentence — pass
  // those through rather than flattening them into a generic string.
  if (/^Settlement rejected:/.test(raw) || /^Daily limit reached/.test(raw)) return raw

  for (const rule of RULES) if (rule.match.test(raw)) return rule.message
  return raw
}
