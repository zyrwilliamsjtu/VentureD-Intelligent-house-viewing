import { create } from 'zustand'
import type { House, V3 } from '../types/api'
import type { Listing } from '../data/listings'
import { LISTINGS } from '../data/listings'
import { resetSessionId } from '../services/agent'

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

/** 落地页搜索卡筛选条件（list 页应用；location 固定上海，仅保留户型/价格） */
export interface ListingFilters {
  layout: string // 'all' | 户型名
  price: string // 'all' | 'lt300' | '300-450' | 'gt450'
}

interface AppState {
  /** 页面流转：splash 开场 → list 房源列表 → walk 漫游（3D 视口常驻，仅覆盖层切换） */
  view: View
  entered: boolean // 兼容字段 = view==='walk'（漫游 HUD 显隐）
  pointerLocked: boolean // 鼠标是否锁定在画布（第一人称视角激活）
  listing: Listing | null // 当前选中的房源（walk 页数据源；null = 未选）
  /** 房源列表（mount 时 loadListings 拉网关，失败已是本地兜底初值） */
  listings: Listing[]
  listingsSource: 'api' | 'local'
  filters: ListingFilters
  house: House | null
  houseLoading: boolean
  houseError: string | null
  currentZone: string | null
  toast: Toast | null
  player: PlayerContext | null // Agent 上下文（视口节流发布）
  teleportCmd: TeleportCmd | null // 视口订阅执行（nonce 变化触发）

  enterList: () => void // splash → list
  selectListing: (l: Listing) => void // list → walk（换房重置会话，指南 §3.4）
  backToList: () => void // walk → list（3D 不卸载，再进秒开）
  loadListings: (r: { listings: Listing[]; source: 'api' | 'local' }) => void
  setFilters: (f: Partial<ListingFilters>) => void
  clearFilters: () => void
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
  listings: LISTINGS,
  listingsSource: 'local',
  filters: { layout: 'all', price: 'all' },
  house: null,
  houseLoading: true,
  houseError: null,
  currentZone: null,
  toast: null,
  player: null,
  teleportCmd: null,

  enterList: () => set({ view: 'list' }),
  selectListing: (l) => {
    const st = useAppStore.getState()
    if (st.listing?.id !== l.id) {
      resetSessionId() // 换房 → 新会话（不带上一套 history/current_room，指南 §3.4）
      set({ listing: l, view: 'walk', entered: true, currentZone: null, player: null, toast: null })
    } else {
      set({ view: 'walk', entered: true }) // 同一套再进：会话延续
    }
  },
  backToList: () => {
    if (document.pointerLockElement) document.exitPointerLock()
    set({ view: 'list', entered: false })
  },
  loadListings: (r) => set({ listings: r.listings, listingsSource: r.source }),
  setFilters: (f) => set({ filters: { ...useAppStore.getState().filters, ...f } }),
  clearFilters: () => set({ filters: { layout: 'all', price: 'all' } }),
  setLocked: (v) => set({ pointerLocked: v }),
  setHouse: (h, loading = false, error = null) => set({ house: h, houseLoading: loading, houseError: error }),
  setZone: (z) => set({ currentZone: z }),
  showToast: (text, sub) => set({ toast: { text, sub, key: ++toastSeq } }),
  setPlayer: (ctx) => set({ player: ctx }),
  requestTeleport: (position, label) => set({ teleportCmd: { position, label, nonce: ++tpSeq } }),
}))

export const appStore = () => useAppStore.getState()
