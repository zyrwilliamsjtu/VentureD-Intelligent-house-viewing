/** 5 套 InteriorGS 真实房源：world_id ↔ 数据盘目录 ↔ 挂牌。 */

export interface WorldListing {
  listing_id: string
  world_id: string
  scene_dir: string
  title: string
  layout: string
  area: number
  price: string
  orientation?: string
  floor?: string
  highlight?: string
  tags?: string[]
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
    orientation: '南向',
    floor: '12/28',
    highlight: '三室一厅约120平，客厅南向连阳台。',
    tags: ['南北通透', '全明户型', '近地铁'],
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
    orientation: '南向',
    floor: '8/18',
    highlight: '四室一厅约136平，客厅约47平。',
    tags: ['四房', '客厅开间大', '适合三代'],
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
    orientation: '南北',
    floor: '6/22',
    highlight: '三室一厅带书房约136平，主卧约22平。',
    tags: ['带书房', '双卫', '面积宽裕'],
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
    orientation: '东南',
    floor: '3/11',
    highlight: '三室一厅约86平，总价门槛相对低。',
    tags: ['小三房', '低楼层', '层高2.65米'],
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
    orientation: '南向',
    floor: '15/26',
    highlight: '三室一厅约93平，客餐厨开间约32平。',
    tags: ['客餐厨一体', '三房', '高楼层'],
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
  // Vite 只内联静态出现的 VITE_*，必须逐套写出；未配置则回落 dev `/ply/{scene}.ply`
  const perWorld: Record<string, string | undefined> = {
    w_0330_840483: import.meta.env.VITE_SPLAT_URL_w_0330_840483,
    w_0469_840829: import.meta.env.VITE_SPLAT_URL_w_0469_840829,
    w_0259_840804: import.meta.env.VITE_SPLAT_URL_w_0259_840804,
    w_0309_840544: import.meta.env.VITE_SPLAT_URL_w_0309_840544,
    w_0836_841149: import.meta.env.VITE_SPLAT_URL_w_0836_841149,
  }
  const direct = perWorld[worldId]?.trim()
  if (direct) return direct
  const base = (import.meta.env.VITE_SPLAT_BASE as string | undefined)?.replace(/\/+$/, '')
  if (base) return `${base}/${sceneDirForWorld(worldId)}/3dgs_compressed.ply`
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
        orientation: String(row.orientation ?? known?.orientation ?? ''),
        floor: String(row.floor ?? known?.floor ?? ''),
        highlight: String(row.highlight ?? known?.highlight ?? ''),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : known?.tags,
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
