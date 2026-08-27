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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
