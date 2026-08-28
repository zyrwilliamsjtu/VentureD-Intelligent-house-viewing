import { useId, useMemo } from 'react'
import type { RepoRoom } from '../services/mock/data'

/** 功能区配色：半透明填色，墙体另描。无匹配则中性纸色。 */
const FILL: Record<string, string> = {
  living_room: 'rgba(232, 214, 190, 0.72)',
  bedroom: 'rgba(232, 196, 168, 0.70)',
  kitchen: 'rgba(186, 210, 196, 0.68)',
  bathroom: 'rgba(186, 204, 216, 0.70)',
  study: 'rgba(214, 204, 184, 0.70)',
  laundry: 'rgba(206, 198, 188, 0.68)',
}

function fillOf(room: RepoRoom): string {
  if (FILL[room.type]) return FILL[room.type]
  const n = room.name || ''
  if (n.includes('卧')) return FILL.bedroom
  if (n.includes('厨')) return FILL.kitchen
  if (n.includes('卫') || n.includes('浴')) return FILL.bathroom
  if (n.includes('书')) return FILL.study
  if (n.includes('客') || n.includes('厅')) return FILL.living_room
  return 'rgba(232, 226, 216, 0.7)'
}

function centroid(poly: [number, number][]): [number, number] {
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]
    const [x1, z1] = poly[(i + 1) % poly.length]
    const cross = x0 * z1 - x1 * z0
    a += cross
    cx += (x0 + x1) * cross
    cz += (z0 + z1) * cross
  }
  if (Math.abs(a) < 1e-8) {
    const sx = poly.reduce((s, p) => s + p[0], 0) / poly.length
    const sz = poly.reduce((s, p) => s + p[1], 0) / poly.length
    return [sx, sz]
  }
  a *= 0.5
  return [cx / (6 * a), cz / (6 * a)]
}

function bounds(poly: [number, number][]): { w: number; h: number } {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const [x, z] of poly) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { w: Math.max(maxX - minX, 0.01), h: Math.max(maxZ - minZ, 0.01) }
}

function polyPoints(
  poly: [number, number][],
  toX: (x: number) => number,
  toY: (z: number) => number,
): string {
  return poly.map(([x, z]) => `${toX(x).toFixed(1)},${toY(z).toFixed(1)}`).join(' ')
}

/**
 * 真实 rooms[].polygon（scene XZ）俯视图。
 * 不画家具；无门/窗字段不画假开口。房间名在质心居中。
 */
