import { create } from 'zustand'
import type { House, V3 } from '../types/api'
import type { Listing } from '../data/listings'

// ==== 极简全局态：房源列表 → 第一人称漫游 + Agent 上下文/传送命令 ====
// 坐标系约定：player.position / teleportCmd.position 均为点云系（对拍转正：IG 原生 Z-up，米）

export interface Toast {
  text: string
  sub?: string
  key: number
}

/** Agent chat 请求所需的玩家上下文（点云系；room_id 由 coords 房间归因） */
export interface PlayerContext {
  world_id: string
  position: V3
  facing: V3
  room_id: string | null
}

export interface TeleportCmd {
  position: V3
  label?: string
  nonce: number
}

type View = 'splash' | 'list' | 'walk'

interface AppState {
  /** 页面流转：splash 开场 → list 房源列表 → walk 漫游（3D 视口常驻，仅覆盖层切换） */
  view: View
  entered: boolean // 兼容字段 = view==='walk'（漫游 HUD 显隐）
  pointerLocked: boolean // 鼠标是否锁定在画布（第一人称视角激活）
  listing: Listing | null // 当前选中的房源（walk 页数据源；null = 未选）
  house: House | null
  houseLoading: boolean
  houseError: string | null
  currentZone: string | null
  toast: Toast | null
  player: PlayerContext | null // Agent 上下文（视口节流发布）
  teleportCmd: TeleportCmd | null // 视口订阅执行（nonce 变化触发）

  enterList: () => void // splash → list
  selectListing: (l: Listing) => void // list → walk
  backToList: () => void // walk → list（3D 不卸载，再进秒开）
  setLocked: (v: boolean) => void
  setHouse: (h: House | null, loading?: boolean, error?: string | null) => void
  setZone: (z: string | null) => void
  showToast: (text: string, sub?: string) => void
  setPlayer: (ctx: PlayerContext) => void
  requestTeleport: (position: V3, label?: string) => void
}

let toastSeq = 0
let tpSeq = 0

export const useAppStore = create<AppState>()((set) => ({
  view: 'splash',
  entered: false,
  pointerLocked: false,
  listing: null,
  house: null,
  houseLoading: true,
  houseError: null,
  currentZone: null,
  toast: null,
  player: null,
  teleportCmd: null,

  enterList: () => set({ view: 'list' }),
  selectListing: (l) => set({ listing: l, view: 'walk', entered: true }),
  backToList: () => {
    if (document.pointerLockElement) document.exitPointerLock()
    set({ view: 'list', entered: false })
  },
  setLocked: (v) => set({ pointerLocked: v }),
  setHouse: (h, loading = false, error = null) => set({ house: h, houseLoading: loading, houseError: error }),
  setZone: (z) => set({ currentZone: z }),
  showToast: (text, sub) => set({ toast: { text, sub, key: ++toastSeq } }),
  setPlayer: (ctx) => set({ player: ctx }),
  requestTeleport: (position, label) => set({ teleportCmd: { position, label, nonce: ++tpSeq } }),
}))

export const appStore = () => useAppStore.getState()
