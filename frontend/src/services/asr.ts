import type { AsrResponse } from '../types/api'
import { audioExt, type Recording } from './recorder'

// ==== ASR 服务（SPEC v2.2 §3.2 · POST /api/agent/asr）====
// 自研 mock 已下线（2026-08-28）：ASR 由后端队友网关提供。
// multipart 上传录音，10s 超时（SPEC §0，注意不是 chat 的 30s）。
// 空文本 {"text":""} 是正常返回（空语音/噪音），调用方按「没听清」处理，不是异常

// 默认空 = 同源相对路径（dev 走 vite proxy /api → 后端网关）；与 agent.ts 同策略
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export async function agentAsr(rec: Recording): Promise<AsrResponse> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000) // SPEC §0：asr 10s
  try {
    const fd = new FormData()
    // 文件名带对扩展名；不要手动设 Content-Type（浏览器自动带 boundary）
    fd.append('audio', rec.blob, `voice.${audioExt(rec.mime)}`)
    const res = await fetch(`${BASE}/api/agent/asr`, { method: 'POST', body: fd, signal: ctrl.signal })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { code?: string; message?: string }
        msg = body.message ? `[${body.code ?? 'ASR_FAILED'}] ${body.message}` : msg
      } catch {
        /* ignore */
      }
      throw new Error(msg)
    }
    return (await res.json()) as AsrResponse
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('语音识别超时')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
