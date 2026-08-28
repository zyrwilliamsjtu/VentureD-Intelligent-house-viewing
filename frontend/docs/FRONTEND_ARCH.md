# 前端架构（FRONTEND_ARCH）

> **性质**：前端板块**唯一总览**。接口字段仍以根目录 `SPEC.md` 为准；本文记视口、坐标、HUD、8 接口用法。  
> **日期**：2026-08-29 · `feat/agent-ux`（三层流转 + 选房详情弹窗；**尚未合 main**）  
> **不可违反**：命令式 3D（不挂 R3F Canvas）；不改 agent/后端/SPEC 字段语义；ply 不入库。  
> **执行日志**：[`../WORKLOG.md`](../WORKLOG.md)（决策史 D1–D7，接手先读）。  
> 旧稿 [`RENDER_ARCH.md`](./RENDER_ARCH.md) 已并入本文，仅作渲染层对照。

---

## 1. 一句话

React 18 + Vite 5 + TS strict；主视口是**命令式** `THREE.WebGLRenderer` + Spark `SplatMesh`（文件名仍为 `AholoViewport.tsx`）。HUD 只读 store，不进 rAF 循环。只打 PI 网关，不直连 agent 实现。

### 1.5 页面架构（三层流转）

```
Splash（落地） → HouseList（选房） → WalkHud（第一人称漫游）
                     ↑                      │
                     └──── 返回列表 ────────┘
```

| 层 | 组件 | 职责 |
|---|---|---|
| **Splash** | `components/Splash.tsx` | icon +「小驻看房」+ slogan「先驻进去，再住下来」+ inNest / *Step In. Stay Longer.*；主按钮进入列表。不加载 ply、不锁指针。 |
| **HouseList** | `components/HouseList.tsx` | 圆角卡片（楼盘名 + 编号）；筛选；点卡打开详情弹窗，**不直接进 3D**。 |
| **WalkHud** | `components/WalkHud.tsx` | 既有漫游 HUD（对话 / PTT / 带看 / 信息卡 / PlaceFacts / V 回起点）**不改逻辑**；仅加「返回列表」。 |

选房后才挂载 `AholoViewport`（避免开场就拉 ply）。换房：回列表再选，并 `resetAgentSession()`（SPEC 方案 A）。

`GET /api/listings` 可带 `layout` / `price_min` / `price_max` / `q`（`VITE_API_MODE=real`）；失败或 mock 用 `worlds.ts` 硬编码再**本地过滤**。空结果展示「没有符合条件的房源，换个条件试试」。

`store.view`: `splash` | `list` | `walk`；`entered` 仍表示已进入漫游（视口 / narration / V 键）。

### 1.6 选房详情弹窗

点卡片 → `ListingDetail` Modal（遮罩 / Esc /「关闭」可退回列表）。**「进入3D空间」** 才 `enterWalk` + 重置 `session_id`。

| 块 | 数据 | 说明 |
|---|---|---|
| 2D 户型图 | `GET /api/scene/{world_id}` 的 `rooms[].polygon`（scene XZ） | `Floorplan2D` SVG：房间填色/描边/名称/比例尺。真实 polygon，不画假图。0330 可回落 `public/mock/real_0330`。失败显示「户型图暂不可用」，**不阻塞**进 3D。 |
| 介绍 | listings：`title`（楼盘名）/`code`（编号）/`layout`/`area`/`price`/`tags`/`highlight` | 不编造 |
| 房间清单 | scene_graph `rooms[]`：名称 + 面积 + 主要实例中文名 | 类别→中文与 agent 别名表一致；窗帘等噪点类省略 |

楼盘名在 `mock/listings.json` 的 `title`；编号在只增字段 `code`（0330 / 0469 / …）。

---

## 2. 渲染方案：LodSplat → THREE + Spark

### 2.1 为什么换

`@manycore/aholo-viewer` 的 `LodSplat` 在 5 套 InteriorGS 真实点云上**黑屏**（`proxies=0`）。隔离探针证明 Spark 2.1.0 + three 0.180.0 能解码 InteriorGS PlayCanvas compressed ply（0330：772,046 splats，约 1–2s）。PI 放弃 LodSplat。选型过程见仓内 `docs/前端渲染方案选型.md`（若未入库则以本文为准）。

### 2.2 换后架构

```
AholoViewport（文件名历史包袱，避免大范围改 import）
  └── THREE.WebGLRenderer + PerspectiveCamera
        ├── SparkRenderer（splat 合成）
        └── SplatMesh({ url })     ← splatUrlForWorld(worldId)
  相机循环（rAF，命令式）：WASD / Pointer Lock / teleportCmd / highlightCmd / 房间归因
```

