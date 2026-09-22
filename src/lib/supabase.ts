import { createClient } from '@supabase/supabase-js'

// Project credentials. The anon key is safe to ship in the bundle — Row-Level
// Security (every table scoped to auth.uid()) is what protects the data, not
// key secrecy. Never put the service_role key here; it bypasses RLS.
//
// Read from the build environment when available so a fork, or a key rotation,
// is a secrets change rather than a code change. The literals are the fallback
// so an existing deploy with no VITE_* variables set keeps working unchanged.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://wpqpubbyqvqhcwxmzhwu.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcXB1YmJ5cXZxaGN3eG16aHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjY3MzEsImV4cCI6MjA5NjE0MjczMX0.ZRQwj4IDNPctaU2zgyDz16MOBjIU4XrRMS5UeBULe8A'

// Exposed so the advisor client can reach the edge function with the anon key.
export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The password-reset link lands with the recovery token in the URL
    // fragment; this is what turns it into a session (and fires
    // PASSWORD_RECOVERY, which AuthContext listens for).
    detectSessionInUrl: true,
  },
})
