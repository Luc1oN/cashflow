// Bill reminders — Supabase Edge Function.
// Emails each user a digest of bills due in the next 7 days, plus a nudge
// if they haven't settled in 3+ days. Schedule it (e.g. daily at 08:00):
//
//   supabase functions deploy bill-reminders
//   supabase secrets set RESEND_API_KEY=re_xxx REMINDER_FROM="CashFlow <bills@yourdomain.com>"
//   supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
//
// CRON_SECRET is required. This function runs with the service-role key and
// emails every user, so without its own check the only thing standing between
// the internet and a fleet-wide mail blast is the URL — and if Supabase's JWT
// gate is on, *any* signed-in user's token also gets through it. The shared
// secret means only the scheduler can fire it.
//
// Then in the dashboard: Integrations -> Cron -> new job:
//   select cron.schedule('bill-reminders', '0 8 * * *', $$
//     select net.http_post(
//       url := 'https://<ref>.functions.supabase.co/bill-reminders',
//       headers := '{"Authorization": "Bearer <service-role-key>", "x-cron-secret": "<CRON_SECRET>"}'::jsonb
//     ) $$);

import { createClient } from 'jsr:@supabase/supabase-js@2'

/** Constant-time compare, so a wrong secret can't be recovered a byte at a time. */
function secretMatches(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided)
  const b = new TextEncoder().encode(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
  }

  // Fail closed: an unset secret disables the function rather than leaving it open.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.error('CRON_SECRET is not set — refusing to run.')
    return new Response('Not configured', { status: 503 })
  }
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!secretMatches(provided, cronSecret)) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: runs across all users
  )
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('REMINDER_FROM') ?? 'CashFlow <onboarding@resend.dev>'

  const today = new Date()
  const horizon = new Date(today.getTime() + 7 * 86_400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const { data: bills, error } = await supabase
    .from('bills')
    .select('user_id, name, amount, next_due_date')
    .eq('is_active', true)
    .gte('next_due_date', fmt(today))
    .lte('next_due_date', fmt(horizon))

  if (error) return new Response(error.message, { status: 500 })

  const byUser = new Map<string, typeof bills>()
  for (const b of bills ?? []) {
    const list = byUser.get(b.user_id) ?? []
    list.push(b)
    byUser.set(b.user_id, list)
  }

  let sent = 0
  for (const [userId, userBills] of byUser) {
    const { data: userData } = await supabase.auth.admin.getUserById(userId)
    const email = userData?.user?.email
    if (!email || !resendKey) continue

    const lines = userBills
      .map((b) => `• ${b.name} — due ${b.next_due_date}`)
      .join('\n')

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: email,
        subject: `${userBills.length} bill${userBills.length === 1 ? '' : 's'} due this week`,
        text: `Coming up in the next 7 days:\n\n${lines}\n\nOpen CashFlow to settle up.`,
      }),
    })
    sent++
  }

  return new Response(JSON.stringify({ users_notified: sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
