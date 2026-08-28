import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHouse } from './services/api'
import { AholoViewport } from './scene/AholoViewport'
import { Splash } from './components/Splash'
import { HouseList } from './components/HouseList'
import { WalkHud } from './components/WalkHud'

// 页面流转：splash 品牌页 → list 房源列表 → walk 第一人称漫游（返回列表不卸载 3D）
// world_id 唯一来源 VITE_WORLD_ID（PI 决策 2：demo 统一 0330 真实场景）
const WORLD_ID = (import.meta.env.VITE_WORLD_ID as string | undefined) || 'w_0330_840483'

export default function App() {
  const view = useAppStore((s) => s.view)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const h = await getHouse(WORLD_ID)
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
  }, [])

  return (
    <div className="app">
      <AholoViewport />
      {view === 'walk' && <WalkHud />}
      {view === 'list' && <HouseList />}
      {view === 'splash' && <Splash />}
    </div>
  )
}
