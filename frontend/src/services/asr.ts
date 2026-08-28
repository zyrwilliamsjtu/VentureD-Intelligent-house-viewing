import type { AsrResponse } from '../types/api'
import { audioExt, type Recording } from './recorder'

// ==== ASR 服务（SPEC v2.2 §3.2 · POST /api/agent/asr）====
// real：multipart 上传录音，10s 超时（SPEC §0，注意不是 chat 的 30s）
// mock：sleep 800ms 返回轮换预设问题 → 后端未就绪也能全程演练语音 Golden Path
// 空文本 {"text":""} 是正常返回（空语音/噪音），调用方按「没听清」处理，不是异常

// 默认空 = 同源相对路径（dev 走 vite proxy /api → 后端网关）；与 agent.ts 同策略
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** 统一入口：VITE_API_MODE=real 走后端网关，否则 mock */
export function agentAsr(rec: Recording): Promise<AsrResponse> {
  return import.meta.env.VITE_API_MODE === 'real' ? realAgentAsr(rec) : mockAgentAsr(rec)
}

async function realAgentAsr(rec: Recording): Promise<AsrResponse> {
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

// ---- mock 实现（轮换预设问题，覆盖三类演示场景：房间/家具/元信息）----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const DEMO_QUESTIONS = ['主卧在哪', '冰箱在哪', '这套房多大']
let demoIdx = 0

async function mockAgentAsr(rec: Recording): Promise<AsrResponse> {
  await sleep(600 + Math.random() * 400) // 模拟上传+识别延迟
  if (rec.durationMs < 300) return { text: '', duration_ms: rec.durationMs } // 误触统一空文本
  const text = DEMO_QUESTIONS[demoIdx++ % DEMO_QUESTIONS.length]
  return { text, duration_ms: rec.durationMs }
}
