import { useEffect, useMemo, useState } from 'react'
import {
  WORLD_LISTINGS,
  loadListings,
  type ListingQuery,
  type WorldListing,
} from '../scene/worlds'
import { ListingDetail } from './ListingDetail'
import { RecommendAsk } from './RecommendAsk'

const LAYOUTS = Array.from(new Set(WORLD_LISTINGS.map((w) => w.layout).filter(Boolean)))

function parseBound(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function HouseList({ onPick }: { onPick: (listing: WorldListing) => void }) {
  const [layout, setLayout] = useState('')
  const [minRaw, setMinRaw] = useState('')
  const [maxRaw, setMaxRaw] = useState('')
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [rows, setRows] = useState<WorldListing[]>(WORLD_LISTINGS)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WorldListing | null>(null)
  const [askOpen, setAskOpen] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 280)
    return () => window.clearTimeout(t)
  }, [q])

  const query: ListingQuery = useMemo(
    () => ({
      layout: layout || undefined,
      price_min: parseBound(minRaw),
      price_max: parseBound(maxRaw),
      q: qDebounced || undefined,
    }),
    [layout, minRaw, maxRaw, qDebounced],
  )

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadListings(query).then((list) => {
      if (!alive) return
      setRows(list)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [query])

  const clear = () => {
    setLayout('')
    setMinRaw('')
    setMaxRaw('')
    setQ('')
    setQDebounced('')
  }

  const hasFilter = Boolean(layout || minRaw.trim() || maxRaw.trim() || q.trim())

  return (
    <div className="house-list">
      <header className="hl-head">
        <div className="hl-brand">
          <img src="/brand/house_icon.svg" width={28} height={29} alt="" />
          <div>
            <div className="hl-title">小驻看房</div>
            <div className="hl-sub">先驻进去，再住下来</div>
          </div>
        </div>
        <div className="hl-filters">
          <label className="hl-field">
            <span>房型</span>
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="">全部</option>
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="hl-field">
            <span>价格（万）</span>
            <div className="hl-range">
              <input
                inputMode="numeric"
                placeholder="最低"
                value={minRaw}
                onChange={(e) => setMinRaw(e.target.value.replace(/[^\d.]/g, ''))}
                aria-label="最低价（万）"
              />
              <i>—</i>
              <input
                inputMode="numeric"
                placeholder="最高"
                value={maxRaw}
                onChange={(e) => setMaxRaw(e.target.value.replace(/[^\d.]/g, ''))}
                aria-label="最高价（万）"
              />
            </div>
          </label>
          <label className="hl-field hl-grow">
            <span>关键词</span>
            <input
              type="search"
              placeholder="户型、朝向、卖点…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button type="button" className="hl-ask" onClick={() => setAskOpen(true)}>
            问问小驻
          </button>
          {hasFilter && (
            <button type="button" className="hl-clear" onClick={clear}>
              清除
            </button>
          )}
        </div>
      </header>

      {rows.length === 0 && !loading ? (
        <div className="hl-empty">
          <p>没有符合条件的房源，换个条件试试</p>
        </div>
      ) : (
        <div className="hl-grid">
          {rows.map((w, i) => (
            <button
              key={w.world_id}
              type="button"
              className="hl-card"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => setDetail(w)}
            >
              <div className="hl-card-top">
                <span className="hl-layout">{w.layout}</span>
                {w.is_real && <span className="hl-badge">实景</span>}
              </div>
              <h2>{w.title}</h2>
              {w.code ? <div className="hl-code">{w.code}</div> : null}
              <div className="hl-price">{w.price}</div>
              <div className="hl-meta">
                {w.area}㎡{w.orientation ? ` · ${w.orientation}` : ''}
                {w.floor ? ` · ${w.floor} 层` : ''}
              </div>
              {w.highlight && <p className="hl-hl">{w.highlight}</p>}
              {w.floorplan ? (
                <img className="hl-floorplan" src={w.floorplan} alt="" />
              ) : null}
              {w.tags && w.tags.length > 0 && (
                <div className="hl-tags">
                  {w.tags.slice(0, 3).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {askOpen && (
        <RecommendAsk
          open={askOpen}
          onClose={() => setAskOpen(false)}
          onOpenDetail={(w) => {
            setAskOpen(false)
            setDetail(w)
          }}
        />
      )}
      {detail && (
        <ListingDetail
          listing={detail}
          onClose={() => setDetail(null)}
          onEnter={() => {
            const w = detail
            setDetail(null)
            onPick(w)
          }}
        />
      )}
    </div>
  )
}
