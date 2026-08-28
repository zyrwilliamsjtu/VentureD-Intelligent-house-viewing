import { useAppStore } from '../store/useAppStore'
import { startTour, stopTour } from '../scene/tourPlayer'

/** HUD 左上：开始/停止带看（最小按钮，不改对话面板） */
export function TourBar({ worldId }: { worldId: string }) {
  const active = useAppStore((s) => s.tourActive)
  const label = useAppStore((s) => s.tourLabel)

  const onClick = () => {
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

  return (
    <button
      type="button"
      className={active ? 'tour-btn on' : 'tour-btn'}
      onClick={onClick}
      title={active ? '停止带看' : '按动线依次参观房间'}
    >
      {active ? `停止带看${label ? ` · ${label}` : ''}` : '开始带看'}
    </button>
  )
}
