import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { loadVoxelCollision, type VoxelCollision } from './voxel'
import { loadRoomPolys, roomAtCloud, cloudRuleFor, loadTpTable, type RoomPoly, type TpTable } from './coords'
import { makeHighlightMarker } from './highlightMarker'
import { useAppStore } from '../store/useAppStore'
import { unlockAudio } from './agentActions'

// ==== 命令式视口：Spark 3DGS + 体素碰撞 + 对拍出生点 ====
// 渲染：THREE.WebGLRenderer + SparkRenderer + SplatMesh（InteriorGS compressed ply）
// 碰撞：splat-transform Voxel 任务产物（public/collision/），运行时查询在 voxel.ts
// 传送：store.teleportCmd（Agent tp_id/position → coords.ts 解析 → 此处执行）
//       点击不再瞬移；V 键回归初始出生点并复位视角

const VOXEL_META_URL =
  import.meta.env.VITE_AHOLO_VOXEL_META_URL ||
  `${import.meta.env.BASE_URL || '/'}collision/voxel-meta.json`

import { splatUrlForWorld, worldListing } from './worlds'

const EYE = 1.6
const WALK = 2.6
const RUN = 4.6
const ACCEL = 12
const SENS = 0.0022
const PITCH_LIMIT = 1.15 // 勿贴近 ±π/2，lookAt 与 up 平行会闪回
const MOUSE_MAX = 40 // Pointer Lock 首帧/丢帧常给超大 movementX，不夹会甩视角
const CAPSULE_R = 0.28
// 侧移符号：点云为 IG 原生 Z-up（右手系，对拍转正），常规取 +1；
// 旧 -Y up 素材实测反向时改 -1
const SIDE_SIGN = 1
// 玩家上下文发布节流（Agent chat 请求字段）
const CTX_INTERVAL = 200
const CTX_POS_EPS = 0.04
/** # 待确认：Spark 在 dpr=2 时持续走动易掉帧；1.5 为清晰度/帧率折中。外置 Chrome 若 Windows 缩放 150% 即约 1.5，已触顶。未改 Spark renderer 内部 */
const DPR_CAP = 1.5

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function AholoViewport({ worldId }: { worldId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const errRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const [bootEpoch, setBootEpoch] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    const errBox = errRef.current
    const statusBox = statusRef.current
    if (!host || !errBox) return

    if (statusBox) {
      statusBox.style.display = ''
      statusBox.classList.remove('done')
      statusBox.removeAttribute('aria-hidden')
      statusBox.textContent = '初始化渲染引擎…'
    }

    /** 加载浮窗：进度只在未完成时更新；onLoad/initialized 后淡出并卸载，避免 100% 后又被 onProgress 冲掉 done */
    let bootDone = false
    let hideStatusTimer = 0
    const hideStatusNow = () => {
      bootDone = true
      if (hideStatusTimer) window.clearTimeout(hideStatusTimer)
      hideStatusTimer = 0
      if (!statusBox) return
      statusBox.classList.add('done')
      statusBox.style.display = 'none'
      statusBox.textContent = ''
      statusBox.setAttribute('aria-hidden', 'true')
    }
    const setStatus = (text: string, done = false) => {
      if (!statusBox || bootDone) return
      statusBox.style.display = ''
      statusBox.textContent = text
      console.info('[boot]', text)
      if (!done) return
      bootDone = true
      statusBox.classList.add('done')
      statusBox.setAttribute('aria-hidden', 'true')
      hideStatusTimer = window.setTimeout(() => {
        if (statusBox) {
          statusBox.style.display = 'none'
          statusBox.textContent = ''
        }
      }, 1200)
    }

    let renderer: THREE.WebGLRenderer | null = null
    let splats: SplatMesh | null = null
    let raf = 0
    let disposed = false
    const st = { yaw: 0, pitch: 0, vx: 0, vz: 0, keys: new Set<string>() }
    const listing = worldListing(worldId)
    const splatUrl = splatUrlForWorld(worldId)
    const rule = cloudRuleFor(worldId)
    // InteriorGS 5 套均为 Z-up；coords CLOUD_RULES 目前只登记了 0330，其余用 worlds.ts
    const upAxis: 1 | 2 = rule?.up === 'z' || listing?.up === 'z' ? 2 : 1
    const h1 = 0
    const h2 = upAxis === 1 ? 2 : 1
    // 侧移符号：z-up 右手系叉积推导为 -1；旧 Y-up 素材保持 +1
    const sideSign = upAxis === 2 ? -1 : SIDE_SIGN
    const voxelEnabled = listing ? listing.voxel : rule ? rule.voxel !== false : false
    let vox: VoxelCollision | null = null
    let upSign: 1 | -1 = upAxis === 2 ? 1 : -1 // y-up 时由体素网格自动校正
    let tpTable: TpTable | null = null
    let roomPolys: RoomPoly[] = [] // 房间归因 polygon（对拍世界才有；空则 room_id=null）
    let ctxLast = 0
    type SpawnPose = { x: number; y: number; z: number; yaw: number; pitch: number }
    let spawnPose: SpawnPose | null = null

    const boot = async () => {
      setStatus('初始化渲染引擎…')
      if (!webglOk()) {
        hideStatusNow()
        errBox.style.display = 'flex'
        const span = errBox.querySelector('span')
        if (span) span.textContent = '请换用桌面 Chrome / Edge 打开（需启用硬件加速）'
        const title = errBox.querySelector('b')
        if (title) title.textContent = '当前环境不支持 WebGL'
        return
      }

      const w0 = Math.max(1, host.clientWidth)
      const h0 = Math.max(1, host.clientHeight)
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      })
      const applyView = () => {
        if (!renderer) return
        const w = Math.max(1, host.clientWidth)
        const h = Math.max(1, host.clientHeight)
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
        renderer.setPixelRatio(dpr)
        renderer.setSize(w, h, false)
        return { w, h, dpr }
      }
      const view0 = applyView()
      renderer.setClearColor(0x14161c, 1)
      host.appendChild(renderer.domElement)
      console.info(
        '[boot] canvas %d×%d dpr=%s (cap=%s) powerPreference=high-performance antialias=off',
        view0?.w ?? 0,
        view0?.h ?? 0,
        view0?.dpr ?? renderer.getPixelRatio(),
        DPR_CAP,
      )
      console.info('[boot] 若外置 Chrome 卡顿：设置 → 系统 → 打开「使用硬件加速」；关掉多余标签/扩展后再看 [perf] fps')

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(72, w0 / h0, 0.05, 300)
      const spark = new SparkRenderer({ renderer })
      scene.add(spark)

      // ---- tp 表（z-up 世界出生点用；与点云同帧，对拍产物）----
      let tpReady: Promise<void> | null = null
      if (worldId) {
        tpReady = loadTpTable(worldId)
          .then((t) => {
            tpTable = t
            if (Object.keys(t).length) console.info('[coords] tp 表就绪 %d 点', Object.keys(t).length)
          })
          .catch(() => {})
      }

      // ---- 体素碰撞（失败不阻塞渲染，降级为无碰撞漫游）----
      // ⚠️ 0330 体素帧与点云帧不同（网格 23.8×13.8×39.6m vs 点云 ~11×10×3.7m），
      //    启用会把相机推出场景 → 规则级禁用，待重新生成同帧体素后再开
      if (voxelEnabled) {
        setStatus('加载碰撞体…')
        try {
          vox = await loadVoxelCollision(VOXEL_META_URL)
          if (vox) {
            upSign = vox.detectUpSign()
            const spawn = vox.findSpawn()
            if (spawn && upAxis === 1) {
              camera.position.set(spawn.x, spawn.y + EYE * upSign, spawn.z)
              const g = vox.meta.gridBounds
              st.yaw = Math.atan2(-(g.max[0] + g.min[0]) / 2 + spawn.x, -(g.max[2] + g.min[2]) / 2 + spawn.z)
            }
            setStatus(`碰撞体 ✓（up=${upSign > 0 ? '+Y' : '-Y'}）`)
            console.info('[voxel] 碰撞就绪 up=%d spawn=%o', upSign, spawn)
          } else {
            setStatus('碰撞体 ✗（无碰撞漫游，可穿墙）')
          }
        } catch (e) {
          setStatus('碰撞体 ✗（无碰撞漫游，可穿墙）')
          console.warn('[voxel] 加载失败，本次漫游无碰撞', e)
        }
      } else {
        setStatus('碰撞体停用（帧不匹配）')
      }

      // ---- 出生点：z-up 世界用 tp_living（点云同帧坐标，地板 z≈0 眼高 1.5）----
      if (upAxis === 2) {
        await tpReady
        const tp = tpTable?.tp_living ?? (tpTable ? Object.values(tpTable)[0] : null)
        if (tp) {
          camera.position.set(tp[0], tp[1], tp[2] + 1.0)
          st.yaw = 0
          setStatus(`出生点 tp_living ${tp.map((n) => n.toFixed(1)).join(', ')} + 眼高1.0`)
        } else {
          camera.position.set(0, 0, 1.5)
        }
      }
      if (camera.position.lengthSq() < 1e-9) {
        camera.position.set(-1.5, EYE * upSign, 0)
      }
      camera.up.set(0, upAxis === 2 ? 0 : upSign, upAxis === 2 ? 1 : 0)
      const captureSpawn = () => {
        const p = camera.position
        spawnPose = { x: p.x, y: p.y, z: p.z, yaw: st.yaw, pitch: st.pitch }
      }
      captureSpawn()

      // ---- 房间归因数据（对拍世界 polygon；加载失败不阻塞，room_id 降级 null）----
      if (worldId) {
        loadRoomPolys(worldId)
          .then((ps) => {
            roomPolys = ps
            if (ps.length) console.info('[coords] 房间归因就绪 world=%s rooms=%d', worldId, ps.length)
          })
          .catch(() => {})
      }

      // ---- Spark 加载 InteriorGS compressed ply（dev：Vite 只读映射数据盘）----
      const tLoad0 = performance.now()
      setStatus(`加载点云… ${splatUrl}`)
      splats = new SplatMesh({
        url: splatUrl,
        onProgress: (ev) => {
          if (bootDone || disposed) return
          if (!ev.lengthComputable || !ev.total) return
          const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100))
          setStatus(`加载点云… ${pct}%`)
        },
        onLoad: (mesh) => {
          if (disposed) return
          const box = mesh.getBoundingBox(true)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          camera.far = Math.max(300, size.length() * 6)
          camera.updateProjectionMatrix()

          // 水平夹进 AABB（保留眼高）；朝向盒心 = 看向室内
          const inset = 0.45
          const p = camera.position
          p.setComponent(h1, clamp(p.getComponent(h1), box.min.getComponent(h1) + inset, box.max.getComponent(h1) - inset))
          p.setComponent(h2, clamp(p.getComponent(h2), box.min.getComponent(h2) + inset, box.max.getComponent(h2) - inset))
          const dx = center.x - p.x
          const dy = center.y - p.y
          const dz = center.z - p.z
          const len = Math.hypot(dx, dy, dz) || 1
          if (upAxis === 2) {
            st.yaw = Math.atan2(-dx, -dy)
            st.pitch = clamp(Math.asin(clamp(dz / len, -1, 1)), -0.35, 0.35)
          }
          captureSpawn()

          const ms = Math.round(performance.now() - tLoad0)
          const cw = renderer?.domElement.width ?? 0
          const ch = renderer?.domElement.height ?? 0
          console.info(
            '[boot] splat ready numSplats=%d loadMs=%d bbox=%o cam=%o canvas=%d×%d',
            mesh.numSplats,
            ms,
            { size: size.toArray(), center: center.toArray() },
            p.toArray().map((n) => +n.toFixed(2)),
            cw,
            ch,
          )
          setStatus(`场景就绪 · ${mesh.numSplats.toLocaleString()} 高斯 · WASD 漫游 · V 回起点`, true)
        },
      })
      scene.add(splats)
      void splats.initialized
        .then(() => {
          if (disposed || bootDone) return
          setStatus('场景就绪 · WASD 漫游 · V 回起点', true)
        })
        .catch((e: unknown) => {
          if (disposed) return
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[boot] splat init failed', e)
          hideStatusNow()
          errBox.style.display = 'flex'
          const title = errBox.querySelector('b')
          if (title) title.textContent = '点云加载失败'
          const span = errBox.querySelector('span')
          if (span) span.textContent = msg
        })

      // ---- 渲染 + 行走主循环 ----
      let lastT = 0
      let fpsFrames = 0
      let fpsMoving = 0
      let fpsT0 = 0
      const lookDir = new THREE.Vector3()
      const lookTarget = new THREE.Vector3()
      const camUp = new THREE.Vector3(0, upAxis === 2 ? 0 : upSign, upAxis === 2 ? 1 : 0)
      camera.up.copy(camUp)
      let skipLook = 0 // Pointer Lock 后丢掉前几帧脏 movement
      const FLY_MS = 850
      let fly: {
        x0: number; y0: number; z0: number
        x1: number; y1: number; z1: number
        yaw0: number; yaw1: number
        pitch0: number; pitch1: number
        t0: number
      } | null = null
      /** 带看切房：飞入完成前忽略 WASD（不取消平滑过渡） */
      let flyLocked = false

      const applyLookDir = () => {
        const lc = Math.cos(st.pitch)
        const ls = Math.sin(st.pitch)
        if (upAxis === 2) {
          lookDir.set(-Math.sin(st.yaw) * lc, -Math.cos(st.yaw) * lc, ls)
        } else {
          lookDir.set(-Math.sin(st.yaw) * lc, upSign * ls, -Math.cos(st.yaw) * lc)
        }
      }

      const tick = () => {
        if (disposed || !renderer) return
        const now = performance.now()
        const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0.016)
        lastT = now

        const k = st.keys
        let ix = 0
        let iz = 0
        if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1
        if (k.has('KeyS') || k.has('ArrowDown')) iz += 1
        if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1
        if (k.has('KeyD') || k.has('ArrowRight')) ix += 1

        if (flyLocked) {
          ix = 0
          iz = 0
        } else if (fly && (ix !== 0 || iz !== 0)) {
          fly = null
        }

        if (fly) {
          const u = Math.min(1, (performance.now() - fly.t0) / FLY_MS)
          const s = u * u * (3 - 2 * u)
          camera.position.set(
            fly.x0 + (fly.x1 - fly.x0) * s,
            fly.y0 + (fly.y1 - fly.y0) * s,
            fly.z0 + (fly.z1 - fly.z0) * s,
          )
          let dyaw = fly.yaw1 - fly.yaw0
          while (dyaw > Math.PI) dyaw -= Math.PI * 2
          while (dyaw < -Math.PI) dyaw += Math.PI * 2
          st.yaw = fly.yaw0 + dyaw * s
          st.pitch = fly.pitch0 + (fly.pitch1 - fly.pitch0) * s
          st.vx = 0
          st.vz = 0
          if (u >= 1) {
            fly = null
            flyLocked = false
          }
        } else {
        const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK
        let tv1 = 0
        let tv2 = 0
        if (ix !== 0 || iz !== 0) {
          const len = Math.hypot(ix, iz)
          ix /= len
          iz /= len
          // 水平前向/右向（轴向无关：分量 1/2 = h1/h2 两水平轴）
          const f1 = -Math.sin(st.yaw)
          const f2 = -Math.cos(st.yaw)
          tv1 = (f1 * -iz + -f2 * ix * sideSign) * speed
          tv2 = (f2 * -iz + f1 * ix * sideSign) * speed
        }
        const blend = 1 - Math.exp(-ACCEL * dt)
        st.vx += (tv1 - st.vx) * blend
        st.vz += (tv2 - st.vz) * blend
        if (Math.abs(st.vx) < 0.005) st.vx = 0
        if (Math.abs(st.vz) < 0.005) st.vz = 0

        const p = camera.position
        p.setComponent(h1, p.getComponent(h1) + st.vx * dt)
        p.setComponent(h2, p.getComponent(h2) + st.vz * dt)

        // 胶囊碰撞 + 贴地（仅 y-up 体素同帧世界；0330 体素帧不匹配已停用）
        if (vox && upAxis === 1) {
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
        }

        applyLookDir()

        // ---- Agent 上下文发布（节流）：位置变化小于阈值则不写 store，避免 HUD 无意义重绘 ----
        const p = camera.position
        const ctxNow = now
        if (worldId && ctxNow - ctxLast > CTX_INTERVAL) {
          ctxLast = ctxNow
          const rid = roomPolys.length ? roomAtCloud([p.x, p.y, p.z], worldId, roomPolys) : null
          const prev = useAppStore.getState().player
          const dx = prev ? Math.abs(prev.position[0] - p.x) : 1
          const dy = prev ? Math.abs(prev.position[1] - p.y) : 1
          const dz = prev ? Math.abs(prev.position[2] - p.z) : 1
          const moved = dx > CTX_POS_EPS || dy > CTX_POS_EPS || dz > CTX_POS_EPS
          if (!prev || prev.world_id !== worldId || prev.room_id !== rid || moved) {
            useAppStore.getState().setPlayer({
              world_id: worldId,
              position: [p.x, p.y, p.z],
              facing: [lookDir.x, lookDir.y, lookDir.z],
              room_id: rid,
            })
          }
        }

        fpsFrames += 1
        if (ix !== 0 || iz !== 0) fpsMoving += 1
        if (!fpsT0) fpsT0 = now
        else if (now - fpsT0 >= 5000) {
          const fps = (fpsFrames * 1000) / (now - fpsT0)
          console.info(
            '[perf] fps=%s moving=%s%% dpr=%s',
            fps.toFixed(1),
            fpsFrames ? Math.round((100 * fpsMoving) / fpsFrames) : 0,
            renderer.getPixelRatio(),
          )
          fpsFrames = 0
          fpsMoving = 0
          fpsT0 = now
        }

        // 输入已写入 yaw/pitch；本帧只提交一次矩阵
        camera.up.copy(camUp)
        lookTarget.copy(p).add(lookDir)
        camera.lookAt(lookTarget)
        camera.updateMatrixWorld()
        renderer.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      // ---- Agent 传送命令（store.teleportCmd，nonce 变化触发）----
      // 落点为点云系（Agent 契约/tp 表转正产物）；有体素时向下探测贴地，
      // 防穿地板/悬空；探测失败直接信任给定眼高。不要求指针锁定（语音传送也要能用）
      const unsubTp = useAppStore.subscribe((state, prev) => {
        const cmd = state.teleportCmd
        if (!cmd || cmd.nonce === prev.teleportCmd?.nonce) return
        const [tx, ty, tz] = cmd.position
        let x1 = tx
        let y1 = ty
        let z1 = tz
        if (upAxis === 2) {
          z1 = tz + 1.0
        } else {
          let sy = ty
          if (vox) {
            const g = vox.raycast(tx, sy + 1.5 * upSign, tz, 0, -upSign, 0, 3)
            if (g) sy = g.y + EYE * upSign
          }
          y1 = sy
        }
        const from = camera.position
        let yaw1 = st.yaw
        let pitch1 = 0
        const look = cmd.lookAt
        if (look && look.length === 3) {
          const ldx = look[0] - x1
          const ldy = look[1] - y1
          const ldz = look[2] - z1
          if (upAxis === 2) {
            const horiz = Math.hypot(ldx, ldy)
            if (horiz > 0.05) yaw1 = Math.atan2(-ldx, -ldy)
            pitch1 = clamp(Math.atan2(ldz, Math.max(horiz, 0.05)), -PITCH_LIMIT, PITCH_LIMIT)
          } else {
            const horiz = Math.hypot(ldx, ldz)
            if (horiz > 0.05) yaw1 = Math.atan2(-ldx, -ldz)
            pitch1 = clamp(Math.atan2(upSign * ldy, Math.max(horiz, 0.05)), -PITCH_LIMIT, PITCH_LIMIT)
          }
        } else {
          const dh1 = x1 - from.x
          const dh2 = upAxis === 2 ? y1 - from.y : z1 - from.z
          if (Math.hypot(dh1, dh2) > 0.2) {
            yaw1 = Math.atan2(-dh1, -dh2)
          }
        }
        fly = {
          x0: from.x, y0: from.y, z0: from.z,
          x1, y1, z1,
          yaw0: st.yaw, yaw1,
          pitch0: st.pitch, pitch1,
          t0: performance.now(),
        }
        flyLocked = !!cmd.force
        st.vx = 0
        st.vz = 0
        if (!cmd.force) {
          useAppStore.getState().showToast(cmd.label ? `已传送 · ${cmd.label}` : '已传送')
        }
        console.info('[teleport] agent world=%s fly→ %o force=%s', state.player?.world_id, [x1, y1, z1], !!cmd.force)
      })
      cleanupFns.push(unsubTp)

      // ---- Agent highlight（点云系 tp 落点；Z-up 与 teleport 同一套 camera_poses，不经 scene 实例坐标）----
      let hlMesh: THREE.Group | null = null
      let hlTimer: number | null = null
      const unsubHl = useAppStore.subscribe((state, prev) => {
        const cmd = state.highlightCmd
        if (!cmd || cmd.nonce === prev.highlightCmd?.nonce) return
        if (hlMesh) {
          scene.remove(hlMesh)
          hlMesh.traverse((o) => {
            const m = o as THREE.Mesh
            m.geometry?.dispose()
            const mat = m.material
            if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
            else mat?.dispose()
          })
          hlMesh = null
        }
        hlMesh = makeHighlightMarker(upAxis)
        hlMesh.position.set(cmd.position[0], cmd.position[1], cmd.position[2])
        scene.add(hlMesh)
        if (hlTimer) window.clearTimeout(hlTimer)
        hlTimer = window.setTimeout(() => {
          if (hlMesh) {
            scene.remove(hlMesh)
            hlMesh = null
          }
        }, 8_000)
        console.info('[highlight] world=%s pos=%o %s', worldId, cmd.position, cmd.label ?? '')
      })
      cleanupFns.push(unsubHl, () => {
        if (hlTimer) window.clearTimeout(hlTimer)
        if (hlMesh) scene.remove(hlMesh)
      })

      // ---- V 键回归初始点（位置 + 视角复位）。原 voxel 校准循环已废弃。----
      const resetToSpawn = () => {
        if (!spawnPose) return
        camera.position.set(spawnPose.x, spawnPose.y, spawnPose.z)
        st.yaw = spawnPose.yaw
        st.pitch = spawnPose.pitch
        st.vx = 0
        st.vz = 0
        useAppStore.getState().showToast('已回到起点', '位置和视角已复位')
        console.info('[spawn] reset pos=%o yaw=%s', camera.position.toArray().map((n) => +n.toFixed(2)), spawnPose.yaw.toFixed(2))
      }

      // ---- 键鼠 ----
      const canvas = () => host.querySelector('canvas')
      const requestLock = () => {
        unlockAudio()
        if (!useAppStore.getState().entered || document.pointerLockElement) return
        void canvas()?.requestPointerLock()
      }
      const onHostClickLock = () => requestLock()
      host.addEventListener('click', onHostClickLock)

      const onLockChange = () => {
        const c = canvas()
        const locked = !!c && document.pointerLockElement === c
        useAppStore.getState().setLocked(locked)
        if (locked) skipLook = 2
      }
      document.addEventListener('pointerlockchange', onLockChange)

      const onMove = (e: MouseEvent) => {
        const c = canvas()
        if (!c || document.pointerLockElement !== c) return
        if (skipLook > 0) {
          skipLook -= 1
          return
        }
        const dx = Math.max(-MOUSE_MAX, Math.min(MOUSE_MAX, e.movementX))
        const dy = Math.max(-MOUSE_MAX, Math.min(MOUSE_MAX, e.movementY))
        st.yaw += dx * SENS
        st.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, st.pitch - dy * SENS))
      }
      document.addEventListener('mousemove', onMove)

      const onDown = (e: KeyboardEvent) => {
        unlockAudio()
        st.keys.add(e.code)
        if (e.code.startsWith('Arrow')) e.preventDefault()
        if (e.code === 'KeyV' && useAppStore.getState().entered) {
          const el = e.target as HTMLElement | null
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
          resetToSpawn()
        }
      }
      const onUp = (e: KeyboardEvent) => st.keys.delete(e.code)
      window.addEventListener('keydown', onDown)
      window.addEventListener('keyup', onUp)

      const syncView = () => {
        const v = applyView()
        if (!v) return
        camera.aspect = v.w / v.h
        camera.updateProjectionMatrix()
      }
      const ro = new ResizeObserver(syncView)
      ro.observe(host)
      window.addEventListener('resize', syncView)
      window.visualViewport?.addEventListener('resize', syncView)

      cleanupFns.push(() => {
        host.removeEventListener('click', onHostClickLock)
        document.removeEventListener('pointerlockchange', onLockChange)
        document.removeEventListener('mousemove', onMove)
        window.removeEventListener('keydown', onDown)
        window.removeEventListener('keyup', onUp)
        window.removeEventListener('resize', syncView)
        window.visualViewport?.removeEventListener('resize', syncView)
        ro.disconnect()
      })
    }

    const cleanupFns: Array<() => void> = []
    boot().catch((e) => {
      console.error('[AholoViewport]', e)
      if (errBox && !disposed) {
        hideStatusNow()
        errBox.style.display = 'flex'
        const title = errBox.querySelector('b')
        if (title) title.textContent = '点云加载失败'
        const msg = errBox.querySelector('span')
        if (msg) msg.textContent = e instanceof Error ? e.message : String(e)
      }
    })

    return () => {
      disposed = true
      if (hideStatusTimer) window.clearTimeout(hideStatusTimer)
      cancelAnimationFrame(raf)
      cleanupFns.forEach((fn) => fn())
      try {
        splats?.dispose()
      } catch {
        /* noop */
      }
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
        renderer = null
      }
    }
  }, [worldId, bootEpoch])

  return (
    <>
      <div className="canvas-host" ref={hostRef} />
      <div className="boot-status" ref={statusRef} role="status">
        初始化渲染引擎…
      </div>
      <div className="canvas-host no-webgl" ref={errRef} style={{ display: 'none' }}>
        <div>
          <b>当前环境不支持 WebGL</b>
          <span>请换用桌面 Chrome / Edge 打开（需启用硬件加速）</span>
          <div className="boot-err-actions">
            <button
              type="button"
              className="boot-err-btn"
              onClick={() => {
                if (errRef.current) errRef.current.style.display = 'none'
                setBootEpoch((n) => n + 1)
              }}
            >
              重试
            </button>
            <button
              type="button"
              className="boot-err-btn ghost"
              onClick={() => {
                if (errRef.current) errRef.current.style.display = 'none'
              }}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
