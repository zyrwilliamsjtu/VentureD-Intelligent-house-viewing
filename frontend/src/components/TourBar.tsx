import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { startTour, stopTour } from '../scene/tourPlayer'

function toggleTour(worldId: string) {
  const active = useAppStore.getState().tourActive
  if (active) {
    stopTour()
    useAppStore.getState().showToast('已停止带看')
    return
  }
  if (!worldId) {
    useAppStore.getState().showToast('带看暂不可用', '未选择房源')
    return
  }
  void startTour(worldId)
}

/** HUD 左上：开始/停止带看。Pointer Lock 时鼠标点不到 HUD，用 B 键兜底。 */
export function TourBar({ worldId }: { worldId: string }) {
  const active = useAppStore((s) => s.tourActive)
  const label = useAppStore((s) => s.tourLabel)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyB' || e.repeat) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault()
      toggleTour(worldId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [worldId])

  return (
    <button
      type="button"
      className={active ? 'tour-btn on' : 'tour-btn'}
      onClick={() => toggleTour(worldId)}
      title={active ? '停止带看（B）' : '开始带看（漫游中按 B，无需 ESC）'}
    >
      {active ? `停止带看${label ? ` · ${label}` : ''}` : '开始带看'}
      <span className="tour-key">B</span>
    </button>
  )
}
