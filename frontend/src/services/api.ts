import type { House } from '../types/api'
import { houseFromSceneGraph, loadRepoScene, type RepoSceneGraph } from './mock/data'

// ==== 服务入口（PI 决策 1 · 2026-08-28 1143 通知）====
// 主链路：services/agent.ts（POST /api/agent/chat、POST /api/agent/asr）
//        + GET /api/scene/{world_id}（本文件 getHouse 的 real 路径）。
// 旧 realApi.ts（/api/houses、/api/chat、/api/health）为遗留代码，主链路不再调用。
// .env: VITE_API_MODE=mock | real（缺省 mock）

export type ApiMode = 'mock' | 'real'

export const apiMode: ApiMode =
  import.meta.env.VITE_API_MODE === 'real' ? 'real' : 'mock'

// 同源空串 = dev 走 vite proxy /api → 后端网关（无跨源）；直连时 .env 配 VITE_API_BASE
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

const houseCache = new Map<string, House>()

/** real 主链路：GET /api/scene/{world_id} → scene_graph JSON → House（10s 超时） */
async function sceneFromGateway(worldId: string): Promise<House> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${BASE}/api/scene/${encodeURIComponent(worldId)}`, {
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const scene = (await res.json()) as RepoSceneGraph
    if (!scene?.world_id || scene.world_id !== worldId) {
      throw new Error(`world_id 不符（响应 ${scene?.world_id}）`)
    }
    return houseFromSceneGraph(scene)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('/api/scene 超时(10s)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 房源语义数据：real 先走网关 /api/scene，失败/非 real 降级本地 public/mock（不阻塞进入）。
 *  worldId 与 3D 视口共用 VITE_WORLD_ID（PI 决策 2：demo 统一 w_0330_840483）。 */
export async function getHouse(worldId: string): Promise<House> {
  const hit = houseCache.get(worldId)
  if (hit) return hit
  let h: House | null = null
  if (apiMode === 'real') {
    try {
      h = await sceneFromGateway(worldId)
    } catch (e) {
      console.warn('[api] 网关 /api/scene 失败，降级本地 mock（漫游/Agent 不受影响）', e)
    }
  }
  if (!h) {
    const { scene, poses } = await loadRepoScene(worldId)
    h = houseFromSceneGraph(scene, poses)
  }
  houseCache.set(worldId, h)
  return h
}
