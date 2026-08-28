// ==== 群核 Aholo 开放平台客户端（接入层，Key 从 .env.local 读取）====
// 文档：docs/aholo-kb/openapi.yaml · 平台 https://labs.aholo3d.cn
// 鉴权：Header「Authorization: <API key>」直传，无 Bearer 前缀
//
// 接入路线（对接第一人称漫游）：
// 1. 在 studio.aholo3d.cn 上传/重建房源 → 拿到 worldId
// 2. listWorlds() 找到目标世界 → getWorld(worldId) 拿 assets.splats.urls（ply/spz）
// 3. 用 Aholo Viewer（https://aholojs.dev，MIT 开源 3DGS 渲染器）加载点云，
//    替换 SceneCanvas 里的 <ApartmentModel>；Viewer 自带第一人称行走 + 体素碰撞
//
// ⚠️ CORS：若网关未放行浏览器直调，在 vite.config.ts 加 /aholo 代理转发即可

const GATEWAY = import.meta.env.VITE_AHOLO_GATEWAY || 'https://api.aholo3d.cn'
const API_KEY = import.meta.env.VITE_AHOLO_API_KEY || ''

export const aholoReady = API_KEY !== ''

export class AholoApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(`[Aholo ${status}] ${code}: ${message}`)
    this.name = 'AholoApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!aholoReady) throw new AholoApiError(401, 'NO_API_KEY', '未配置 VITE_AHOLO_API_KEY（见 .env.example）')

  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data as { code?: number; message?: string; status?: string } | null
    throw new AholoApiError(res.status, e?.status ?? 'UNKNOWN', e?.message ?? res.statusText)
  }
  return data as T
}

// ---- 类型（对齐 openapi.yaml 的 World 模型，只声明前端用到的字段）----

export interface AholoWorldSummary {
  worldId: string
  name: string
  cover?: string
  scene?: 'space' | 'model' | string
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | string
  progress?: number
  createTime?: number
  updateTime?: number
}

export interface AholoWorldDetail extends AholoWorldSummary {
  /** 重建产物：splat 点云下载地址（ply/spz）与 LOD 分块元数据 */
  assets?: {
    splats?: {
      urls?: {
        ply?: string
        spz?: string
        /** chunk-level LoD 分块元数据（大场景流式加载用） */
        lodMetaPath?: string
      }
    }
    /** AI 生成世界的全景图 */
    imagery?: { panoUrl?: string }
  }
}

interface WorldListResp {
  pageNum: number
  pageSize: number
  count: number
  totalCount: number
  hasMore: boolean
  result: AholoWorldSummary[]
}

// ---- 接口 ----

/** AI 生成 3DGS 世界（Spatial Gen）：纯文案或文案+1张图；室内场景效果最成熟 */
export function generateWorld(name: string, prompt: string, imageUrl?: string): Promise<{ worldId: string }> {
  return request<{ worldId: string }>('/world/v1/generations', {
    method: 'POST',
    body: JSON.stringify({
      name,
      prompt,
      ...(imageUrl ? { resources: [{ url: imageUrl, type: 'image' }] } : {}),
    }),
  })
}

/** 照片/视频重建 3DGS 世界（需先上传素材拿 URL：asset upload 或自行托管） */
export function reconstructWorld(name: string, resources: { url: string; type?: 'image' | 'video' | 'insv' }[]): Promise<{ worldId: string }> {
  return request<{ worldId: string }>('/world/v1/reconstructions', {
    method: 'POST',
    body: JSON.stringify({ name, resources }),
  })
}

/** 分页查询当前账号下的 3DGS 世界列表 */
export function listWorlds(pageNum = 0, pageSize = 20): Promise<WorldListResp> {
  return request<WorldListResp>('/world/v1/list', {
    method: 'POST',
    body: JSON.stringify({ pageNum, pageSize }),
  })
}

/** 查询世界详情（含 splat 点云下载地址） */
export function getWorld(worldId: string): Promise<AholoWorldDetail> {
  return request<AholoWorldDetail>(`/world/v1/${encodeURIComponent(worldId)}`)
}

/** 拉到第一个重建成功的世界的点云地址（黑赛快捷路径） */
export async function firstSplatUrl(): Promise<{ worldId: string; url: string } | null> {
  const list = await listWorlds(0, 20)
  for (const w of list.result) {
    if (w.status !== 'SUCCEEDED') continue
    const d = await getWorld(w.worldId)
    const u = d.assets?.splats?.urls
    const url = u?.spz || u?.ply
    if (url) return { worldId: w.worldId, url }
  }
  return null
}
