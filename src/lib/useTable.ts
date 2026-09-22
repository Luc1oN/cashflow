import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useToast } from '../contexts/ToastContext'
import { titleCase } from './format'
import { friendlyError } from './errors'

/**
 * Table CRUD on TanStack Query: cached reads, automatic invalidation,
 * toast feedback. RLS scopes every row to the signed-in user.
 */
export function useTable<T extends { id: string }>(table: string, orderBy = 'created_at', ascending = false) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const key = [table, orderBy, ascending]
  const noun = titleCase(table.replace(/s$/, '').replace('income', 'income source'))

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending })
      if (error) throw new Error(error.message)
      return (data ?? []) as T[]
    },
    // Single-user data that only changes via this app's own mutations (which
    // invalidate immediately), so a wide stale window is safe — and it stops
    // every return-to-app on mobile refiring a query per table.
    staleTime: 120_000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [table] })

  const insertMutation = useMutation({
    mutationFn: async (values: Partial<T>) => {
      const { error } = await supabase.from(table).insert(values as Record<string, unknown>)
      if (error) throw new Error(friendlyError(error.message, `Could not add this ${noun.toLowerCase()}`))
    },
    onSuccess: () => { invalidate(); toast(`${noun} added`) },
    onError: (err) => toast(friendlyError(err), 'bad'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<T> }) => {
      const { error } = await supabase.from(table).update(values as Record<string, unknown>).eq('id', id)
      if (error) throw new Error(friendlyError(error.message, `Could not update this ${noun.toLowerCase()}`))
    },
    onSuccess: () => { invalidate(); toast(`${noun} updated`) },
    onError: (err) => toast(friendlyError(err), 'bad'),
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw new Error(friendlyError(error.message, `Could not delete this ${noun.toLowerCase()}`))
    },
    onSuccess: () => { invalidate(); toast(`${noun} deleted`, 'neutral') },
    onError: (err) => toast(friendlyError(err), 'bad'),
  })

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? friendlyError(query.error, 'Could not load your data') : null,
    refresh: () => invalidate(),
    insert: (values: Partial<T>) => insertMutation.mutateAsync(values),
    update: (id: string, values: Partial<T>) => updateMutation.mutateAsync({ id, values }),
    remove: (id: string) => removeMutation.mutateAsync(id),
  }
}
