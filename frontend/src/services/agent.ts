import type {
  AgentChatRequest,
  AgentChatResponse,
  NarrationResponse,
  TourResponse,
  TtsResponse,
} from '../types/api'

// ==== Agent 服务（SPEC v2.2 §3.1 · docs/agent-api.md v1.1）====
// 自研 mock 已下线（2026-08-28）：agent 全部由后端队友实现，
// 前端只打网关 POST {VITE_API_BASE}/api/agent/chat（JSON，30s 超时，
// 错误顶层 {code,message}）。后端不可达时面板如实报错，不再本地兜底。

const SESSION_KEY = 'agent_session_id'

/** session_id：前端生成、同一房源会话内复用（sessionStorage 跨刷新保留） */
export function getSessionId(): string {
  try {
    const hit = sessionStorage.getItem(SESSION_KEY)
    if (hit) return hit
    const sid = newSid()
    sessionStorage.setItem(SESSION_KEY, sid)
    return sid
  } catch {
    return `s_${Date.now().toString(36)}_tmp`
  }
}

/** 换房源必须重置会话（联调指南 §3.4 方案 A / SPEC §0：不带上一套的 history/current_room） */
export function resetSessionId(): string {
  const sid = newSid()
  try {
    sessionStorage.setItem(SESSION_KEY, sid)
  } catch {
    /* 私密模式等场景：本次内存态仍生效 */
  }
  return sid
}

function newSid(): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null
  return uuid ?? `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// 默认空 = 同源相对路径（dev 走 vite proxy /api → 后端网关，无跨源问题）；
// 需直连时在 .env 设 VITE_API_BASE（如 http://192.168.x.x:8000）
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export async function agentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000) // SPEC §0：chat 30s
  try {
    const res = await fetch(`${BASE}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    })
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
    return (await res.json()) as AgentChatResponse
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Agent 响应超时')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 进房讲解（GET /api/agent/narration，SPEC §3.4）。后端不可达抛错，调用方静默处理。 */
export async function getNarration(
  worldId: string,
  roomId: string,
  sessionId?: string,
  listingId?: string,
): Promise<NarrationResponse> {
  const q = new URLSearchParams({ world_id: worldId, room_id: roomId })
  if (sessionId) q.set('session_id', sessionId)
  if (listingId) q.set('listing_id', listingId)
  const res = await fetch(`${BASE}/api/agent/narration?${q.toString()}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as NarrationResponse
}

/** 语音合成（POST /api/agent/tts，SPEC §3.3）。stub/无 key 会返回空 audio_url。 */
export async function synthesizeTts(text: string, voice?: string): Promise<TtsResponse> {
  if (!text.trim()) return {}
  const res = await fetch(`${BASE}/api/agent/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as TtsResponse
}

/** 全屋带看（POST /api/agent/tour，SPEC §3.5）。 */
export async function getTour(worldId: string, sessionId: string, listingId?: string): Promise<TourResponse> {
  const res = await fetch(`${BASE}/api/agent/tour`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ world_id: worldId, session_id: sessionId, ...(listingId ? { listing_id: listingId } : {}) }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as TourResponse
}
