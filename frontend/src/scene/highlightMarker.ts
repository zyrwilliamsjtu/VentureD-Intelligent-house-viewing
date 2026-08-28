import * as THREE from 'three'

/** Agent highlight 3D 标记：点云系落点上的光柱+球（MeshBasic，不依赖灯光） */
export function makeHighlightMarker(upAxis: 1 | 2): THREE.Group {
  const g = new THREE.Group()
  g.name = 'agent-highlight'
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc4613c,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.6, 10), mat)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), mat)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 24), mat)
  if (upAxis === 2) {
    // Z-up：柱沿 Z，环贴 XY 地面
    beam.rotation.x = Math.PI / 2
    beam.position.z = 0.8
    ball.position.z = 1.65
  } else {
    beam.position.y = 0.8
    ball.position.y = 1.65
    ring.rotation.x = Math.PI / 2
  }
  g.add(ring, beam, ball)
  return g
}
