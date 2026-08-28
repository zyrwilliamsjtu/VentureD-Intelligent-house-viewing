import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { LISTINGS, type Listing, type RoomPoly } from '../data/listings'

// ==== 房源列表页：暗色编辑部风（发丝线网格 + 编号卡片，悬停整卡反色）====
// 0330 的户型 polygon 是 scene_graph 真实提取；其余为同管线示意户型。
// 点击卡片 → selectListing → walk（3D 视口常驻，首次进入自动 Pointer Lock）

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
  return (
    <button className="house-card" onClick={() => onPick(l)}>
      <div className="hc-plan">
        <MiniFloorplan rooms={l.floorplan} className="fp-svg" />
        {l.isReal ? (
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
          {l.area}㎡ · {l.orientation} · {l.floor}
        </div>
        <div className="hc-foot">
          <span className="hc-price">
            <b>{l.price}</b>
            <i>{(l.priceNum / l.area).toFixed(1)}万/㎡</i>
          </span>
          <span className="hc-go">{l.isReal ? '进入实景 →' : '先看 0330 实景 →'}</span>
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

  const onPick = (l: Listing) => {
    selectListing(l)
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
    if (l.isReal) {
      showToast(`欢迎来到 ${l.title}`, 'AI 管家随时为您讲解，按 T 呼出')
    } else {
      showToast(`${l.title} · 点云 LOD 转码中`, '先以 0330 实景为您演示，AI 管家按 T 呼出')
    }
  }

  return (
    <div className="house-list">
      <header className="hl-head">
        <div className="hl-brand">
          <span className="hl-logo">房</span>
          <div>
            <div className="hl-app">AI 代看房</div>
            <div className="hl-slogan">VentureD · 实景漫游 × AI 管家带看</div>
          </div>
        </div>
        <div className="hl-city">
          <span className="hl-city-dot" />
          上海 Shanghai · {LISTINGS.length} 套在展
        </div>
      </header>

      <div className="hl-sub">
        <span className="hl-no mono">1.1</span>
        <b>精选房源</b>
        <span>点击卡片进入第一人称实景 · AI 管家全程讲解</span>
      </div>

      <div className="hl-grid">
        {LISTINGS.map((l, i) => (
          <HouseCard key={l.id} l={l} index={i} onPick={onPick} />
        ))}
      </div>

      <footer className="hl-foot">3DGS 点云由群核 Aholo 提供 · AI 讲解由 MOSS 大模型驱动</footer>
    </div>
  )
}
