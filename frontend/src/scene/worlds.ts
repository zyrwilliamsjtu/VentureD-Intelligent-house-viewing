/** 5 套 InteriorGS 真实房源：world_id ↔ 数据盘目录 ↔ 挂牌。 */

export interface WorldListing {
  listing_id: string
  world_id: string
  scene_dir: string
  title: string
  layout: string
  area: number
  price: string
  price_num?: number
  orientation?: string
  floor?: string
  highlight?: string
  tags?: string[]
  is_real?: boolean
  floorplan?: string
  /** 场景编号（如 0330），副标题；只增 */
  code?: string
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
    title: '云栖雅苑',
    code: '0330',
    layout: '三室一厅',
    area: 120.1,
    price: '430万',
    price_num: 430,
    orientation: '南向',
    floor: '12/28',
    highlight: '三室一厅约120平，客厅南向连阳台。',
    tags: ['南北通透', '全明户型', '近地铁'],
    is_real: true,
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0469_840829',
    world_id: 'w_0469_840829',
    scene_dir: '0469_840829',
    title: '翡翠云邸',
    code: '0469',
    layout: '四室一厅',
    area: 135.9,
    price: '490万',
    price_num: 490,
    orientation: '南向',
    floor: '8/18',
    highlight: '四室一厅约136平，客厅约47平。',
    tags: ['四房', '客厅开间大', '适合三代'],
    is_real: true,
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0259_840804',
    world_id: 'w_0259_840804',
    scene_dir: '0259_840804',
    title: '澜庭华府',
    code: '0259',
    layout: '三室一厅',
    area: 135.9,
    price: '460万',
    price_num: 460,
    orientation: '南北',
    floor: '6/22',
    highlight: '三室一厅带书房约136平，主卧约22平。',
    tags: ['带书房', '双卫', '面积宽裕'],
    is_real: true,
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0309_840544',
    world_id: 'w_0309_840544',
    scene_dir: '0309_840544',
    title: '月栖小筑',
    code: '0309',
    layout: '三室一厅',
    area: 85.9,
    price: '320万',
    price_num: 320,
    orientation: '东南',
    floor: '3/11',
    highlight: '三室一厅约86平，总价门槛相对低。',
    tags: ['小三房', '低楼层', '层高2.65米'],
    is_real: true,
    up: 'z',
    voxel: false,
  },
  {
    listing_id: 'listing_0836_841149',
    world_id: 'w_0836_841149',
    scene_dir: '0836_841149',
    title: '澄心雅居',
    code: '0836',
    layout: '三室一厅',
    area: 92.9,
    price: '340万',
    price_num: 340,
    orientation: '南向',
    floor: '15/26',
    highlight: '三室一厅约93平，客餐厨开间约32平。',
    tags: ['客餐厨一体', '三房', '高楼层'],
    is_real: true,
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

export interface ListingQuery {
  layout?: string
  price_min?: number | null
  price_max?: number | null
  q?: string
}

export function filterListingsLocal(rows: WorldListing[], query: ListingQuery = {}): WorldListing[] {
  const layout = (query.layout ?? '').trim()
  const needle = (query.q ?? '').trim().toLowerCase()
  return rows.filter((w) => {
    if (layout && !(w.layout || '').includes(layout)) return false
    const pn = w.price_num
    if (query.price_min != null && (pn == null || pn < query.price_min)) return false
    if (query.price_max != null && (pn == null || pn > query.price_max)) return false
    if (needle) {
      const blob = [w.title, w.code, w.layout, w.highlight, w.orientation, w.floor, ...(w.tags ?? [])].join(' ').toLowerCase()
      if (!blob.includes(needle)) return false
    }
    return true
  })
}

function mapListingRow(row: Record<string, unknown>): WorldListing | null {
  const world_id = String(row.world_id ?? '')
  if (!world_id) return null
  const known = worldListing(world_id)
  const price_num = typeof row.price_num === 'number' ? row.price_num : known?.price_num
  return {
    listing_id: String(row.id ?? known?.listing_id ?? listingIdForWorld(world_id)),
    world_id,
    scene_dir: known?.scene_dir ?? sceneDirForWorld(world_id),
    title: String(row.title ?? known?.title ?? world_id),
    layout: String(row.layout ?? known?.layout ?? ''),
    area: typeof row.area === 'number' ? row.area : (known?.area ?? 0),
    price: String(row.price ?? known?.price ?? ''),
    price_num,
    orientation: String(row.orientation ?? known?.orientation ?? ''),
    floor: String(row.floor ?? known?.floor ?? ''),
    highlight: String(row.highlight ?? known?.highlight ?? ''),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : known?.tags,
    is_real: row.is_real === true || known?.is_real === true,
    floorplan: typeof row.floorplan === 'string' ? row.floorplan : known?.floorplan,
    code: typeof row.code === 'string' && row.code ? row.code : known?.code ?? sceneDirForWorld(world_id).slice(0, 4),
    up: 'z',
    voxel: false,
  }
}

function queryString(query: ListingQuery): string {
  const p = new URLSearchParams()
  const layout = (query.layout ?? '').trim()
  const q = (query.q ?? '').trim()
  if (layout) p.set('layout', layout)
  if (query.price_min != null && Number.isFinite(query.price_min)) p.set('price_min', String(query.price_min))
  if (query.price_max != null && Number.isFinite(query.price_max)) p.set('price_max', String(query.price_max))
  if (q) p.set('q', q)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** 网关 listings（可带筛选）；失败不阻断，用硬编码 5 条再本地过滤。200 + 空列表视为有效空结果。 */
export async function loadListings(query: ListingQuery = {}): Promise<WorldListing[]> {
  const local = () => filterListingsLocal(WORLD_LISTINGS, query)
  if (import.meta.env.VITE_API_MODE !== 'real') return local()
  try {
    const res = await fetch(`${BASE}/api/listings${queryString(query)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { listings?: Array<Record<string, unknown>> }
    const rows = body.listings
    if (!Array.isArray(rows)) throw new Error('listings 无效')
    const mapped = rows.map(mapListingRow).filter((x): x is WorldListing => x != null)
    console.info('[listings] 网关 %d 套', mapped.length)
    return mapped
  } catch (e) {
    console.warn('[listings] 网关失败，用本地过滤兜底', e)
    return local()
  }
}
