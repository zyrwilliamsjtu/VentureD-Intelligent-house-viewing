import { create } from 'zustand'
import type { House, V3 } from '../types/api'

// ==== 极简全局态：第一人称漫游 + Agent 上下文/传送命令 ====
// 坐标系约定：player.position / teleportCmd.position / highlightCmd.position 均为点云系（IG 原生 Z-up，米）

export interface Toast {
  text: string
  sub?: string
  key: number
}

export interface InfoCardData {
  title: string
  lines: string[]
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
  lookAt?: V3
  nonce: number
}

export interface HighlightCmd {
  position: V3
  label?: string
  nonce: number
}

export type AppView = 'splash' | 'list' | 'walk'

interface AppState {
  view: AppView
  entered: boolean // 是否已进入第一人称漫游
  pointerLocked: boolean // 鼠标是否锁定在画布（第一人称视角激活）
  house: House | null
  houseLoading: boolean
  houseError: string | null
  currentZone: string | null
  toast: Toast | null
  player: PlayerContext | null // Agent 上下文（视口节流发布）
  teleportCmd: TeleportCmd | null // 视口订阅执行（nonce 变化触发）
  highlightCmd: HighlightCmd | null // 视口订阅：点云系 3D 标记
  infoCard: InfoCardData | null
  tourActive: boolean
  tourLabel: string | null

  enter: () => void
  enterList: () => void
  enterWalk: () => void
  exitToList: () => void
  setLocked: (v: boolean) => void
  setHouse: (h: House | null, loading?: boolean, error?: string | null) => void
  setZone: (z: string | null) => void
  showToast: (text: string, sub?: string) => void
  setPlayer: (ctx: PlayerContext) => void
  requestTeleport: (position: V3, label?: string, lookAt?: V3) => void
  requestHighlight: (position: V3, label?: string) => void
  showInfoCard: (title: string, lines: string[]) => void
  clearInfoCard: () => void
  setTour: (active: boolean, label?: string | null) => void
}

let toastSeq = 0
let tpSeq = 0
let hlSeq = 0
let cardSeq = 0

export const useAppStore = create<AppState>()((set) => ({
  view: 'splash',
  entered: false,
  pointerLocked: false,
  house: null,
  houseLoading: true,
  houseError: null,
  currentZone: null,
  toast: null,
  player: null,
  teleportCmd: null,
  highlightCmd: null,
  infoCard: null,
  tourActive: false,
  tourLabel: null,

  enter: () => set({ view: 'walk', entered: true }),
  enterList: () => set({ view: 'list', entered: false, pointerLocked: false }),
  enterWalk: () => set({ view: 'walk', entered: true }),
  exitToList: () =>
    set({
      view: 'list',
      entered: false,
      pointerLocked: false,
      infoCard: null,
      tourActive: false,
      tourLabel: null,
    }),
  setLocked: (v) => set({ pointerLocked: v }),
  setHouse: (h, loading = false, error = null) => set({ house: h, houseLoading: loading, houseError: error }),
  setZone: (z) => set({ currentZone: z }),
  showToast: (text, sub) => set({ toast: { text, sub, key: ++toastSeq } }),
  setPlayer: (ctx) => set({ player: ctx }),
  requestTeleport: (position, label, lookAt) =>
    set({ teleportCmd: { position, label, lookAt, nonce: ++tpSeq } }),
  requestHighlight: (position, label) => set({ highlightCmd: { position, label, nonce: ++hlSeq } }),
  showInfoCard: (title, lines) => set({ infoCard: { title, lines, key: ++cardSeq } }),
  clearInfoCard: () => set({ infoCard: null }),
  setTour: (active, label = null) => set({ tourActive: active, tourLabel: active ? (label ?? null) : null }),
}))

export const appStore = () => useAppStore.getState()
