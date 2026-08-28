# 前端渲染架构（RENDER_ARCH）

> **性质**：渲染层单一事实源。接口字段仍以根目录 `SPEC.md` 为准；本文只记**实际跑通**的视口、坐标、世界与 ply。  
> **日期**：2026-08-28 · 分支 `feat/frontend-spark`  
> **不可违反**：命令式 3D（不挂 R3F Canvas）；不改 agent/后端/SPEC；ply 不入库。

---

## 1. 渲染方案：Aholo LodSplat → THREE + Spark

### 1.1 为什么换

`@manycore/aholo-viewer` 的 `LodSplat` 在 5 套 InteriorGS 真实点云上**黑屏**：调度结果 `proxies=0`、`nodesVisible` 从 4 掉到 0。4 轮修复（坐标系、体素、出生点、LOD meta）后仍不出画。PI 决策放弃 LodSplat 路径。

隔离探针（仓外 `ventureD_tmp/render_probe/`，**不入库**）证明：Spark 2.1.0 + three 0.180.0 能解码 InteriorGS PlayCanvas compressed ply（0330：772,046 splats，约 1–2s）。

### 1.2 换后架构

```
AholoViewport（仍用此文件名，避免大范围改 import）
  └── THREE.WebGLRenderer + PerspectiveCamera
        ├── SparkRenderer（后处理/splat 合成）
        └── SplatMesh({ url })     ← ply 来自 splatUrlForWorld(worldId)
  相机循环（rAF，命令式）：WASD / Pointer Lock / teleportCmd / 房间归因
```

**不**把 splat 挂进 `@react-three/fiber` `<Canvas>`。r3f/drei 仍在 package.json，但主视口不依赖它们。

---

## 2. 技术栈（钉死版本，勿用 `^`）

| 包 | 版本 | 说明 |
|---|---|---|
| `three` | **0.180.0** | Spark 2.1 要求 three ≥ 0.180 |
| `@types/three` | **0.180.0** | 与 three 对齐 |
| `@sparkjsdev/spark` | **2.1.0** | `SparkRenderer` + `SplatMesh` |
| React / Vite | 18 / 5 | 不变 |
| `@manycore/aholo-viewer` | **已卸载** | 勿再装回 |

---

## 3. 视口模块职责

| 模块 | 职责 |
|---|---|
| `src/scene/AholoViewport.tsx` | 命令式视口：建 renderer / Spark / SplatMesh；WASD + Pointer Lock；订阅 `teleportCmd` 瞬移；200ms 发布 `player`（点云系 + `room_id`）；V 键校准出生点；体素可选 |
| `src/scene/worlds.ts` | 5 套 `world_id` ↔ `scene_dir` ↔ listing；`splatUrlForWorld` |
| `src/scene/coords.ts` | `CLOUD_RULES`、scene↔点云、tp 表、房间 polygon、`resolveTeleportCloud` |
| `src/scene/voxel.ts` | splat-transform 体素查询（0330 规则级 `voxel:false`） |
| `src/scene/agentActions.ts` | chat 动作：teleport / InfoCard / highlight 光柱 / TTS |
| `src/scene/narration.ts` | `room_id` 切换 → `event=enter_room` |
| `src/scene/tourPlayer.ts` | `POST /api/agent/tour` 动线播放 |
| `src/scene/highlightMarker.ts` | highlight 光柱 Mesh |
| `src/components/InfoCard.tsx` | show_card HUD 卡 |
| `src/components/WalkHud.tsx` | HUD：房源 / 房间 / Agent 对话 / PTT；**不改** 3D 循环 |
| `src/store/useAppStore.ts` | `player` / `teleportCmd` / `highlightCmd` / `infoCard` / `tourActive` |

换世界：`<AholoViewport key={worldId} />` 整树卸载，避免两套 ply 叠画。

---

## 4. 世界与数据源

### 4.1 五套真实房源

