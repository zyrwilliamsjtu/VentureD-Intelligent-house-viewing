import { useAppStore } from '../store/useAppStore'

// ==== 对话折叠态演示条（简报加分项）：不抢占看房视野 ====
export function FoldedBar() {
  const messages = useAppStore((s) => s.messages)
  const setCollapsed = useAppStore((s) => s.setCollapsed)
  const last = [...messages].reverse().find((m) => m.role === 'assistant')
  const zone = useAppStore((s) => s.currentZone)
  const house = useAppStore((s) => s.house)
  const zoneLabel = house?.zones.find((z) => z.id === zone)?.label

  const text = last ? last.text.replace(/\s+/g, ' ').slice(0, 30) : 'AI 置业顾问已就绪'
  const prefix = zoneLabel ? `正在讲解：${zoneLabel}` : '正在讲解'

  return (
    <button className="folded-bar" onClick={() => setCollapsed(false)}>
      <span className="fb-wave">▍▍▍</span>
      <span className="fb-text">
        {prefix} · {text}…
      </span>
      <span className="fb-tag">对话折叠态：不抢占看房视野，点击展开</span>
    </button>
  )
}
