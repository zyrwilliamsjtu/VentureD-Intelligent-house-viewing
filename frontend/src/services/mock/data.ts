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

async function fetchJson<T>(name: string): Promise<T> {
  const r = await fetch(`${BASE}mock/${name}`)
  if (!r.ok) throw new Error(`mock/${name} 加载失败 HTTP ${r.status}`)
  return (await r.json()) as T
}

export interface RepoScene {
  scene: RepoSceneGraph
  poses: RepoCameraPoses
  timeline: RepoTimeline
}

let scenePromise: Promise<RepoScene> | null = null

/** 拉取仓库三件套（并行，带缓存） */
export function loadRepoScene(): Promise<RepoScene> {
  if (!scenePromise) {
    scenePromise = Promise.all([
      fetchJson<RepoSceneGraph>('scene_graph.json'),
      fetchJson<RepoCameraPoses>('camera_poses.json'),
      fetchJson<RepoTimeline>('timeline.json'),
    ]).then(([scene, poses, timeline]) => ({ scene, poses, timeline }))
  }
  return scenePromise
}

let cachedHouse: House | null = null

/** 仓库 scene_graph → 前端 House（HUD / Agent 上下文用） */
export async function loadRepoHouse(): Promise<House> {
  if (cachedHouse) return cachedHouse
  const { scene, poses } = await loadRepoScene()

  const zones: Zone[] = scene.rooms.map((r) => {
    const tp = r.trajectory_point_id ? poses[r.trajectory_point_id] : undefined
    return {
      id: r.id,
      label: r.name,
      area_m2: r.area,
      polygon: r.polygon,
      camera: tp ? { pos: tp.position, target: tp.look_at } : undefined,
      story_card: r.story_card,
    }
  })

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

  cachedHouse = {
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
  return cachedHouse
}

/** 已加载的 House（未加载返回 null）——旧 mock 问答模块用 */
export function getLoadedHouse(): House | null {
  return cachedHouse
}
