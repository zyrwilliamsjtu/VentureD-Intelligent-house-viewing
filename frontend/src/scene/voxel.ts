/**
 * 体素碰撞运行时（按 aholojs.dev 物理碰撞手册实现）
 *
 * 数据由 splat-transform 的 Voxel 任务生成：
 *   voxel-meta.json —— 网格边界 / 体素尺寸 / treeDepth / nodeCount / leafDataCount
 *   voxel.bin       —— nodes[] 在前、leafData[] 在后（均为 uint32 数组）
 *
 * 节点编码（Laine–Karras 紧凑八叉树，与 playcanvas/splat-transform 约定一致）：
 *   内部节点：高 8 位 childMask（8 个子八分体是否存在），低 24 位 = 第一个子节点下标；
 *             其余子节点下标由 popcount 推算
 *   全实心叶：0xFF000000（SOLID_LEAF_MARKER）
 *   混合叶  ：childMask == 0，低 24 位指向 leafData 的 64bit 掩码（2×uint32），
 *             块内体素位索引 = vx + vy*4 + vz*16（各分量 ∈ [0,3]）
 */

export interface VoxelMeta {
  version: string
  gridBounds: { min: [number, number, number]; max: [number, number, number] }
  sceneBounds: { min: [number, number, number]; max: [number, number, number] }
  voxelResolution: number
  leafSize: number
  treeDepth: number
  numInteriorNodes: number
  numMixedLeaves: number
  nodeCount: number
  leafDataCount: number
  files: string[]
}

const SOLID_LEAF = 0xff000000

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  x = (x + (x >>> 4)) & 0x0f0f0f0f
  return (x * 0x01010101) >>> 24
}

/** 一次命中的世界坐标与距离 */
export interface RayHit {
  x: number
  y: number
  z: number
  dist: number
}

export class VoxelCollision {
  readonly meta: VoxelMeta
  private nodes: Uint32Array
  private leafData: Uint32Array
  private min: [number, number, number]
  private res: number
  private nx: number
  private ny: number
  private nz: number
  /** 八分体位序（x,y,z 各占 bit0/1/2；错误时自动换序重建） */
  private axisBits: [number, number, number]

  constructor(meta: VoxelMeta, bin: ArrayBuffer) {
    this.meta = meta
    const u32 = new Uint32Array(bin)
    this.nodes = u32.subarray(0, meta.nodeCount)
    this.leafData = u32.subarray(meta.nodeCount, meta.nodeCount + meta.leafDataCount)
    this.min = meta.gridBounds.min
    this.res = meta.voxelResolution
    const size = [
      (meta.gridBounds.max[0] - this.min[0]) / this.res,
      (meta.gridBounds.max[1] - this.min[1]) / this.res,
      (meta.gridBounds.max[2] - this.min[2]) / this.res,
    ]
    this.nx = Math.ceil(size[0])
    this.ny = Math.ceil(size[1])
    this.nz = Math.ceil(size[2])
    this.axisBits = [0, 1, 2]
  }

  /** 自适应：体素位序错误会导致结构噪声化。探针校验，不对则换序重建 */
  validateOrRebuild(): boolean {
    if (this.probeValid()) return true
    this.axisBits = [2, 1, 0] // x/z 互换重试
    if (this.probeValid()) return true
    this.axisBits = [0, 1, 2] // 还原，放弃
    return false
  }

