import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { sendText, sendAudio, interruptForAsk } from '../chat/chatFlow'
import { stopAudio } from '../audio/player'
import { PttRecorder } from '../audio/recorder'

const QUICK_QUESTIONS = ['厨房多大？', '层高多少？', '带我去主卧看看']

// ==== 右栏：AI 对话面板（小安）====
// 按住圆形语音按钮说话 / 文字输入；识别来源卡展示回答依据
export function ChatPanel() {
  const messages = useAppStore((s) => s.messages)
  const phase = useAppStore((s) => s.chatPhase)
  const tourState = useAppStore((s) => s.tourState)
  const setCollapsed = useAppStore((s) => s.setCollapsed)

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<PttRecorder | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, phase])

  const busy = phase === 'thinking' || phase === 'uploading'

  const submitText = (raw?: string) => {
    const text = (raw ?? inputRef.current?.value ?? '').trim()
    if (!text || phase !== 'idle') return
    if (inputRef.current) inputRef.current.value = ''
    interruptForAsk()
    void sendText(text)
  }

  // ---- Push-to-Talk ----
  const startHold = async () => {
    const s = useAppStore.getState()
    if (s.chatPhase !== 'idle') return
    interruptForAsk()
    stopAudio()
    s.setChatPhase('recording')
    recRef.current ??= new PttRecorder()
    try {
      await recRef.current.start()
    } catch (e) {
      s.setChatPhase('idle')
      s.setToast(e instanceof Error ? e.message : '麦克风不可用，请改用文字提问')
    }
  }

  const finishHold = async (send: boolean) => {
    const s = useAppStore.getState()
    if (s.chatPhase !== 'recording') return
    const rec = recRef.current
    if (!rec) {
      s.setChatPhase('idle')
      return
    }
    const r = await rec.stop()
    s.setChatPhase('idle')
    if (!send || !r) return
    if (r.durationMs < 350) {
      s.setToast('按住时间太短，长按说话后松开发送')
      return
    }
    s.setChatPhase('uploading')
    await sendAudio({ blob: r.blob, mime: r.mime, durationMs: r.durationMs })
  }

  // ---- AI 状态（简报：讲解中/聆听中/思考中）----
  const status =
    phase === 'recording'
      ? { text: '聆听中 · 请讲', cls: 'blue' }
      : busy
        ? { text: '思考中…', cls: 'gray' }
        : tourState === 'running'
          ? { text: '讲解中 · 可随时打断', cls: 'green' }
          : { text: '在线 · 随时提问', cls: 'green' }

  const phaseText =
    phase === 'recording' ? '正在聆听 · 松开发送' : phase === 'uploading' ? '语音识别中…' : phase === 'thinking' ? '小安思考中…' : '按住语音按钮，或输入文字'

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div className={`orb ${busy || tourState === 'running' ? 'speaking' : ''}`}>安</div>
        <div className="chat-head-mid">
          <div className="chat-name">AI 置业顾问 · 小安</div>
          <div className={`chat-status ${status.cls}`}>{status.text}</div>
        </div>
        <button className="collapse-btn" title="收起对话" onClick={() => setCollapsed(true)}>
          ▾
        </button>
      </div>

      <div className="msg-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="msg-empty">
            您好，我是 AI 置业顾问小安，可以带您线上看房。
            <br />
            试试快捷提问，或按住语音按钮说话。
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <div className={`msg ${m.role}`}>
              {m.role === 'assistant' && <div className="avatar">安</div>}
              <div className="bubble">{m.text}</div>
            </div>
            {m.role === 'assistant' && m.recognition && m.recognition.length > 0 && (
              <div className="recog-card">
                <span className="dot blue" />
                空间识别：{m.recognition.join(' / ')}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="avatar">安</div>
            <div className="bubble typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {messages.length < 3 && (
        <div className="quick-chips">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} className="chip" onClick={() => submitText(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className={`recording-hint ${phase === 'recording' ? 'show' : ''}`}>
        <span className="rec-dot" /> 正在聆听，松开发送
      </div>

      <div className="chat-input-row">
        <button
          className={`mic-btn ${phase === 'recording' ? 'recording' : ''}`}
          disabled={busy}
          title={phaseText}
          onPointerDown={(e) => {
            e.preventDefault()
            void startHold()
          }}
          onPointerUp={(e) => {
            e.preventDefault()
            void finishHold(true)
          }}
          onPointerLeave={() => void finishHold(false)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
          </svg>
          语音
        </button>
        <input
          ref={inputRef}
          className="input"
          placeholder="输入问题，或按住说话…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitText()
          }}
          disabled={phase === 'recording'}
        />
      </div>
      <div className="mic-hint">{phaseText}</div>
    </div>
  )
}
