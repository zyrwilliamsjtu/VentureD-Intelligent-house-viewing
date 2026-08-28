import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { getHouse } from './services/api'
import { resetAgentSession } from './services/agent'
import { stopTour } from './scene/tourPlayer'
import { AholoViewport } from './scene/AholoViewport'
import { WORLD_LISTINGS, loadListings, type WorldListing } from './scene/worlds'
import { Splash } from './components/Splash'
import { HouseList } from './components/HouseList'
import { WalkHud } from './components/WalkHud'

export default function App() {
  const view = useAppStore((s) => s.view)
  const entered = useAppStore((s) => s.entered)
  const [worldId, setWorldId] = useState('')
  const [listings, setListings] = useState<WorldListing[]>(WORLD_LISTINGS)

  useEffect(() => {
    let alive = true
    loadListings().then((rows) => {
      if (alive && rows.length) setListings(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (view !== 'walk' || !worldId) return
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
  }, [worldId, view])

  const pickListing = (w: WorldListing) => {
    stopTour()
    resetAgentSession()
    useAppStore.getState().clearInfoCard()
    setListings((prev) => (prev.some((x) => x.world_id === w.world_id) ? prev : [...prev, w]))
    setWorldId(w.world_id)
    useAppStore.getState().enterWalk()
    useAppStore.getState().showToast('欢迎看房', '点击画面开始漫游 · WASD 走动')
    console.info('[world] enter → %s', w.world_id)
  }

  const backToList = () => {
    stopTour()
    document.exitPointerLock?.()
    useAppStore.getState().exitToList()
  }

  const listing =
    listings.find((w) => w.world_id === worldId) ?? WORLD_LISTINGS.find((w) => w.world_id === worldId)

  return (
    <div className="app">
      {view === 'walk' && worldId ? <AholoViewport key={worldId} worldId={worldId} /> : null}
      {view === 'walk' && entered && worldId ? (
        <WalkHud worldId={worldId} listing={listing} onBackToList={backToList} />
      ) : null}
      {view === 'list' ? <HouseList onPick={pickListing} /> : null}
      {view === 'splash' ? <Splash /> : null}
    </div>
  )
}