  /** 校验法：网格中部向下/向上打 40 列射线，某方向大部分列能命中且命中 y 值集中 → 结构正确 */
  private probeValid(): boolean {
    const { min, res, nx, nz, ny } = this
    const cy = min[1] + (res * ny) / 2
    let downHits = 0
    let upHits = 0
    let downY = 0
    for (let i = 0; i < 40; i++) {
      const x = min[0] + res * nx * (0.15 + 0.7 * ((i * 7) % 40) / 40)
      const z = min[2] + res * nz * (0.15 + 0.7 * ((i * 13) % 40) / 40)
      const hd = this.raycast(x, cy, z, 0, -1, 0, 1e4)
      if (hd) {
        downHits++
        downY += hd.y
      }
      const hu = this.raycast(x, cy, z, 0, 1, 0, 1e4)
      if (hu) upHits++
    }
    if (downHits < 24 && upHits < 24) return false // 命中率过低 → 位序错
    if (downHits >= upHits) {
      // 命中点 y 值应大致同一层（地板）；方差过大视为噪声
      const mean = downY / downHits
      let varsum = 0
      for (let i = 0; i < 40; i++) {
        const x = min[0] + res * nx * (0.15 + 0.7 * ((i * 7) % 40) / 40)
        const z = min[2] + res * nz * (0.15 + 0.7 * ((i * 13) % 40) / 40)
        const hd = this.raycast(x, cy, z, 0, -1, 0, 1e4)
        if (hd) varsum += (hd.y - mean) ** 2
      }
      return Math.sqrt(varsum / downHits) < 3.5
    }
    return true
  }

  /** 世界坐标 → 体素索引（越界返回 null） */
  private toVoxel(x: number, y: number, z: number): [number, number, number] | null {
    const { min, res } = this
    const vx = Math.floor((x - min[0]) / res)
    const vy = Math.floor((y - min[1]) / res)
    const vz = Math.floor((z - min[2]) / res)
    if (vx < 0 || vy < 0 || vz < 0 || vx >= this.nx || vy >= this.ny || vz >= this.nz) return null
    return [vx, vy, vz]
  }

  /** 单点占用查询（八叉树下潜 treeDepth 层） */
  isOccupied(x: number, y: number, z: number): boolean {
    const v = this.toVoxel(x, y, z)
    if (!v) return false
    return this.isOccupiedV(v[0], v[1], v[2])
  }

  private isOccupiedV(vx: number, vy: number, vz: number): boolean {
    const nodes = this.nodes
    const leafData = this.leafData
    const bx = vx >>> 2
    const by = vy >>> 2
    const bz = vz >>> 2
    const [ax, ay, az] = this.axisBits
    let node = nodes[0]
    for (let level = this.meta.treeDepth - 1; level >= 0; level--) {
      if (node === SOLID_LEAF) return true
      const childMask = node >>> 24
      if (childMask === 0) {
        // 混合叶：64bit 掩码
        const idx = node & 0xffffff
        const bit = (vx & 3) + ((vy & 3) << 2) + ((vz & 3) << 4)
        const word = leafData[idx + (bit >= 32 ? 1 : 0)]
        return ((word >>> (bit & 31)) & 1) === 1
      }
      const ox = (bx >> level) & 1
      const oy = (by >> level) & 1
      const oz = (bz >> level) & 1
      const bits = [ox, oy, oz]
      const oct = bits[ax] | (bits[ay] << 1) | (bits[az] << 2)
      if (((childMask >>> oct) & 1) === 0) return false
      const childBase = node & 0xffffff
      const offset = popcount(childMask & ((1 << oct) - 1))
      node = nodes[childBase + offset]
    }
    return false
  }

