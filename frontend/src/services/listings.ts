import { LISTINGS, floorplanFor, type Listing, type RoomPoly } from '../data/listings'
import { apiMode } from './api'

// ==== 房源列表服务（SPEC v2.3 §2.6 · GET /api/listings）====
// real：GET {BASE}/api/listings → { listings: [...] }（snake_case，10s 超时）
// 失败 / 非 real / 字段缺失 → 降级 data/listings.ts 本地兜底（不阻断列表与进房）。
// 后端 floorplan 当前为 ""：一律用本地真实提取按 worldId 回填。

/** 后端 wire 类型（snake_case，SPEC §2.6） */
export interface ListingDTO {
  id: string
  title: string
  layout: string
  area: number
  orientation: string
  floor: string
  price: string
  price_num: number
  tags: string[]
  highlight: string
  world_id: string
  is_real: boolean
  floorplan?: string | RoomPoly[]
}

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

function toListing(d: ListingDTO): Listing {
  // 后端 floorplan 为空串/缺省 → 本地真实提取回填；若日后下发 polygon 数组则直接用
  const fp: RoomPoly[] = Array.isArray(d.floorplan) && d.floorplan.length ? d.floorplan : floorplanFor(d.world_id)
  return {
    id: d.id,
    title: d.title,
    layout: d.layout,
    area: d.area,
    orientation: d.orientation,
    floor: d.floor,
    price: d.price,
    priceNum: d.price_num,
    tags: d.tags ?? [],
    highlight: d.highlight,
    worldId: d.world_id,
    isReal: d.is_real,
    plyReady: true,
    floorplan: fp,
  }
}

/** 0330（唯一可漫游）置顶，其余价格升序 */
function sortListings(ls: Listing[]): Listing[] {
  return [...ls].sort(
    (a, b) =>
      Number(b.worldId === 'w_0330_840483') - Number(a.worldId === 'w_0330_840483') ||
      a.priceNum - b.priceNum,
  )
}

async function fromGateway(): Promise<Listing[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${BASE}/api/listings`, { signal: ctrl.signal })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { code?: string; message?: string }
        if (body.message) msg = `[${body.code ?? 'LISTINGS_ERROR'}] ${body.message}`
      } catch {
        /* ignore */
      }
      throw new Error(msg)
    }
    const body = (await res.json()) as { listings?: ListingDTO[] }
    if (!Array.isArray(body.listings) || !body.listings.length) throw new Error('listings 为空')
    return sortListings(body.listings.map(toListing))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('/api/listings 超时(10s)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 拉取房源列表：real 走网关，失败静默降级本地（返回 source 供 UI 标注数据源） */
export async function fetchListings(): Promise<{ listings: Listing[]; source: 'api' | 'local' }> {
  if (apiMode === 'real') {
    try {
      return { listings: await fromGateway(), source: 'api' }
    } catch (e) {
      console.warn('[listings] 网关 /api/listings 失败 → 降级本地硬编码', e)
    }
  }
  return { listings: LISTINGS, source: 'local' }
}
