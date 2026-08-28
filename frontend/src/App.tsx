import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHouse } from './services/api'
import { AholoViewport } from './scene/AholoViewport'
import { Splash } from './components/Splash'
import { WalkHud } from './components/WalkHud'

// PI 决策 2（2026-08-28）：demo 统一 0330 真实场景；world_id 唯一来源 VITE_WORLD_ID
// （.env 缺省也回退 w_0330_840483，与 3D 视口/后端 GT/camera_poses 同一套 id）
const WORLD_ID = (import.meta.env.VITE_WORLD_ID as string | undefined) || 'w_0330_840483'

export default function App() {
  const entered = useAppStore((s) => s.entered)

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
      {entered && <WalkHud />}
      {!entered && <Splash />}
    </div>
  )
}
