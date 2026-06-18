// Test-only shim. The app runs in browsers, which provide WebSocket natively,
// but Node 20 (used by both local tests and the CI workflow) has no global
// WebSocket. @supabase/realtime-js demands one when the client is constructed,
// so simply importing src/lib/supabase.ts throws under vitest. Providing the
// standard `ws` polyfill lets test modules import the real client unchanged —
// no application code, credentials, or runtime behaviour is affected.
import WebSocket from 'ws'

if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  ;(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket
}
