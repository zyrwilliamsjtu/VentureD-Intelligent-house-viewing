// ==== Push-to-Talk 录音器（MediaRecorder）====
// 按下开始、松开结束；mime 自动探测（Chrome/Edge → webm，Safari → mp4）

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

  /** 停止并返回录音；未在录音时返回 null */
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

  /** 录音音量（0~1），供波纹动画使用；未录音返回 0 */
  level(analyser: AnalyserNode | null): number {
    if (!analyser) return 0
    const buf = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(buf)
    let sum = 0
    for (const v of buf) sum += v
    return Math.min(1, sum / buf.length / 64)
  }

  get analyserSource(): MediaStream | null {
    return this.stream
  }

  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}
