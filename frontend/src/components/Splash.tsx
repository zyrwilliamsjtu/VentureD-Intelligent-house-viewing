import { useAppStore } from '../store/useAppStore'
import { unlockAudio } from '../scene/agentActions'

// ==== 开场页：点击进入（同时完成 Pointer Lock 所需的用户手势）====
export function Splash() {
  const house = useAppStore((s) => s.house)
  const loading = useAppStore((s) => s.houseLoading)
  const error = useAppStore((s) => s.houseError)
  const enter = useAppStore((s) => s.enter)
  const showToast = useAppStore((s) => s.showToast)

  const onEnter = () => {
    unlockAudio()
    enter()
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
    showToast('欢迎来到示范房源', 'WASD 走动看看')
  }

  return (
    <div className="splash">
      <div className="splash-card">
        <div className="splash-kicker">AI 代看房 · VentureD</div>
        <h1>{house ? house.meta.title : '示范房源'}</h1>
        {house && (
          <div className="splash-meta">
            {house.meta.area}㎡ · {house.meta.orientation} · {house.meta.floor} 层
          </div>
        )}
        <div className="splash-note">第一视角漫游 · 3D 实景看房（选上方房源后进入）</div>
        {error ? (
          <button className="splash-btn" disabled>
            场景加载失败：{error}
          </button>
        ) : (
          <button className="splash-btn" onClick={onEnter} disabled={loading || !house}>
            {loading || !house ? '正在生成场景…' : '进入漫游'}
          </button>
        )}
        <div className="splash-hint">WASD 移动 · 鼠标视角 · Shift 快走</div>
      </div>
    </div>
  )
}