| world_id | scene_dir | listing 价（兜底） |
|---|---|---|
| `w_0330_840483` | `0330_840483` | 430万 |
| `w_0469_840829` | `0469_840829` | 490万 |
| `w_0259_840804` | `0259_840804` | 460万 |
| `w_0309_840544` | `0309_840544` | 320万 |
| `w_0836_841149` | `0836_841149` | 340万 |

### 4.2 `CLOUD_RULES`（`coords.ts`）

公式：`scene(x,y,z) → 点云 [x+tx, ty−z, y]`。**禁止把 0330 的 0.573/1.087 套到其它世界。** 数值来自各 `mock/{scene}/origin.json`（与 `docs/FE_房源列表联调指南.md` §3.5 一致）。0330 **未改**。

| world_id | tx | ty |
|---|---|---|
| `w_0330_840483` | 0.573 | 1.087 |
| `w_0469_840829` | 2.839056 | −3.219509 |
| `w_0259_840804` | −2.768704 | −5.238312 |
| `w_0309_840544` | −3.938458 | −0.707424 |
| `w_0836_841149` | 0.314266 | −0.446865 |

未登记世界：恒等映射，`roomAtCloud` 返回 `null`。

房间 polygon：0330 仍走 `public/mock/real_0330/scene_graph.json`；其它 4 套无 public 副本 → `GET /api/scene/{world_id}`。

### 4.3 ply 三级回落（`splatUrlForWorld`）

1. `VITE_SPLAT_URL_{world_id}`（Vite 只内联静态出现的 `VITE_*`，必须逐套写出）
2. `VITE_SPLAT_BASE` + `/{scene_dir}/3dgs_compressed.ply`
3. 开发默认：`/ply/{scene_dir}.ply`（`vite.config.ts` 中间件只读映射数据盘，**禁止复制 ply 入库**）

`.env.example` 只列变量名。**# 待确认**：对象存储 bucket / 权限 / 实际上传（PI 未提供则生产 URL 为空，本地回落仍可用）。

---

## 5. 坐标体系（SPEC 附录 A）

- **scene JSON**：Y-up，原点 house_center，polygon 在 XZ。Agent 只读这一套。
- **玩家 / teleport / ply**：点云系，InteriorGS **原生 Z-up**，米。穿网关坐标**不翻轴**。
- 视口：`camera.up` 随规则 `up:'z'` 设为 `(0,0,1)`；侧移符号 Z-up 为 −1。
- Agent 只出 `tp_id`；前端用当前 `world_id` 的 `GET /api/camera_poses/{world_id}` 查表。

---

## 6. 已知问题 / 待确认

| 项 | 状态 |
|---|---|
| `0309` / `0836` 无 `tp_living` | **# 待确认**（camera_poses 事实；厨房/主卧完整，未编造）。出生点回落到该世界第一档 tp |
| 生产 ply 对象存储 | **# 待确认** 位置与权限；代码骨架已就绪 |
| React StrictMode 双挂载 | dev 下 ply 可能下载两次（~2×47MB）。生产构建无此问题 |
| Splash 文案 | 已改为「Spark 3DGS」；旧 README 写 Aholo 至本次文档更新 |
| 文件名 `AholoViewport` | 历史包袱，未改名以免大 diff |
| `highlight` 3D 标记 | `tp_id` → camera_poses 点云落点上的陶土橙光柱（8s）；无 tp 则 toast |
| `show_card` | HUD `InfoCard`（可关 / 6s） |
| `GET /api/agent/narration` | 前端走 chat `event=enter_room`，未打独立 GET（步 4） |
| 常驻房源/房间卡 | `PlaceFacts`：listings 户型面积卖点 + `player.room_id` 对应 zone 讲解 |

---

## 7. 相关文档

- 对接 roadmap：`../../docs/FE_后端对接方案.md`
- 联调坐标表：`../../docs/FE_房源列表联调指南.md` §3.5
- 选型过程（调研稿，可与本文对照）：`../../docs/前端渲染方案选型.md`（若未入库则仓内副本）
- Agent 契约：`./agent-api.md` + 根目录 `SPEC.md` §3
