import { getSessionId } from './agent'

export interface RecommendResult {
  listing_id?: string
  reason: string
  title?: string
  code?: string
  world_id?: string
}

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export async function agentRecommend(userText: string, sessionId?: string): Promise<RecommendResult> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 12_000)
  try {
    const res = await fetch(`${BASE}/api/agent/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId || getSessionId(),
        user_text: userText,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const body = (await res.json()) as RecommendResult
    if (!body || typeof body.reason !== 'string') {
      throw new Error('bad body')
    }
    return body
  } finally {
    window.clearTimeout(timer)
  }
}
