import type { AgentChatRequest, AgentChatResponse } from '../types/api'

// ==== Agent 服务（SPEC v2.2 §3.1 · docs/agent-api.md v1.1）====
// 自研 mock 已下线（2026-08-28）：agent 全部由后端队友实现，
// 前端只打网关 POST {VITE_API_BASE}/api/agent/chat（JSON，30s 超时，
// 错误顶层 {code,message}）。后端不可达时面板如实报错，不再本地兜底。

const SESSION_KEY = 'agent_session_id'

/** session_id：前端生成、全程复用（SPEC §0 会话约定；sessionStorage 跨刷新保留） */
export function getSessionId(): string {
  try {
    const hit = sessionStorage.getItem(SESSION_KEY)
    if (hit) return hit
    const sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    sessionStorage.setItem(SESSION_KEY, sid)
    return sid
  } catch {
    return `s_${Date.now().toString(36)}_tmp`
  }
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
