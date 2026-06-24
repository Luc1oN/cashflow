import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Send, Trash2, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTable } from '../lib/useTable'
import { buildForecastSummary } from '../lib/snapshot'
import { streamAdvisor, type AdvisorMessage } from '../lib/advisor'
import type { Account, Bill, Income, Loan, OneOffLoanPayment, PlannedExpense, Profile, SavingsGoal } from '../lib/types'
import { Button, Card, PageHeader, Skeleton } from '../components/ui'

interface QuickAction { label: string; prompt: string; mode: 'chat' | 'review' }

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Review my finances', mode: 'review', prompt: 'Give me a full review of my finances: where I stand right now, the biggest risks or opportunities in my forecast, and your top 3–5 prioritised recommendations.' },
  { label: 'Debt payoff plan', mode: 'chat', prompt: 'Based on my credit card and loans, what is the smartest order and pace to pay down my debt? Compare avalanche vs snowball for my actual balances and rates.' },
  { label: 'Savings strategy', mode: 'chat', prompt: 'How should I use my vault surplus and savings pots? Suggest an emergency-fund target and how to split spare money between debt, savings and goals.' },
  { label: 'Can I afford…?', mode: 'chat', prompt: 'I’m thinking about a big purchase. Walk me through how to tell if I can afford it given my forecast — and ask me for the amount and timing.' },
]

export default function Advisor() {
  const { user, session } = useAuth()

  const accounts = useTable<Account>('accounts')
  const bills = useTable<Bill>('bills')
  const income = useTable<Income>('income')
  const savings = useTable<SavingsGoal>('savings_goals')
  const planned = useTable<PlannedExpense>('planned_expenses')
  const loans = useTable<Loan>('loans')
  const oneOffs = useTable<OneOffLoanPayment>('one_off_loan_payments')

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw new Error(error.message)
      return data as Profile
    },
    enabled: !!user,
  })
  const horizon = profileQuery.data?.default_horizon ?? 90

  const forecast = useMemo(
    () => buildForecastSummary({
      accounts: accounts.rows, bills: bills.rows, income: income.rows, savingsGoals: savings.rows,
      plannedExpenses: planned.rows, loans: loans.rows, oneOffPayments: oneOffs.rows, horizonDays: horizon,
    }),
    [accounts.rows, bills.rows, income.rows, savings.rows, planned.rows, loans.rows, oneOffs.rows, horizon],
  )

  const [messages, setMessages] = useState<AdvisorMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load saved conversation once.
  useEffect(() => {
    if (!user) return
    supabase.from('advisor_messages').select('role,content').order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as AdvisorMessage[])
        setHistoryLoaded(true)
      })
  }, [user])

  // Keep the transcript scrolled to the latest.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const dataLoading = accounts.loading || bills.loading || income.loading || loans.loading || profileQuery.isLoading

  const persist = (role: 'user' | 'assistant', content: string) =>
    supabase.from('advisor_messages').insert({ role, content }).then(() => {})

  async function send(text: string, mode: 'chat' | 'review' = 'chat') {
    const trimmed = text.trim()
    if (!trimmed || streaming || !session) return

    const history: AdvisorMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    setError(null)
    void persist('user', trimmed)

    let assistant = ''
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamAdvisor({
        accessToken: session.access_token,
        mode,
        messages: history,
        forecast,
        signal: controller.signal,
        onDelta: (d) => {
          assistant += d
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = { role: 'assistant', content: assistant }
            return next
          })
        },
      })
      if (assistant.trim()) void persist('assistant', assistant)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (assistant.trim()) void persist('assistant', assistant)
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        // drop the empty assistant placeholder
        setMessages((prev) => (prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  async function clearConversation() {
    if (!user || streaming) return
    setMessages([])
    setError(null)
    await supabase.from('advisor_messages').delete().eq('user_id', user.id)
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="AI Advisor"
        subtitle="Personalised guidance from your own CashFlow data"
        action={messages.length > 0 ? (
          <Button variant="ghost" onClick={clearConversation} disabled={streaming}>
            <Trash2 size={16} className="mr-1.5 inline" aria-hidden /> Clear
          </Button>
        ) : undefined}
      />

      <div className="rounded-lg border border-line bg-mist/60 px-3 py-2 text-xs text-slate2">
        General information to help you understand your own finances — not regulated financial, investment or tax advice.
        Your data is sent securely to Anthropic’s Claude API to generate each reply (it is not used to train models).
      </div>

      {dataLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-64" />
        </div>
      ) : (
        <Card className="mt-4 flex h-[min(70vh,620px)] flex-col p-0">
          {/* Transcript */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && historyLoaded && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Sparkles size={24} aria-hidden />
                </span>
                <p className="mt-3 max-w-sm text-sm text-slate2">
                  Ask me anything about your money, or pick a starting point below. I can see your card, bills, income,
                  savings, loans and forecast.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-on-accent">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-mist px-3.5 py-2.5 text-sm text-ink">
                    {m.content ? (
                      <div className="prose-cf">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="inline-flex gap-1 text-slate2">
                        <span className="animate-pulse">●</span> thinking…
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <p className="mx-4 mb-1 rounded-lg bg-claret/10 px-3 py-2 text-xs text-claret" role="alert">{error}</p>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 border-t border-line px-3 pt-3">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                onClick={() => send(qa.prompt, qa.mode)}
                disabled={streaming}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium text-slate2 transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Composer */}
          <form
            className="flex items-end gap-2 p-3"
            onSubmit={(e) => { e.preventDefault(); send(input) }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
              }}
              rows={1}
              placeholder="Ask about your finances…"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate2 focus:border-accent focus:outline-none"
            />
            {streaming ? (
              <Button variant="ghost" onClick={stop}><Square size={16} className="mr-1 inline" aria-hidden /> Stop</Button>
            ) : (
              <Button type="submit" disabled={!input.trim()}><Send size={16} className="mr-1 inline" aria-hidden /> Send</Button>
            )}
          </form>
        </Card>
      )}
    </div>
  )
}
