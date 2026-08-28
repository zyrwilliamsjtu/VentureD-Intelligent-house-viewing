import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHouse } from './services/api'
import { resetAgentSession } from './services/agent'
import { stopTour } from './scene/tourPlayer'
import { AholoViewport } from './scene/AholoViewport'
import { DEFAULT_WORLD_ID, WORLD_LISTINGS, loadListings, type WorldListing } from './scene/worlds'
import { Splash } from './components/Splash'
import { WalkHud } from './components/WalkHud'

export default function App() {
  const entered = useAppStore((s) => s.entered)
  const [worldId, setWorldId] = useState(DEFAULT_WORLD_ID)
  const [listings, setListings] = useState<WorldListing[]>(WORLD_LISTINGS)

  useEffect(() => {
    let alive = true
    loadListings().then((rows) => {
      if (alive) setListings(rows)
    })
    return () => {
      alive = false
    }
  }, [])

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

  const selectWorld = (id: string) => {
    if (id === worldId) return
    stopTour()
    resetAgentSession()
    setWorldId(id)
    console.info('[world] switch → %s', id)
  }

  return (
    <div className="app">
      <AholoViewport key={worldId} worldId={worldId} />
      <div className="world-bar" role="navigation" aria-label="选择房源">
        {(listings.length ? listings : WORLD_LISTINGS).map((w) => (
          <button
            key={w.world_id}
            type="button"
            className={w.world_id === worldId ? 'world-chip on' : 'world-chip'}
            onClick={() => selectWorld(w.world_id)}
          >
            {w.title.replace('InteriorGS ', '')}
            <span className="world-price">{w.price}</span>
          </button>
        ))}
      </div>
      {entered && <WalkHud worldId={worldId} />}
      {!entered && <Splash />}
    </div>
  )
}
