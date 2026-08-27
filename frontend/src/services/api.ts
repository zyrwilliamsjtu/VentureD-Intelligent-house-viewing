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
  const h = apiMode === 'mock' ? await mockGetHouse(id) : await real.realGetHouse(id)
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
