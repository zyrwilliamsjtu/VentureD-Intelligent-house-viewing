import type { House, V3, Zone, HouseObject } from '../types/api'
import { useAppStore } from '../store/useAppStore'

// ==== 镜头指令执行器：后端 actions[] → 前端状态变化 ====
// 契约：未知 type 直接忽略；actions 可为空数组

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

/** 分区中心（地面投影） */
export function zoneCenterOf(zone: Zone): [number, number] {
  let cx = 0
  let cz = 0
  for (const [x, z] of zone.polygon) {
    cx += x
    cz += z
  }
  return [cx / zone.polygon.length, cz / zone.polygon.length]
}

/** 分区面积：优先用后端 area_m2，缺省按多边形鞋带公式计算 */
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

function camForZone(zone: Zone): { pos: V3; target: V3 } {
  if (zone.camera) return { pos: zone.camera.pos, target: zone.camera.target }
  // 无预置机位时自动计算：从分区南侧上方看
  let cx = 0
  let cz = 0
  for (const [x, z] of zone.polygon) {
    cx += x
    cz += z
  }
  cx /= zone.polygon.length
  cz /= zone.polygon.length
  return { pos: [cx, 5.8, cz + 3.4], target: [cx, 0.4, cz] }
}

function camForObject(o: HouseObject): { pos: V3; target: V3 } {
  const [cx, cy, cz] = o.bbox3d.center
  const size = o.bbox3d.size
  const maxDim = Math.max(size[0], size[1], size[2])
  const d = maxDim * 1.9 + 0.9
  // 固定斜上方视角推近
  const pos: V3 = [cx + d * 0.55, cy + d * 0.7, cz + d * 0.75]
  return { pos, target: [cx, cy, cz] }
}

function camOverview(house: House | null): { pos: V3; target: V3 } {
  const e = houseExtents(house)
  const span = Math.max(e.width, e.depth)
  return { pos: [e.cx + span * 0.35, span * 1.15, e.cz + span * 0.85], target: [e.cx, 0, e.cz] }
}

export function executeActions(actions: import('../types/api').CameraAction[] = []): void {
  const s = useAppStore.getState()
  const house = s.house

  for (const a of actions) {
    switch (a.type) {
      case 'fly_to_zone': {
        const zone = house?.zones.find((z) => z.id === a.zone_id)
        if (!zone) break
        const { pos, target } = camForZone(zone)
        s.setZone(zone.id)
        s.flyTo(pos, target)
        break
      }
      case 'focus_object': {
        const obj = house?.objects.find((o) => o.id === a.object_id)
        if (!obj) break
        const { pos, target } = camForObject(obj)
        s.setFocus(obj.id)
        s.setZone(obj.zone_id)
        s.flyTo(pos, target)
        break
      }
      case 'highlight': {
        const t = a.target
        s.setHighlight(t)
        const dur = a.duration_ms ?? 3000
        setTimeout(() => {
          if (useAppStore.getState().highlightedTarget === t) useAppStore.getState().setHighlight(null)
        }, dur)
        break
      }
      case 'set_tour_index': {
        s.setTour(useAppStore.getState().tourState, a.index)
        break
      }
      case 'overview': {
        const { pos, target } = camOverview(house)
        s.setZone(null)
        s.setFocus(null)
        s.flyTo(pos, target)
        break
      }
      default:
        break // 未知指令忽略，保证向后兼容
    }
  }
}

export { camForZone, camForObject, camOverview }