export function Floorplan2D({
  rooms,
  orientation,
  hideLabels = false,
  marker,
}: {
  rooms: RepoRoom[]
  orientation?: string
  /** 俯瞰图：不画房间名/面积/朝向文字 */
  hideLabels?: boolean
  /** scene XZ（Y-up 投影），当前位置 */
  marker?: { x: number; z: number } | null
}) {
  const uid = useId().replace(/:/g, '')
  const paperId = `fp-paper-${uid}`
  const frame = useMemo(() => {
    const usable = rooms.filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
    if (!usable.length) return null
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const r of usable) {
      for (const [x, z] of r.polygon) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    }
    const pad = 0.55
    minX -= pad
    maxX += pad
    minZ -= pad
    maxZ += pad
    const bw = Math.max(maxX - minX, 0.5)
    const bh = Math.max(maxZ - minZ, 0.5)
    const W = 540
    const H = 400
    const plotH = H - 36
    const scale = Math.min((W - 36) / bw, (plotH - 16) / bh)
    const ox = (W - bw * scale) / 2
    const oy = (plotH - bh * scale) / 2
    const toX = (x: number) => ox + (x - minX) * scale
    const toY = (z: number) => oy + (maxZ - z) * scale
    const wallOuter = Math.max(4.2, Math.min(7.5, 0.16 * scale))
    return {
      usable,
      W,
      H,
      toX,
      toY,
      scale,
      wallOuter,
      wallInner: Math.max(1.6, wallOuter * 0.38),
      barM: bw >= 12 ? 5 : 2,
      barLen: (bw >= 12 ? 5 : 2) * scale,
    }
  }, [rooms])

  const staticLayer = useMemo(() => {
    if (!frame) return null
    const { usable, toX, toY, W, H, scale, wallOuter, wallInner, barM, barLen } = frame
    const orient = orientation?.trim()
    const showOrient = !hideLabels && !!orient && orient !== '待对拍'
    return (
      <>
        <rect x="0" y="0" width={W} height={H} fill={`url(#${paperId})`} rx="16" />
        {usable.map((r) => (
          <polygon key={`${r.id}-fill`} points={polyPoints(r.polygon, toX, toY)} fill={fillOf(r)} stroke="none" />
        ))}
        {usable.map((r) => (
          <polygon
            key={`${r.id}-wall-o`}
            points={polyPoints(r.polygon, toX, toY)}
            fill="none"
            stroke="#3a424a"
            strokeWidth={wallOuter}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {usable.map((r) => (
          <polygon
            key={`${r.id}-wall-i`}
            points={polyPoints(r.polygon, toX, toY)}
            fill="none"
            stroke="#faf7f1"
            strokeWidth={wallInner}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {!hideLabels &&
          usable.map((r) => {
            const label = (r.name || '').replace(/^\s+/, '')
            if (!label || label === '其他') return null
            const box = bounds(r.polygon)
            const rw = box.w * scale
            const rh = box.h * scale
            if (rw < 18 || rh < 14) return null
            const [cx, cz] = centroid(r.polygon)
            const area =
              typeof r.area === 'number' && r.area > 0
                ? `${Number.isInteger(r.area) ? r.area : r.area.toFixed(1)}㎡`
                : ''
            const twoLine = Boolean(area) && rh >= 28
            const fs = Math.max(
              7.5,
              Math.min(12, Math.min((rw / Math.max(label.length, 2)) * 1.35, rh * (twoLine ? 0.28 : 0.38))),
            )
            const x = toX(cx)
            const y = toY(cz)
            return (
              <text
                key={`${r.id}-lab`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#1d1d1f"
                fontSize={fs}
                fontWeight="600"
                stroke="#f6f2ea"
                strokeWidth={3.2}
                paintOrder="stroke"
                style={{ fontFamily: 'inherit' }}
                pointerEvents="none"
              >
                {twoLine ? (
                  <>
                    <tspan x={x} dy={-fs * 0.55}>
                      {label}
                    </tspan>
                    <tspan x={x} dy={fs + 1} fill="#6e6e73" fontSize={Math.max(6.5, fs - 1.5)} fontWeight="500">
                      {area}
                    </tspan>
                  </>
                ) : (
                  <tspan x={x} dy="0">
                    {area ? `${label} ${area}` : label}
                  </tspan>
                )}
              </text>
            )
          })}
        <g transform={`translate(18, ${H - 18})`}>
          <line x1="0" y1="0" x2={barLen} y2="0" stroke="#1d1d1f" strokeWidth="2.2" />
          <line x1="0" y1="-5" x2="0" y2="5" stroke="#1d1d1f" strokeWidth="2.2" />
          <line x1={barLen} y1="-5" x2={barLen} y2="5" stroke="#1d1d1f" strokeWidth="2.2" />
          <text x={barLen / 2} y="14" textAnchor="middle" fill="#6e6e73" fontSize="10">
            {barM} m
          </text>
        </g>
        {showOrient ? (
          <g transform={`translate(${W - 78}, 16)`}>
            <rect x="0" y="0" width="64" height="22" rx="11" fill="#fff" stroke="#d8d2c8" strokeWidth="0.8" />
            <text x="32" y="12" textAnchor="middle" dominantBaseline="middle" fill="#3a424a" fontSize="10.5" fontWeight="600">
              {orient}
            </text>
          </g>
        ) : null}
      </>
    )
  }, [frame, hideLabels, orientation, paperId])

  if (!frame) {
    return <div className="fp-placeholder">户型图暂不可用</div>
  }

  const { toX, toY, W, H } = frame
  return (
    <svg className="fp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="户型平面图">
      <defs>
        <pattern id={paperId} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#f6f2ea" />
          <circle cx="1.2" cy="1.5" r="0.35" fill="#e4ddd2" />
        </pattern>
      </defs>
      {staticLayer}
      {marker ? (
        <g pointerEvents="none">
          <circle cx={toX(marker.x)} cy={toY(marker.z)} r="9" fill="rgba(196, 97, 60, 0.22)" />
          <circle cx={toX(marker.x)} cy={toY(marker.z)} r="4.5" fill="#c4613c" stroke="#fff" strokeWidth="1.6" />
        </g>
      ) : null}
    </svg>
  )
}
