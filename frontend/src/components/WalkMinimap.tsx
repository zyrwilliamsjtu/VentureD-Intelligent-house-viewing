import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { fetchSceneGraph } from '../scene/sceneGraphFetch'
import { cloudToScene } from '../scene/coords'
import { Floorplan2D } from './Floorplan2D'
import type { RepoSceneGraph } from '../services/mock/data'

export function WalkMinimap({ worldId, open, onClose }: { worldId: string; open: boolean; onClose: () => void }) {
  const [scene, setScene] = useState<RepoSceneGraph | null | undefined>(undefined)
  const player = useAppStore((s) => s.player)

  useEffect(() => {
    if (!open) return
    let alive = true
    setScene(undefined)
    fetchSceneGraph(worldId).then((sg) => {
      if (alive) setScene(sg)
    })
    return () => {
      alive = false
    }
  }, [open, worldId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.code === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const marker =
    player && player.world_id === worldId && player.position.length === 3
      ? (() => {
          const sc = cloudToScene(player.position, worldId)
          return { x: sc[0], z: sc[2] }
        })()
      : null

  return (
    <div className="mm-overlay" role="dialog" aria-label="俯瞰户型图">
      <div className="mm-card">
        <header className="mm-head">
          <span>俯瞰图</span>
          <button type="button" className="ld-close" onClick={onClose} aria-label="关闭俯瞰图">
            关闭
          </button>
        </header>
        {scene === undefined ? (
          <div className="fp-placeholder">正在读取户型…</div>
        ) : scene ? (
          <Floorplan2D rooms={scene.rooms} hideLabels marker={marker} />
        ) : (
          <div className="fp-placeholder">户型图暂不可用</div>
        )}
        <p className="mm-tip">橙点为当前位置 · 再按 M 或 Esc 关闭</p>
      </div>
    </div>
  )
}
