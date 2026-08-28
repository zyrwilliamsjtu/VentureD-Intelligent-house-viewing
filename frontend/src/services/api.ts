import type { ChatRequest, ChatResponse, House, TourScript } from '../types/api'
import * as mock from './mock'
import * as real from './realApi'

// ==== 服务入口：mock / real 一键切换 ====
// .env: VITE_API_MODE=mock | real（缺省 mock）

export type ApiMode = 'mock' | 'real'

export const apiMode: ApiMode =
  import.meta.env.VITE_API_MODE === 'real' ? 'real' : 'mock'

// 简单缓存：houses / tour 均为静态数据，重复进入不重复请求
const houseCache = new Map<string, House>()
const tourCache = new Map<string, TourScript>()

export async function getHouse(id: string): Promise<House> {
  const hit = houseCache.get(id)
  if (hit) return hit
  let h: House
  if (apiMode === 'real') {
    // real 失败降级本地 mock（house 为前端展示数据，不阻塞进入；Agent chat 仍走网关）。
    // 注：后端网关无 /api/houses 路由（scene_graph 走 /api/scene），故 real 路径常态即降级。
    try {
      h = await real.realGetHouse(id)
    } catch {
      console.warn('[api] realGetHouse 失败，降级本地 mock（不影响漫游与 Agent 联调）')
      h = await mockGetHouse(id)
    }
  } else {
    h = await mockGetHouse(id)
  }
  houseCache.set(id, h)
  return h
}

export async function getTour(houseId: string): Promise<TourScript> {
  const hit = tourCache.get(houseId)
  if (hit) return hit
  const t = apiMode === 'mock' ? await mock.mockGetTour() : await real.realGetTour(houseId)
  tourCache.set(houseId, t)
  return t
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  return apiMode === 'mock' ? mock.mockSendChat(req) : real.realSendChat(req)
}

export const checkBackendHealth = real.realHealth

// ---- mock 内部小包装：仓库 mock 是唯一事实源，忽略请求 id ----
async function mockGetHouse(_id: string): Promise<House> {
  return mock.loadRepoHouse()
}
