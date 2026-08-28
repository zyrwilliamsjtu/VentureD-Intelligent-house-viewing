import type { NarrationResponse } from '../types/api'

// GET /api/agent/narration — 进房讲解主路径；404/失败由调用方回落 chat enter_room

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export async function fetchNarration(opts: {
  worldId: string
  roomId: string
  sessionId?: string
  listingId?: string
}): Promise<NarrationResponse | null> {
  const q = new URLSearchParams({
    world_id: opts.worldId,
    room_id: opts.roomId,
  })
  if (opts.sessionId) q.set('session_id', opts.sessionId)
  if (opts.listingId) q.set('listing_id', opts.listingId)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8_000)
  try {
    const res = await fetch(`${BASE}/api/agent/narration?${q.toString()}`, { signal: ctrl.signal })
    if (res.status === 404) return null
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { code?: string; message?: string }
        msg = body.message ? `[${body.code ?? 'AGENT_ERROR'}] ${body.message}` : msg
      } catch {
        /* ignore */
      }
      throw new Error(msg)
    }
    const body = (await res.json()) as NarrationResponse
    if (!body?.reply_text?.trim()) return null
    return body
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('讲解超时')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
