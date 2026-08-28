import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { agentChat, getSessionId } from '../services/agent'
import { agentAsr } from '../services/asr'
import { PttRecorder, type Recording } from '../services/recorder'
import {
  agentChatWithAudio,
  executeAgentActions,
  onTtsBlocked,
  playReplyVoice,
  playReplyVoiceManual,
  playTts,
  unlockAudio,
} from '../scene/agentActions'
import { useRoomNarration } from '../scene/narration'
import { TourBar } from './TourBar'
import { InfoCard } from './InfoCard'
import { PlaceFacts } from './PlaceFacts'
import type { House } from '../types/api'
import type { WorldListing } from '../scene/worlds'

// ==== 极简漫游 HUD：房源信息 · 当前房间 · Agent 对话 · 操作提示 ====
// Agent 面板：占位按钮 → 真接线（services/agent.ts mock/real 一键切换）
// 请求带玩家上下文（store.player，点云系），响应动作走 executeAgentActions
// 语音：按住说话（PttRecorder）→ /api/agent/asr 转文字 → 复用 sendText 走 chat 链路

const FAST_Q = /在哪|带我|去看看|户型|面积|价格|朝向|多大|有没有|有无|你好|您好|冰箱|沙发|洗衣机|厨房|主卧|卫生间|洗手间|厕所|客厅|餐桌|桌子/

function looksOpenQuestion(q: string): boolean {
  return !FAST_Q.test(q)
}

function lockCanvas() {
  const canvas = document.querySelector('canvas')
  void canvas?.requestPointerLock()
}

interface Msg {
  role: 'user' | 'assistant'
  text: string
}

function AgentChat({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [ttsReplay, setTtsReplay] = useState<string | null>(null)
  const [replay, setReplay] = useState<{ text: string; url?: string | null } | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => onTtsBlocked(setTtsReplay), [])

  // 打开面板：释放指针锁定（要打字），聚焦输入框
  useEffect(() => {
    if (!open) return
    document.exitPointerLock?.()
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [msgs, busy])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    await sendText(text)
  }

  /** 统一发送入口：打字静音；PTT 带 audio 才会拿到 tts_url 自动播 */
  async function sendText(text: string, rec?: Recording | null) {
    const q = text.trim()
    if (!q || busy) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    if (looksOpenQuestion(q)) {
      useAppStore.getState().showToast('让我想想…', '正在理解您的问题')
    }
    setBusy(true)
    try {
      const player = useAppStore.getState().player
      const worldId = player?.world_id || (import.meta.env.VITE_WORLD_ID as string | undefined) || ''
      const payload = {
        session_id: getSessionId(),
        world_id: worldId,
        user_text: q,
        player_position: player?.position,
        player_facing: player?.facing,
        room_id: player?.room_id ?? null,
        event: 'button_press' as const,
      }
      const res = rec ? await agentChatWithAudio(payload, rec) : await agentChat(payload)
      setMsgs((m) => [...m, { role: 'assistant', text: res.reply_text }])
      setReplay({ text: res.reply_text, url: res.tts_url })
      await executeAgentActions(res.actions, worldId)
      unlockAudio()
      playReplyVoice(res.reply_text, res.tts_url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '网络错误'
      setMsgs((m) => [...m, { role: 'assistant', text: `Agent 暂不可用：${msg}` }])
    } finally {
      setBusy(false)
    }
  }

  // ==== 语音按钮（Push-to-Talk）：按下录音 → 松开 ASR → 自动发送 ====
  const [voice, setVoice] = useState<'idle' | 'recording' | 'recognizing'>('idle')
  const recorderRef = useRef<PttRecorder | null>(null)
  const pressSeq = useRef(0) // 每次按下/松开 +1；丢弃「松开早于麦克风授权」的孤儿录音
  const autoStopRef = useRef<number | null>(null)

  function recorder(): PttRecorder {
    if (!recorderRef.current) recorderRef.current = new PttRecorder()
    return recorderRef.current
  }

  async function startVoice() {
    unlockAudio()
    if (busy || voice !== 'idle') return
    const seq = ++pressSeq.current
    try {
      await recorder().start() // 可能因权限被拒抛错
    } catch {
      useAppStore.getState().showToast('麦克风不可用', '请允许麦克风权限，或用打字输入')
      return
    }
    if (seq !== pressSeq.current) {
      void recorder().stop() // 授权期间用户已松开：丢弃
      return
    }
    setVoice('recording')
    autoStopRef.current = window.setTimeout(() => void finishVoice(), 15_000) // SPEC：音频 ≤15s
  }

  async function finishVoice() {
    pressSeq.current++ // 使 startVoice 中尚未 resolve 的分支失效
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    const rec: Recording | null = (await recorderRef.current?.stop()) ?? null
    if (!rec || rec.durationMs < 300) {
      setVoice('idle') // 未在录 / 误触短按：静默丢弃
      return
    }
    setVoice('recognizing')
    try {
      const { text } = await agentAsr(rec)
      if (!text.trim()) {
        useAppStore.getState().showToast('没听清', '请再按住说一次') // {"text":""} 是正常返回
        return
      }
      setVoice('idle')
      await sendText(text, rec)
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : '网络错误'
      useAppStore.getState().showToast('语音识别失败', msg)
    } finally {
      setVoice('idle')
    }
  }

  // 卸载：停录音、释放麦克风
  useEffect(() => {
    return () => {
      pressSeq.current++
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current)
      void recorderRef.current?.stop()
      recorderRef.current?.release()
    }
  }, [])

  if (!open) {
    return (
      <button className="agent-stub live" onClick={() => setOpen(true)} title="问 AI 置业顾问">
        <span className="dot" />
        AI 讲解 · 询问
      </button>
    )
  }

  return (
    <div className="agent-panel">
      <div className="agent-head">
        <span className="ah-title">AI 置业顾问</span>
        <button className="agent-close" onClick={() => setOpen(false)}>
          收起
        </button>
      </div>
      <div className="agent-list" ref={listRef}>
        {msgs.length === 0 && <div className="agent-tip">试试：「主卧在哪」「冰箱在哪」「这套房多大」<br />也可以按住 🎙 说话</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="msg assistant pending">让我想想…</div>}
        {voice === 'recognizing' && !busy && <div className="msg assistant pending">语音识别中…</div>}
        {(ttsReplay || replay) && (
          <button
            className="tts-replay"
            type="button"
            onClick={() => {
              unlockAudio()
              if (ttsReplay) playTts(ttsReplay)
              else if (replay) playReplyVoiceManual(replay.text, replay.url)
            }}
          >
            🔊 播报
          </button>
        )}
      </div>
      <div className="agent-input">
        <input
          ref={inputRef}
          value={input}
          placeholder={voice === 'recording' ? '正在录音…松开发送' : '输入问题，回车发送'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          disabled={busy || voice !== 'idle'}
        />
        <button
          className={`voice-btn ${voice}`}
          disabled={busy || voice === 'recognizing'}
          onPointerDown={() => void startVoice()}
          onPointerUp={() => void finishVoice()}
          onPointerLeave={() => {
            if (voice === 'recording') void finishVoice()
          }}
          onContextMenu={(e) => e.preventDefault()}
          title={voice === 'recording' ? '松开发送（最多 15 秒）' : '按住说话'}
          aria-label="按住说话"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
            <path d="M12 18v4" />
          </svg>
        </button>
        <button className="send" onClick={() => void send()} disabled={busy || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}

function CenterToast() {
  const toast = useAppStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), useAppStore.getState().tourActive ? 3800 : 2600)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [toast?.key])

  if (!toast || !visible) return null
  return (
    <div className="center-toast" key={toast.key}>
      <div className="ct-title">{toast.text}</div>
      {toast.sub && <div className="ct-sub">{toast.sub}</div>}
    </div>
  )
}

