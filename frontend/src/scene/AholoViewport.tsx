import { useEffect, useRef } from 'react'
import {
  createViewer,
  setViewerConfig,
  PerspectiveCamera,
  BackgroundMode,
  Vector3,
  Color,
  SplatUtils,
  type Viewer,
  type IViewerContext,
} from '@manycore/aholo-viewer'
import { loadVoxelCollision, type VoxelCollision } from './voxel'
import { loadRoomPolys, roomAtCloud, type RoomPoly } from './coords'
import { useAppStore } from '../store/useAppStore'

// ==== 群核全栈视口：LOD 流式渲染 + 体素碰撞 + 点击传送 + 自动出生点 ====
// 渲染：@manycore/aholo-viewer 的 LodSplat（分块多级 LOD，按视锥调度）
// 配置：官方 3DGS Preset「效果优先」（SPZ + Compressed + pack.highPrecision）
// 碰撞：splat-transform Voxel 任务产物（public/collision/），运行时查询在 voxel.ts
// 传送：锁定时点击 → 射线命中点瞬移（解决关门房间不可达）
//       + store.teleportCmd（Agent tp_id/position → coords.ts 解析 → 此处执行）

const LOD_META_URL =
  import.meta.env.VITE_AHOLO_LOD_META_URL ||
  'https://holo-cos.aholo3d.cn/splat-transform/3FO4FA4U7MVJ/lod/1787836246/lod-meta.json'
const VOXEL_META_URL = import.meta.env.VITE_AHOLO_VOXEL_META_URL || '/collision/voxel-meta.json'

/** 当前加载点云对应的业务 world_id（Agent 契约/坐标映射按它索引）。
 *  对拍转正的世界（w_0330_840483）才有 scene↔点云映射与房间归因；未登记世界恒等降级。 */
const WORLD_ID = (import.meta.env.VITE_WORLD_ID as string | undefined) || ''

