import type { AgentAction } from '../types/api'
import { resolveTeleportCloud } from './coords'
import { useAppStore } from '../store/useAppStore'

// ==== Agent 动作执行器（SPEC §4 / docs/agent-api.md）====
// teleport：resolveTeleportCloud（position 直用 / tp_id 查表）→ requestTeleport → 视口体素贴地瞬移
// show_card：HUD InfoCard（title + lines[]；兼容平铺与 data 嵌套）
// highlight：tp_id 查点云系 camera_poses → requestHighlight → 视口 3D 光柱；无落点则 toast

/** show_card 载荷兼容：PI mock 样例为 {type,data:{title,lines}}，契约正文为平铺 */
function cardOf(a: Extract<AgentAction, { type: 'show_card' }>): { title: string; lines: string[] } {
  const d = (a as { data?: { title?: string; lines?: string[] } }).data
  return { title: a.title ?? d?.title ?? '信息卡', lines: a.lines ?? d?.lines ?? [] }
}

let audio: HTMLAudioElement | null = null

/** 播放 TTS 直链；被拦/失效静默降级（降级矩阵：tts 失败 → 静音气泡） */
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