**不**把 splat 挂进 `@react-three/fiber` `<Canvas>`。r3f/drei 仍可能在 package.json，主视口不依赖它们。换世界：`<AholoViewport key={worldId} />` 整树卸载，避免两套 ply 叠画。

### 2.3 钉死版本（勿用 `^`）

| 包 | 版本 | 说明 |
|---|---|---|
| `three` | **0.180.0** | Spark 2.1 要求 three ≥ 0.180 |
| `@types/three` | **0.180.0** | 与 three 对齐 |
| `@sparkjsdev/spark` | **2.1.0** | `SparkRenderer` + `SplatMesh` |
| React / Vite | 18 / 5 | 不变 |
| `@manycore/aholo-viewer` | **已卸载** | 勿再装回 |

---

## 3. 模块职责

| 模块 | 职责 |
|---|---|
| `src/scene/AholoViewport.tsx` | 命令式视口；`teleportCmd` **约 0.85s 平滑飞入**（WASD 可打断）；出生点优先 `tp_living` |
| `src/scene/sceneGraphFetch.ts` | 详情弹窗拉 scene_graph（网关 + 0330 本地兜底） |
| `src/scene/coords.ts` | `CLOUD_RULES`、scene↔点云、tp 表、房间 polygon、`resolveTeleportCloud` |
| `src/scene/voxel.ts` | splat-transform 体素（5 套真实世界默认 `voxel:false`） |
| `src/scene/agentActions.ts` | chat 动作：teleport / InfoCard / highlight 光柱 / 播 `tts_url` |
| `src/scene/highlightMarker.ts` | highlight 陶土橙光柱 Mesh |
| `src/scene/narration.ts` | 进房：优先 GET `/api/agent/narration`，失败回落 chat `enter_room`；带看中跳过 |
| `src/scene/tourPlayer.ts` | `POST /api/agent/tour` 动线播放 |
| `src/services/narration.ts` | narration GET 客户端（8s 超时；404 → `null`） |
| `src/services/agent.ts` / `asr.ts` / `tour.ts` | chat / ASR / tour |
| `src/components/Splash.tsx` | 落地页 |
| `src/components/HouseList.tsx` | 房源卡片 + 筛选 + 打开详情 |
| `src/components/ListingDetail.tsx` | 选房详情弹窗 |
| `src/components/Floorplan2D.tsx` | 真实 polygon 2D 户型图 |
| `src/components/WalkHud.tsx` | 对话 + PTT；**不改** 3D 循环；返回列表 |
| `src/components/PlaceFacts.tsx` | 常驻房源/房间卡（listings + 当前 `player.room_id`） |
| `src/components/InfoCard.tsx` | `show_card` HUD（可关 / 6s） |
| `src/components/TourBar.tsx` | 「开始带看」+ **B 键**（Pointer Lock 时鼠标点不到按钮） |
| `src/store/useAppStore.ts` | `view` / `player` / `teleportCmd` / `highlightCmd` / `infoCard` / `tourActive` / toast |

`.hud-tl` 的 z-index 在 overlay 之上（main `e10f7d7`），避免全屏遮罩挡住「开始带看」。

---

## 4. 世界、坐标与 ply

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

未登记世界：恒等映射，`roomAtCloud` 返回 `null`（不触发进房讲解）。

房间 polygon：0330 可走 `public/mock/real_0330/scene_graph.json`；其它 4 套无 public 副本 → `GET /api/scene/{world_id}`。

### 4.3 坐标体系（SPEC 附录 A）

- **scene JSON**：Y-up，原点 house_center，polygon 在 XZ。Agent 只读这一套。
- **玩家 / teleport / ply / highlight**：点云系，InteriorGS **原生 Z-up**，米。穿网关坐标**不翻轴**。
- 视口：`camera.up` 随规则 `up:'z'` 设为 `(0,0,1)`。
- Agent **只出 `tp_id`**；前端用当前 `world_id` 的 `GET /api/camera_poses/{world_id}` 查表。不要用 `instances[].position`（那是 scene Y-up）当点云落点。

### 4.4 ply 三级回落（`splatUrlForWorld`）

1. `VITE_SPLAT_URL_{world_id}`（Vite 只内联静态出现的 `VITE_*`，必须逐套写出）
2. `VITE_SPLAT_BASE` + `/{scene_dir}/3dgs_compressed.ply`
3. 开发默认：`/ply/{scene_dir}.ply`（`vite.config.ts` 中间件只读映射数据盘，**禁止复制 ply 入库**）

`.env.example` 只列变量名。**# 待确认**：对象存储 bucket / 权限 / 实际上传（未提供则生产 URL 为空，本地 `/ply` 仍可用）。

---

