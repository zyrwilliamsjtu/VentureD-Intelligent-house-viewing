import { useMemo } from 'react'
import type { Zone } from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { executeActions, houseExtents, zoneAreaOf, zoneCenterOf } from '../actions/executor'
import { stopTour } from '../tour/tourPlayer'
import { speak } from '../audio/player'

// ==== 左栏：户型导航（平面图 + 空间列表）====
export function LeftNav() {
  const house = useAppStore((s) => s.house)
  const currentZone = useAppStore((s) => s.currentZone)
  const tourIndex = useAppStore((s) => s.tourIndex)

  const ordered = useMemo(() => {
    if (!house) return []
    return [...house.zones].sort(
      (a, b) =>
        (house.tour_path.indexOf(a.id) === -1 ? 99 : house.tour_path.indexOf(a.id)) -
        (house.tour_path.indexOf(b.id) === -1 ? 99 : house.tour_path.indexOf(b.id)),
    )
  }, [house])

  const go = (z: Zone) => {
    stopTour(false)
    executeActions([
      { type: 'fly_to_zone', zone_id: z.id },
      { type: 'highlight', target: z.id, duration_ms: 5000 },
    ])
    const s = useAppStore.getState()
    s.pushMsg('assistant', z.story_card)
    void speak(z.story_card)
  }

  if (!house) return null

  return (
    <aside className="leftnav">
      <div className="leftnav-title">户型导航</div>
      <FloorPlan activeZone={currentZone} />
      <div className="space-list">
        {ordered.map((z) => {
          const ti = house.tour_path.indexOf(z.id)
          const active = currentZone === z.id
          const done = ti >= 0 && ti < tourIndex - 1
          return (
            <button
              key={z.id}
              className={`space-item ${active ? 'active' : ''}`}
              onClick={() => go(z)}
            >
              <span className="space-name">
                {z.label}
                <em>{zoneAreaOf(z)}㎡</em>
              </span>
              <span className={`space-state ${active ? 'on' : ''}`}>
                {active ? '● 讲解中' : done ? '✓ 已看' : '待参观'}
              </span>
            </button>
          )
        })}
      </div>
      <div className="hint-bar">💡 点击空间，AI 视角自动飞行</div>
    </aside>
  )
}

// ---- 2D 户型平面图（由 zones 多边形实时绘制，非占位）----
function FloorPlan({ activeZone }: { activeZone: string | null }) {
  const house = useAppStore((s) => s.house)
  const ext = useMemo(() => houseExtents(house), [house])
  if (!house) return null

  const vb = `${ext.minX - 0.4} ${ext.minZ - 0.4} ${ext.width + 0.8} ${ext.depth + 0.8}`
  // 翻转 z 轴，让平面图与 3D 俯视方向一致
  const fy = (z: number) => ext.minZ + ext.maxZ - z
  const pt = (z: Zone) => z.polygon.map(([x, zz]) => `${x},${fy(zz)}`).join(' ')

  const active = house.zones.find((z) => z.id === activeZone)

  return (
    <div className="plan-box">
      <svg viewBox={vb} className="plan-svg">
        {house.zones.map((z) => (
          <polygon
            key={z.id}
            points={pt(z)}
            className={`plan-zone ${z.id === activeZone ? 'active' : ''}`}
          />
        ))}
        {active && (
          <circle
            cx={zoneCenterOf(active)[0]}
            cy={fy(zoneCenterOf(active)[1])}
            r={0.35}
            className="plan-dot"
          />
        )}
      </svg>
      <div className="plan-caption">1F · {house.meta.area}㎡</div>
    </div>
  )
}
