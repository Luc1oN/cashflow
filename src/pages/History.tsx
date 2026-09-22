import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { useTable } from '../lib/useTable'
import { useToast } from '../contexts/ToastContext'
import { canReverse, reverseSettlement } from '../lib/settle'
import { friendlyError } from '../lib/errors'
import { titleCase } from '../lib/format'
import type { Income, PlannedExpense, Settlement, Transaction } from '../lib/types'
import { Badge, Button, Card, EmptyState, Modal, Money, PageHeader, Skeleton } from '../components/ui'

export default function History() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [undoing, setUndoing] = useState<Settlement | null>(null)
  const [busy, setBusy] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)

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

  // Only the newest settlement that is still standing can be undone — undoing
  // an older one would restore dates that later settlements have rolled past.
  const newestUnreversedId = useMemo(
    () => settlements.rows.find((s) => s.reversed_at === null)?.id ?? null,
    [settlements.rows],
  )

  const confirmUndo = async () => {
    if (!undoing) return
    setBusy(true)
    setUndoError(null)
    try {
      await reverseSettlement(undoing.id)
      setUndoing(null)
      toast('Settlement undone — everything is back as it was', 'neutral')
      // Balances, due dates, pots and planned ticks all moved: refetch the lot.
      await queryClient.invalidateQueries()
    } catch (err) {
      setUndoError(friendlyError(err, 'Could not undo that settlement'))
    }
    setBusy(false)
  }

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
              <Card key={s.id} className={`p-5 ${s.reversed_at ? 'opacity-60' : ''}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">
                      Settled {format(parseISO(s.created_at), 'd MMM yyyy, HH:mm')}
                      {s.reversed_at && <> <Badge tone="warn">Undone</Badge></>}
                    </p>
                    <p className="text-xs text-slate2">
                      Covered {s.from_date === s.to_date ? format(parseISO(s.to_date), 'd MMM') : `${format(parseISO(s.from_date), 'd MMM')} – ${format(parseISO(s.to_date), 'd MMM')}`}
                      {' · '}{s.item_count} item{s.item_count === 1 ? '' : 's'}
                      {s.reversed_at && <> · reversed {format(parseISO(s.reversed_at), 'd MMM, HH:mm')}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {canReverse(s, newestUnreversedId) && (
                      <Button variant="ghost" onClick={() => { setUndoing(s); setUndoError(null) }}>Undo</Button>
                    )}
                    <span className="font-num text-lg font-semibold">
                      <Money value={Number(s.net)} signed />
                    </span>
                  </div>
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

      <Modal title="Undo this settlement?" open={undoing !== null} onClose={() => setUndoing(null)}>
        {undoing && (
          <div className="space-y-4 text-sm">
            <p className="text-slate2">
              This puts everything back exactly as it was before you settled on{' '}
              <span className="font-medium text-ink">{format(parseISO(undoing.created_at), 'd MMM yyyy, HH:mm')}</span>:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-slate2">
              <li>
                your balance moves back by <Money value={-Number(undoing.net)} signed />
              </li>
              <li>bill and income dates return to what they were</li>
              <li>savings top-ups come back out of their pots</li>
              <li>planned expenses this settlement ticked off are un-ticked</li>
            </ul>
            <p className="text-xs text-slate2">
              The settlement and its {undoing.item_count} ledger {undoing.item_count === 1 ? 'entry' : 'entries'} stay in
              your history, marked as undone — an audit trail that erased its own mistakes wouldn't be one.
            </p>
            {undoError && <p className="text-claret" role="alert">{undoError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setUndoing(null)}>Cancel</Button>
              <Button onClick={confirmUndo} disabled={busy}>{busy ? 'Undoing…' : 'Undo settlement'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
