import { useEffect, useRef } from 'react'
import {
  createViewer,
  createViewerContext,
  setViewerConfig,
  PerspectiveCamera,
  BackgroundMode,
  Vector3,
  Color,
  SplatUtils,
  type Viewer,
} from '@manycore/aholo-viewer'
import { loadVoxelCollision, type VoxelCollision } from './voxel'
import { loadRoomPolys, roomAtCloud, cloudRuleFor, loadTpTable, type RoomPoly, type TpTable } from './coords'
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
const VOXEL_META_URL =
  import.meta.env.VITE_AHOLO_VOXEL_META_URL ||
  `${import.meta.env.BASE_URL || '/'}collision/voxel-meta.json`

/** 当前加载点云对应的业务 world_id（Agent 契约/坐标映射按它索引）。
 *  唯一来源 VITE_WORLD_ID，缺省回退 w_0330_840483（PI 决策 2：demo 统一 0330 真实场景，
 *  与后端 GT / camera_poses / App.tsx 同一套 id；未登记世界恒等降级）。 */
const WORLD_ID = (import.meta.env.VITE_WORLD_ID as string | undefined) || 'w_0330_840483'

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

    let viewer: Viewer | null = null
    let lod: SplatUtils.LodSplat | null = null
    let raf = 0
    let disposed = false
    const st = { yaw: 0, pitch: 0, vx: 0, vz: 0, keys: new Set<string>() }
    const rule = cloudRuleFor(WORLD_ID)
    // 轴向无关：竖直分量下标（y-up=1 / z-up=2），水平两轴 = 其余下标
    const upAxis: 1 | 2 = rule?.up === 'z' ? 2 : 1
    const h1 = 0
    const h2 = upAxis === 1 ? 2 : 1
    // 侧移符号：z-up 右手系叉积推导为 -1；旧 Y-up 素材保持 +1
    const sideSign = upAxis === 2 ? -1 : SIDE_SIGN
    const voxelEnabled = rule ? rule.voxel !== false : true
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
      viewer = createViewer('house-walk', host, {})
      const scene = viewer.getScene()
      const camera = new PerspectiveCamera(72, host.clientWidth / Math.max(1, host.clientHeight), 0.05, 300)
      viewer.setCamera(camera)

      // ---- tp 表（z-up 世界出生点用；与点云同帧，对拍产物）----
      let tpReady: Promise<void> | null = null
      if (WORLD_ID) {
        tpReady = loadTpTable(WORLD_ID)
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
      if (WORLD_ID) {
        loadRoomPolys(WORLD_ID)
          .then((ps) => {
            roomPolys = ps
            if (ps.length) console.info('[coords] 房间归因就绪 world=%s rooms=%d', WORLD_ID, ps.length)
          })
          .catch(() => {})
      }

      // ---- LOD 流式加载（分块多级，视锥调度）----
      setStatus('下载点云索引…')
      const ctrl = new AbortController()
      const metaTimer = window.setTimeout(() => ctrl.abort(), 20_000) // 卡死不再是无限黑屏
      let lodMeta: ConstructorParameters<typeof SplatUtils.LodSplat>[0] | undefined
      try {
        const metaRes = await fetch(LOD_META_URL, { signal: ctrl.signal })
        if (!metaRes.ok) throw new Error(`lod-meta 下载失败 HTTP ${metaRes.status}`)
        lodMeta = await metaRes.json()
      } catch (e) {
        throw new Error(
          e instanceof DOMException && e.name === 'AbortError'
            ? '点云索引下载超时（20s），请检查网络后刷新'
            : `lod-meta 下载失败：${e instanceof Error ? e.message : String(e)}`,
        )
      } finally {
        window.clearTimeout(metaTimer)
      }
      if (!lodMeta) throw new Error('点云索引解析失败（空内容）')
      lod = new SplatUtils.LodSplat(lodMeta, undefined, createViewerContext(viewer))
      scene.add(lod.container)
      lod.start()
      setStatus('加载点云…（视网络 10–60 秒，期间画面逐块出现）')
      void lod
        .onFinishSchedule()
        .then(() => setStatus(`场景就绪 · WASD 漫游${upAxis === 2 ? ' · 黑屏先按 V' : ''}`, true))
        .catch(() => {}) // 调度完成回调失败不影响渲染

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

        // 视线向量（轴向无关）
        const lc = Math.cos(st.pitch)
        const ls = Math.sin(st.pitch)
        if (upAxis === 2) {
          look.set(-Math.sin(st.yaw) * lc, -Math.cos(st.yaw) * lc, ls)
        } else {
          look.set(-Math.sin(st.yaw) * lc, upSign * ls, -Math.cos(st.yaw) * lc)
        }

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
        if (e.code === 'KeyV' && upAxis === 2 && useAppStore.getState().entered) cycleSpawn()
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
