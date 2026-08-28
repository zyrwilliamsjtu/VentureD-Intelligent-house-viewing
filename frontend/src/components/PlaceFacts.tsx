import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { WorldListing } from '../scene/worlds'
import type { House } from '../types/api'

/** 进入 3D 后的常驻房源/房间卡（listings + scene_graph zones）。Agent show_card 仍用 InfoCard。 */
export function PlaceFacts({ listing }: { listing?: WorldListing }) {
  const [open, setOpen] = useState(true)
  const house = useAppStore((s) => s.house) as House | null
  const roomId = useAppStore((s) => s.player?.room_id ?? null)
  const zone = house?.zones.find((z) => z.id === roomId) ?? null

  const title = listing?.title ?? house?.meta.title ?? '房源'
  const layout = listing?.layout || house?.meta.tags?.[0] || ''
  const area = listing?.area || house?.meta.area
  const price = listing?.price || house?.meta.price
  const floor = listing?.floor
  const highlight = listing?.highlight
  const tags = listing?.tags?.length ? listing.tags : house?.meta.tags

  return (
    <div className="place-card">
      <div className="place-head">
        <span className="place-kicker">当前房源</span>
        <button type="button" className="place-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '展开'}
        </button>
      </div>
      {open && (
        <>
          <div className="place-title">{title.replace(/^InteriorGS\s+/, '')}</div>
          <div className="place-meta">
            {[layout, area ? `${area}㎡` : '', price, floor].filter(Boolean).join(' · ')}
          </div>
          {highlight ? <div className="place-hl">{highlight}</div> : null}
          {tags && tags.length > 0 ? <div className="place-tags">{tags.slice(0, 4).join(' · ')}</div> : null}
          <div className="place-room">
            {zone ? (
              <>
                <span className="place-room-name">
                  {zone.label}
                  {typeof zone.area_m2 === 'number' ? ` · ${zone.area_m2}㎡` : ''}
                </span>
                {zone.story_card ? <div className="place-room-card">{zone.story_card}</div> : null}
              </>
            ) : (
              <span className="place-room-name muted">未进房间</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
