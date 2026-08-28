import { useAppStore } from '../store/useAppStore'

// ==== 开场页：暗色编辑部风（Odin's Crow 参考）====
// 上下等宽页眉/页脚 + 居中大衬线标题；场景数据后台预载，不阻塞开场
export function Splash() {
  const enterList = useAppStore((s) => s.enterList)

  return (
    <div className="splash">
      <div className="splash-frame">
        <div className="splash-top mono">
          <span>AI 代看房 — VentureD</span>
          <span>© 2026</span>
        </div>

        <div className="splash-card">
          <div className="splash-kicker mono">3DGS 实景漫游 × AI 管家带看</div>
          <h1>
            足不出户
            <br />
            <em>实景</em>看房
          </h1>
          <div className="splash-meta">Preserving Spaces, Driving Trust</div>
          <div className="splash-note">群核 3DGS 点云渲染 · MOSS 大模型语音讲解</div>
          <button className="splash-btn" onClick={enterList}>
            开始看房
          </button>
          <div className="splash-hint mono">10 套精选房源 · 支持语音提问</div>
        </div>

        <div className="splash-bottom mono">
          <span>Groupcore Aholo · 3DGS</span>
          <span>MOSS LLM · Voice</span>
        </div>
      </div>
    </div>
  )
}
