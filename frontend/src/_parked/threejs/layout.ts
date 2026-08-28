import type { House, HouseObject, Zone } from '../types/api'

// ==== 布局几何层：程序化户型的墙体/碰撞/房间检测 ====
// 数据源是 scene JSON（services/mock/data.ts）；后续接入群核点云后，
// 本模块连同 ApartmentModel 可整体替换为 aholo-viewer（自带步行漫游）。

export const WALL_H = 2.8
export const WALL_T = 0.12
const DOOR_W = 1.15 // 内墙门洞宽（米）
const DOOR_POS = 0.38 // 门洞中心在墙段上的比例位置

export interface HouseExtents {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  cx: number
  cz: number
  width: number
  depth: number
}

export function houseExtents(house: House | null): HouseExtents {
  const fallback: HouseExtents = { minX: 0, maxX: 10, minZ: 0, maxZ: 8, cx: 5, cz: 4, width: 10, depth: 8 }
  if (!house || house.zones.length === 0) return fallback
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const z of house.zones) {
    for (const [x, zz] of z.polygon) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, zz)
      maxZ = Math.max(maxZ, zz)
    }
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ }
}

export function zoneCenterOf(zone: Zone): [number, number] {
  let cx = 0
  let cz = 0
  for (const [x, z] of zone.polygon) {
    cx += x
    cz += z
  }
  return [cx / zone.polygon.length, cz / zone.polygon.length]
}

export function zoneAreaOf(zone: Zone): number {
  if (zone.area_m2 != null) return zone.area_m2
  let a = 0
  const p = zone.polygon
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]
    const [x2, z2] = p[(i + 1) % p.length]
    a += x1 * z2 - x2 * z1
  }
  return Math.round(Math.abs(a / 2))
}

// ---- 墙体：多边形边 → 去重 → 内墙开门口 ----

export interface WallBox {
  key: string
  cx: number
  cz: number
  w: number // x 方向尺寸
  d: number // z 方向尺寸
}

interface EdgeInfo {
  x1: number
  z1: number
  x2: number
  z2: number
  count: number // 被几个分区共享；>=2 即内墙
}

function collectEdges(zones: Zone[]): Map<string, EdgeInfo> {
  const map = new Map<string, EdgeInfo>()
  const r2 = (n: number) => Math.round(n * 100) / 100
  for (const z of zones) {
    const pts = z.polygon
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i]
      const [x2, z2] = pts[(i + 1) % pts.length]
      const a = `${r2(x1)},${r2(z1)}`
      const b = `${r2(x2)},${r2(z2)}`
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const e = map.get(key)
      if (e) {
        e.count++
      } else {
        map.set(key, { x1, z1, x2, z2, count: 1 })
      }
    }
  }
  return map
}

/** 轴对齐墙段：返回沿主轴的 [lo, hi] 与轴向；非轴对齐返回 null */
function axisSpan(e: EdgeInfo): { axis: 'x' | 'z'; lo: number; hi: number; fixed: number } | null {
  const eps = 0.01
  if (Math.abs(e.z1 - e.z2) < eps) {
    const lo = Math.min(e.x1, e.x2)
    const hi = Math.max(e.x1, e.x2)
    return { axis: 'x', lo, hi, fixed: e.z1 }
  }
  if (Math.abs(e.x1 - e.x2) < eps) {
    const lo = Math.min(e.z1, e.z2)
    const hi = Math.max(e.z1, e.z2)
    return { axis: 'z', lo, hi, fixed: e.x1 }
  }
  return null // 斜墙（mock 无；保守处理为不开门）
}

function segBox(axis: 'x' | 'z', lo: number, hi: number, fixed: number, key: string): WallBox {
  return axis === 'x'
    ? { key, cx: (lo + hi) / 2, cz: fixed, w: hi - lo + WALL_T, d: WALL_T }
    : { key, cx: fixed, cz: (lo + hi) / 2, w: WALL_T, d: hi - lo + WALL_T }
}

export function buildWallBoxes(zones: Zone[]): WallBox[] {
  const edges = collectEdges(zones)
  const out: WallBox[] = []
  let i = 0
  for (const e of edges.values()) {
    const key = `w${i++}`
    const span = axisSpan(e)
    if (!span) {
      // 斜墙：用两端点外接盒（保守）
      const minX = Math.min(e.x1, e.x2) - WALL_T
      const maxX = Math.max(e.x1, e.x2) + WALL_T
      const minZ = Math.min(e.z1, e.z2) - WALL_T
      const maxZ = Math.max(e.z1, e.z2) + WALL_T
      out.push({ key, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ })
      continue
    }
    const { axis, lo, hi, fixed } = span
    const len = hi - lo
    const inner = e.count >= 2
    if (!inner || len < DOOR_W + 0.9) {
      out.push(segBox(axis, lo, hi, fixed, key))
      continue
    }
    // 内墙 → 开门洞
    const center = Math.min(Math.max(lo + len * DOOR_POS, lo + DOOR_W / 2 + 0.4), hi - DOOR_W / 2 - 0.4)
    const dLo = center - DOOR_W / 2
    const dHi = center + DOOR_W / 2
    out.push(segBox(axis, lo, dLo, fixed, `${key}a`))
    out.push(segBox(axis, dHi, hi, fixed, `${key}b`))
  }
  return out
}

// ---- 碰撞 ----

export interface Aabb {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function wallAabbs(walls: WallBox[]): Aabb[] {
  return walls.map((w) => ({
    minX: w.cx - w.w / 2,
    maxX: w.cx + w.w / 2,
    minZ: w.cz - w.d / 2,
    maxZ: w.cz + w.d / 2,
  }))
}

export function objectAabbs(objects: HouseObject[]): Aabb[] {
  return objects.map((o) => {
    const [cx, , cz] = o.bbox3d.center
    const [sx, sy, sz] = o.bbox3d.size
    if (sy < 0.35) return null // 地毯等低矮物不挡路
    return {
      minX: cx - sx / 2,
      maxX: cx + sx / 2,
      minZ: cz - sz / 2,
      maxZ: cz + sz / 2,
    }
  }).filter((a): a is Aabb => a !== null)
}

// ---- 房间检测 ----

export function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function zoneAt(house: House, x: number, z: number): Zone | null {
  for (const zone of house.zones) {
    if (pointInPolygon(x, z, zone.polygon)) return zone
  }
  return null
}

// ---- 出生点：带看动线第一站的分区中心，面向第二站 ----

export interface Spawn {
  x: number
  z: number
  yaw: number
  zoneId: string
}

export function spawnPoint(house: House, blocked: (x: number, z: number) => boolean): Spawn | null {
  const pathZones = house.tour_path
    .map((id) => house.zones.find((z) => z.id === id))
    .filter((z): z is Zone => !!z)
  const first = pathZones[0] ?? house.zones[0]
  const next = pathZones[1] ?? null
  if (!first) return null

  const [cx, cz] = zoneCenterOf(first)
  // 中心被家具占住时按螺旋偏移找空位
  const offsets = [0, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5]
  let sx = cx
  let sz = cz
  outer: for (const dx of offsets) {
    for (const dz of offsets) {
      if (!blocked(cx + dx, cz + dz)) {
        sx = cx + dx
        sz = cz + dz
        break outer
      }
    }
  }

  let yaw = 0
  if (next) {
    const [nx, nz] = zoneCenterOf(next)
    // three.js 相机 yaw=0 朝 -Z；forward = (-sin yaw, -cos yaw)
    yaw = Math.atan2(-(nx - sx), -(nz - sz))
  }
  return { x: sx, z: sz, yaw, zoneId: first.id }
}
