import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useAppStore } from '../store/useAppStore'
import {
  buildWallBoxes,
  objectAabbs,
  spawnPoint,
  wallAabbs,
  zoneAreaOf,
  zoneAt,
  type Aabb,
} from './layout'

// ==== 第一人称漫游（占位实现，交互习惯对齐群核 Aholo 步行漫游：第一人称眼高）====
// 控件：WASD/方向键移动 · 鼠标视角（Pointer Lock）· Shift 快走 · ESC 释放
// 后续接入群核点云（aholo-viewer）后，本组件整体退役，由 viewer 自带步行模式接管。

const EYE_H = 1.6
const RADIUS = 0.26 // 玩家碰撞半径（米）
const WALK = 3.0
const RUN = 5.2
const ACCEL = 12 // 加速/阻尼系数
const SENS = 0.0022 // 鼠标灵敏度
const PITCH_LIMIT = 1.45

export function FirstPersonRig() {
  const house = useAppStore((s) => s.house)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const colliders = useMemo<Aabb[]>(
    () => (house ? [...wallAabbs(buildWallBoxes(house.zones)), ...objectAabbs(house.objects)] : []),
    [house],
  )

  const st = useRef({
    yaw: 0,
    pitch: 0,
    vx: 0,
    vz: 0,
    keys: new Set<string>(),
    spawned: false,
  })

  const blocked = (x: number, z: number) => {
    for (const a of colliders) {
      if (x > a.minX - RADIUS && x < a.maxX + RADIUS && z > a.minZ - RADIUS && z < a.maxZ + RADIUS) return true
    }
    return false
  }
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked

  // ---- 出生点 ----
  useEffect(() => {
    if (!house || st.current.spawned) return
    const spawn = spawnPoint(house, (x, z) => blockedRef.current(x, z))
    if (!spawn) return
    camera.position.set(spawn.x, EYE_H, spawn.z)
    st.current.yaw = spawn.yaw
    st.current.pitch = 0
    st.current.spawned = true
    camera.rotation.order = 'YXZ'
  }, [house, camera])

  // ---- Pointer Lock + 键鼠 ----
  useEffect(() => {
    const canvas = gl.domElement

    const requestLock = () => {
      const s = useAppStore.getState()
      if (!s.entered || document.pointerLockElement) return
      void canvas.requestPointerLock()
    }
    canvas.addEventListener('click', requestLock)

    const onLockChange = () => {
      useAppStore.getState().setLocked(document.pointerLockElement === canvas)
    }
    document.addEventListener('pointerlockchange', onLockChange)

    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      const s = st.current
      s.yaw -= e.movementX * SENS
      s.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, s.pitch - e.movementY * SENS))
    }
    document.addEventListener('mousemove', onMove)

    const onDown = (e: KeyboardEvent) => {
      st.current.keys.add(e.code)
      if (e.code.startsWith('Arrow')) e.preventDefault()
    }
    const onUp = (e: KeyboardEvent) => st.current.keys.delete(e.code)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)

    return () => {
      canvas.removeEventListener('click', requestLock)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [gl])

  // ---- 每帧：移动 + 碰撞（轴分离滑墙） + 房间检测 ----
  useFrame((_, rawDt) => {
    const s = st.current
    if (!s.spawned) return
    const dt = Math.min(rawDt, 0.05)

    // 朝向
    camera.rotation.order = 'YXZ'
    camera.rotation.y = s.yaw
    camera.rotation.x = s.pitch

    // 输入 → 目标速度（相对视线朝向）
    const k = s.keys
    let ix = 0
    let iz = 0
    if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1
    if (k.has('KeyS') || k.has('ArrowDown')) iz += 1
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1
    const running = k.has('ShiftLeft') || k.has('ShiftRight')
    const speed = running ? RUN : WALK

    let tvx = 0
    let tvz = 0
    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz)
      ix /= len
      iz /= len
      // forward = (-sin yaw, -cos yaw)；right = (cos yaw... ) 由 forward 旋转 -90°
      const fx = -Math.sin(s.yaw)
      const fz = -Math.cos(s.yaw)
      const rx = -fz
      const rz = fx
      tvx = (fx * -iz + rx * ix) * speed
      tvz = (fz * -iz + rz * ix) * speed
    }

    // 平滑加减速
    const blend = 1 - Math.exp(-ACCEL * dt)
    s.vx += (tvx - s.vx) * blend
    s.vz += (tvz - s.vz) * blend
    if (Math.abs(s.vx) < 0.005) s.vx = 0
    if (Math.abs(s.vz) < 0.005) s.vz = 0

    // 轴分离碰撞：先 X 后 Z，各自被挡则取消该轴（贴墙滑动）
    let nx = camera.position.x + s.vx * dt
    if (blockedRef.current(nx, camera.position.z)) {
      nx = camera.position.x
      s.vx = 0
    }
    let nz = camera.position.z + s.vz * dt
    if (blockedRef.current(nx, nz)) {
      nz = camera.position.z
      s.vz = 0
    }
    camera.position.set(nx, EYE_H, nz)

    // 房间检测 → 进房提示
    const app = useAppStore.getState()
    const h = app.house
    if (h) {
      const zone = zoneAt(h, nx, nz)
      const id = zone?.id ?? null
      if (id !== app.currentZone) {
        app.setZone(id)
        if (zone) app.showToast(zone.label, `${zoneAreaOf(zone)} ㎡`)
      }
    }
  })

  return null
}
