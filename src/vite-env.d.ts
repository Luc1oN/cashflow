/// <reference types="vite/client" />

// Augments Vite's own ImportMetaEnv (interfaces merge) so the Supabase
// variables are typed rather than falling through its `any` index signature.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
