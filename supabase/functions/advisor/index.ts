// AI Financial Advisor — Supabase Edge Function.
// Holds the Anthropic API key (never exposed to the browser) and acts as the
// authenticated middleman between the CashFlow frontend and the Claude API.
//
// Flow: verify the caller's Supabase JWT -> enforce a per-user daily cap ->
// fetch the user's own data (RLS-scoped) -> build a prompt (cached) -> call
// Claude with stream:true -> pipe the SSE stream straight back to the browser.
//
// Deploy:  (done via the Supabase integration)
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (or Dashboard -> Edge Functions -> Secrets)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const DAILY_CAP = 50 // messages per user per day
const CHAT_MODEL = 'claude-sonnet-4-6'
const REVIEW_MODEL = 'claude-opus-4-8'

const ALLOWED_ORIGINS = ['https://luc1on.github.io', 'http://localhost:5173']

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const SYSTEM_PROMPT = `You are the in-app financial advisor for CashFlow, a personal cashflow app. You advise ONE specific user using ONLY the financial data provided to you in this conversation — their accounts, credit card, bills, income, savings goals/pots, planned expenses, loans, budgets, recent spending, net worth and a forward cashflow forecast.

Your job is to act like a sharp, practical personal financial adviser tailored to THIS user's actual numbers. Help with:
- budgeting and day-to-day cashflow
- whether they can afford a planned or possible expense, and when
- debt strategy (e.g. avalanche vs snowball) using their real card balance, loans and interest rates
- what to do with their "vault" (surplus that builds once the card is paid off) and emergency-fund sizing
- savings goals and general financial planning

You may give GENERAL, EDUCATIONAL investment guidance (diversification, low-cost index funds, time horizon, tax-advantaged/pension accounts, the order of operations like clearing high-interest debt and building an emergency fund first). You must NOT recommend specific securities or tickers, attempt market timing, or give personalised investment, pension, tax or legal advice — for those, tell the user to consult a qualified regulated professional.

Style:
- Be specific and numeric: cite their real figures and dates, and show the maths.
- Lead with the direct answer, then the brief reasoning.
- Be concise and skimmable: short paragraphs, bullet points, **bold** the key numbers. Use markdown.
- Use the user's currency exactly as given in the data ("currency" field).
- If important data is missing or looks wrong, say so and tell them where to add/fix it in the app (e.g. "add your salary on the Income page").
- Never invent data you weren't given. If a question can't be answered from the data, say what's missing.
- Be honest about trade-offs and risk — don't just cheerlead.

Important: You provide general information and education to help the user understand their own finances. You are NOT a regulated financial adviser and nothing here is regulated financial, investment, tax or legal advice. For major decisions (investments, pensions, tax, debt restructuring) advise consulting a qualified professional, and include a brief reminder of this whenever you give investment, pension or tax guidance.`

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Advisor is not configured yet (missing ANTHROPIC_API_KEY).' }, 503)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  // Client bound to the caller's JWT so every query is RLS-scoped to them.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  const user = userData?.user
  if (userErr || !user) return json({ error: 'Not signed in.' }, 401)

  // Parse request
  let payload: { messages?: { role: string; content: string }[]; mode?: string; forecast?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }
  const mode = payload.mode === 'review' ? 'review' : 'chat'
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const trimmed = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-24)
  if (trimmed.length === 0) return json({ error: 'No message provided.' }, 400)

  // Per-user daily cap
  const today = new Date().toISOString().slice(0, 10)
  const { data: usage } = await supabase
    .from('advisor_usage').select('count').eq('user_id', user.id).eq('day', today).maybeSingle()
  const used = usage?.count ?? 0
  if (used >= DAILY_CAP) {
    return json({ error: `Daily limit reached (${DAILY_CAP} messages). Try again tomorrow.` }, 429)
  }
  await supabase.from('advisor_usage')
    .upsert({ user_id: user.id, day: today, count: used + 1 }, { onConflict: 'user_id,day' })

  // Authoritative data (RLS-scoped). Forecast summary comes from the client.
  const sinceExpenses = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10)
  const [accounts, bills, income, savings, planned, loans, budgets, profiles, expenses] = await Promise.all([
    supabase.from('accounts').select('name,balance,type,credit_limit,is_primary,notes'),
    supabase.from('bills').select('name,amount,next_due_date,frequency,category,is_active'),
    supabase.from('income').select('name,amount,frequency,income_type,next_date,is_active'),
    supabase.from('savings_goals').select('name,amount_per_payslip,current_saved,target_amount,start_date,end_date,deduction_type,is_active,is_disposable_pot'),
    supabase.from('planned_expenses').select('name,amount,date,category,is_completed'),
    supabase.from('loans').select('name,starting_balance,interest_rate,payment_amount,payment_frequency,start_date,is_active'),
    supabase.from('budget_alerts').select('type,label,monthly_limit,category,is_active'),
    supabase.from('profiles').select('currency,default_horizon,last_settled_date,display_name'),
    supabase.from('expenses').select('name,amount,date,category,merchant').gte('date', sinceExpenses).order('date', { ascending: false }).limit(200),
  ])

  const profile = profiles.data?.[0] ?? null
  const dataBlock = JSON.stringify({
    today,
    currency: profile?.currency ?? 'EUR',
    profile,
    accounts: accounts.data ?? [],
    credit_card_and_cash_note: 'balance on a credit_card account is the amount OWED; available credit = credit_limit - balance.',
    bills: bills.data ?? [],
    income: income.data ?? [],
    savings_goals: savings.data ?? [],
    planned_expenses: planned.data ?? [],
    loans: loans.data ?? [],
    budgets: budgets.data ?? [],
    recent_expenses_last_120d: expenses.data ?? [],
    forecast_summary: payload.forecast ?? null,
  })

  const model = mode === 'review' ? REVIEW_MODEL : CHAT_MODEL
  const anthropicBody = {
    model,
    max_tokens: mode === 'review' ? 4096 : 1500,
    temperature: 0.3,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: `Here is the signed-in user's financial data (authoritative, server-fetched):\n${dataBlock}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  }

  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(anthropicBody),
  })

  if (!anthropicResp.ok || !anthropicResp.body) {
    const detail = await anthropicResp.text().catch(() => '')
    console.error('Anthropic error', anthropicResp.status, detail)
    return json({ error: 'The advisor could not respond right now.', status: anthropicResp.status }, 502)
  }

  // Pipe the SSE stream straight back to the browser.
  return new Response(anthropicResp.body, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
