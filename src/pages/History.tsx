import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { useTable } from '../lib/useTable'
import { titleCase } from '../lib/format'
import type { Settlement, Transaction } from '../lib/types'
import { Badge, Card, EmptyState, Money, PageHeader, Skeleton } from '../components/ui'

export default function History() {
  const settlements = useTable<Settlement>('settlements', 'created_at', false)
  const transactions = useTable<Transaction>('transactions', 'created_at', false)

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
      <PageHeader title="History" subtitle="Every settlement, recorded permanently — your audit trail" />
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
