import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useToast } from '../contexts/ToastContext'
import { titleCase } from './format'

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
    staleTime: 30_000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [table] })

  const insertMutation = useMutation({
    mutationFn: async (values: Partial<T>) => {
      const { error } = await supabase.from(table).insert(values as Record<string, unknown>)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { invalidate(); toast(`${noun} added`) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<T> }) => {
      const { error } = await supabase.from(table).update(values as Record<string, unknown>).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { invalidate(); toast(`${noun} updated`) },
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { invalidate(); toast(`${noun} deleted`, 'neutral') },
  })

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refresh: () => invalidate(),
    insert: (values: Partial<T>) => insertMutation.mutateAsync(values),
    update: (id: string, values: Partial<T>) => updateMutation.mutateAsync({ id, values }),
    remove: (id: string) => removeMutation.mutateAsync(id),
  }
}