  /**
   * 射线检测（3D DDA，Amanatides–Woo）。方向无需归一化（按 maxDist 截断）。
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    const { min, res, nx, ny, nz } = this
    const maxX = min[0] + res * nx
    const maxY = min[1] + res * ny
    const maxZ = min[2] + res * nz
    // 与网格 AABB 求交（slab 法），求 [tEnter, tExit]
    const inv = (d: number) => (Math.abs(d) < 1e-9 ? 1e9 : 1 / d)
    const ix = inv(dx)
    const iy = inv(dy)
    const iz = inv(dz)
    let t0 = 0
    let t1 = maxDist
    const slab = (o: number, lo: number, hi: number, i: number): boolean => {
      let a = (lo - o) * i
      let b = (hi - o) * i
      if (a > b) [a, b] = [b, a]
      t0 = Math.max(t0, a)
      t1 = Math.min(t1, b)
      return t0 <= t1
    }
    if (!slab(ox, min[0], maxX, ix)) return null
    if (!slab(oy, min[1], maxY, iy)) return null
    if (!slab(oz, min[2], maxZ, iz)) return null

    // 起点体素
    const px = Math.min(Math.max(ox + dx * Math.max(t0, 0) * 1.0001, min[0]), maxX - 1e-6)
    const py = Math.min(Math.max(oy + dy * Math.max(t0, 0) * 1.0001, min[1]), maxY - 1e-6)
    const pz = Math.min(Math.max(oz + dz * Math.max(t0, 0) * 1.0001, min[2]), maxZ - 1e-6)
    let vx = Math.floor((px - min[0]) / res)
    let vy = Math.floor((py - min[1]) / res)
    let vz = Math.floor((pz - min[2]) / res)
    const stepX = dx > 0 ? 1 : -1
    const stepY = dy > 0 ? 1 : -1
    const stepZ = dz > 0 ? 1 : -1
    const nextBoundary = (o: number, v: number, axis: number, s: number) =>
      min[axis] + res * (v + (s > 0 ? 1 : 0))
    let tMaxX = ((nextBoundary(px, vx, 0, stepX) - px) * ix) as number
    let tMaxY = (nextBoundary(py, vy, 1, stepY) - py) * iy
    let tMaxZ = (nextBoundary(pz, vz, 2, stepZ) - pz) * iz
    const tDeltaX = Math.abs(res * ix)
    const tDeltaY = Math.abs(res * iy)
    const tDeltaZ = Math.abs(res * iz)
    let t = Math.max(t0, 0)

    // 起点格先测
    if (this.isOccupiedV(vx, vy, vz)) {
      return { x: px, y: py, z: pz, dist: t }
    }
    for (let guard = 0; guard < 4096; guard++) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        vx += stepX
        t = tMaxX
        tMaxX += tDeltaX
      } else if (tMaxY < tMaxZ) {
        vy += stepY
        t = tMaxY
        tMaxY += tDeltaY
      } else {
        vz += stepZ
        t = tMaxZ
        tMaxZ += tDeltaZ
      }
      if (t > t1) return null
      if (vx < 0 || vy < 0 || vz < 0 || vx >= nx || vy >= ny || vz >= nz) return null
      if (this.isOccupiedV(vx, vy, vz)) {
        return {
          x: ox + dx * t,
          y: oy + dy * t,
          z: oz + dz * t,
          dist: t,
        }
      }
    }
    return null
  }

  /**
   * 球体穿透修正：返回推出向量（无穿透返回 null）
   * 遍历球心邻域内实心体素，对每个体素 AABB 计算最近点，距离 < r 则沿最短方向推出
   */
  resolveSphere(cx: number, cy: number, cz: number, r: number): [number, number, number] | null {
    const { res } = this
    const lo = this.toVoxel(cx - r - res, cy - r - res, cz - r - res)
    const hi = this.toVoxel(cx + r + res, cy + r + res, cz + r + res)
    if (!lo || !hi) return null
    let px = 0
    let py = 0
    let pz = 0
    let hit = false
    for (let vx = lo[0]; vx <= hi[0]; vx++) {
      for (let vy = lo[1]; vy <= hi[1]; vy++) {
        for (let vz = lo[2]; vz <= hi[2]; vz++) {
          if (!this.isOccupiedV(vx, vy, vz)) continue
          // 体素 AABB
          const x0 = this.min[0] + vx * res
          const y0 = this.min[1] + vy * res
          const z0 = this.min[2] + vz * res
          const nearX = Math.max(x0, Math.min(cx, x0 + res))
          const nearY = Math.max(y0, Math.min(cy, y0 + res))
          const nearZ = Math.max(z0, Math.min(cz, z0 + res))
          const ddx = cx - nearX
          const ddy = cy - nearY
          const ddz = cz - nearZ
          const d2 = ddx * ddx + ddy * ddy + ddz * ddz
          if (d2 >= r * r || d2 < 1e-12) continue
          const d = Math.sqrt(d2)
          const push = (r - d) / d
          px += ddx * push
          py += ddy * push
          pz += ddz * push
          hit = true
        }
      }
    }
    return hit ? [px, py, pz] : null
  }

