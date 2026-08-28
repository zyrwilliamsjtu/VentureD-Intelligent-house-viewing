import type { RepoRoom, RepoSceneGraph } from '../services/mock/data'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
const ASSET = import.meta.env.BASE_URL || '/'
const cache = new Map<string, RepoSceneGraph>()

/** GET /api/scene；0330 可回落 public/mock/real_0330。失败返回 null，不抛。 */
export async function fetchSceneGraph(worldId: string): Promise<RepoSceneGraph | null> {
  const hit = cache.get(worldId)
  if (hit) return hit
  try {
    const res = await fetch(`${BASE}/api/scene/${encodeURIComponent(worldId)}`)
    if (res.ok) {
      const body = (await res.json()) as RepoSceneGraph
      if (body && Array.isArray(body.rooms) && body.world_id === worldId) {
        cache.set(worldId, body)
        return body
      }
    }
  } catch {
    /* 网关不可用时走本地兜底 */
  }
  if (worldId === 'w_0330_840483') {
    try {
      const res = await fetch(`${ASSET}mock/real_0330/scene_graph.json`)
      if (res.ok) {
        const body = (await res.json()) as RepoSceneGraph
        if (body && Array.isArray(body.rooms)) {
          cache.set(worldId, body)
          return body
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}
