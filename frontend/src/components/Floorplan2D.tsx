import type { RepoRoom } from '../services/mock/data'

const FILL: Record<string, string> = {
  living_room: '#f3e4d4',
  bedroom: '#ead7c4',
  kitchen: '#d7e4dc',
  bathroom: '#d5dee6',
  study: '#e6dfd0',
  laundry: '#e2dbd3',
}

function fillOf(room: RepoRoom): string {
  if (FILL[room.type]) return FILL[room.type]
  const n = room.name || ''
  if (n.includes('卧')) return FILL.bedroom
  if (n.includes('厨')) return FILL.kitchen
  if (n.includes('卫') || n.includes('浴')) return FILL.bathroom
  if (n.includes('书')) return FILL.study
  if (n.includes('客') || n.includes('厅')) return FILL.living_room
  return '#ebe6de'
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

/** 真实 rooms[].polygon（scene XZ）俯视图；无 polygon 时由调用方占位。 */
export function Floorplan2D({ rooms }: { rooms: RepoRoom[] }) {
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
  const pad = 0.55
  minX -= pad
  maxX += pad
  minZ -= pad
  maxZ += pad
  const bw = Math.max(maxX - minX, 0.5)
  const bh = Math.max(maxZ - minZ, 0.5)
  const W = 520
  const H = 380
  const barH = 28
  const scale = Math.min((W - 20) / bw, (H - barH - 12) / bh)
  const toX = (x: number) => 10 + (x - minX) * scale
  const toY = (z: number) => 8 + (maxZ - z) * scale

  const barM = bw >= 12 ? 5 : 2
  const barLen = barM * scale

  return (
    <svg className="fp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="户型平面图">
      <rect x="0" y="0" width={W} height={H} fill="#f7f4ef" rx="16" />
      {usable.map((r) => {
        const pts = r.polygon.map(([x, z]) => `${toX(x).toFixed(1)},${toY(z).toFixed(1)}`).join(' ')
        const [cx, cz] = centroid(r.polygon)
        const label = (r.name || '').replace(/^\s+/, '')
        const show = label && label !== '其他' && span(r.polygon) > 1.4
        return (
          <g key={r.id}>
            <polygon points={pts} fill={fillOf(r)} stroke="#2c3338" strokeWidth="1.15" strokeLinejoin="round" />
            {show && (
              <text
                x={toX(cx)}
                y={toY(cz)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#1d1d1f"
                fontSize={span(r.polygon) > 4 ? 12 : 10}
                fontWeight="600"
                style={{ fontFamily: 'inherit' }}
              >
                {label}
              </text>
            )}
          </g>
        )
      })}
      <g transform={`translate(16, ${H - 18})`}>
        <line x1="0" y1="0" x2={barLen} y2="0" stroke="#1d1d1f" strokeWidth="2" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#1d1d1f" strokeWidth="2" />
        <line x1={barLen} y1="-4" x2={barLen} y2="4" stroke="#1d1d1f" strokeWidth="2" />
        <text x={barLen / 2} y="12" textAnchor="middle" fill="#6e6e73" fontSize="10">
          {barM} m
        </text>
      </g>
    </svg>
  )
}
