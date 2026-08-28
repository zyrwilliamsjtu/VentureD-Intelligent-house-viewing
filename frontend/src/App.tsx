import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHouse } from './services/api'
import { AholoViewport } from './scene/AholoViewport'
import { Splash } from './components/Splash'
import { WalkHud } from './components/WalkHud'

const HOUSE_ID = 'w_mock_001' // 仓库 mock 唯一事实源（scene_graph.world_id）

export default function App() {
  const entered = useAppStore((s) => s.entered)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const h = await getHouse(HOUSE_ID)
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
      {entered && <WalkHud />}
      {!entered && <Splash />}
    </div>
  )
}