const EYE = 1.6
const WALK = 2.6
const RUN = 4.6
const ACCEL = 12
const SENS = 0.0022
const PITCH_LIMIT = 1.45
const CAPSULE_R = 0.28
const TELEPORT_MAX = 40
// 侧移符号：点云为 IG 原生 Z-up（右手系，对拍转正），常规取 +1；
// 旧 -Y up 素材实测反向时改 -1
const SIDE_SIGN = 1
// 玩家上下文发布节流（Agent chat 请求字段）
const CTX_INTERVAL = 200

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function AholoViewport() {
  const hostRef = useRef<HTMLDivElement>(null)
  const errRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const errBox = errRef.current
    if (!host || !errBox) return

    let viewer: Viewer | null = null
    let lod: SplatUtils.LodSplat | null = null
    let raf = 0
    let disposed = false
    const st = { yaw: 0, pitch: 0, vx: 0, vz: 0, keys: new Set<string>() }
    let vox: VoxelCollision | null = null
    let upSign: 1 | -1 = -1 // 体素加载后按网格自动校正（0330 为 IG 原生 Z-up → +1）
    let roomPolys: RoomPoly[] = [] // 房间归因 polygon（对拍世界才有；空则 room_id=null）
    let ctxLast = 0

    const boot = async () => {
      if (!webglOk()) {
        errBox.style.display = 'flex'
        return
      }

      viewer = createViewer('house-walk', host, {})
      const scene = viewer.getScene()
      const camera = new PerspectiveCamera(72, host.clientWidth / Math.max(1, host.clientHeight), 0.05, 300)
      viewer.setCamera(camera)

      // ---- 体素碰撞（失败不阻塞渲染，降级为无碰撞漫游）----
      try {
        vox = await loadVoxelCollision(VOXEL_META_URL)
        if (vox) {
          upSign = vox.detectUpSign()
          const spawn = vox.findSpawn()
          if (spawn) {
            camera.position.set(spawn.x, spawn.y + EYE * upSign, spawn.z)
            // 出生朝向：面向网格中心
            const g = vox.meta.gridBounds
            st.yaw = Math.atan2(-(g.max[0] + g.min[0]) / 2 + spawn.x, -(g.max[2] + g.min[2]) / 2 + spawn.z)
          }
          console.info('[voxel] 碰撞就绪 up=%d spawn=%o', upSign, spawn)
        }
      } catch (e) {
        console.warn('[voxel] 加载失败，本次漫游无碰撞', e)
      }
      if (camera.position.lengthSq() < 1e-9) {
        camera.position.set(-1.5, EYE * upSign, 0)
      }
      camera.up.set(0, upSign, 0)

      // ---- 房间归因数据（对拍世界 polygon；加载失败不阻塞，room_id 降级 null）----
      if (WORLD_ID) {
        loadRoomPolys(WORLD_ID)
          .then((ps) => {
            roomPolys = ps
            if (ps.length) console.info('[coords] 房间归因就绪 world=%s rooms=%d', WORLD_ID, ps.length)
          })
          .catch(() => {})
      }

      // ---- LOD 流式加载（分块多级，视锥调度）----
      const metaRes = await fetch(LOD_META_URL)
      if (!metaRes.ok) throw new Error(`lod-meta 下载失败 HTTP ${metaRes.status}`)
      const lodMeta = await metaRes.json()
      lod = new SplatUtils.LodSplat(lodMeta, undefined, viewer as unknown as IViewerContext)
      scene.add(lod.container)
      lod.start()
      void lod.onFinishSchedule()

      // ---- 官方 Preset「效果优先」----
      setViewerConfig(viewer, {
        pipeline: {
          Background: {
            background: { active: BackgroundMode.BasicBackground, basic: { color: new Color(0.08, 0.09, 0.12) } },
            ground: { enabled: false },
          },
          Splatting: {
            enabled: true,
            pack: { highPrecisionEnabled: true, cameraRelativeEnabled: false },
          },
          TAA: { enabled: false },
        },
      })

      // ---- 渲染 + 行走主循环 ----
      let lastT = 0
      const look = new Vector3()
      const tick = () => {
        if (disposed || !viewer) return
        const dt = Math.min(0.05, lastT ? (performance.now() - lastT) / 1000 : 0.016)
        lastT = performance.now()

        const k = st.keys
        let ix = 0
        let iz = 0
        if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1
        if (k.has('KeyS') || k.has('ArrowDown')) iz += 1
        if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1
        if (k.has('KeyD') || k.has('ArrowRight')) ix += 1
        const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK
        let tvx = 0
        let tvz = 0
        if (ix !== 0 || iz !== 0) {
          const len = Math.hypot(ix, iz)
          ix /= len
          iz /= len
          const fx = -Math.sin(st.yaw)
          const fz = -Math.cos(st.yaw)
          tvx = (fx * -iz + -fz * ix * SIDE_SIGN) * speed
          tvz = (fz * -iz + fx * ix * SIDE_SIGN) * speed
        }
        const blend = 1 - Math.exp(-ACCEL * dt)
        st.vx += (tvx - st.vx) * blend
        st.vz += (tvz - st.vz) * blend
        if (Math.abs(st.vx) < 0.005) st.vx = 0
        if (Math.abs(st.vz) < 0.005) st.vz = 0

        const p = camera.position
        p.x += st.vx * dt
        p.z += st.vz * dt

        // 胶囊碰撞：脚部/头部两球推出（迭代 2 轮）
        if (vox) {
          const feetY = p.y - EYE * upSign
          for (let it = 0; it < 2; it++) {
            const lo = vox.resolveSphere(p.x, feetY + 0.3 * upSign, p.z, CAPSULE_R)
            if (lo) {
              p.x += lo[0]
              p.z += lo[2]
            }
            const hi = vox.resolveSphere(p.x, p.y - 0.15 * upSign, p.z, CAPSULE_R)
            if (hi) {
              p.x += hi[0]
              p.z += hi[2]
            }
          }
          // 贴地：从脚上方向下探测，命中即吸附
          const g = vox.raycast(p.x, feetY + 0.5 * upSign, p.z, 0, -upSign, 0, 1.4)
          if (g) {
            p.y = g.y + EYE * upSign
          }
        }

        look.set(
          -Math.sin(st.yaw) * Math.cos(st.pitch),
          upSign * Math.sin(st.pitch),
          -Math.cos(st.yaw) * Math.cos(st.pitch),
        )

        // ---- Agent 上下文发布（节流）：眼位/视线取点云原生坐标，房间按对拍映射归因 ----
        const ctxNow = performance.now()
        if (WORLD_ID && ctxNow - ctxLast > CTX_INTERVAL) {
          ctxLast = ctxNow
          useAppStore.getState().setPlayer({
            world_id: WORLD_ID,
            position: [p.x, p.y, p.z],
            facing: [look.x, look.y, look.z],
            room_id: roomPolys.length ? roomAtCloud([p.x, p.y, p.z], WORLD_ID, roomPolys) : null,
          })
        }

        camera.lookAt(look.add(p))
        lod?.tick(camera)
        viewer.render()
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      // ---- 点击传送（锁定状态下）----
      const onCanvasClick = () => {
        const c = host.querySelector('canvas')
        if (!c || document.pointerLockElement !== c || !vox) return
        const p = camera.position
        const fx = -Math.sin(st.yaw) * Math.cos(st.pitch)
        const fy = upSign * Math.sin(st.pitch)
        const fz = -Math.cos(st.yaw) * Math.cos(st.pitch)
        const hit = vox.raycast(p.x, p.y, p.z, fx, fy, fz, TELEPORT_MAX)
        if (!hit) {
          useAppStore.getState().showToast('这里到不了', '视线内没有可站立的落点')
          return
        }
        // 沿视线回退找落脚点（贴墙物体后面也能站）
        for (const back of [0.3, 0.8, 1.6]) {
          const tx = hit.x - fx * back
          const tz = hit.z - fz * back
          const feetProbe = vox.raycast(tx, hit.y + 2 * upSign, tz, 0, -upSign, 0, 3.5)
          if (!feetProbe) continue
          const ty = feetProbe.y + EYE * upSign
          const push1 = vox.resolveSphere(tx, feetProbe.y + 0.3 * upSign, tz, CAPSULE_R)
          const push2 = vox.resolveSphere(tx, ty - 0.15 * upSign, tz, CAPSULE_R)
          const blocked = Math.hypot(push1?.[0] ?? 0, push1?.[2] ?? 0) + Math.hypot(push2?.[0] ?? 0, push2?.[2] ?? 0)
          if (blocked > 0.12) continue
          p.set(tx, ty, tz)
          st.vx = 0
          st.vz = 0
          return
        }
        useAppStore.getState().showToast('落点被挡住了', '换个角度看目标位置')
      }
      host.addEventListener('click', onCanvasClick)

      // ---- Agent 传送命令（store.teleportCmd，nonce 变化触发）----
      // 落点为点云系（Agent 契约/tp 表转正产物）；有体素时向下探测贴地，
      // 防穿地板/悬空；探测失败直接信任给定眼高。不要求指针锁定（语音传送也要能用）
      const unsubTp = useAppStore.subscribe((state, prev) => {
        const cmd = state.teleportCmd
        if (!cmd || cmd.nonce === prev.teleportCmd?.nonce) return
        const [tx, , tz] = cmd.position
        let ty = cmd.position[1]
        if (vox) {
          const g = vox.raycast(tx, ty + 1.5 * upSign, tz, 0, -upSign, 0, 3)
          if (g) ty = g.y + EYE * upSign
        }
        camera.position.set(tx, ty, tz)
        st.vx = 0
        st.vz = 0
        useAppStore.getState().showToast(cmd.label ? `已传送 · ${cmd.label}` : '已传送')
        console.info('[teleport] agent world=%s target=%o resolved_y=%s', state.player?.world_id, cmd.position, ty)
      })
      cleanupFns.push(unsubTp)

      // ---- 键鼠 ----
      const canvas = () => host.querySelector('canvas')
      const requestLock = () => {
        if (!useAppStore.getState().entered || document.pointerLockElement) return
        void canvas()?.requestPointerLock()
      }
      const onHostClickLock = () => requestLock()
      host.addEventListener('click', onHostClickLock)

      const onLockChange = () => {
        const c = canvas()
        useAppStore.getState().setLocked(!!c && document.pointerLockElement === c)
      }
      document.addEventListener('pointerlockchange', onLockChange)

      const onMove = (e: MouseEvent) => {
        const c = canvas()
        if (!c || document.pointerLockElement !== c) return
        st.yaw -= e.movementX * SENS
        st.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, st.pitch - e.movementY * SENS))
      }
      document.addEventListener('mousemove', onMove)

      const onDown = (e: KeyboardEvent) => {
        st.keys.add(e.code)
        if (e.code.startsWith('Arrow')) e.preventDefault()
      }
      const onUp = (e: KeyboardEvent) => st.keys.delete(e.code)
      window.addEventListener('keydown', onDown)
      window.addEventListener('keyup', onUp)

      const ro = new ResizeObserver(() => viewer?.resize())
      ro.observe(host)

      cleanupFns.push(() => {
        host.removeEventListener('click', onCanvasClick)
        host.removeEventListener('click', onHostClickLock)
        document.removeEventListener('pointerlockchange', onLockChange)
        document.removeEventListener('mousemove', onMove)
        window.removeEventListener('keydown', onDown)
        window.removeEventListener('keyup', onUp)
        ro.disconnect()
      })
    }

    const cleanupFns: Array<() => void> = []
    boot().catch((e) => {
      console.error('[AholoViewport]', e)
      if (errBox && !disposed) {
        errBox.style.display = 'flex'
        const msg = errBox.querySelector('span')
        if (msg) msg.textContent = `点云加载失败：${e instanceof Error ? e.message : String(e)}`
      }
    })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      cleanupFns.forEach((fn) => fn())
      try {
        lod?.destroy()
      } catch {
        /* noop */
      }
      viewer?.pause()
    }
  }, [])

  return (
    <>
      <div className="canvas-host" ref={hostRef} />
      <div className="canvas-host no-webgl" ref={errRef} style={{ display: 'none' }}>
        <div>
          <b>当前环境不支持 WebGL</b>
          <span>请换用桌面 Chrome / Edge 打开（需启用硬件加速）</span>
        </div>
      </div>
    </>
  )
}
