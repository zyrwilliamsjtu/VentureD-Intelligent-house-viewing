import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { houseExtents, zoneAreaOf, zoneCenterOf } from '../actions/executor'

// ==== 场景区 HUD：识别状态条 / 小地图 / 飞行进度 / 楼层切换 / 视角控制 ====
export function ViewportHud() {
  return (
    <>
      <StatusRow />
      <Minimap />
      <FlightPill />
      <FloorSwitch />
      <ViewControls />
      <Toast />
    </>
  )
}

function StatusRow() {
  const house = useAppStore((s) => s.house)
  const currentZone = useAppStore((s) => s.currentZone)
  const phase = useAppStore((s) => s.chatPhase)
  const thinking = phase === 'thinking' || phase === 'uploading'

  const zone = house?.zones.find((z) => z.id === currentZone)
  const nObj = useMemo(() => {
    if (!house) return 0
    if (!zone) return house.objects.length
    return house.objects.filter((o) => o.zone_id === zone.id).length
  }, [house, zone])

  return (
    <div className="hud-status-row">
      <div className="hud-pill zone">
        <span className="dot green" />
        {zone ? `当前空间：${zone.label} · ${zoneAreaOf(zone)}㎡` : '当前空间：全屋总览'}
      </div>
      <div className={`hud-pill recog ${thinking ? 'busy' : ''}`}>
        <span className="dot yellow" />
        {thinking ? '正在识别物体 …' : `已识别 ${nObj} 类物体`}
      </div>
    </div>
  )
}

function Minimap() {
  const house = useAppStore((s) => s.house)
  const currentZone = useAppStore((s) => s.currentZone)
  const desired = useAppStore((s) => s.desiredCam)
  const ext = useMemo(() => houseExtents(house), [house])
  if (!house) return null

  const vb = `${ext.minX - 0.4} ${ext.minZ - 0.4} ${ext.width + 0.8} ${ext.depth + 0.8}`
  const fy = (z: number) => ext.minZ + ext.maxZ - z
  const zone = house.zones.find((z) => z.id === currentZone)
  const dot = zone ? zoneCenterOf(zone) : desired ? [desired.target[0], desired.target[2]] : [ext.cx, ext.cz]

  return (
    <div className="minimap">
      <div className="minimap-floor">1F</div>
      <svg viewBox={vb} className="minimap-svg">
        {house.zones.map((z) => (
          <polygon
            key={z.id}
            points={z.polygon.map(([x, zz]) => `${x},${fy(zz)}`).join(' ')}
            className={`mm-zone ${z.id === currentZone ? 'active' : ''}`}
          />
        ))}
        <circle cx={dot[0]} cy={fy(dot[1])} r={0.42} className="mm-dot" />
      </svg>
      <div className="minimap-label">小地图</div>
    </div>
  )
}

function FlightPill() {
  const flight = useAppStore((s) => s.flight)
  if (flight == null) return null
  const pct = Math.min(99, Math.round(flight * 100))
  const filled = Math.round(pct / 12)
  return (
    <div className="flight-pill">
      视角飞行中 {'▓'.repeat(filled)}
      <span className="dim">{'░'.repeat(8 - filled)}</span> {pct}%
    </div>
  )
}

function FloorSwitch() {
  const setToast = useAppStore((s) => s.setToast)
  return (
    <div className="floor-switch">
      <button className="floor-btn active">1F</button>
      <button className="floor-btn" onClick={() => setToast('演示版仅 1F 户型，2F 待接入群核数据')}>
        2F
      </button>
    </div>
  )
}

function ViewControls() {
  const send = useAppStore((s) => s.sendViewCmd)
  const B = ({ k, t }: { k: Parameters<typeof send>[0]; t: string }) => (
    <button className="vc-btn" onClick={() => send(k)}>
      {t}
    </button>
  )
  return (
    <div className="view-ctl">
      <div className="vc-col">
        <B k="zoom_in" t="+" />
        <B k="zoom_out" t="−" />
      </div>
      <div className="vc-pad">
        <B k="pan_up" t="↑" />
        <div className="vc-row">
          <B k="pan_left" t="←" />
          <B k="pan_down" t="↓" />
          <B k="pan_right" t="→" />
        </div>
      </div>
    </div>
  )
}

function Toast() {
  const toast = useAppStore((s) => s.toast)
  const setToast = useAppStore((s) => s.setToast)
  if (!toast) return null
  return (
    <div className="toast" onClick={() => setToast(null)}>
      {toast}
    </div>
  )
}
