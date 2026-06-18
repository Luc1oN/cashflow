import { createClient } from '@supabase/supabase-js'

// Hardcoded Supabase project credentials.
// The anon key is safe to be public: Row-Level Security (every table is scoped
// to auth.uid()) is what actually protects your data, not key secrecy. Never
// put the service_role key here — that one bypasses RLS.
const url = 'https://wpqpubbyqvqhcwxmzhwu.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcXB1YmJ5cXZxaGN3eG16aHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjY3MzEsImV4cCI6MjA5NjE0MjczMX0.ZRQwj4IDNPctaU2zgyDz16MOBjIU4XrRMS5UeBULe8A'

export const supabase = createClient(url, anonKey)
