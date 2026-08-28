import type { ChatRequest, ChatResponse, House, TourScript } from '../types/api'

// ⚠️ 遗留代码（PI 决策 1 · 2026-08-28 1143 通知）：主链路已统一走
//   services/agent.ts（POST /api/agent/chat、POST /api/agent/asr）
//   + services/api.ts 的 GET /api/scene/{world_id}。
// 本文件的 /api/houses、/api/chat、/api/health 为旧契约路由，后端网关已不提供；
// 保留文件仅为兼容历史引用，勿在新代码中调用，勿据此修改接口形状。

// ==== （遗留）真实后端实现（按旧接口契约 V1.0）====
// Base URL 末尾不带 /api；接口路径统一为 ${BASE}/api/...

const BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/+$/, '')

function timeoutFetch(input: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { message?: string; error?: string }
      msg = body.message || body.error || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export async function realGetHouse(id: string): Promise<House> {
  const res = await timeoutFetch(`${BASE}/api/houses/${encodeURIComponent(id)}`)
  return json<House>(res)
}

export async function realGetTour(houseId: string): Promise<TourScript> {
  const res = await timeoutFetch(`${BASE}/api/houses/${encodeURIComponent(houseId)}/tour`)
  return json<TourScript>(res)
}

export async function realSendChat(req: ChatRequest): Promise<ChatResponse> {
  const fd = new FormData()
  fd.append('house_id', req.house_id)
  if (req.text) fd.append('text', req.text)
  if (req.audio) fd.append('audio', req.audio.blob, `audio.${req.audio.mime.includes('mp4') ? 'mp4' : 'webm'}`)
  fd.append('current_zone', req.current_zone ?? '')
  fd.append('tour_index', String(req.tour_index))
  fd.append('history', JSON.stringify(req.history.slice(-6)))

  const res = await timeoutFetch(`${BASE}/api/chat`, { method: 'POST', body: fd })
  return json<ChatResponse>(res)
}

export async function realHealth(): Promise<boolean> {
  try {
    const res = await timeoutFetch(`${BASE}/api/health`, {}, 5000)
    return res.ok
  } catch {
    return false
  }
}
