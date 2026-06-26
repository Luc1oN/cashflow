import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { useTable } from '../lib/useTable'
import { titleCase } from '../lib/format'
import type { Income, PlannedExpense, Settlement, Transaction } from '../lib/types'
import { Badge, Card, EmptyState, Money, PageHeader, Skeleton } from '../components/ui'

export default function History() {
  const settlements = useTable<Settlement>('settlements', 'created_at', false)
  const transactions = useTable<Transaction>('transactions', 'created_at', false)
  const planned = useTable<PlannedExpense>('planned_expenses', 'date', true)
  const income = useTable<Income>('income', 'next_date', true)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const feed = useMemo(() => {
    const items: { date: string; name: string; meta: string; amount: number; kind: 'income' | 'spend' }[] = []
    for (const p of planned.rows) if (!p.is_completed && p.date >= todayStr) items.push({ date: p.date, name: p.name, meta: `${titleCase(p.category)} · Planned`, amount: -Number(p.amount), kind: 'spend' })
    for (const i of income.rows) if (i.is_active && i.next_date >= todayStr) items.push({ date: i.next_date, name: i.name, meta: `${titleCase(i.income_type)} · Income`, amount: Number(i.amount), kind: 'income' })
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12)
  }, [planned.rows, income.rows, todayStr])

  const bySettlement = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of transactions.rows) {
      if (!t.settlement_id) continue
      const list = map.get(t.settlement_id) ?? []
      list.push(t)
      map.set(t.settlement_id, list)
    }
    return map
  }, [transactions.rows])

  if (settlements.loading || transactions.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Activity" subtitle="What's coming up, then your settlement history" />

      {feed.length > 0 && (
        <Card className="mb-[18px]">
          <h2 className="px-5 pt-4 font-display text-lg font-semibold text-ink">Upcoming</h2>
          <ul className="mt-2 divide-y divide-line">
            {feed.map((e, idx) => (
              <li key={idx} className="flex items-center gap-3 px-5 py-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-mist">
                  <span className="font-num text-sm font-semibold leading-none text-ink">{format(parseISO(e.date), 'd')}</span>
                  <span className="text-[10px] uppercase leading-tight text-slate2">{format(parseISO(e.date), 'MMM')}</span>
                </div>
                <span className={`h-2 w-2 shrink-0 rounded-full ${e.kind === 'income' ? 'bg-pos' : 'bg-neg'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{e.name}</p>
                  <p className="text-xs text-slate2">{e.meta}</p>
                </div>
                <Money value={e.amount} signed />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-2 mt-1 text-sm font-medium uppercase tracking-wide text-slate2">Settlement history</h2>
      {settlements.rows.length === 0 ? (
        <EmptyState message="No settlements yet. Once you settle the day on the dashboard, every applied transaction is recorded here." />
      ) : (
        <div className="space-y-4">
          {settlements.rows.map((s) => {
            const items = bySettlement.get(s.id) ?? []
            return (
              <Card key={s.id} className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">
                      Settled {format(parseISO(s.created_at), 'd MMM yyyy, HH:mm')}
                    </p>
                    <p className="text-xs text-slate2">
                      Covered {s.from_date === s.to_date ? format(parseISO(s.to_date), 'd MMM') : `${format(parseISO(s.from_date), 'd MMM')} – ${format(parseISO(s.to_date), 'd MMM')}`}
                      {' · '}{s.item_count} item{s.item_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="font-num text-lg font-semibold">
                    <Money value={Number(s.net)} signed />
                  </span>
                </div>
                {items.length > 0 && (
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {items.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 truncate text-ink">
                          {t.label} <Badge>{titleCase(t.kind)}</Badge>
                        </span>
                        <Money value={Number(t.amount)} signed />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
