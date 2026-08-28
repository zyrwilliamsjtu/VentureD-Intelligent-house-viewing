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

export interface CloudRule {
  /** 平移量：scene→点云为 (x+tx, ty−z, y) */
  tx: number
  ty: number
  label: string
}

/** 世界级对拍规则表（新场景对拍后在此登记） */
export const CLOUD_RULES: Record<string, CloudRule> = {
  w_0330_840483: {
    tx: 0.573,
    ty: 1.087,
    label: 'InteriorGS 0330_840483 · 对拍转正（75/75 实例 <1cm，锚点残差 0.0003m）',
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

export type TpTable = Record<string, V3>

const tpCache = new Map<string, TpTable>()

function tpTableUrl(worldId: string): string | null {
  if (worldId === 'w_0330_840483') return '/mock/real_0330/camera_poses.json'
  return null
}

/** 加载对拍转正的 tp 表；无对应世界返回空表 */
export async function loadTpTable(worldId: string): Promise<TpTable> {
  const hit = tpCache.get(worldId)
  if (hit) return hit
  const url = tpTableUrl(worldId)
  if (!url) return {}
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = (await res.json()) as Record<string, unknown>
    const table: TpTable = {}
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('_')) continue
      if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) {
        table[k] = v as V3
      }
    }
    tpCache.set(worldId, table)
    return table
  } catch (e) {
    console.warn('[coords] tp 表加载失败', worldId, e)
    return {}
  }
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
  if (worldId === 'w_0330_840483') return '/mock/real_0330/scene_graph.json'
  if (worldId === 'w_mock_001') return '/mock/scene_graph.json'
  return null
}

/** 加载场景语义 JSON 的房间 polygon 列表（房间归因用） */
export async function loadRoomPolys(worldId: string): Promise<RoomPoly[]> {
  const hit = roomCache.get(worldId)
  if (hit) return hit
  const url = sceneGraphUrl(worldId)
  if (!url) return []
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const sg = (await res.json()) as { rooms?: Array<{ id: string; polygon?: [number, number][] }> }
    const rooms = (sg.rooms ?? [])
      .filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
      .map((r) => ({ id: r.id, polygon: r.polygon as [number, number][] }))
    roomCache.set(worldId, rooms)
    return rooms
  } catch (e) {
    console.warn('[coords] scene_graph 加载失败', worldId, e)
    return []
  }
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
