import { fetchTour } from '../services/tour'
import { resolveRoomLookAt, resolveTeleportCloud } from './coords'
import { playTts, stopTts, unlockAudio } from './agentActions'
import { useAppStore } from '../store/useAppStore'

// 自主带看：拉 steps → 依次 teleport（当前 world 的 camera_poses）+ toast + 可选 TTS。
// 用 generation token 中途停止；换世界必须 stopTour。

const DWELL_MS = 4000
const TTS_MS = 8_000

let generation = 0

function sleep(ms: number, token: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    const id = window.setInterval(() => {
      if (token !== generation || Date.now() - start >= ms) {
        window.clearInterval(id)
        resolve()
      }
    }, 80)
  })
}

async function tryTtsUrl(text: string | undefined): Promise<string | null> {
  const t = text?.trim()
  if (!t) return null
  const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TTS_MS)
  try {
    const res = await fetch(`${BASE}/api/agent/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { audio_url?: string; tts_url?: string }
    return body.audio_url || body.tts_url || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function isTourRunning(): boolean {
  return useAppStore.getState().tourActive
}

export function stopTour(): void {
  generation += 1
  stopTts()
  useAppStore.getState().setTour(false)
}

export async function startTour(worldId: string): Promise<void> {
  const token = ++generation
  stopTts()
  const store = useAppStore.getState()
  store.setTour(true, '拉取动线…')
  try {
    const { steps } = await fetchTour(worldId)
    if (token !== generation) return
    if (!steps.length) {
      store.setTour(false)
      store.showToast('带看暂不可用', '动线为空')
      return
    }
    for (let i = 0; i < steps.length; i++) {
      if (token !== generation) return
      const step = steps[i]
      const label = `${i + 1}/${steps.length}`
      useAppStore.getState().setTour(true, label)
      const hit = await resolveTeleportCloud(
        { tp_id: step.trajectory_point_id, label: step.room_id },
        worldId,
      )
      if (token !== generation) return
      if (hit) {
        const look = await resolveRoomLookAt(step.trajectory_point_id, worldId)
        useAppStore.getState().requestTeleport(hit.position, hit.label, look?.lookAt)
      } else {
        useAppStore.getState().showToast('传送点不可用', step.trajectory_point_id)
      }
      const narr = step.narration || step.room_id
      useAppStore.getState().showToast(`带看 ${label}`, narr)
      unlockAudio()
      const url = await tryTtsUrl(step.narration)
      if (token !== generation) return
      if (url) playTts(url)
      await sleep(DWELL_MS, token)
    }
    if (token !== generation) return
    useAppStore.getState().showToast('带看结束', `${steps.length} 个房间已走完`)
    useAppStore.getState().setTour(false)
  } catch (e) {
    if (token !== generation) return
    const msg = e instanceof Error ? e.message : '网络错误'
    useAppStore.getState().setTour(false)
    useAppStore.getState().showToast('带看暂不可用', msg)
  }
}
