import { getSessionId } from './agent'
import type { TourResponse, TourStep } from '../types/api'

// POST /api/agent/tour → {steps[]}。失败则用 GET /api/scene 的 tour_path 本地拼 steps（不改后端）。

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

function parseSteps(raw: unknown): TourStep[] {
  if (!raw || typeof raw !== 'object') return []
  const steps = (raw as { steps?: unknown }).steps
  if (!Array.isArray(steps)) return []
  const out: TourStep[] = []
  for (const item of steps) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const room_id = typeof s.room_id === 'string' ? s.room_id : ''
    const tp = typeof s.trajectory_point_id === 'string' ? s.trajectory_point_id : ''
    if (!room_id || !tp) continue
    const step: TourStep = {
      index: typeof s.index === 'number' ? s.index : out.length,
      room_id,
      trajectory_point_id: tp,
    }
    if (typeof s.narration === 'string' && s.narration) step.narration = s.narration
    if (Array.isArray(s.selling_points) && s.selling_points.length) {
      step.selling_points = s.selling_points.map(String).filter(Boolean)
    }
    out.push(step)
  }
  return out
}

async function tourFromGateway(worldId: string): Promise<TourStep[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${BASE}/api/agent/tour`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ world_id: worldId, session_id: getSessionId() }),
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
    return parseSteps(await res.json())
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('带看动线超时')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 与后端 build_tour 同规则：tour_path 顺序，无 trajectory_point_id 的房间跳过 */
function stepsFromSceneGraph(sg: {
  tour_path?: unknown
  rooms?: Array<{
    id?: string
    trajectory_point_id?: string
    name?: string
    area?: number
    story_card?: string
    selling_points?: unknown
  }>
}): TourStep[] {
  const rooms = new Map((sg.rooms ?? []).filter((r) => r.id).map((r) => [r.id as string, r]))
  const path = Array.isArray(sg.tour_path) ? sg.tour_path : []
  const out: TourStep[] = []
  for (const id of path) {
    if (typeof id !== 'string') continue
    const room = rooms.get(id)
    const tp = room?.trajectory_point_id
    if (!room || typeof tp !== 'string' || !tp) continue
    const card = (room.story_card ?? '').trim()
    const narration =
      card ||
      (room.name && room.area != null ? `${room.name}约${room.area}平。` : room.name) ||
      undefined
    const step: TourStep = { index: out.length, room_id: id, trajectory_point_id: tp }
    if (narration) step.narration = narration
    if (Array.isArray(room.selling_points) && room.selling_points.length) {
      step.selling_points = room.selling_points.map(String).filter(Boolean)
    }
    out.push(step)
  }
  return out
}

async function tourFromScene(worldId: string): Promise<TourStep[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8_000)
  try {
    const res = await fetch(`${BASE}/api/scene/${encodeURIComponent(worldId)}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return stepsFromSceneGraph((await res.json()) as Parameters<typeof stepsFromSceneGraph>[0])
  } finally {
    clearTimeout(timer)
  }
}

/** 拉当前世界带看 steps；网关失败则 scene 兜底；都空则抛错给 UI */
export async function fetchTour(worldId: string): Promise<TourResponse> {
  if (!worldId) throw new Error('缺少 world_id')
  try {
    const steps = await tourFromGateway(worldId)
    if (steps.length) {
      console.info('[tour] 网关 %s · %d 步', worldId, steps.length)
      return { steps }
    }
    console.warn('[tour] 网关 steps 为空，改走 scene tour_path', worldId)
  } catch (e) {
    console.warn('[tour] 网关失败，改走 scene tour_path', worldId, e)
  }
  const steps = await tourFromScene(worldId)
  if (!steps.length) throw new Error('带看暂不可用')
  console.info('[tour] scene 兜底 %s · %d 步', worldId, steps.length)
  return { steps }
}
