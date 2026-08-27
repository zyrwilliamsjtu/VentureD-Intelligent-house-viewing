import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import type { House, HouseObject, Zone } from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { buildWallBoxes, houseExtents, zoneCenterOf, WALL_H } from './layout'

const ACCENT = '#7C86F2'
const WALL_COLOR = '#8B93B8'
const FURN_BASE = '#4A5878'

// ==== 程序化占位户型：按语义 JSON 画墙/分区/家具色块 ====
// 全部为"占位色块"：等群核点云接入（aholo-viewer / GLB）后整体替换，
// 语义标注层（标签/分区）可平移复用。

// ---- 分区地面（当前所在分区微亮）----
function ZoneFloor({ zone }: { zone: Zone }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(zone.polygon.map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    return g
  }, [zone])

  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(() => {
    const m = matRef.current
    if (!m) return
    const isCur = useAppStore.getState().currentZone === zone.id
    const target = isCur ? 0.17 : 0.07
    m.opacity += (target - m.opacity) * 0.1
    m.color.set(isCur ? ACCENT : '#7A82A6')
  })

  return (
    <mesh geometry={geo} position={[0, 0.012, 0]}>
      <meshStandardMaterial
        ref={matRef}
        color="#8B90AD"
        transparent
        opacity={0.07}
        side={THREE.DoubleSide}
        depthWrite={false}
        roughness={0.9}
      />
    </mesh>
  )
}

// ---- 家具：占位色块（不可交互，等 Agent 接入后做讲解锚点）----
function FurnitureBox({ obj }: { obj: HouseObject }) {
  return (
    <mesh position={obj.bbox3d.center}>
      <boxGeometry args={obj.bbox3d.size} />
      <meshStandardMaterial color={FURN_BASE} transparent opacity={0.95} roughness={0.5} metalness={0.08} />
      <Edges color="#8E97B8" />
    </mesh>
  )
}

// ---- 物体标注胶囊：走近（<3.8m）淡入 ----
function ObjectLabel({ obj }: { obj: HouseObject }) {
  const ref = useRef<HTMLDivElement>(null)
  const center = useMemo(() => new THREE.Vector3(...obj.bbox3d.center), [obj])
  const y = obj.bbox3d.center[1] + obj.bbox3d.size[1] / 2 + 0.22

  useFrame(({ camera }) => {
    const el = ref.current
    if (!el) return
    const near = camera.position.distanceTo(center) < 3.8
    el.style.opacity = near ? '1' : '0'
  })

  return (
    <Html position={[center.x, y, center.z]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className="obj-label show" style={{ opacity: 0, transition: 'opacity .3s' }}>
        {obj.class}
        {obj.tag ? ` · ${obj.tag}` : ''}
      </div>
    </Html>
  )
}

// ---- 分区标签：只显示当前所在分区 ----
function ZoneLabel({ zone }: { zone: Zone }) {
  const active = useAppStore((s) => s.currentZone === zone.id)
  const [cx, cz] = zoneCenterOf(zone)
  if (!active) return null
  return (
    <Html position={[cx, 2.25, cz]} center distanceFactor={10} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div className="zone-chip3d active">{zone.label}</div>
    </Html>
  )
}

export function ApartmentModel({ house }: { house: House }) {
  const walls = useMemo(() => buildWallBoxes(house.zones), [house.zones])
  const ext = useMemo(() => houseExtents(house), [house])

  return (
    <group>
      {/* 地板底座 */}
      <mesh position={[ext.cx, -0.055, ext.cz]}>
        <boxGeometry args={[ext.width + 0.6, 0.11, ext.depth + 0.6]} />
        <meshStandardMaterial color="#252939" roughness={0.95} />
      </mesh>

      {/* 墙体（半透明示意；内墙已开门洞，可穿行） */}
      {walls.map((w) => (
        <mesh key={w.key} position={[w.cx, WALL_H / 2, w.cz]}>
          <boxGeometry args={[w.w, WALL_H, w.d]} />
          <meshStandardMaterial color={WALL_COLOR} transparent opacity={0.3} roughness={0.85} />
        </mesh>
      ))}

      {/* 分区地面 + 标签 */}
      {house.zones.map((z) => (
        <group key={z.id}>
          <ZoneFloor zone={z} />
          <ZoneLabel zone={z} />
        </group>
      ))}

      {/* 家具占位色块 + 标注 */}
      {house.objects.map((o) => (
        <group key={o.id}>
          <FurnitureBox obj={o} />
          <ObjectLabel obj={o} />
        </group>
      ))}
    </group>
  )
}