## 5. HUD（main 已落地）

| 组件 | 行为 |
|---|---|
| **PlaceFacts** | 进入 3D 后常驻：挂牌户型/面积/价/卖点 + 当前 `player.room_id` 对应 zone 的 `story_card`。可收起。与 Agent `show_card` 不是同一块 UI。 |
| **InfoCard** | 仅响应 `actions.show_card`（`title` + `lines[]`；兼容平铺与 `data` 嵌套）。可关，约 6s 消失。 |
| **TourBar** | 「开始带看」→ `startTour`；进行中显示房间名。失败 toast「带看暂不可用」。 |
| **B 键** | `keydown` `KeyB` 切换带看（忽略输入框）。Pointer Lock 时点不到左上按钮，用键盘兜底。 |
| **WalkHud** | 对话气泡 + 打字 + PTT；进房 toast 由 `narration.ts` 调 `showToast`。 |

带看期间 `tourActive`：跳过进房 narration，避免与 tour 步骤双讲。

---

## 6. 八接口用法（前端调用点）

字段以 `SPEC.md` 为准。`VITE_API_MODE=real` 打网关；`mock` 可无后端漫游（chat 为本地关键词）。

| 接口 | 调用 | 前端行为 |
|---|------|----------|
| `GET /api/listings` | HouseList 选房 / 筛选 | 可选 `layout` `price_min` `price_max` `q`；失败 → `worlds.ts` 硬编码再本地过滤 |
| `GET /api/scene/{world_id}` | 进 3D / 房间 polygon | 图纸 + PlaceFacts zone；未知 world 404 |
| `GET /api/camera_poses/{world_id}` | 进 3D / 每次 resolve tp | teleport / highlight 共用此表 |
| `POST /api/agent/chat` | 提问、PTT 转写后、narration 回落 | 30s；带 `session_id` / `world_id` / `listing_id` / `player_*` / `room_id`；执行 `actions` |
| `POST /api/agent/asr` | PTT 松手 | multipart `audio`；空文本不发 chat |
| `POST /api/agent/tts` | 独立合成（少用） | chat 已带 `tts_url` 则直接播；独立 TTS 常 `{}` |
| `GET /api/agent/narration` | `room_id` 变化（防抖 700ms） | 优先路径；404/失败/空文案 → chat `event=enter_room`；每房间每会话一次（前端 Set） |
| `POST /api/agent/tour` | TourBar / B 键 | `{steps[]}` 依次 teleport + toast + 可选 TTS；可中途停止 |

会话：前端生成 `session_id`，换房重置（SPEC 方案 A）。错误顶层 `{code,message}`。

Golden Path：问「主卧在哪」→ `teleport` + `tp_id=tp_bedroom_master`（不要示例里的 `tp_master` / `position`）。

---

## 7. 已知问题 / 待确认

| 项 | 状态 |
|---|---|
| `0309` / `0836` `tp_living` | 复用已对拍 `tp_kitchen`（无独立客厅，见各 `SOURCE.md`），非编造 |
| 生产 ply 对象存储 | **# 待确认**；代码骨架已就绪 |
| React StrictMode 双挂载 | dev 下 ply 可能下载两次。生产构建无此问题 |
| 文件名 `AholoViewport` | 历史包袱，未改名以免大 diff |
| `0469` 无冰箱 | 问冰箱不会出实例卡（0330 有 `tp_refrigerator_582`） |
| 独立 TTS | 后端 stub 常 omit `audio_url`；讲解依赖 chat/narration 的 `tts_url` |

无 `# 待合入`：narration GET、B 键、PlaceFacts、show_card、highlight、tour 均已在 main。

---

## 8. 相关文档

| 文档 | 角色 |
|------|------|
| 根目录 [`SPEC.md`](../../SPEC.md) | 接口唯一事实源 |
| [`../../docs/PROJECT_OVERVIEW.md`](../../docs/PROJECT_OVERVIEW.md) | 项目一页总览 |
| [`../../docs/FE_后端对接方案.md`](../../docs/FE_后端对接方案.md) | 对接 roadmap（步 4 已合 main） |
| [`../../docs/FE_房源列表联调指南.md`](../../docs/FE_房源列表联调指南.md) | 5 套偏移表 |
| [`backend/README.md`](../../backend/README.md) | 后端唯一总览 |
| [`./RENDER_ARCH.md`](./RENDER_ARCH.md) | 渲染层旧稿，已并入本文 |
| [`./agent-api.md`](./agent-api.md) | Agent 动作实现笔记（字段仍以 SPEC 为准） |
| [`./backend-handbook.md`](./backend-handbook.md) | 联调手册（部分段落落后于 main，以本文 + SPEC 为准） |
