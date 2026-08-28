import type { AgentAction } from '../types/api'
import { resolveTeleportCloud } from './coords'
import { getSessionId, getTour, synthesizeTts } from '../services/agent'
import { useAppStore } from '../store/useAppStore'

// ==== Agent 动作执行器（SPEC §4 / docs/agent-api.md）====
// teleport：resolveTeleportCloud（position 直用 / tp_id 查表）→ requestTeleport → 视口体素贴地瞬移
// show_card：HUD toast 信息卡（兼容平铺 {title,lines} 与嵌套 {data:{...}} 两种载荷）
// highlight：3D 标记待做，先 toast 承接，保证动作不丢（降级矩阵 §8）

/** show_card 载荷兼容：PI mock 样例为 {type,data:{title,lines}}，契约正文为平铺 */
function cardOf(a: Extract<AgentAction, { type: 'show_card' }>): { title: string; lines: string[] } {
  const d = (a as { data?: { title?: string; lines?: string[] } }).data
  return { title: a.title ?? d?.title ?? '信息卡', lines: a.lines ?? d?.lines ?? [] }
}

let audio: HTMLAudioElement | null = null

/** 后端资产相对路径（/static/...）→ 直连时补后端地址；dev 走 vite proxy /static（同源） */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

function resolveAssetUrl(url: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return API_BASE ? `${API_BASE}${url}` : url
  }
  return url
}

/** 播放 TTS 直链；被拦/失效静默降级（降级矩阵：tts 失败 → 静音气泡） */
export function playTts(url?: string | null): void {
  if (!url) return
  try {
    audio?.pause()
    audio = new Audio(resolveAssetUrl(url))
    void audio.play().catch(() => {})
  } catch {
    /* ignore */
  }
}

export async function executeAgentActions(
  actions: AgentAction[] | undefined | null,
  worldId: string,
): Promise<void> {
  if (!actions?.length) return
  const s = useAppStore.getState()
  for (const a of actions) {
    if (a.type === 'teleport') {
      const hit = await resolveTeleportCloud(a, worldId)
      if (hit) {
        s.requestTeleport(hit.position, hit.label)
      } else {
        s.showToast('传送点不可用', a.tp_id ? `tp_id「${a.tp_id}」不在映射表` : '动作缺 tp_id / position')
      }
    } else if (a.type === 'show_card') {
      const { title, lines } = cardOf(a)
      s.showToast(title, lines.length ? lines.join(' · ') : undefined)
    } else if (a.type === 'highlight') {
      const hit = await resolveTeleportCloud(a, worldId)
      s.showToast('已标记', hit?.label ?? a.tp_id ?? '高亮目标')
    }
  }
}

/** 无 tts_url 时的兜底：调后端 /api/agent/tts 合成再播放；失败静默（降级矩阵） */
export async function speakText(text: string): Promise<void> {
  if (!text.trim()) return
  try {
    const { audio_url } = await synthesizeTts(text)
    if (audio_url) playTts(audio_url)
  } catch {
    /* ignore */
  }
}

/** 全屋带看：按 tour steps 依次传送到语义锚点 + 讲解 + 朗读 */
export async function runTour(worldId: string, listingId?: string): Promise<void> {
  const s = useAppStore.getState()
  try {
    const { steps } = await getTour(worldId, getSessionId(), listingId)
    for (const step of steps) {
      const target = await resolveTeleportCloud({ tp_id: step.trajectory_point_id }, worldId)
      if (target) s.requestTeleport(target.position, `带您去${step.room_id}`)
      const text = step.narration || step.selling_points?.join('；') || `带您去${step.room_id}`
      s.showToast('带看', text)
      void speakText(text)
      await new Promise((r) => setTimeout(r, 4500))
    }
  } catch (e) {
    s.showToast('带看不可用', e instanceof Error ? e.message : '请稍后再试')
  }
}
