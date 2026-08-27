// ==== 语音播放：后端 base64 音频优先，降级浏览器本地 TTS ====
// mock 模式无后端音频 → speak() 本地朗读；real 模式优先 reply_audio

let audioEl: HTMLAudioElement | null = null
let speakToken = 0

export function stopAudio(): void {
  speakToken++
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
  if (audioEl) {
    audioEl.pause()
    audioEl = null
  }
}

/** 播放后端返回的 base64 音频，结束后 resolve */
export function playBase64(mime: string, base64: string): Promise<void> {
  stopAudio()
  const token = speakToken
  return new Promise((resolve) => {
    try {
      audioEl = new Audio(`data:${mime};base64,${base64}`)
      audioEl.onended = () => resolve()
      audioEl.onerror = () => resolve()
      audioEl.play().catch(() => resolve())
      // 安全兜底：超长音频异常时最多等 60s
      setTimeout(() => {
        if (token === speakToken) resolve()
      }, 60000)
    } catch {
      resolve()
    }
  })
}

/** 本地 TTS 朗读（中文），结束后 resolve；不支持时按估时 resolve */
export function speak(text: string): Promise<void> {
  stopAudio()
  const token = speakToken
  const estimateMs = Math.min(30000, 2200 + text.length * 240)

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        resolve()
      }
    }
    // 估算时长兜底（部分环境 onend 不触发）
    const timer = setTimeout(() => {
      if (token === speakToken) finish()
    }, estimateMs)

    try {
      const synth = window.speechSynthesis
      if (!synth) {
        clearTimeout(timer)
        setTimeout(finish, 600)
        return
      }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.rate = 1.05
      const zh = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh'))
      if (zh) u.voice = zh
      u.onend = () => {
        clearTimeout(timer)
        finish()
      }
      u.onerror = () => {
        clearTimeout(timer)
        finish()
      }
      synth.speak(u)
    } catch {
      clearTimeout(timer)
      setTimeout(finish, 600)
    }
  })
}

/** 播放回答：有后端音频用音频，否则本地朗读 */
export function speakReply(audio: { mime: string; base64: string } | null | undefined, text: string): Promise<void> {
  if (audio?.base64) return playBase64(audio.mime, audio.base64)
  return speak(text)
}
