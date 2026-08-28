// ==== 房源列表数据（v3 · 2026-08-28 对齐后端 dev-backend@66940dd）====
// 数据源两级：GET /api/listings（后端 mock/listings.json，5 套真实挂牌，snake_case）
//   → 失败/非 real 降级本文件（与后端同口径硬编码，勿改数值）。
// floorplan：后端当前为 ""，展示用 floorplans.gen.ts 的真实提取（按 worldId 回填）。
// 挂牌价/朝向/楼层为挂牌 mock（数据集无这些字段）；问答时 listing 优先于 scene_graph（SPEC v2.3 §3.1）。

import { SCENE_FLOORS } from './floorplans.gen'

export type RoomPoly = { name: string; poly: [number, number][]; area?: number }

export interface Listing {
  id: string // = 后端 listing_id（listing_XXXX_YYYYYY）
  title: string
  layout: string // 户型（真实提取归纳）
  area: number // 建筑面积 ㎡
  orientation: string
  floor: string
  price: string // 展示价（万）
  priceNum: number
  tags: string[]
  highlight: string // 一句话卖点（卡片副标题）
  worldId: string // ↔ GET /api/scene/{world_id} 与 chat world_id
  isReal: boolean // 后端 is_real（实景数据源徽标）
  plyReady: boolean // InteriorGS 点云在手
  floorplan: RoomPoly[] // mini 户型图（本地真实提取回填）
}

/** 3D 视口世界（PI 决策 2：Aholo LOD 目前仅 0330 转码完成，其余套 HUD/对话按 listing.worldId 工作） */
export const WALK_WORLD = 'w_0330_840483'

/** 后端同口径兜底（dev-backend mock/listings.json @66940dd；数值改动需与后端同步） */
const FALLBACK_RAW: Array<
  Omit<Listing, 'floorplan' | 'plyReady'> & { floorplan?: RoomPoly[] }
> = [
  {
    id: 'listing_0330_840483',
    title: 'InteriorGS 0330 · 三室一厅',
    layout: '三室一厅',
    area: 120.1,
    orientation: '南向',
    floor: '12/28',
    price: '430万',
    priceNum: 430,
    tags: ['南北通透', '全明户型', '近地铁'],
    highlight: '三室一厅约120平，客厅南向连阳台。',
    worldId: 'w_0330_840483',
    isReal: true,
  },
  {
    id: 'listing_0469_840829',
    title: 'InteriorGS 0469 · 四室一厅',
    layout: '四室一厅',
    area: 135.9,
    orientation: '南向',
    floor: '8/18',
    price: '490万',
    priceNum: 490,
    tags: ['四房', '客厅开间大', '适合三代'],
    highlight: '四室一厅约136平，客厅约47平。',
    worldId: 'w_0469_840829',
    isReal: true,
  },
  {
    id: 'listing_0259_840804',
    title: 'InteriorGS 0259 · 三室一厅',
    layout: '三室一厅',
    area: 135.9,
    orientation: '南北',
    floor: '6/22',
    price: '460万',
    priceNum: 460,
    tags: ['带书房', '双卫', '面积宽裕'],
    highlight: '三室一厅带书房约136平，主卧约22平。',
    worldId: 'w_0259_840804',
    isReal: true,
  },
  {
    id: 'listing_0309_840544',
    title: 'InteriorGS 0309 · 三室一厅',
    layout: '三室一厅',
    area: 85.9,
    orientation: '东南',
    floor: '3/11',
    price: '320万',
    priceNum: 320,
    tags: ['小三房', '低楼层', '层高2.65米'],
    highlight: '三室一厅约86平，总价门槛相对低。',
    worldId: 'w_0309_840544',
    isReal: true,
  },
  {
    id: 'listing_0836_841149',
    title: 'InteriorGS 0836 · 三室一厅',
    layout: '三室一厅',
    area: 92.9,
    orientation: '南向',
    floor: '15/26',
    price: '340万',
    priceNum: 340,
    tags: ['客餐厨一体', '三房', '高楼层'],
    highlight: '三室一厅约93平，客餐厨开间约32平。',
    worldId: 'w_0836_841149',
    isReal: true,
  },
]

/** 按世界回填真实提取户型（后端 floorplan 为空时用；提取产物勿手改） */
export function floorplanFor(worldId: string): RoomPoly[] {
  return SCENE_FLOORS[worldId]?.floorplan ?? []
}

/** 本地兜底列表（0330 可漫游置顶，其余按价格升序） */
export const LISTINGS: Listing[] = FALLBACK_RAW.map((l) => ({
  ...l,
  plyReady: true,
  floorplan: l.floorplan ?? floorplanFor(l.worldId),
})).sort(
  (a, b) =>
    Number(b.worldId === WALK_WORLD) - Number(a.worldId === WALK_WORLD) || a.priceNum - b.priceNum,
)

export function listingById(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id)
}
