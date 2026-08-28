import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { WorldListing } from '../scene/worlds'
import type { House, HouseObject, Zone } from '../types/api'

/** 进入 3D 后的常驻房源卡。字段只来自 listings + scene_graph，无则省略、不编造。 */

const ZH: Record<string, string> = {
  bed: '床',
  sofa: '沙发',
  tv_cabinet: '电视柜',
  stove: '灶台',
  dining_table: '餐桌',
  wardrobe: '衣柜',
  desk: '书桌',
  refrigerator: '冰箱',
  washing_machine: '洗衣机',
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
  'bookshelf',
  'stove',
  'washing_machine',
]

function fmtArea(n: number | undefined): string {
  if (typeof n !== 'number' || !(n > 0)) return ''
  return Number.isInteger(n) ? `${n}㎡` : `${n.toFixed(1)}㎡`
}

/** 标题已含户型/面积时，卖点只留后半句。 */
function extraSell(hl: string | undefined, layout: string, area?: number): string {
  if (!hl) return ''
  let s = hl.trim()
  if (layout && s.startsWith(layout)) s = s.slice(layout.length)
  s = s.replace(/^约?\d+(\.\d+)?平[米]?[，,]?/, '')
  if (area) {
    const a = Number.isInteger(area) ? String(area) : String(area)
    s = s.replace(new RegExp(`约?${a.replace('.', '\\.')}\\s*平[米]?[，,]?`), '')
  }
  return s.replace(/^[，,。\s]+/, '').trim()
}

function tagUseful(tag: string, layout: string): boolean {
  const t = tag.trim()
  if (!t || t === layout) return false
  if (layout.includes('三室') && (t === '三房' || t === '三室一厅')) return false
  if (layout.includes('四室') && (t === '四房' || t === '四室一厅')) return false
  return true
}

function roomLine(z: Zone): string {
  const a = fmtArea(z.area_m2)
  return a ? `${z.label} ${a}` : z.label
}

function notableFurniture(house: House): string[] {
  const zoneName = new Map(house.zones.map((z) => [z.id, z.label]))
  const picks: string[] = []
  const seen = new Set<string>()
  const byHero = (o: HouseObject) => {
    const i = HERO.indexOf(o.class)
    return i < 0 ? 99 : i
  }
  const objs = [...house.objects].sort((a, b) => byHero(a) - byHero(b))
  for (const o of objs) {
    const zh = ZH[o.class]
    if (!zh) continue
    const room = zoneName.get(o.zone_id)
    if (!room || room === '其他') continue
    const key = `${room}-${zh}`
    if (seen.has(key) || seen.has(zh)) continue
    seen.add(key)
    seen.add(zh)
    picks.push(`${room}${zh}`)
    if (picks.length >= 4) break
  }
  return picks
}

export function PlaceFacts({ listing }: { listing?: WorldListing }) {
  const [open, setOpen] = useState(true)
  const house = useAppStore((s) => s.house) as House | null
  const roomId = useAppStore((s) => s.player?.room_id ?? null)
  const zone = house?.zones.find((z) => z.id === roomId) ?? null

  const title = listing?.title ?? house?.meta.title ?? '房源'
  const layout = listing?.layout || ''
  const area = listing?.area || house?.meta.area
  const price = listing?.price || house?.meta.price
  const floor = listing?.floor || house?.meta.floor
  const orient = listing?.orientation || house?.meta.orientation
  const sell = extraSell(listing?.highlight, layout, area)
  const tags = (listing?.tags?.length ? listing.tags : house?.meta.tags ?? []).filter((t) => tagUseful(t, layout))
  const rooms = (house?.zones ?? []).filter((z) => z.label && z.label !== '其他')
  const furniture = house ? notableFurniture(house) : []
  const hang = [fmtArea(area), price, orient, floor ? `${floor} 层` : ''].filter(Boolean)
  const roomPts = zone?.selling_points?.filter((s) => s && s !== zone.story_card).slice(0, 2) ?? []

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
          <div className="place-title">
            {title}
            {layout ? ` · ${layout}` : ''}
          </div>
          {listing?.code ? <div className="place-code">{listing.code}</div> : null}
          {hang.length > 0 ? <div className="place-meta">{hang.join(' · ')}</div> : null}

          {sell ? <div className="place-hl">{sell}</div> : null}
          {tags.length > 0 ? (
            <div className="place-tags">
              {tags.slice(0, 4).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          ) : null}

          {rooms.length > 0 ? (
            <div className="place-sec">
              <div className="place-sec-label">房间</div>
              <div className="place-rooms">{rooms.map(roomLine).join(' · ')}</div>
            </div>
          ) : null}

          {furniture.length > 0 ? (
            <div className="place-sec">
              <div className="place-sec-label">屋内</div>
              <div className="place-rooms">{furniture.join(' · ')}</div>
            </div>
          ) : null}

          <div className="place-room">
            {zone ? (
              <>
                <span className="place-room-name">
                  当前 {zone.label}
                  {fmtArea(zone.area_m2) ? ` · ${fmtArea(zone.area_m2)}` : ''}
                </span>
                {roomPts.length > 0 ? <div className="place-room-card">{roomPts.join(' · ')}</div> : null}
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
