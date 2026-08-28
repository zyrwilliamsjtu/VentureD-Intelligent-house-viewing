import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ApartmentModel } from './ApartmentModel'
import { FirstPersonRig } from './FirstPersonRig'
import { useAppStore } from '../store/useAppStore'

// ==== 3D 视口：第一人称漫游（占位程序化户型）====
// 群核点云接入点：把 <ApartmentModel> 换成 aholo-viewer 场景（pointcloud_url），
// 或在其上叠 GLB 分支；FirstPersonRig 随之退役（viewer 自带步行漫游）。

/** WebGL 不可用（无 GPU / 沙箱浏览器）时兜底，避免整页白屏 */
function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function SceneCanvas() {
  const house = useAppStore((s) => s.house)
  const ok = useMemo(webglOk, [])

  if (!ok) {
    return (
      <div className="canvas-host no-webgl">
        <div>
          <b>当前环境不支持 WebGL</b>
          <span>请换用桌面 Chrome / Edge 打开（需启用硬件加速）</span>
        </div>
      </div>
    )
  }

  return (
    <div className="canvas-host">
      <Canvas
        camera={{ position: [6.3, 1.6, 2.7], fov: 72, near: 0.05, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.9 } />
        <directionalLight position={[10, 16, 8]} intensity={1.0 } />
        <directionalLight position={[-8, 10, -10]} intensity={0.35 } />

        {house && <ApartmentModel house={house} />}
        <FirstPersonRig />
      </Canvas>
    </div>
  )
}
