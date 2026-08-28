// ==== scene(Y-up) ↔ 点云坐标系 映射层（对拍转正 · 2026-08-28）====
//
// 对拍结论（docs/0330-align-report.md，labels.json 500 实例交叉验证）：
//   点云 = IG 原生坐标系：右手系、Z-up（地板 z≈0，层高 2.8m）、米
//   scene = Y-up、原点 house_center
//
//   scene(x,y,z) → 点云:  [ x + 0.573, 1.087 − z, y ]
//   点云(X,Y,Z) → scene:   [ X − 0.573, Z, 1.087 − Y ]
//
// ⚠️ 旧草稿 "(x,-y,z) 纯 Y 翻转" 已作废；旧 camera_poses.json 全量重算。
// 映射按 world_id 索引：只有对拍过的世界才有非恒等映射，未对拍世界恒等返回。

import type { V3 } from '../types/api'

/** 静态资源根：跟随 vite base（'./' 部署在 GitHub Pages 子路径也能命中，勿写死 '/mock/...' 绝对路径） */
const ASSET_BASE = import.meta.env.BASE_URL || '/'

export interface CloudRule {
  /** 平移量：scene→点云为 (x+tx, ty−z, y) */
  tx: number
  ty: number
  label: string
  /** 点云竖直轴：'z' = IG 原生 Z-up（0330 实测，地板 z≈0）；缺省 'y'（旧素材） */
  up?: 'y' | 'z'
  /** 体素碰撞帧是否与点云同帧（0330 实测不同帧，禁用防相机被推出场景） */
  voxel?: boolean
}

/** 世界级对拍规则表（新场景对拍后在此登记）
 *  tx/ty 来自各套 mock/{scene}/origin.json（与 SOURCE.md、docs/FE_房源列表联调指南 §3.5 一致）：
 *    scene(x,y,z) → 点云 [x+tx, ty−z, y]；点云均为 InteriorGS 原生 Z-up。
 *  禁止把 0330 的 0.573/1.087 套到其它世界。 */
export const CLOUD_RULES: Record<string, CloudRule> = {
  w_0330_840483: {
    tx: 0.573,
    ty: 1.087,
    label: 'InteriorGS 0330_840483 · 对拍转正（75/75 实例 <1cm，锚点残差 0.0003m）',
    up: 'z',
    voxel: false,
  },
  w_0469_840829: {
    tx: 2.839056,
    ty: -3.219509,
    label: 'InteriorGS 0469_840829 · origin.json ox/oz（10/10 房间、75/75 实例 <1cm）',
    up: 'z',
    voxel: false,
  },
  w_0259_840804: {
    tx: -2.768704,
    ty: -5.238312,
    label: 'InteriorGS 0259_840804 · origin.json ox/oz（10/10 房间、88/88 实例 <1cm）',
    up: 'z',
    voxel: false,
  },
  w_0309_840544: {
    tx: -3.938458,
    ty: -0.707424,
    // 出生点：z-up 世界用 tp_living（点云同帧；0309/0836 复用已对拍 tp_kitchen）
    label: 'InteriorGS 0309_840544 · origin.json ox/oz（10/10 房间、93/93 实例 <1cm）',
    up: 'z',
    voxel: false,
  },
  w_0836_841149: {
    tx: 0.314266,
    ty: -0.446865,
    // 出生点：z-up 世界用 tp_living（点云同帧；0309/0836 复用已对拍 tp_kitchen）
    label: 'InteriorGS 0836_841149 · origin.json ox/oz（10/10 房间、86/86 实例 <1cm）',
    up: 'z',
    voxel: false,
  },
}

