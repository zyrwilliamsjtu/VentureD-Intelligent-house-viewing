import type { CameraAction, ChatRequest } from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { sendChat } from '../services/api'
import { executeActions } from '../actions/executor'
import { stopTour } from '../tour/tourPlayer'
import { speakReply } from '../audio/player'

// ==== 共享对话流程：ChatPanel / 演示模式 / 快捷 chips 共用 ====
// 完整链路：用户输入（文字/语音）→ sendChat → 消息上屏 + 识别来源卡 → 镜头指令 → 语音播报

export interface RecordingLike {
  blob: Blob
  mime: string
  durationMs: number
}

/** 从 actions 推导“识别来源卡”内容（纯前端展示，不增加后端负担） */
function deriveRecognition(actions: CameraAction[]): string[] | undefined {
  const s = useAppStore.getState()
  const house = s.house
  if (!house) return undefined
  const out: string[] = []
  for (const a of actions) {
    const target = a.type === 'fly_to_zone' ? a.zone_id : a.type === 'focus_object' ? a.object_id : a.type === 'highlight' ? a.target : null
    if (!target) continue
    const obj = house.objects.find((o) => o.id === target)
    if (obj) out.push(obj.tag ? `${obj.class} · ${obj.tag}` : obj.class)
    else {
      const zone = house.zones.find((z) => z.id === target)
      if (zone) out.push(`${zone.label} · ${zone.area_m2 ?? ''}㎡`)
    }
  }
  return out.length > 0 ? [...new Set(out)].slice(0, 3) : undefined
}

function buildRequest(partial: { text?: string; audio?: ChatRequest['audio'] }): ChatRequest | null {
  const s = useAppStore.getState()
  if (!s.house) return null
  return {
    house_id: s.house.id,
    current_zone: s.currentZone,
    tour_index: s.tourIndex,
    history: s.messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
    ...partial,
  }
}

/** 发送文字问题（用户气泡由调用方先上屏）；resolve 于语音播报结束 */
export async function sendText(text: string, opts?: { silentUserBubble?: boolean }): Promise<void> {
  const t = text.trim()
  if (!t) return
  const req = buildRequest({ text: t })
  if (!req) return
  if (!opts?.silentUserBubble) useAppStore.getState().pushMsg('user', t)
  await runChat(req)
}

/** 发送语音录音；resolve 于语音播报结束 */
export async function sendAudio(rec: RecordingLike): Promise<void> {
  const req = buildRequest({ audio: { blob: rec.blob, mime: rec.mime } })
  if (!req) return
  await runChat(req, true)
}

async function runChat(req: ChatRequest, echoAsr = false): Promise<void> {
  const s = useAppStore.getState()
  s.setChatPhase('thinking')
  try {
    const res = await sendChat(req)
    const st = useAppStore.getState()
    if (echoAsr && res.asr_text) st.pushMsg('user', res.asr_text) // 语音识别结果上屏
    st.pushMsg('assistant', res.reply_text, { recognition: deriveRecognition(res.actions) })
    executeActions(res.actions) // 镜头指令与语音同步
    st.setChatPhase('idle')
    await speakReply(res.reply_audio, res.reply_text)
  } catch (e) {
    const st = useAppStore.getState()
    st.pushMsg('assistant', `请求失败了：${e instanceof Error ? e.message : String(e)}。可以稍后重试，或先用文字提问~`)
    st.setChatPhase('idle')
  }
}

/** 用户主动提问前调用：打断带看、停掉当前播报 */
export function interruptForAsk(): void {
  stopTour(false)
}
