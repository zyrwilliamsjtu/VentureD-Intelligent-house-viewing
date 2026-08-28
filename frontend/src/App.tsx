import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHouse } from './services/api'
import { fetchListings } from './services/listings'
import { AholoViewport } from './scene/AholoViewport'
import { Splash } from './components/Splash'
import { HouseList } from './components/HouseList'
import { WalkHud } from './components/WalkHud'

// 页面流转：splash 品牌页 → list 房源列表 → walk 第一人称漫游（返回列表不卸载 3D）
// 性能：splash 是纯 DOM 落地页，不挂 3D 引擎（38MB 点云不白加载）；list 挂载但不渲染（白底盖住），walk 才真正渲染。
// scene/camera_poses/chat 的 world_id 跟随选中房源（联调指南 §4.5）；
// 未选房时默认 0330 作背景（也是 3D 视口的 LOD 世界，PI 决策 2）。
const DEFAULT_WORLD = (import.meta.env.VITE_WORLD_ID as string | undefined) || 'w_0330_840483'

export default function App() {
  const view = useAppStore((s) => s.view)
  const worldId = useAppStore((s) => s.listing?.worldId ?? DEFAULT_WORLD)

  // 房源列表：mount 即拉网关（失败已在服务内降级本地兜底，不阻塞 UI）
  useEffect(() => {
    let alive = true
    void fetchListings().then((r) => {
      if (alive) useAppStore.getState().loadListings(r)
    })
    return () => {
      alive = false
    }
  }, [])

  // 场景语义（房间 polygon/物体）：随选中房源的 world_id 变化重拉（api 层带 per-world 缓存）
  useEffect(() => {
    let alive = true
    useAppStore.getState().setHouse(null, true, null)
    ;(async () => {
      try {
        const h = await getHouse(worldId)
        if (!alive) return
        useAppStore.getState().setHouse(h)
      } catch (e) {
        if (alive) {
          useAppStore.getState().setHouse(null, false, e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [worldId])

  return (
    <div className="app">
      {view !== 'splash' && <AholoViewport />}
      {view === 'walk' && <WalkHud />}
      {view === 'list' && <HouseList />}
      {view === 'splash' && <Splash />}
    </div>
  )
}
