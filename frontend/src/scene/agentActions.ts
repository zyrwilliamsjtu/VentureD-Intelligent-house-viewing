import type { AgentAction, AgentChatRequest, AgentChatResponse } from '../types/api'
import { isInstanceTpId, resolveObserveCloud, resolveRoomLookAt, resolveTeleportCloud } from './coords'
import { useAppStore } from '../store/useAppStore'
import { agentChat } from '../services/agent'
import { listingIdForWorld } from './worlds'

// ==== Agent 动作执行器（SPEC §4 / docs/agent-api.md）====
// teleport：房间锚点 + lookAt 房间中心；实例观察位 = 退 2m + lookAt（前端计算，不改契约）
// show_card：HUD InfoCard
// highlight：点云系光柱

function cardOf(a: Extract<AgentAction, { type: 'show_card' }>): { title: string; lines: string[] } {
  const d = (a as { data?: { title?: string; lines?: string[] } }).data
  return { title: a.title ?? d?.title ?? '信息卡', lines: a.lines ?? d?.lines ?? [] }
}

let audio: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null

type TtsBlockedFn = (url: string | null) => void
let ttsBlockedFn: TtsBlockedFn | null = null

export function onTtsBlocked(fn: TtsBlockedFn): () => void {
  ttsBlockedFn = fn
  return () => {
    if (ttsBlockedFn === fn) ttsBlockedFn = null
  }
}

/** 用户手势时解锁自动播放（进入漫游 / PTT / 键鼠） */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      if (!audioCtx) audioCtx = new AC()
      if (audioCtx.state === 'suspended') void audioCtx.resume()
    }
  } catch {
    /* ignore */
  }
}

function mediaUrl(url: string): string {
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  const base = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
  if (base) return `${base}${url.startsWith('/') ? url : `/${url}`}`
  return url.startsWith('/') ? url : `/${url}`
}

export function playTts(url?: string | null): void {
  if (!url) return
  const abs = mediaUrl(url)
  try {
    unlockAudio()
    audio?.pause()
    audio = new Audio(abs)
    audio.preload = 'auto'
    const p = audio.play()
    if (p && typeof p.then === 'function') {
      void p
        .then(() => ttsBlockedFn?.(null))
        .catch(() => ttsBlockedFn?.(abs))
    }
  } catch {
    ttsBlockedFn?.(abs)
  }
}

export function stopTts(): void {
  try {
    audio?.pause()
  } catch {
    /* ignore */
  }
  audio = null
}

const TTS_MS = 15_000

/** 仅当 chat 已带 tts_url 才自动播（语音/带看）。打字不补播。 */
export function playReplyVoice(_text: string, ttsUrl?: string | null): void {
  if (ttsUrl) playTts(ttsUrl)
}

/** 手动 🔊：有 url 直接播；否则 POST /tts（不自动触发） */
export function playReplyVoiceManual(text: string, ttsUrl?: string | null): void {
  if (ttsUrl) {
    playTts(ttsUrl)
    return
  }
  const t = text.trim()
  if (!t || import.meta.env.VITE_API_MODE !== 'real') return
  const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), TTS_MS)
  void fetch(`${BASE}/api/agent/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t }),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok) return
      const body = (await res.json()) as { audio_url?: string; tts_url?: string }
      const url = body.audio_url || body.tts_url
      if (url) playTts(url)
    })
    .catch(() => {})
    .finally(() => window.clearTimeout(timer))
}

/** PTT：multipart 带 audio，后端据此合成 tts_url（打字 JSON 不带 audio） */
export async function agentChatWithAudio(
  req: AgentChatRequest,
  rec: { blob: Blob; mime: string },
): Promise<AgentChatResponse> {
  if (import.meta.env.VITE_API_MODE !== 'real') return agentChat(req)
  const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
  const form = new FormData()
  form.append('session_id', req.session_id)
  form.append('world_id', req.world_id)
  if (req.user_text) form.append('user_text', req.user_text)
  form.append('event', req.event || 'button_press')
  if (req.room_id) form.append('room_id', req.room_id)
  const lid = listingIdForWorld(req.world_id)
  if (lid) form.append('listing_id', lid)
  const ext = rec.mime.includes('mp4') ? 'm4a' : 'webm'
  form.append('audio', rec.blob, `ptt.${ext}`)
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(`${BASE}/api/agent/chat`, { method: 'POST', body: form, signal: ctrl.signal })
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
    window.clearTimeout(timer)
  }
}

export async function executeAgentActions(
  actions: AgentAction[] | undefined | null,
  worldId: string,
): Promise<void> {
  if (!actions?.length) return
  const s = useAppStore.getState()
  const teleports = actions.filter((a) => a.type === 'teleport')
  const highlights = actions.filter((a) => a.type === 'highlight')
  const instTp =
    highlights.find((a) => a.type === 'highlight' && isInstanceTpId(a.tp_id))?.tp_id ||
    teleports.find((a) => a.type === 'teleport' && isInstanceTpId(a.tp_id))?.tp_id

  let usedObserve = false
  if (instTp && teleports.length) {
    const obs = await resolveObserveCloud(instTp, worldId)
    if (obs) {
      const label = teleports[0]?.type === 'teleport' ? teleports[0].label : undefined
      s.requestTeleport(obs.stand, label, obs.lookAt)
      usedObserve = true
    }
  }

  for (const a of actions) {
    if (a.type === 'teleport') {
      if (usedObserve) continue
      const hit = await resolveTeleportCloud(a, worldId)
      if (hit) {
        const look = a.tp_id && !isInstanceTpId(a.tp_id) ? await resolveRoomLookAt(a.tp_id, worldId) : null
        s.requestTeleport(hit.position, hit.label, look?.lookAt)
      } else {
        s.showToast('传送点不可用', a.tp_id ? `tp_id「${a.tp_id}」不在映射表` : '动作缺 tp_id / position')
      }
    } else if (a.type === 'show_card') {
      const { title, lines } = cardOf(a)
      s.showInfoCard(title, lines)
    } else if (a.type === 'highlight') {
      const hit = await resolveTeleportCloud(a, worldId)
      if (hit) {
        s.requestHighlight(hit.position, hit.label ?? a.tp_id)
      } else {
        s.showToast('无法高亮', a.tp_id ? `tp_id「${a.tp_id}」不在映射表` : '动作缺 tp_id / position')
      }
    }
  }
}
