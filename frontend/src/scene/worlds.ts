/** 5 套 InteriorGS 真实房源：world_id ↔ 数据盘目录 ↔ 挂牌。 */

export interface WorldListing {
  listing_id: string
  world_id: string
  scene_dir: string
  title: string
  layout: string
  area: number
  price: string
  /** InteriorGS 点云均为 Z-up；体素与 0330 一样不同帧，默认关 */
  up: 'z'
  voxel: boolean
}

/** GET /api/listings 失败时的硬编码兜底（与 mock/listings.json 对齐） */
export const WORLD_LISTINGS: WorldListing[] = [
  {
    listing_id: 'listing_0330_840483',
    world_id: 'w_0330_840483',
    scene_dir: '0330_840483',
    title: '0330 · 三室一厅',
    layout: '三室一厅',
    area: 120.1,
    price: '430万',
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0469_840829',
    world_id: 'w_0469_840829',
    scene_dir: '0469_840829',
    title: '0469 · 四室一厅',
    layout: '四室一厅',
    area: 135.9,
    price: '490万',
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0259_840804',
    world_id: 'w_0259_840804',
    scene_dir: '0259_840804',
    title: '0259 · 三室一厅',
    layout: '三室一厅',
    area: 135.9,
    price: '460万',
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0309_840544',
    world_id: 'w_0309_840544',
    scene_dir: '0309_840544',
    title: '0309 · 三室一厅',
    layout: '三室一厅',
    area: 85.9,
    price: '320万',
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0836_841149',
    world_id: 'w_0836_841149',
    scene_dir: '0836_841149',
    title: '0836 · 三室一厅',
    layout: '三室一厅',
    area: 92.9,
    price: '340万',
    up: 'z',
    voxel: false,
  },
]

export const DEFAULT_WORLD_ID =
  (import.meta.env.VITE_WORLD_ID as string | undefined) || 'w_0330_840483'

export function worldListing(worldId: string): WorldListing | undefined {
  return WORLD_LISTINGS.find((w) => w.world_id === worldId)
}

export function sceneDirForWorld(worldId: string): string {
  return worldListing(worldId)?.scene_dir ?? worldId.replace(/^w_/, '')
}

export function splatUrlForWorld(worldId: string): string {
  return `/ply/${sceneDirForWorld(worldId)}.ply`
}

export function listingIdForWorld(worldId: string): string {
  return worldListing(worldId)?.listing_id ?? `listing_${sceneDirForWorld(worldId)}`
}

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** 网关 listings；失败不阻断，用硬编码 5 条 */
export async function loadListings(): Promise<WorldListing[]> {
  try {
    const res = await fetch(`${BASE}/api/listings`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { listings?: Array<Record<string, unknown>> }
    const rows = body.listings
    if (!Array.isArray(rows) || !rows.length) throw new Error('listings 为空')
    const mapped: WorldListing[] = []
    for (const row of rows) {
      const world_id = String(row.world_id ?? '')
      if (!world_id) continue
      const known = worldListing(world_id)
      mapped.push({
        listing_id: String(row.id ?? known?.listing_id ?? listingIdForWorld(world_id)),
        world_id,
        scene_dir: known?.scene_dir ?? sceneDirForWorld(world_id),
        title: String(row.title ?? known?.title ?? world_id),
        layout: String(row.layout ?? known?.layout ?? ''),
        area: typeof row.area === 'number' ? row.area : (known?.area ?? 0),
        price: String(row.price ?? known?.price ?? ''),
        up: 'z',
        voxel: false,
      })
    }
    if (mapped.length) {
      console.info('[listings] 网关 %d 套', mapped.length)
      return mapped
    }
  } catch (e) {
    console.warn('[listings] 网关失败，用本地 5 套兜底', e)
  }
  return WORLD_LISTINGS
}
