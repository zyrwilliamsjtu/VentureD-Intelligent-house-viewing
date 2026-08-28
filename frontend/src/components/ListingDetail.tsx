import { useEffect, useState } from 'react'
import type { WorldListing } from '../scene/worlds'
import { fetchSceneGraph } from '../scene/sceneGraphFetch'
import type { RepoRoom, RepoSceneGraph } from '../services/mock/data'
import { Floorplan2D } from './Floorplan2D'

const ZH: Record<string, string> = {
  bed: '床',
  sofa: '沙发',
  tv_cabinet: '电视柜',
  stove: '灶台',
  dining_table: '餐桌',
  chair: '椅子',
  wardrobe: '衣柜',
  desk: '书桌',
  refrigerator: '冰箱',
  washing_machine: '洗衣机',
  toilet: '马桶',
  shower: '淋浴',
  sink: '洗手台',
  cabinet: '柜子',
  coffee_table: '茶几',
  bedside_table: '床头柜',
  bookshelf: '书架',
}

const HERO = [
  'bed',
  'sofa',
  'dining_table',
  'desk',
  'refrigerator',
  'tv_cabinet',
  'wardrobe',
  'bedside_table',
  'coffee_table',
  'stove',
  'washing_machine',
  'bookshelf',
  'toilet',
  'shower',
  'sink',
  'cabinet',
]
const SKIP = new Set(['curtain', 'plant', 'lamp'])

function furnitureOf(room: RepoRoom): string[] {
  const seen = new Set<string>()
  for (const inst of room.instances ?? []) {
    const cat = inst.category
    if (!cat || SKIP.has(cat)) continue
    seen.add(cat)
  }
  const ordered = [...HERO.filter((c) => seen.has(c)), ...[...seen].filter((c) => !HERO.includes(c))]
  const names: string[] = []
  for (const cat of ordered.slice(0, 5)) {
    const zh = ZH[cat]
    if (zh && !names.includes(zh)) names.push(zh)
  }
  return names
}

export function ListingDetail({
  listing,
  onClose,
  onEnter,
}: {
  listing: WorldListing
  onClose: () => void
  onEnter: () => void
}) {
  const [scene, setScene] = useState<RepoSceneGraph | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    setScene(undefined)
    fetchSceneGraph(listing.world_id).then((sg) => {
      if (alive) setScene(sg)
    })
    return () => {
      alive = false
    }
  }, [listing.world_id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rooms = (scene?.rooms ?? []).filter((r) => r.name && r.name !== '其他')

  return (
    <div className="ld-overlay" onClick={onClose} role="presentation">
      <div
        className="ld-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ld-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ld-head">
          <div>
            <h2 id="ld-title">{listing.title}</h2>
            <div className="ld-code">
              {listing.code ?? ''}
              {listing.layout ? ` · ${listing.layout}` : ''}
              {listing.is_real ? ' · 实景' : ''}
            </div>
          </div>
          <button type="button" className="ld-close" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </header>

        <div className="ld-body">
          <div className="ld-plan">
            {scene === undefined ? (
              <div className="fp-placeholder">正在读取户型…</div>
            ) : scene ? (
              <Floorplan2D rooms={scene.rooms} orientation={listing.orientation} />
            ) : (
              <div className="fp-placeholder">户型图暂不可用</div>
            )}
          </div>
          <div className="ld-info">
            <div className="ld-price">{listing.price}</div>
            <div className="ld-meta">
              {[listing.area ? `${listing.area}㎡` : '', listing.orientation, listing.floor ? `${listing.floor} 层` : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
            {listing.highlight ? <p className="ld-hl">{listing.highlight}</p> : null}
            {listing.tags && listing.tags.length > 0 ? (
              <div className="ld-tags">
                {listing.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            ) : null}
            <h3>房间</h3>
            {scene === undefined ? (
              <p className="ld-muted">正在读取房间…</p>
            ) : rooms.length ? (
              <ul className="ld-rooms">
                {rooms.map((r) => {
                  const furn = furnitureOf(r)
                  return (
                    <li key={r.id}>
                      <strong>
                        {r.name}
                        {typeof r.area === 'number' ? ` · ${r.area}平` : ''}
                      </strong>
                      {furn.length ? <span>{furn.join('、')}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="ld-muted">房间清单暂不可用</p>
            )}
          </div>
        </div>

        <footer className="ld-foot">
          <button type="button" className="splash-btn ld-enter" onClick={onEnter}>
            进入3D空间
          </button>
        </footer>
      </div>
    </div>
  )
}
