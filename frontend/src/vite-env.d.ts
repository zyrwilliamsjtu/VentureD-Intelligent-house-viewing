/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'real'
  readonly VITE_API_BASE?: string
  /** 群核 Aholo 开放平台 API Key */
  readonly VITE_AHOLO_API_KEY?: string
  /** 群核网关地址 */
  readonly VITE_AHOLO_GATEWAY?: string
  /** 漫游场景点云直链（SPZ/SOG/PLY，Aholo World API 的 assets.splats.urls） */
  readonly VITE_AHOLO_SPLAT_URL?: string
  /** LOD 分块元数据直链（World API 的 lodMetaPath） */
  readonly VITE_AHOLO_LOD_META_URL?: string
  /** 体素碰撞元数据（splat-transform Voxel 产物，本地 public/ 或直链） */
  readonly VITE_AHOLO_VOXEL_META_URL?: string
  readonly VITE_WORLD_ID?: string
  /** 生产 ply 统一前缀（/{scene_dir}/3dgs_compressed.ply）；# 待确认存储位置 */
  readonly VITE_SPLAT_BASE?: string
  readonly VITE_SPLAT_URL_w_0330_840483?: string
  readonly VITE_SPLAT_URL_w_0469_840829?: string
  readonly VITE_SPLAT_URL_w_0259_840804?: string
  readonly VITE_SPLAT_URL_w_0309_840544?: string
  readonly VITE_SPLAT_URL_w_0836_841149?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