export function cloudRuleFor(worldId: string): CloudRule | null {
  return CLOUD_RULES[worldId] ?? null
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000

/** scene(Y-up) → 点云。未对拍世界恒等返回（调用方需自知，勿混算） */
export function sceneToCloud(p: V3, worldId: string): V3 {
  const r = cloudRuleFor(worldId)
  if (!r) return [p[0], p[1], p[2]]
  return [r3(p[0] + r.tx), r3(r.ty - p[2]), r3(p[1])]
}

/** 点云 → scene(Y-up)。未对拍世界恒等返回 */
export function cloudToScene(p: V3, worldId: string): V3 {
  const r = cloudRuleFor(worldId)
  if (!r) return [p[0], p[1], p[2]]
  return [r3(p[0] - r.tx), r3(p[2]), r3(r.ty - p[1])]
}

/** 方向向量 scene → 点云（线性部分，无平移）：(dx,dy,dz) → (dx, −dz, dy) */
export function dirSceneToCloud(d: V3): V3 {
  return [d[0], -d[2], d[1]]
}

/** 方向向量 点云 → scene：(dX,dY,dZ) → (dX, dZ, −dY) */
export function dirCloudToScene(d: V3): V3 {
  return [d[0], d[2], -d[1]]
}

// ==== tp_id → 点云坐标表（对拍转正产物）====
// PI 决策 3（2026-08-28）：优先后端网关 GET /api/camera_poses/{world_id}（85 条对拍转正 poses），
// 网关不可用 / 非 real 模式才 fallback 到 public/mock 本地表（同一份对拍产物，内容一致）。

export type TpTable = Record<string, V3>

const tpCache = new Map<string, TpTable>()

/** 网关 BASE：空 = 同源（dev 走 vite proxy /api）；与 agent.ts / asr.ts 同策略 */
const GATEWAY_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** 任意 Record → 只保留 tp_id → V3 项（过滤 _note 等文档键与非坐标值） */
function toV3Table(raw: Record<string, unknown>): TpTable {
  const table: TpTable = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue
    if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) {
      table[k] = v as V3
    }
  }
  return table
}

/** 主路径：GET /api/camera_poses/{world_id} → { world_id, poses }（5s 超时，启动不被卡死） */
async function tpFromGateway(worldId: string): Promise<TpTable> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5_000)
  try {
    const res = await fetch(`${GATEWAY_BASE}/api/camera_poses/${encodeURIComponent(worldId)}`, {
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { poses?: Record<string, unknown> }
    if (!body?.poses || typeof body.poses !== 'object') throw new Error('响应缺 poses 字段')
    const table = toV3Table(body.poses)
    if (!Object.keys(table).length) throw new Error('poses 为空表')
    console.info('[coords] tp 表（网关）%s · %d 点', worldId, Object.keys(table).length)
    return table
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('camera_poses 超时(5s)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function localTpTableUrl(worldId: string): string | null {
  if (worldId === 'w_0330_840483') return `${ASSET_BASE}mock/real_0330/camera_poses.json`
  return null
}

/** fallback：public/mock 本地表（对拍转正产物，与网关数据同源） */
async function tpFromLocal(worldId: string): Promise<TpTable> {
  const url = localTpTableUrl(worldId)
  if (!url) return {}
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const table = toV3Table((await res.json()) as Record<string, unknown>)
    if (Object.keys(table).length) {
      console.info('[coords] tp 表（本地 fallback）%s · %d 点', worldId, Object.keys(table).length)
    }
    return table
  } catch (e) {
    console.warn('[coords] 本地 tp 表加载失败', worldId, e)
    return {}
  }
}

/** 加载对拍转正的 tp 表：real 先网关、失败降级本地；mock 直连本地；无对应世界返回空表 */
export async function loadTpTable(worldId: string): Promise<TpTable> {
  const hit = tpCache.get(worldId)
  if (hit) return hit
  let table: TpTable | null = null
  if (import.meta.env.VITE_API_MODE === 'real') {
    try {
      table = await tpFromGateway(worldId)
    } catch (e) {
      console.warn('[coords] 网关 camera_poses 失败 → 降级本地 mock', e)
    }
  }
  if (!table) table = await tpFromLocal(worldId)
  if (Object.keys(table).length) tpCache.set(worldId, table)
  return table
}

// ==== 房间归因（scene 系 XZ 平面 point-in-polygon）====

export interface RoomPoly {
  id: string
  polygon: [number, number][]
}

export function roomAtScene(posScene: V3, rooms: RoomPoly[]): string | null {
  const px = posScene[0]
  const pz = posScene[2]
  for (const r of rooms) {
    if (!r.polygon?.length) continue
    let inside = false
    const n = r.polygon.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, zi] = r.polygon[i]
      const [xj, zj] = r.polygon[j]
      if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
        inside = !inside
      }
    }
    if (inside) return r.id
  }
  return null
}

