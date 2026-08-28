import type { House, HouseObject, V3, Zone } from '../../types/api'

// ==== 数据源：GitHub 仓库 mock/（SPEC v2.1，队友维护，唯一事实源）====
// public/mock/{scene_graph,camera_poses,timeline}.json 从仓库同步（zyrwilliamsjtu/VentureD-Intelligent-house-viewing）
// 运行时 fetch 并映射为内部 House 类型；仓库格式变更只需改本文件
//
// 仓库 scene_graph 坐标约定（coord 块）：米 / Y-up / 右手系 / polygon 在 XZ 平面 / 逆时针
// 注意：渲染层点云是群核 -Y up（OpenCV 系），两套并存——语义坐标用于 HUD/Agent，勿与相机坐标混算

export const REPO_HOUSE_ID = 'w_mock_001'

// ---- 仓库 mock 原始类型（scene_graph.json）----

export interface RepoCoord {
  unit: string
  up: string
  origin: string
  handedness: string
  polygon_axis: string
  polygon_winding: string
}

export interface RepoInstance {
  id: string
  category: string
  position: V3
  bbox3d?: { center: V3; size: V3 }
  tag?: string
  attrs?: Record<string, string>
  confidence?: number
  trajectory_point_id?: string
}

export interface RepoRoom {
  id: string
  type: string
  name: string
  area: number
  polygon: [number, number][]
  adjacent_rooms?: string[]
  trajectory_point_id?: string
  selling_points?: string[]
  story_card: string
  instances: RepoInstance[]
}

export interface RepoSceneGraph {
  world_id: string
  coord: RepoCoord
  house: {
    title: string
    type: string
    total_area: number
    orientation: string
    floor: string
    price: string
    tags: string[]
    facts?: Record<string, string | number>
  }
  rooms: RepoRoom[]
  tour_path: string[]
  topology?: { adjacency: Array<{ from: string; to: string }> }
}

/** camera_poses.json：轨迹点机位（30 秒模拟参数用同一套 tp） */
export type RepoCameraPoses = Record<string, { position: V3; look_at: V3 }>

/** timeline.json：PL 的 30 秒模拟带看时间轴 */
export interface RepoTimeline {
  duration_ms: number
  fps: number
  resolution: string
  segments: Array<{ start_ms: number; end_ms: number; tp_id: string; note: string }>
}

// ---- 加载 + 映射 ----

const BASE = import.meta.env.BASE_URL || '/'

export interface RepoScene {
  scene: RepoSceneGraph
  poses: RepoCameraPoses
  /** 0330 真实场景无 timeline（PL 带看脚本仅 w_mock_001 有），可能为 null */
  timeline: RepoTimeline | null
}

const scenePromises = new Map<string, Promise<RepoScene>>()

/** world → public/mock 子目录：0330 真实场景在 real_0330/，根目录为 w_mock_001 */
export function mockSubdir(worldId: string): string {
  return worldId === 'w_0330_840483' ? 'real_0330/' : ''
}

async function fetchJson<T>(name: string): Promise<T> {
  const r = await fetch(`${BASE}mock/${name}`)
  if (!r.ok) throw new Error(`mock/${name} 加载失败 HTTP ${r.status}`)
  return (await r.json()) as T
}

/** 拉取仓库三件套（并行，按 world 缓存；timeline 缺失置 null 不算失败） */
export function loadRepoScene(worldId: string = REPO_HOUSE_ID): Promise<RepoScene> {
  let p = scenePromises.get(worldId)
  if (!p) {
    const sub = mockSubdir(worldId)
    p = Promise.all([
      fetchJson<RepoSceneGraph>(`${sub}scene_graph.json`),
      fetchJson<RepoCameraPoses>(`${sub}camera_poses.json`),
      // timeline 仅根目录 mock 有；0330 缺失是正常形态（降级 null，调用方自判）
      fetchJson<RepoTimeline>(`${sub}timeline.json`).catch(() => null),
    ]).then(([scene, poses, timeline]) => ({ scene, poses, timeline }))
    scenePromises.set(worldId, p)
  }
  return p
}

const houseCacheByWorld = new Map<string, House>()

/** 仓库 scene_graph → 前端 House（HUD / Agent 上下文用）。
 *  poses 可空（网关 /api/scene 拿到的 scene 无随附机位时 zone.camera 自然缺省）；
 *  兼容两种 pose 形态：根目录 {position,look_at} 与 0330 纯 V3（后者无机位朝向，跳过）。 */
export function houseFromSceneGraph(scene: RepoSceneGraph, poses?: RepoCameraPoses): House {
  const zonePose = (tpId?: string): { pos: V3; target: V3 } | undefined => {
    if (!tpId || !poses) return undefined
    const tp = poses[tpId] as Partial<{ position: V3; look_at: V3 }> | V3 | undefined
    // 仅根目录 {position, look_at} 形态有机位；0330 纯 V3 表无朝向，跳过
    if (!tp || Array.isArray(tp) || !tp.position || !tp.look_at) return undefined
    return { pos: tp.position, target: tp.look_at }
  }

  const zones: Zone[] = scene.rooms.map((r) => ({
    id: r.id,
    label: r.name,
    area_m2: r.area,
    polygon: r.polygon,
    camera: zonePose(r.trajectory_point_id),
    story_card: r.story_card,
  }))

  const objects: HouseObject[] = scene.rooms.flatMap((r) =>
    r.instances.map((i) => ({
      id: i.id,
      class: i.category,
      tag: i.tag,
      zone_id: r.id,
      bbox3d: i.bbox3d ?? { center: i.position, size: [0.5, 0.5, 0.5] },
      attrs: i.attrs,
      confidence: i.confidence,
    })),
  )

  // 由房间多边形包络推户型尺寸（XZ 平面，米）
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const z of scene.rooms) {
    for (const [x, zz] of z.polygon) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, zz); maxZ = Math.max(maxZ, zz)
    }
  }
  const ceiling = Number(scene.house.facts?.ceiling_height) || 2.8

  return {
    id: scene.world_id,
    meta: {
      title: scene.house.title,
      area: scene.house.total_area,
      orientation: scene.house.orientation,
      floor: scene.house.floor,
      price: scene.house.price,
      tags: scene.house.tags,
    },
    model: {
      url: '', // 点云直链走 VITE_AHOLO_LOD_META_URL，语义模型无独立 GLB
      format: 'pointcloud',
      up_axis: scene.coord?.up ?? 'Y',
      bounds: { size: [maxX - minX, ceiling, maxZ - minZ] },
    },
    zones,
    objects,
    tour_path: scene.tour_path,
  }
}

let lastHouse: House | null = null

/** 本地 mock 数据加载入口（按 world 缓存）；HUD/Agent 语义兜底数据源 */
export async function loadRepoHouse(worldId: string = REPO_HOUSE_ID): Promise<House> {
  const hit = houseCacheByWorld.get(worldId)
  if (hit) return hit
  const { scene, poses } = await loadRepoScene(worldId)
  const h = houseFromSceneGraph(scene, poses)
  houseCacheByWorld.set(worldId, h)
  lastHouse = h
  return h
}

/** 最近一次加载的 House（未加载返回 null）——旧 mock 问答模块用 */
export function getLoadedHouse(): House | null {
  return lastHouse
}
