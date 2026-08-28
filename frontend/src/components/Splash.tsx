import { useAppStore } from '../store/useAppStore'

// 落地页：品牌 + slogan，进入房源列表（不锁指针、不加载 ply）
export function Splash() {
  const enterList = useAppStore((s) => s.enterList)

  return (
    <div className="splash">
      <div className="splash-card splash-brand">
        <img className="splash-icon" src="/brand/house_icon.svg" width={88} height={92} alt="" />
        <div className="splash-en">inNest</div>
        <h1>小驻看房</h1>
        <p className="splash-slogan">先驻进去，再住下来</p>
        <p className="splash-en-s">Step In. Stay Longer.</p>
        <button className="splash-btn" type="button" onClick={() => enterList()}>
          进入看房
        </button>
      </div>
    </div>
  )
}
