import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

const AUTO_MS = 6000

/** HUD 信息卡：show_card 的 title + lines，可关，数秒后自动消失 */
export function InfoCard() {
  const card = useAppStore((s) => s.infoCard)
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!card) {
      setVisible(false)
      return
    }
    setVisible(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setVisible(false)
      useAppStore.getState().clearInfoCard()
    }, AUTO_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [card?.key])

  if (!card || !visible) return null

  return (
    <div className="info-card" role="dialog" aria-label={card.title}>
      <div className="info-card-head">
        <span className="info-card-title">{card.title}</span>
        <button
          type="button"
          className="info-card-close"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current)
            setVisible(false)
            useAppStore.getState().clearInfoCard()
          }}
          aria-label="关闭信息卡"
        >
          关闭
        </button>
      </div>
      {card.lines.length > 0 && (
        <ul className="info-card-lines">
          {card.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
