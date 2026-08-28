import type { AgentAction } from '../types/api'
import { isInstanceTpId, resolveObserveCloud, resolveTeleportCloud } from './coords'
import { useAppStore } from '../store/useAppStore'

// ==== Agent 动作执行器（SPEC §4 / docs/agent-api.md）====
// teleport：房间锚点直接飞；实例观察位 = 退 2m + lookAt（前端计算，不改契约）
// show_card：HUD InfoCard
// highlight：点云系光柱

function cardOf(a: Extract<AgentAction, { type: 'show_card' }>): { title: string; lines: string[] } {
  const d = (a as { data?: { title?: string; lines?: string[] } }).data
  return { title: a.title ?? d?.title ?? '信息卡', lines: a.lines ?? d?.lines ?? [] }
}

let audio: HTMLAudioElement | null = null

export function playTts(url?: string | null): void {
  if (!url) return
  try {
    audio?.pause()
    audio = new Audio(url)
    void audio.play().catch(() => {})
  } catch {
    /* ignore */
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

/** chat 已带 tts_url 立即播；没有则异步打独立 TTS，不阻塞文字气泡 */
export function playReplyVoice(text: string, ttsUrl?: string | null): void {
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
        s.requestTeleport(hit.position, hit.label)
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
