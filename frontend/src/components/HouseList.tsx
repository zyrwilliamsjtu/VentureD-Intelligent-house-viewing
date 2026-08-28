import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { WALK_WORLD, type Listing, type RoomPoly } from '../data/listings'
import { HOUSE_FLOOR } from '../data/houseImages'

// ==== 房源列表页：白纸编辑部风（发丝线网格 + 编号卡片，悬停整卡反色）====
// 数据源：store.listings（网关 GET /api/listings，失败本地兜底；listingsSource 标注）。
// 户型 polygon 全部为真实提取；点击 → selectListing（换房自动重置会话）→ walk。

/** mini 户型图：等比缩放到 viewBox，房间半透明填充 + 描边 + 房名 */
function MiniFloorplan({ rooms, className }: { rooms: RoomPoly[]; className?: string }) {
  const { path, roomEls } = useMemo(() => {
    const xs = rooms.flatMap((r) => r.poly.map((p) => p[0]))
    const ys = rooms.flatMap((r) => r.poly.map((p) => p[1]))
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const w = maxX - minX || 1, h = maxY - minY || 1
    // SVG y 轴向下：翻转 y 让"北"朝上
    const toPath = (poly: [number, number][]) =>
      poly.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x - minX).toFixed(2)},${(maxY - y).toFixed(2)}`).join(' ') + ' Z'
    const els = rooms.map((r, i) => {
      // 房名可能重复（多个过道/书房），key 用 索引拼接
      const cx = r.poly.reduce((s, p) => s + p[0], 0) / r.poly.length - minX
      const cy = maxY - r.poly.reduce((s, p) => s + p[1], 0) / r.poly.length
      return (
        <g key={`${r.name}-${i}`}>
          <path d={toPath(r.poly)} className="fp-room" />
          <text x={cx} y={cy} className="fp-name" textAnchor="middle" dominantBaseline="middle">
            {r.name}
          </text>
        </g>
      )
    })
    return { path: els, roomEls: { w, h } }
  }, [rooms])
  const { w, h } = roomEls
  return (
    <svg className={className} viewBox={`${-0.6} ${-0.6} ${w + 1.2} ${h + 1.2}`} preserveAspectRatio="xMidYMid meet">
      {path}
    </svg>
  )
}

function HouseCard({ l, index, onPick }: { l: Listing; index: number; onPick: (l: Listing) => void }) {
  const no = String(index + 1).padStart(2, '0')
  const walkable = l.worldId === WALK_WORLD // Aholo LOD 目前仅 0330 转码完成
  const floorImg = HOUSE_FLOOR[l.id]
  return (
    <button className="house-card" onClick={() => onPick(l)}>
      <div className="hc-plan">
        {floorImg ? (
          <img className="hc-floor-img" src={floorImg} alt={`${l.title} 户型图`} loading="lazy" />
        ) : (
          <MiniFloorplan rooms={l.floorplan} className="fp-svg" />
        )}
        {walkable ? (
          <span className="hc-live-badge mono">3DGS 实景</span>
        ) : (
          <span className="hc-live-badge ghost mono">点云就绪</span>
        )}
      </div>
      <div className="hc-body">
        <span className="hc-no mono">{no} / {l.layout}</span>
        <div className="hc-title">{l.title}</div>
        <div className="hc-highlight">{l.highlight}</div>
        <div className="hc-meta">
          {l.layout} · {l.area}㎡ · {l.orientation} · {l.floor}
        </div>
        <div className="hc-foot">
          <span className="hc-price">
            <b>{l.price}</b>
            <i>{(l.priceNum / l.area).toFixed(1)}万/㎡</i>
          </span>
          <span className="hc-go">{walkable ? '进入实景 →' : 'AI 带看已就绪 →'}</span>
        </div>
        <div className="hc-tags">
          {l.tags.map((t) => (
            <span key={t} className="hc-tag">
              {t}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

export function HouseList() {
  const selectListing = useAppStore((s) => s.selectListing)
  const showToast = useAppStore((s) => s.showToast)
  const listings = useAppStore((s) => s.listings)
  const source = useAppStore((s) => s.listingsSource)
  const filters = useAppStore((s) => s.filters)
  const clearFilters = useAppStore((s) => s.clearFilters)

  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        if (filters.layout !== 'all' && l.layout !== filters.layout) return false
        if (filters.price === 'lt300') return l.priceNum < 300
        if (filters.price === '300-450') return l.priceNum >= 300 && l.priceNum <= 450
        if (filters.price === 'gt450') return l.priceNum > 450
        return true
      }),
    [listings, filters],
  )

  const priceLabel =
    filters.price === 'lt300'
      ? '300万以下'
      : filters.price === '300-450'
        ? '300-450万'
        : filters.price === 'gt450'
          ? '450万以上'
          : ''
  const hasFilter = filters.layout !== 'all' || filters.price !== 'all'

  const onPick = (l: Listing) => {
    selectListing(l) // 换房自动重置会话（指南 §3.4）
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
    if (l.worldId === WALK_WORLD) {
      showToast(`欢迎来到 ${l.title}`, 'AI 管家随时为您讲解，按 T 呼出')
    } else {
      showToast(`${l.title}`, '点云 LOD 转码中 · 对话/讲解已按本套数据工作，按 T 呼出')
    }
  }

  return (
    <div className="house-list">
      <header className="hl-head">
        <div className="hl-brand">
          <img className="hl-logo-img" src="/assets/logo-clean.png" alt="小驻看房" />
          <div>
            <div className="hl-app">小驻看房</div>
            <div className="hl-slogan">先驻进去，再住下来 · Step In. Stay Longer.</div>
          </div>
        </div>
        <div className="hl-city">
          <span className="hl-city-dot" />
          上海 Shanghai · {listings.length} 套在展{source === 'local' ? ' · 离线数据' : ''}
        </div>
      </header>

      <div className="hl-sub">
        <span className="hl-no mono">1.1</span>
        <b>精选房源</b>
        <span>点击卡片进入第一人称实景 · AI 管家全程讲解</span>
      </div>

      {hasFilter && (
        <div className="filter-bar">
          <span className="filter-label mono">当前筛选</span>
          {filters.layout !== 'all' && <span className="filter-chip">{filters.layout}</span>}
          {filters.price !== 'all' && <span className="filter-chip">{priceLabel}</span>}
          <button className="filter-clear mono" onClick={clearFilters}>
            清除 ✕
          </button>
          <span className="filter-count mono">{filtered.length} 套匹配</span>
        </div>
      )}

      <div className="hl-grid">
        {filtered.map((l, i) => (
          <HouseCard key={l.id} l={l} index={i} onPick={onPick} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="hl-empty">
          没有匹配的房源，试试调整筛选条件
          <button className="filter-clear mono" onClick={clearFilters}>
            清除筛选
          </button>
        </div>
      )}

      <footer className="hl-foot">3DGS 点云由群核 Aholo 提供 · AI 讲解由火山大模型驱动</footer>
    </div>
  )
}