/** 点云坐标 → 所属房间 id（未对拍世界返回 null，符合契约 room_id 恒 null 降级） */
export function roomAtCloud(posCloud: V3, worldId: string, rooms: RoomPoly[]): string | null {
  if (!cloudRuleFor(worldId)) return null
  return roomAtScene(cloudToScene(posCloud, worldId), rooms)
}

const roomCache = new Map<string, RoomPoly[]>()

function sceneGraphUrl(worldId: string): string | null {
  if (worldId === 'w_0330_840483') return `${ASSET_BASE}mock/real_0330/scene_graph.json`
  if (worldId === 'w_mock_001') return `${ASSET_BASE}mock/scene_graph.json`
  return null
}

function roomsFromSceneGraph(sg: { rooms?: Array<{ id: string; polygon?: [number, number][] }> }): RoomPoly[] {
  return (sg.rooms ?? [])
    .filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
    .map((r) => ({ id: r.id, polygon: r.polygon as [number, number][] }))
}

/** 网关 GET /api/scene/{world_id}（5 套真实 polygon 的主路径） */
async function roomsFromGateway(worldId: string): Promise<RoomPoly[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8_000)
  try {
    const res = await fetch(`${GATEWAY_BASE}/api/scene/${encodeURIComponent(worldId)}`, {
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const sg = (await res.json()) as { rooms?: Array<{ id: string; polygon?: [number, number][] }> }
    return roomsFromSceneGraph(sg)
  } finally {
    clearTimeout(timer)
  }
}

/** 加载场景语义 JSON 的房间 polygon 列表（房间归因用）
 *  0330/mock 仍走 public（不改变既有路径）；其它 4 套无本地副本 → GET /api/scene。 */
export async function loadRoomPolys(worldId: string): Promise<RoomPoly[]> {
  const hit = roomCache.get(worldId)
  if (hit) return hit
  let rooms: RoomPoly[] = []
  const localUrl = sceneGraphUrl(worldId)
  if (localUrl) {
    try {
      const res = await fetch(localUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      rooms = roomsFromSceneGraph(
        (await res.json()) as { rooms?: Array<{ id: string; polygon?: [number, number][] }> },
      )
    } catch (e) {
      console.warn('[coords] scene_graph 本地加载失败', worldId, e)
    }
  }
  if (!rooms.length) {
    try {
      rooms = await roomsFromGateway(worldId)
      if (rooms.length) {
        console.info('[coords] rooms（网关）%s · %d', worldId, rooms.length)
      }
    } catch (e) {
      console.warn('[coords] 网关 scene_graph 失败', worldId, e)
    }
  }
  if (rooms.length) roomCache.set(worldId, rooms)
  return rooms
}

// ==== Agent 动作解析（teleport 优先 tp_id，其次 position）====

export interface TeleportTargetLike {
  tp_id?: string
  position?: V3
  label?: string
}

/**
 * 把 Agent 的 teleport 动作解析为点云落点。
 * position 按 Agent 契约已是点云系，直接用；tp_id 查转正 tp 表。
 * 都缺失/查不到 → null（调用方降级为纯文本）。
 */
export async function resolveTeleportCloud(
  target: TeleportTargetLike,
  worldId: string,
): Promise<{ position: V3; label?: string } | null> {
  if (Array.isArray(target.position) && target.position.length === 3) {
    return { position: target.position as V3, label: target.label }
  }
  if (target.tp_id) {
    const table = await loadTpTable(worldId)
    const pos = table[target.tp_id]
    if (pos) return { position: pos, label: target.label ?? target.tp_id }
  }
  return null
}

/** 实例 tp：`tp_sofa_417`；房间级：`tp_living` / `tp_bedroom_master` */
export function isInstanceTpId(tpId: string | undefined | null): boolean {
  return !!tpId && /^tp_[a-z]+(?:_[a-z]+)*_\d+$/.test(tpId)
}

function roomCentroidScene(poly: [number, number][]): V3 | null {
  if (!poly.length) return null
  let sx = 0
  let sz = 0
  for (const [x, z] of poly) {
    sx += x
    sz += z
  }
  const n = poly.length
  return [sx / n, 0, sz / n]
}

/**
 * 实例观察位：沿「实例 → 房间中心」退 2m，站姿 z=0.5（与房间锚点同档）。
 * 观察位不在该房间 polygon 内 → 落到房间中心，仍 lookAt 实例。
 */
export async function resolveObserveCloud(
  instanceTp: string,
  worldId: string,
): Promise<{ stand: V3; lookAt: V3; fallback: boolean } | null> {
  const table = await loadTpTable(worldId)
  const inst = table[instanceTp]
  if (!inst) return null
  const rooms = await loadRoomPolys(worldId)
  const roomId = roomAtCloud(inst, worldId, rooms)
  const host = rooms.find((r) => r.id === roomId)
  const centerScene = host ? roomCentroidScene(host.polygon) : null
  const center = centerScene ? sceneToCloud(centerScene, worldId) : null
  const lookAt: V3 = inst
  const dist = 2.0
  let stand: V3 = [inst[0], inst[1], 0.5]
  let fallback = true
  if (center) {
    const dx = center[0] - inst[0]
    const dy = center[1] - inst[1]
    const len = Math.hypot(dx, dy)
    if (len > 0.08) {
      stand = [r3(inst[0] - (dx / len) * dist), r3(inst[1] - (dy / len) * dist), 0.5]
      fallback = false
    }
  }
  if (roomId && !fallback) {
    const inside = roomAtCloud(stand, worldId, rooms) === roomId
    if (!inside) fallback = true
  }
  if (fallback) {
    if (center) stand = [r3(center[0]), r3(center[1]), 0.5]
    else stand = [inst[0], inst[1], 0.5]
  }
  return { stand, lookAt, fallback }
}

/** 房间级 tp：`tp_living` / `tp_bedroom_master`（非实例） */
export function isRoomTpId(tpId: string | undefined | null): boolean {
  return !!tpId && tpId.startsWith('tp_') && !isInstanceTpId(tpId)
}

/**
 * 房间导航朝向：站锚点，lookAt 房间 polygon 质心（面向屋内，避免面壁）。
 * 锚点已在中心 → 朝屋子中心再看一点；polygon 不可用 → 朝屋子中心。
 */
export async function resolveRoomLookAt(
  roomTp: string,
  worldId: string,
): Promise<{ stand: V3; lookAt: V3 } | null> {
  const table = await loadTpTable(worldId)
  const stand = table[roomTp]
  if (!stand) return null
  const rooms = await loadRoomPolys(worldId)
  const guessedId = roomTp.startsWith('tp_') ? `room_${roomTp.slice(3)}` : roomTp
  const byCloud = roomAtCloud(stand, worldId, rooms)
  const host = rooms.find((r) => r.id === byCloud) || rooms.find((r) => r.id === guessedId)
  const centers = rooms
    .map((r) => {
      const sc = roomCentroidScene(r.polygon)
      return sc ? sceneToCloud(sc, worldId) : null
    })
    .filter((c): c is V3 => !!c)
  let house: V3 | null = null
  if (centers.length) {
    house = [
      centers.reduce((s, c) => s + c[0], 0) / centers.length,
      centers.reduce((s, c) => s + c[1], 0) / centers.length,
      0.5,
    ]
  }
  const centerScene = host ? roomCentroidScene(host.polygon) : null
  const center = centerScene ? sceneToCloud(centerScene, worldId) : house
  const eye = stand[2]
  if (!center) {
    const target = house ?? ([stand[0] + 1.2, stand[1], eye] as V3)
    return { stand, lookAt: [r3(target[0]), r3(target[1]), eye] }
  }
  const dx = center[0] - stand[0]
  const dy = center[1] - stand[1]
  const len = Math.hypot(dx, dy)
  let lookAt: V3
  if (len > 0.35) {
    lookAt = [r3(center[0]), r3(center[1]), eye]
  } else {
    let nx = 1
    let ny = 0
    if (house) {
      const hx = house[0] - stand[0]
      const hy = house[1] - stand[1]
      const hl = Math.hypot(hx, hy)
      if (hl > 0.08) {
        nx = hx / hl
        ny = hy / hl
      }
    }
    lookAt = [r3(stand[0] + nx * 1.6), r3(stand[1] + ny * 1.6), eye]
  }
  return { stand, lookAt }
}
