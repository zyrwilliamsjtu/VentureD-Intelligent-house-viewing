import { getTour } from '../services/api'
import { executeActions } from '../actions/executor'
import { speakReply, stopAudio } from '../audio/player'
import { useAppStore } from '../store/useAppStore'

// ==== 自动带看控制器 ====
// 逐段执行：镜头指令 → 消息上屏 → 朗读/播音频 → 下一段
// 任何用户交互（提问 / 点房间 / 点停止）都会使 runId 失效而中断

let runId = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function stopTour(announce = true): void {
  runId++
  stopAudio()
  const s = useAppStore.getState()
  if (s.tourState !== 'idle') {
    s.setTour('idle')
    if (announce) {
      s.pushMsg('assistant', '带看已暂停。您可以随时提问，或点右上角「开始带看」重新出发。')
    }
  }
}

export async function startTour(fromIndex = 0): Promise<void> {
  stopTour(false)
  const my = ++runId
  const s = useAppStore.getState()
  if (!s.house) return
  const house = s.house
  s.setTour('running', fromIndex)

  let tour
  try {
    tour = await getTour(house.id)
  } catch (e) {
    if (runId !== my) return
    useAppStore.getState().setTour('idle')
    useAppStore.getState().pushMsg('assistant', `导览脚本加载失败：${e instanceof Error ? e.message : String(e)}`)
    return
  }

  for (let i = fromIndex; i < tour.segments.length; i++) {
    if (runId !== my) return
    const seg = tour.segments[i]
    useAppStore.getState().setTour('running', i)
    executeActions(seg.actions)
    useAppStore.getState().pushMsg('assistant', seg.text)
    await speakReply(seg.audio, seg.text)
    if (runId !== my) return
    await sleep(400)
  }

  if (runId !== my) return
  const fin = useAppStore.getState()
  fin.setTour('idle')
  executeActions([{ type: 'overview' }])
}