  /** 判定竖直方向：返回 +1（Y 向上为天）或 -1（-Y 为天，OpenCV 系） */
  detectUpSign(): 1 | -1 {
    const { min, res, nx, nz, ny } = this
    const cx = min[0] + (res * nx) / 2
    const cz = min[2] + (res * nz) / 2
    const midY = min[1] + (res * ny) / 2
    // 从中部向上/向下打射线，命中数多的一侧是"地面在下面" → up 指向另一侧
    let upCount = 0
    let downCount = 0
    for (let i = 0; i < 12; i++) {
      const x = cx + (i - 6) * 0.8
      const z = cz + ((i * 5) % 12 - 6) * 0.5
      const hu = this.raycast(x, midY, z, 0, 1, 0, 50)
      const hd = this.raycast(x, midY, z, 0, -1, 0, 50)
      if (hu) upCount++
      if (hd) downCount++
    }
    // 天花板在"上"：从室内中部向上应先命中天花板（近），向下命中地板（近），两侧都会命中
    // 用命中距离区分：地板通常是更远的实心层 → 比较两侧平均命中距离，距离大的一侧是地板方向
    let upDist = 0
    let downDist = 0
    let un = 0
    let dn = 0
    for (let i = 0; i < 12; i++) {
      const x = cx + (i - 6) * 0.8
      const z = cz + ((i * 5) % 12 - 6) * 0.5
      const hu = this.raycast(x, midY, z, 0, 1, 0, 50)
      const hd = this.raycast(x, midY, z, 0, -1, 0, 50)
      if (hu) {
        upDist += hu.dist
        un++
      }
      if (hd) {
        downDist += hd.dist
        dn++
      }
    }
    void upCount
    void downCount
    if (un === 0 && dn === 0) return -1
    if (un === 0) return 1 // 只有向下有地面 → Y 向上
    if (dn === 0) return -1
    // 地板是"大块实心"，通常命中距离更远（天花板近、地板远或反之皆可能）
    // 取距离更小的一侧为天花板 → up 指向该侧（站在地板上，头朝天花板）
    return upDist / un < downDist / dn ? 1 : -1
  }

  /** 在网格内撒点找可行走出生点：从高处向下打射线，要求落点上方有 1.9m 净空 */
  findSpawn(): { x: number; y: number; z: number } | null {
    const { min, res, nx, nz } = this
    const topY = min[1] + res * (this.ny - 2)
    const centerX = min[0] + (res * nx) / 2
    const centerZ = min[2] + (res * nz) / 2
    let best: { x: number; y: number; z: number } | null = null
    let bestScore = -Infinity
    for (let i = 0; i < 400; i++) {
      const fx = 0.2 + 0.6 * (((i * 37) % 100) / 100)
      const fz = 0.2 + 0.6 * (((i * 61) % 100) / 100)
      const x = min[0] + res * nx * fx
      const z = min[2] + res * nz * fz
      const hit = this.raycast(x, topY, z, 0, -1, 0, 1e4)
      if (!hit) continue
      // 净空检测：落点上方 1.9m 内无占用
      let clear = true
      for (let h = 0.15; h <= 1.9; h += 0.25) {
        if (this.isOccupied(x, hit.y + h, z)) {
          clear = false
          break
        }
      }
      if (!clear) continue
      // 越靠网格中心越好
      const score = -(Math.abs(x - centerX) + Math.abs(z - centerZ))
      if (score > bestScore) {
        bestScore = score
        best = { x, y: hit.y, z }
      }
    }
    return best
  }
}

/** 加载 voxel-meta.json + voxel.bin（相对 meta URL 解析） */
export async function loadVoxelCollision(metaUrl: string): Promise<VoxelCollision | null> {
  const res = await fetch(metaUrl)
  if (!res.ok) throw new Error(`voxel-meta 加载失败 HTTP ${res.status}`)
  const meta = (await res.json()) as VoxelMeta
  const binUrl = new URL(meta.files[0], new URL(metaUrl, location.href)).href
  const binRes = await fetch(binUrl)
  if (!binRes.ok) throw new Error(`voxel.bin 加载失败 HTTP ${binRes.status}`)
  const buf = await binRes.arrayBuffer()
  const vc = new VoxelCollision(meta, buf)
  if (!vc.validateOrRebuild()) {
    console.warn('[voxel] 八叉树校验失败，碰撞已禁用')
    return null
  }
  return vc
}
