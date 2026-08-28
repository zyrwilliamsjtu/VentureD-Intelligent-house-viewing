import { fetchTour } from '../services/tour'
import { resolveRoomLookAt, resolveTeleportCloud } from './coords'
import { playTtsAndWait, stopTts, unlockAudio } from './agentActions'
import { useAppStore } from '../store/useAppStore'
import type { TourStep } from '../types/api'

// 自主带看：拉 steps → 依次强制 teleport（WASD 不可打断飞入）+ 到位后短句上屏 + 长 speech。
// 等 TTS 播完（onended）再切下一房；stub/失败按文本时长估算兜底。
// 当前房介绍期间可自由走动。用 generation token 中途停止；换世界必须 stopTour。

const TTS_FETCH_MS = 15_000
const MIN_DWELL_MS = 1_200
/** 对齐 AholoViewport FLY_MS=850：强制飞入完成后再上屏/播 speech */
const FLY_WAIT_MS = 900

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

/** 中文 TTS 约 4.2 字/秒；夹在 1.8s–20s。 */
export function estimateSpeechMs(text: string): number {
  const n = text.replace(/\s/g, '').length
  return Math.min(20_000, Math.max(1_800, Math.round((n / 4.2) * 1000) + 500))
}

function voiceText(step: TourStep): string {
  return (step.speech || step.narration || '').trim()
}

async function tryTtsUrl(text: string | undefined): Promise<string | null> {
  const t = text?.trim()
  if (!t) return null
  const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TTS_FETCH_MS)
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
    const ttsCache = new Map<string, Promise<string | null>>()
    const ttsOf = (text: string) => {
      if (!text) return Promise.resolve(null)
      let hit = ttsCache.get(text)
      if (!hit) {
        hit = tryTtsUrl(text)
        ttsCache.set(text, hit)
      }
      return hit
    }
    unlockAudio()
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
        useAppStore.getState().requestTeleport(hit.position, hit.label, look?.lookAt, true)
      } else {
        useAppStore.getState().showToast('传送点不可用', step.trajectory_point_id)
      }
      const onScreen = step.narration || step.room_id
      const voice = voiceText(step)
      const nextVoice = i + 1 < steps.length ? voiceText(steps[i + 1]) : ''
      if (nextVoice) void ttsOf(nextVoice)
      const urlP = voice ? ttsOf(voice) : Promise.resolve(null)
      if (hit) await sleep(FLY_WAIT_MS, token)
      if (token !== generation) return
      useAppStore.getState().showToast(`带看 ${label}`, onScreen)
      const url = await urlP
      if (token !== generation) return
      if (url) {
        await playTtsAndWait(
          url,
          Math.max(estimateSpeechMs(voice) * 2 + 2_000, 8_000),
          () => token !== generation,
        )
      } else {
        await sleep(Math.max(MIN_DWELL_MS, estimateSpeechMs(voice || onScreen)), token)
      }
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
