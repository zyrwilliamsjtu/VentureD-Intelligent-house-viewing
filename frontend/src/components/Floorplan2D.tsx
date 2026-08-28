import type { RepoInstance, RepoRoom } from '../services/mock/data'

/** 功能区配色：半透明填色，墙体另描。无匹配则中性纸色。 */
const FILL: Record<string, string> = {
  living_room: 'rgba(232, 214, 190, 0.72)',
  bedroom: 'rgba(232, 196, 168, 0.70)',
  kitchen: 'rgba(186, 210, 196, 0.68)',
  bathroom: 'rgba(186, 204, 216, 0.70)',
  study: 'rgba(214, 204, 184, 0.70)',
  laundry: 'rgba(206, 198, 188, 0.68)',
}

/** 有实例才画；窗帘/绿植/灯/椅过多会糊成一团，不画（数据仍在清单里）。 */
const DRAW = new Set([
  'bed',
  'sofa',
  'dining_table',
  'desk',
  'coffee_table',
  'refrigerator',
  'washing_machine',
  'wardrobe',
  'tv_cabinet',
  'cabinet',
  'toilet',
  'shower',
  'sink',
  'bedside_table',
  'bookshelf',
  'stove',
])

/** 无 bbox 时的示意尺寸（米，XZ）。 */
const DEFAULT_M: Record<string, [number, number]> = {
  bed: [2.0, 1.6],
  sofa: [1.8, 0.85],
  dining_table: [1.5, 0.9],
  desk: [1.2, 0.6],
  coffee_table: [0.9, 0.55],
  refrigerator: [0.7, 0.65],
  washing_machine: [0.6, 0.6],
  wardrobe: [1.4, 0.55],
  tv_cabinet: [1.6, 0.45],
  cabinet: [0.9, 0.45],
  toilet: [0.45, 0.65],
  shower: [0.85, 0.85],
  sink: [0.55, 0.4],
  bedside_table: [0.5, 0.45],
  bookshelf: [0.9, 0.35],
  stove: [0.7, 0.55],
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

function span(poly: [number, number][]): number {
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
  return Math.hypot(maxX - minX, maxZ - minZ)
}

function polyPoints(
  poly: [number, number][],
  toX: (x: number) => number,
  toY: (z: number) => number,
): string {
  return poly.map(([x, z]) => `${toX(x).toFixed(1)},${toY(z).toFixed(1)}`).join(' ')
}

/** scene Y-up → 俯视 XZ；bbox size 的 x/z 为平面边长。 */
function instSizeM(inst: RepoInstance, cat: string): [number, number] {
  const sz = inst.bbox3d?.size
  if (sz && sz.length >= 3 && sz[0] > 0.05 && sz[2] > 0.05) {
    return [sz[0], sz[2]]
  }
  return DEFAULT_M[cat] ?? [0.6, 0.5]
}

function FurnitureMark({
  cat,
  x,
  y,
  w,
  h,
}: {
  cat: string
  x: number
  y: number
  w: number
  h: number
}) {
  const left = x - w / 2
  const top = y - h / 2
  const stroke = '#5a5248'
  const sw = Math.max(0.65, Math.min(w, h) * 0.08)
  const rx = Math.min(2.2, Math.min(w, h) * 0.12)
  if (cat === 'bed') {
    return (
      <g>
        <rect x={left} y={top} width={w} height={h} rx={rx} fill="#d7bc96" stroke={stroke} strokeWidth={sw} />
        <rect
          x={left + w * 0.08}
          y={top + h * 0.07}
          width={w * 0.84}
          height={h * 0.26}
          rx={1.2}
          fill="#efe4d4"
          stroke={stroke}
          strokeWidth={sw * 0.55}
        />
      </g>
    )
  }
  if (cat === 'sofa') {
    return (
      <g>
        <rect x={left} y={top} width={w} height={h} rx={rx + 0.6} fill="#c4b49a" stroke={stroke} strokeWidth={sw} />
        <rect
          x={left + w * 0.06}
          y={top + h * 0.42}
          width={w * 0.88}
          height={h * 0.48}
          rx={1}
          fill="#d8cbb6"
          stroke={stroke}
          strokeWidth={sw * 0.5}
        />
      </g>
    )
  }
  if (cat === 'dining_table' || cat === 'desk' || cat === 'coffee_table') {
    return (
      <ellipse
        cx={x}
        cy={y}
        rx={w / 2}
        ry={h / 2}
        fill="#cbb89a"
        stroke={stroke}
        strokeWidth={sw}
      />
    )
  }
  if (cat === 'refrigerator') {
    return (
      <g>
        <rect x={left} y={top} width={w} height={h} rx={1} fill="#b9c4cc" stroke={stroke} strokeWidth={sw} />
        <line x1={x} y1={top + 2} x2={x} y2={top + h - 2} stroke={stroke} strokeWidth={sw * 0.7} />
      </g>
    )
  }
  if (cat === 'washing_machine') {
    const r = Math.min(w, h) * 0.28
    return (
      <g>
        <rect x={left} y={top} width={w} height={h} rx={1.4} fill="#c5ced4" stroke={stroke} strokeWidth={sw} />
        <circle cx={x} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={sw} />
      </g>
    )
  }
  if (cat === 'toilet') {
    return <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill="#dce3e8" stroke={stroke} strokeWidth={sw} />
  }
  if (cat === 'shower') {
    return (
      <g>
        <rect x={left} y={top} width={w} height={h} rx={1} fill="none" stroke={stroke} strokeWidth={sw} />
        <line x1={left + 2} y1={top + 2} x2={left + w - 2} y2={top + h - 2} stroke={stroke} strokeWidth={sw * 0.7} />
        <line x1={left + w - 2} y1={top + 2} x2={left + 2} y2={top + h - 2} stroke={stroke} strokeWidth={sw * 0.7} />
      </g>
    )
  }
  if (cat === 'sink' || cat === 'stove') {
    return (
      <rect x={left} y={top} width={w} height={h} rx={1} fill="#cfd6d4" stroke={stroke} strokeWidth={sw} />
    )
  }
  return (
    <rect x={left} y={top} width={w} height={h} rx={rx} fill="#cfc6b8" stroke={stroke} strokeWidth={sw} />
  )
}

/**
 * 真实 scene_graph 俯视图（polygon + 实例 XZ）。
 * 无门/窗字段 → 不画假开口。无实例 → 只画轮廓 + 名称/面积。
 */
export function Floorplan2D({
  rooms,
  orientation,
}: {
  rooms: RepoRoom[]
  orientation?: string
}) {
  const usable = rooms.filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
  if (!usable.length) {
    return <div className="fp-placeholder">户型图暂不可用</div>
  }

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
  const pad = 0.7
  minX -= pad
  maxX += pad
  minZ -= pad
  maxZ += pad
  const bw = Math.max(maxX - minX, 0.5)
  const bh = Math.max(maxZ - minZ, 0.5)
  const W = 540
  const H = 400
  const barH = 32
  const scale = Math.min((W - 28) / bw, (H - barH - 16) / bh)
  const toX = (x: number) => 14 + (x - minX) * scale
  const toY = (z: number) => 12 + (maxZ - z) * scale
  const wallOuter = Math.max(4.2, Math.min(7.5, 0.16 * scale))
  const wallInner = Math.max(1.6, wallOuter * 0.38)

  const barM = bw >= 12 ? 5 : 2
  const barLen = barM * scale
  const orient = orientation?.trim()
  const showOrient = !!orient && orient !== '待对拍'

  return (
    <svg className="fp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="户型平面图">
      <defs>
        <pattern id="fp-paper" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#f6f2ea" />
          <circle cx="1.2" cy="1.5" r="0.35" fill="#e4ddd2" />
        </pattern>
        <filter id="fp-soft" x="-4%" y="-4%" width="108%" height="108%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#2c3338" floodOpacity="0.12" />
        </filter>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="url(#fp-paper)" rx="16" />

      <g filter="url(#fp-soft)">
        {usable.map((r) => (
          <polygon
            key={`${r.id}-fill`}
            points={polyPoints(r.polygon, toX, toY)}
            fill={fillOf(r)}
            stroke="none"
          />
        ))}
      </g>
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

      {usable.flatMap((r) =>
        (r.instances ?? [])
          .filter((inst) => inst.category && DRAW.has(inst.category) && inst.position?.length >= 3)
          .map((inst) => {
            const cat = inst.category
            const [mx, mz] = instSizeM(inst, cat)
            const w = Math.min(64, Math.max(8, mx * scale))
            const h = Math.min(64, Math.max(8, mz * scale))
            return (
              <FurnitureMark
                key={inst.id}
                cat={cat}
                x={toX(inst.position[0])}
                y={toY(inst.position[2])}
                w={w}
                h={h}
              />
            )
          }),
      )}

      {usable.map((r) => {
        const label = (r.name || '').replace(/^\s+/, '')
        const show = label && label !== '其他' && span(r.polygon) > 1.2
        if (!show) return null
        const [cx, cz] = centroid(r.polygon)
        const area =
          typeof r.area === 'number' && r.area > 0 ? `${Number.isInteger(r.area) ? r.area : r.area.toFixed(1)}㎡` : ''
        const fs = span(r.polygon) > 4 ? 11.5 : 9.5
        return (
          <g key={`${r.id}-lab`} pointerEvents="none">
            <text
              x={toX(cx)}
              y={toY(cz) - (area ? 6 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#1d1d1f"
              fontSize={fs}
              fontWeight="600"
              style={{ fontFamily: 'inherit' }}
            >
              {label}
            </text>
            {area ? (
              <text
                x={toX(cx)}
                y={toY(cz) + 8}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#6e6e73"
                fontSize={fs - 1.5}
                style={{ fontFamily: 'inherit' }}
              >
                {area}
              </text>
            ) : null}
          </g>
        )
      })}

      <g transform={`translate(18, ${H - 20})`}>
        <line x1="0" y1="0" x2={barLen} y2="0" stroke="#1d1d1f" strokeWidth="2.2" />
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#1d1d1f" strokeWidth="2.2" />
        <line x1={barLen} y1="-5" x2={barLen} y2="5" stroke="#1d1d1f" strokeWidth="2.2" />
        <text x={barLen / 2} y="14" textAnchor="middle" fill="#6e6e73" fontSize="10">
          {barM} m
        </text>
      </g>
      {showOrient ? (
        <g transform={`translate(${W - 78}, 18)`}>
          <rect x="0" y="0" width="64" height="22" rx="11" fill="#fff" stroke="#d8d2c8" strokeWidth="0.8" />
          <text x="32" y="12" textAnchor="middle" dominantBaseline="middle" fill="#3a424a" fontSize="10.5" fontWeight="600">
            {orient}
          </text>
        </g>
      ) : null}
    </svg>
  )
}
