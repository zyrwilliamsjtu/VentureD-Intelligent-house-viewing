import { useAppStore } from '../store/useAppStore'
import { apiMode } from '../services/api'
import { startTour, stopTour } from '../tour/tourPlayer'
import { runDemoSequence } from '../demo/demoSequence'

// ==== 顶部栏：返回 | 房源标题 | 演示模式 | 带看状态 | 数据模式 ====
export function TopBar() {
  const house = useAppStore((s) => s.house)
  const tourState = useAppStore((s) => s.tourState)
  const demoMode = useAppStore((s) => s.demoMode)
  const setToast = useAppStore((s) => s.setToast)
  const setDemo = useAppStore((s) => s.setDemo)
  const touring = tourState === 'running'

  const toggleDemo = () => {
    if (demoMode) {
      setDemo(false)
      setToast('演示模式已关闭')
    } else {
      setDemo(true)
      void runDemoSequence()
    }
  }

  return (
    <header className="topbar">
      <button
        className="back-btn"
        title="返回"
        onClick={() => setToast('演示版无上级页面')}
      >
        ←
      </button>

      <div className="house-title">
        {house?.meta.title ?? '加载中…'}
        {house && (
          <span className="house-sub">
            {house.meta.area}㎡ · {house.meta.orientation}
          </span>
        )}
      </div>

      <div className="topbar-right">
        <button className={`demo-pill ${demoMode ? 'on' : ''}`} onClick={toggleDemo}>
          <span className="pill-dot" />
          {demoMode ? '演示模式 ON' : '演示模式 OFF'}
        </button>
        <button
          className={`tour-pill ${touring ? 'on' : ''}`}
          onClick={() => (touring ? stopTour(true) : void startTour(0))}
        >
          {touring ? 'AI 带看中 · 点击停止' : '开始 AI 带看'}
        </button>
        <span className={`mode-badge ${apiMode}`}>{apiMode === 'mock' ? 'MOCK' : 'LIVE'}</span>
      </div>
    </header>
  )
}
