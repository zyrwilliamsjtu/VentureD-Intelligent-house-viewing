import type { AgentAction, AgentChatRequest, AgentChatResponse } from '../types/api'
import { listingIdForWorld } from '../scene/worlds'

// ==== Agent 服务（SPEC v2.2 §3.1 · docs/agent-api.md v1.1）====
// real：POST {VITE_API_BASE}/api/agent/chat（JSON，30s 超时，错误顶层 {code,message}）
// mock：按当前 world 的 scene_graph 关键词匹配，动作走真实 tp 表
//      → 后端未就绪也能全程演练 Golden Path（问位置 → teleport 瞬移 + 信息卡）

const SESSION_KEY = 'agent_session_id'

/** session_id：前端生成、全程复用（SPEC §0 会话约定；sessionStorage 跨刷新保留） */
export function getSessionId(): string {
  try {
    const hit = sessionStorage.getItem(SESSION_KEY)
    if (hit) return hit
    const sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    sessionStorage.setItem(SESSION_KEY, sid)
    return sid
  } catch {
    return `s_${Date.now().toString(36)}_tmp`
  }
}

/** 换房时清会话，避免上一套 world 的对话状态串台 */
export function resetAgentSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* noop */
  }
}

/** 统一入口：VITE_API_MODE=real 走后端网关，否则 mock */
export function agentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  return import.meta.env.VITE_API_MODE === 'real' ? realAgentChat(req) : mockAgentChat(req)
}

// ---- real 实现 ----

// 默认空 = 同源相对路径（dev 走 vite proxy /api → 后端网关，无跨源问题）；
// 需直连时在 .env 设 VITE_API_BASE（如 http://192.168.x.x:8000）
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export async function realAgentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000) // SPEC §0：chat 30s
  try {
    const res = await fetch(`${BASE}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...req,
        listing_id: listingIdForWorld(req.world_id),
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { code?: string; message?: string }
        msg = body.message ? `[${body.code ?? 'AGENT_ERROR'}] ${body.message}` : msg
      } catch {
        /* ignore */
      }
      throw new Error(msg)
    }
    return (await res.json()) as AgentChatResponse
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Agent 响应超时')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ---- mock 实现（关键词匹配 scene_graph；动作引用真实 tp_id）----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** SPEC §1.2 实例类别 → 中文（匹配用户口语用） */
const ZH: Record<string, string> = {
  bed: '床', sofa: '沙发', tv_cabinet: '电视柜', stove: '灶台', dining_table: '餐桌',
  chair: '椅子', wardrobe: '衣柜', desk: '书桌', refrigerator: '冰箱', washing_machine: '洗衣机',
  toilet: '马桶', shower: '淋浴', sink: '洗手台', cabinet: '橱柜', coffee_table: '茶几',
  lamp: '灯', curtain: '窗帘', bedside_table: '床头柜', bookshelf: '书架', plant: '绿植',
}

export interface MockScene {
  house: { title: string; type: string; total_area: number; orientation: string; price: string }
  rooms: Array<{
    id: string
    name: string
    area?: number
    trajectory_point_id?: string
    selling_points?: string[]
    story_card?: string
    instances?: Array<{
      id: string
      category: string
      tag?: string
      trajectory_point_id?: string
      attrs?: Record<string, string>
    }>
  }>
}

let sceneCache: MockScene | null = null

/** 按世界加载 scene_graph（0330 真实数据 / 其余根目录手写 mock），与 coords.ts 同源；narration 复用 */
export async function loadScene(worldId: string): Promise<MockScene | null> {
  if (sceneCache) return sceneCache
  const sub = worldId === 'w_0330_840483' ? 'real_0330/' : ''
  try {
    const res = await fetch(`${import.meta.env.BASE_URL || '/'}mock/${sub}scene_graph.json`)
    if (!res.ok) return null
    sceneCache = (await res.json()) as MockScene
    return sceneCache
  } catch {
    return null
  }
}

export async function mockAgentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  await sleep(300 + Math.random() * 400) // 模拟网络+推理延迟
  const scene = await loadScene(req.world_id)
  const text = (req.user_text ?? '').trim()

  if (!scene) {
    return { reply_text: '场景数据未加载，Agent 暂时无法回答。', tts_url: null, actions: [] }
  }

  // 进房主动讲解（event=enter_room，无文本）：按 room_id 讲 story_card
  if (!text && req.event === 'enter_room' && req.room_id) {
    const room = scene.rooms.find((r) => r.id === req.room_id)
    if (room?.story_card) return { reply_text: room.story_card, tts_url: null, actions: [] }
  }

  if (!text) {
    return {
      reply_text: '您可以说「主卧在哪」「冰箱在哪」，或问我户型面积。',
      tts_url: null,
      actions: [],
    }
  }

  // 1) 房间名命中 → 传送 + 信息卡
  for (const r of scene.rooms) {
    if (r.name && text.includes(r.name)) {
      const lines = [r.area ? `面积约 ${r.area} 平` : ''].filter(Boolean).concat(r.selling_points ?? [])
      const actions: AgentAction[] = []
      if (r.trajectory_point_id) {
        actions.push({ type: 'teleport', tp_id: r.trajectory_point_id, label: `带您去${r.name}` })
      }
      actions.push({ type: 'show_card', title: r.name, lines: lines.length ? lines : [r.name] })
      return {
        reply_text: `好的，带您去${r.name}。${r.story_card ?? lines.join('；')}`,
        tts_url: null,
        actions,
      }
    }
  }

  // 2) 家具/实例命中（中文类别名或 tag）→ 传送 + 属性卡
  for (const r of scene.rooms) {
    for (const i of r.instances ?? []) {
      const zh = ZH[i.category] ?? i.category
      if ((zh && text.includes(zh)) || (i.tag && text.includes(i.tag))) {
        const lines = Object.entries(i.attrs ?? {})
          .slice(0, 4)
          .map(([k, v]) => `${k}: ${v}`)
        const actions: AgentAction[] = []
        if (i.trajectory_point_id) {
          actions.push({ type: 'teleport', tp_id: i.trajectory_point_id, label: `带您看${zh}` })
        }
        actions.push({ type: 'show_card', title: zh, lines: lines.length ? lines : [`${zh}在${r.name}`] })
        return {
          reply_text: `${zh}在${r.name}，这就带您过去看看。`,
          tts_url: null,
          actions,
        }
      }
    }
  }

  // 3) 户型元信息
  if (/面积|多大|多少平|户型|朝向|价格|总价/.test(text)) {
    const h = scene.house
    const orient = h.orientation && h.orientation !== '待对拍' ? `，${h.orientation}` : ''
    return {
      reply_text: `${h.title}，${h.type}，建面约 ${h.total_area} 平${orient}。`,
      tts_url: null,
      actions: [],
    }
  }

  return {
    reply_text: '这个问题我记下了。您可以问我某个房间或家具的位置，也可以问我户型面积。',
    tts_url: null,
    actions: [],
  }
}
