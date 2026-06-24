import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase'
import type { AdvisorForecastSummary } from './snapshot'

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/advisor`

export type AdvisorRole = 'user' | 'assistant'
export interface AdvisorMessage { role: AdvisorRole; content: string }

/**
 * Calls the `advisor` edge function and streams the reply, invoking onDelta for
 * each chunk of text. The Anthropic API key lives only in the function; here we
 * send the user's Supabase access token so the function can authenticate them
 * and fetch their data under RLS.
 */
export async function streamAdvisor(opts: {
  accessToken: string
  mode: 'chat' | 'review'
  messages: AdvisorMessage[]
  forecast: AdvisorForecastSummary
  onDelta: (text: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const resp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ mode: opts.mode, messages: opts.messages, forecast: opts.forecast }),
    signal: opts.signal,
  })

  if (!resp.ok || !resp.body) {
    let message = 'The advisor could not respond right now.'
    try {
      const j = await resp.json()
      if (j?.error) message = j.error
    } catch {
      /* non-JSON error */
    }
    throw new Error(message)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the trailing partial line
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const evt = JSON.parse(data)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          opts.onDelta(evt.delta.text as string)
        }
      } catch {
        /* ignore keep-alives / non-JSON events */
      }
    }
  }
}
