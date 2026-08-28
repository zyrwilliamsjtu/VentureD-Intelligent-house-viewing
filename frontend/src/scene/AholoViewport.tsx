import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { loadVoxelCollision, type VoxelCollision } from './voxel'
import { loadRoomPolys, roomAtCloud, cloudRuleFor, loadTpTable, type RoomPoly, type TpTable } from './coords'
import { makeHighlightMarker } from './highlightMarker'
import { useAppStore } from '../store/useAppStore'

// ==== 命令式视口：Spark 3DGS + 体素碰撞 + 点击传送 + 对拍出生点 ====
// 渲染：THREE.WebGLRenderer + SparkRenderer + SplatMesh（InteriorGS compressed ply）
// 碰撞：splat-transform Voxel 任务产物（public/collision/），运行时查询在 voxel.ts
// 传送：锁定时点击 → 射线命中点瞬移（解决关门房间不可达）
//       + store.teleportCmd（Agent tp_id/position → coords.ts 解析 → 此处执行）

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function AholoViewport({ worldId }: { worldId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const errRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const errBox = errRef.current
    const statusBox = statusRef.current
    if (!host || !errBox) return

    /** 加载仪表盘：黑屏期间把每一步进度写在屏幕上（无需开 F12），完成 1.2s 后淡出 */
    const setStatus = (text: string, done = false) => {
      if (!statusBox) return
      statusBox.textContent = text
      statusBox.classList.toggle('done', done)
      console.info('[boot]', text)
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

    const boot = async () => {
      setStatus('初始化渲染引擎…')
      if (!webglOk()) {
        errBox.style.display = 'flex'
        return
      }

      const w0 = Math.max(1, host.clientWidth)
      const h0 = Math.max(1, host.clientHeight)
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w0, h0, false)
      renderer.setClearColor(0x14161c, 1)
      host.appendChild(renderer.domElement)
      console.info('[boot] canvas %d×%d dpr=%s', w0, h0, renderer.getPixelRatio())

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
          if (!ev.lengthComputable || !ev.total) return
          const pct = ((ev.loaded / ev.total) * 100).toFixed(0)
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
          setStatus(`场景就绪 · ${mesh.numSplats.toLocaleString()} 高斯 · WASD 漫游${upAxis === 2 ? ' · 黑屏先按 V' : ''}`, true)
        },
      })
      scene.add(splats)
      void splats.initialized.catch((e: unknown) => {
        if (disposed) return
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[boot] splat init failed', e)
        errBox.style.display = 'flex'
        const span = errBox.querySelector('span')
        if (span) span.textContent = `点云加载失败：${msg}`
      })

      // ---- 渲染 + 行走主循环 ----
      let lastT = 0
      const lookDir = new THREE.Vector3()
      const lookTarget = new THREE.Vector3()
      const camUp = new THREE.Vector3(0, upAxis === 2 ? 0 : upSign, upAxis === 2 ? 1 : 0)
      camera.up.copy(camUp)
      let skipLook = 0 // Pointer Lock 后丢掉前几帧脏 movement

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

        applyLookDir()

        // ---- Agent 上下文发布（节流）：眼位/视线取点云原生坐标，房间按对拍映射归因 ----
        const ctxNow = performance.now()
        if (worldId && ctxNow - ctxLast > CTX_INTERVAL) {
          ctxLast = ctxNow
          useAppStore.getState().setPlayer({
            world_id: worldId,
            position: [p.x, p.y, p.z],
            facing: [lookDir.x, lookDir.y, lookDir.z],
            room_id: roomPolys.length ? roomAtCloud([p.x, p.y, p.z], worldId, roomPolys) : null,
          })
        }

        // 输入已写入 yaw/pitch；本帧只提交一次矩阵（look 向量不 in-place add，避免 facing 被污染）
        camera.up.copy(camUp)
        lookTarget.copy(p).add(lookDir)
        camera.lookAt(lookTarget)
        camera.updateMatrixWorld(true)
        renderer.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      // ---- 点击传送（锁定状态下）----
      const onCanvasClick = () => {
        const c = host.querySelector('canvas')
        if (!c || document.pointerLockElement !== c) return
        const p = camera.position
        if (!vox) {
          // 无体素（0330 帧不匹配停用）：沿视线水平冲刺 2.2m
          p.setComponent(h1, p.getComponent(h1) - Math.sin(st.yaw) * 2.2)
          p.setComponent(h2, p.getComponent(h2) - Math.cos(st.yaw) * 2.2)
          return
        }
        if (upAxis === 2) return
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
        const [tx, ty, tz] = cmd.position
        if (upAxis === 2) {
          // z-up 点云系：tp 落点 + 眼高 1.0（与出生点同约定）
          camera.position.set(tx, ty, tz + 1.0)
        } else {
          let sy = ty
          if (vox) {
            const g = vox.raycast(tx, sy + 1.5 * upSign, tz, 0, -upSign, 0, 3)
            if (g) sy = g.y + EYE * upSign
          }
          camera.position.set(tx, sy, tz)
        }
        st.vx = 0
        st.vz = 0
        useAppStore.getState().showToast(cmd.label ? `已传送 · ${cmd.label}` : '已传送')
        console.info('[teleport] agent world=%s target=%o pos=%o', state.player?.world_id, cmd.position, camera.position.toArray())
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

      // ---- V 键视角校准（z-up 联调用）：黑屏时逐个试出生候选，可见的编号告诉我 ----
      const spawnPresets: Array<{ name: string; tp?: string; dz: number; pitch: number }> = [
        { name: 'A 客厅·眼高1.0', tp: 'tp_living', dz: 1.0, pitch: 0 },
        { name: 'B 客厅·眼高1.5', tp: 'tp_living', dz: 1.5, pitch: 0 },
        { name: 'C 客厅·眼高2.2·俯视', tp: 'tp_living', dz: 2.2, pitch: -0.5 },
        { name: 'D 厨房·眼高1.0', tp: 'tp_kitchen', dz: 1.0, pitch: 0 },
        { name: 'E 场景中心·眼高1.5', dz: 1.5, pitch: 0 },
      ]
      let presetIdx = 0
      const cycleSpawn = () => {
        if (!tpTable) return
        const ps = spawnPresets[presetIdx % spawnPresets.length]
        presetIdx++
        const tp = ps.tp ? tpTable[ps.tp] : null
        if (tp) camera.position.set(tp[0], tp[1], tp[2] + ps.dz)
        else camera.position.set(0, 0, ps.dz)
        st.pitch = ps.pitch
        st.vx = 0
        st.vz = 0
        useAppStore.getState().showToast('视角校准', `${ps.name} · 能看到房间就记住编号`)
        console.info('[calibrate] %s pos=%o', ps.name, camera.position.toArray().map((n) => +n.toFixed(2)))
      }

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
        st.keys.add(e.code)
        if (e.code.startsWith('Arrow')) e.preventDefault()
        if (e.code === 'KeyV' && upAxis === 2 && useAppStore.getState().entered) cycleSpawn()
      }
      const onUp = (e: KeyboardEvent) => st.keys.delete(e.code)
      window.addEventListener('keydown', onDown)
      window.addEventListener('keyup', onUp)

      const ro = new ResizeObserver(() => {
        if (!renderer) return
        const w = Math.max(1, host.clientWidth)
        const h = Math.max(1, host.clientHeight)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h, false)
      })
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
  }, [worldId])

  return (
    <>
      <div className="canvas-host" ref={hostRef} />
      <div className="boot-status" ref={statusRef}>
        初始化渲染引擎…
      </div>
      <div className="canvas-host no-webgl" ref={errRef} style={{ display: 'none' }}>
        <div>
          <b>当前环境不支持 WebGL</b>
          <span>请换用桌面 Chrome / Edge 打开（需启用硬件加速）</span>
        </div>
      </div>
    </>
  )
}