export function WalkHud({ worldId, listing }: { worldId: string; listing?: WorldListing }) {
  const locked = useAppStore((s) => s.pointerLocked)
  const [agentOpen, setAgentOpen] = useState(false)
  const roomId = useAppStore((s) => s.player?.room_id ?? null)
  const house = useAppStore((s) => s.house) as House | null
  const zone = house?.zones.find((z) => z.id === roomId) ?? null
  useRoomNarration(worldId) // 进房主动讲解：room_id 切换 → enter_room → toast + TTS

  return (
    <div className="walk-hud">
      {/* 左上：房源信息 */}
      <div className="hud-tl">
        <PlaceFacts listing={listing} />
        <TourBar worldId={worldId} />
      </div>

      {/* 右上：当前房间 + Agent 对话 */}
      <div className="hud-tr">
        <div className="room-chip">{zone ? zone.label : '自由漫游'}</div>
        <AgentChat open={agentOpen} setOpen={setAgentOpen} />
      </div>

      {/* 进房提示 / 信息卡 */}
      <CenterToast />
      <InfoCard />

      {/* 传送准星（锁定时显示，点击视线落点瞬移） */}
      {locked && <div className="crosshair" />}

      {/* 底部操作提示 */}
      <div className="hint-bar">
        <span><b>W A S D</b> 移动</span>
        <span><b>鼠标</b> 视角</span>
        <span><b>点击</b> 传送</span>
        <span><b>Shift</b> 快走</span>
        <span><b>B</b> 带看</span>
        <span><b>ESC</b> 释放鼠标</span>
      </div>

      {/* 未锁定时的恢复层（Agent 面板打开时不盖住输入框） */}
      {!locked && !agentOpen && (
        <div className="resume-overlay" onClick={lockCanvas}>
          <div className="resume-card">
            <div className="resume-title">点击继续漫游</div>
            <div className="resume-sub">WASD 移动 · 鼠标控制视角 · ESC 暂停</div>
          </div>
        </div>
      )}
    </div>
  )
}
