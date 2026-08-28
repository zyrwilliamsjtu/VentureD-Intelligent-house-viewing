import { sendText } from '../chat/chatFlow'
import { appStore } from '../store/useAppStore'

// ==== 演示模式：预设对话序列（简报加分项）====
// 现场演示不依赖真实语音：点击「演示模式」自动模拟用户提问，完整走通
// 用户气泡 → AI 回答 → 视角飞行 + 高亮 的链路

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const SCRIPT = [
  '厨房多大？',
  '层高多少？',
  '带我去主卧看看',
]

let seqId = 0

export async function runDemoSequence(): Promise<void> {
  const my = ++seqId
  const s = appStore()
  s.setCollapsed(false) // 展开对话面板，让评委看到对话流
  s.pushMsg('assistant', '【演示模式】接下来自动模拟 3 轮用户提问，无需真实语音。')
  await sleep(900)

  for (const q of SCRIPT) {
    if (seqId !== my) return
    await sendText(q)
    if (seqId !== my) return
    await sleep(1000)
  }

  if (seqId !== my) return
  appStore().pushMsg('assistant', '演示序列结束。您可以继续自由提问，或点左侧空间列表切换房间~')
}

export function stopDemoSequence(): void {
  seqId++
}
