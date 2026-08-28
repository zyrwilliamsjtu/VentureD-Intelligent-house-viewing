// ==== Push-to-Talk 录音器（自 _parked/audio/recorder.ts 回迁，2026-08-28 语音按钮启用）====
// 按下开始、松开结束；mime 自动探测（Chrome/Edge → webm，Safari → mp4）
// 注意：getUserMedia 需安全上下文（localhost / HTTPS），局域网 IP 裸 http 不可用

export interface Recording {
  blob: Blob
  mime: string
  durationMs: number
}

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return undefined
}

/** 上传文件用的扩展名（Safari 是 audio/mp4） */
export function audioExt(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export class PttRecorder {
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  private t0 = 0

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持录音（建议 Chrome / Edge）')
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
    const mimeType = pickMime()
    this.chunks = []
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.rec.start(200)
    this.t0 = Date.now()
  }

  /** 停止并返回录音；未在录音时返回 null。注意 stop() 异步，blob 在 onstop 后才完整 */
  stop(): Promise<Recording | null> {
    return new Promise((resolve) => {
      const rec = this.rec
      if (!rec || rec.state === 'inactive') {
        resolve(null)
        return
      }
      const mime = rec.mimeType || 'audio/webm'
      const dur = Date.now() - this.t0
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: mime })
        this.rec = null
        resolve(blob.size > 0 ? { blob, mime, durationMs: dur } : null)
      }
      rec.stop()
    })
  }

  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}
