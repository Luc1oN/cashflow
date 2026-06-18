import { supabase } from './supabase'

/** Upload a receipt image to the private bucket under the user's folder. Returns the storage path. */
export async function uploadReceipt(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

/** Get a short-lived signed URL for viewing a stored receipt. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60 * 10)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
