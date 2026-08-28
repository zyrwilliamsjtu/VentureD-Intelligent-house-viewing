// ==== 前后端接口契约类型 ====
// 与《48H 黑客松版 · 前后端接口契约》文档一一对应，字段改动需群里同步

export type V3 = [number, number, number]

export interface HouseMeta {
  title: string
  area: number
  orientation: string
  floor: string
  price: string
  tags: string[]
}

export interface HouseModel {
  url: string // GLB 公网直链；mock 模式为空（程序化生成户型）
  format: string
  up_axis: string
  bounds: { size: V3 }
}

export interface ZoneCamera {
  pos: V3
  target: V3
}

export interface Zone {
  id: string
  label: string
  polygon: [number, number][] // 地面投影多边形（世界坐标，米）
  area_m2?: number // 分区面积（后端可选；缺省由前端按 polygon 计算）
  camera?: ZoneCamera // 预置机位
  story_card: string // 讲解兜底文案
}

export interface HouseObject {
  id: string
  class: string
  tag?: string // 短标签（如「3人位」「501L」），物体标注胶囊用
  zone_id: string
  bbox3d: { center: V3; size: V3 }
  attrs?: Record<string, string>
  confidence?: number
}

export interface House {
  id: string
  meta: HouseMeta
  model: HouseModel
  zones: Zone[]
  objects: HouseObject[]
  tour_path: string[]
}

// ==== 镜头指令协议（actions）====
export type CameraAction =
  | { type: 'fly_to_zone'; zone_id: string }
  | { type: 'focus_object'; object_id: string }
  | { type: 'highlight'; target: string; duration_ms?: number }
  | { type: 'set_tour_index'; index: number }
  | { type: 'overview' }

export interface ReplyAudio {
  mime: string
  base64: string
}

export interface ChatResponse {
  asr_text: string
  reply_text: string
  reply_audio?: ReplyAudio | null // 为空时前端降级为本地 TTS / 纯文字
  actions: CameraAction[]
  source?: string
  elapsed_ms?: number
}

// ==== Agent 契约（docs/agent-api.md v1.1 · 对拍转正版）====
// 坐标约定：player_position / actions.position 均为点云坐标系
// （IG 原生 Z-up，米；scene(Y-up) → 点云映射见 scene/coords.ts）

export type AgentAction =
  | { type: 'teleport'; tp_id?: string; position?: V3; label?: string }
  | { type: 'highlight'; tp_id?: string; position?: V3 }
  // show_card 兼容两种载荷：平铺 {title,lines}（契约正文）/ 嵌套 {data:{title,lines}}（PI mock 样例）
  | { type: 'show_card'; title?: string; lines?: string[]; data?: { title?: string; lines?: string[] } }

export interface AgentChatRequest {
  session_id: string
  world_id: string
  /** 选中房源 id（SPEC v2.3 §3.1 新增可选）：价格/面积/朝向/楼层以 listing 为准，冲突时 listing 赢 */
  listing_id?: string | null
  user_text?: string | null
  /** 玩家眼位（点云系，Z-up，米） */
  player_position?: V3
  /** 视线方向单位向量（点云系） */
  player_facing?: V3
  /** 当前房间 id（对拍转正后由前端按 polygon 归因；不可得为 null） */
  room_id?: string | null
  event?: 'button_press' | 'enter_room'
}

export interface AgentChatResponse {
  reply_text: string
  tts_url?: string | null
  actions?: AgentAction[]
}

// ==== ASR 契约（SPEC v2.2 §3.2 · POST /api/agent/asr）====
export interface AsrResponse {
  /** 识别文本；空语音/纯噪音为 ""（正常返回，非错误，前端按「没听清」处理） */
  text: string
  duration_ms?: number
}

export interface HistoryItem {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatRequest {
  house_id: string
  text?: string
  audio?: { blob: Blob; mime: string } // Push-to-Talk 录音
  current_zone: string | null
  tour_index: number
  history: HistoryItem[]
}

export interface TourSegment {
  index: number
  zone_id: string
  text: string
  audio?: ReplyAudio | null
  actions: CameraAction[]
}

export interface TourScript {
  segments: TourSegment[]
}
