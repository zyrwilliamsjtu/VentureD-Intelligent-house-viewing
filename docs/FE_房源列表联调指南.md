# 给 A 的联调指南：房源列表 → 选房 → 3D 漫游

> **给谁**：前端（A）。读完本文即可开工，不必先翻完 SPEC。契约细节以根目录 **`SPEC.md` v2.3** 为准；冲突时以 SPEC 为准。  
> **后端基线**：`dev-backend` @ `66940dd` 起（5 套真实房源 + `GET /api/listings` + chat `listing_id`）。合入 `main` 后即联调基线。  
> **后端不改前端**。本文只列 A 侧待办与对接口径。  
> **原始 ply / structure 未入库**（数据盘 `E:\科研\ventureD_data\interiorgs\scenes\{scene_id}\`）。3DGS 如何按 world 加载见文末「待确认」。

---

## 1. 后端已就绪清单

网关默认 `http://127.0.0.1:8000`。Vite 开发代理：`/api` → 该地址。CORS 已开 `http://localhost:5173`。错误体一律 `{ "code": "...", "message": "..." }`。

| 接口 | 状态 | 说明 |
|------|------|------|
| `GET /api/listings` | ✅ | 5 条真实挂牌，字段 **snake_case**。文件坏 → **500** `LISTINGS_UNAVAILABLE`（请本地硬编码兜底） |
| `GET /api/scene/{world_id}` | ✅ | 5 套真实 + `w_mock_001`。未知 → **404** `WORLD_NOT_FOUND` |
| `GET /api/camera_poses/{world_id}` | ✅ | 同上 5 套 + mock。`poses` 为 `tp_id → [x,y,z]`（点云系 **Z-up**，米） |
| `POST /api/agent/chat` | ✅ | JSON 或 multipart。**新增可选 `listing_id`** |
| `GET /api/agent/narration` | ✅ | query：`world_id`+`room_id` 必填；`session_id` / **`listing_id` 可选** |
| `POST /api/agent/asr` / `tts` / `tour` | ✅ | 与本次列表选房无强依赖 |

未知 `world_id`（scene / camera_poses / chat）→ 404，**不要当 200 空数据**。

起后端（仓库根）：

```
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

自检：`GET http://127.0.0.1:8000/health` → `{"status":"ok"}`；`GET http://127.0.0.1:8000/api/listings` → `listings.length === 5`。

---

## 2. 五套世界与房源清单

`listing_id` = `listings[].id`，与 `world_id` 一一对应。挂牌价/朝向/楼层是 **挂牌 mock**（数据集无这些字段）；问答时 **listing 优先于 scene_graph**。

| listing_id | world_id | 户型 | 面积㎡ | 房间 | 实例 | 挂牌价 | 朝向 / 楼层 |
|---|---|---|---|---|---|---|---|
| `listing_0330_840483` | `w_0330_840483` | 三室一厅 | 120.1 | 10 | 75 | **430万** | 南向 / 12/28 |
| `listing_0469_840829` | `w_0469_840829` | 四室一厅 | 135.9 | 10 | 75 | **490万** | 南向 / 8/18 |
| `listing_0259_840804` | `w_0259_840804` | 三室一厅 | 135.9 | 10 | 88 | **460万** | 南北 / 6/22 |
| `listing_0309_840544` | `w_0309_840544` | 三室一厅 | 85.9 | 10 | 93 | **320万** | 东南 / 3/11 |
| `listing_0836_841149` | `w_0836_841149` | 三室一厅 | 92.9 | 10 | 86 | **340万** | 南向 / 15/26 |

后端数据：`mock/listings.json`；0330 场景在 `mock/real_0330/`，其余在 `mock/{scene_id}/`。手写开发基线 `w_mock_001` **不在** listings 这 5 条里。

`is_real` 全部为 `true`（实景徽标可用此字段）。

---

## 3. 契约要点（指向 SPEC）

全文 snake_case：`world_id` / `is_real` / `price_num` / `listing_id` / `session_id` / `floorplan`。不要 camelCase。

### 3.1 `GET /api/listings` — SPEC §2.6

响应：`{ "listings": [ { id, title, layout, area, orientation, floor, price, price_num, tags, highlight, world_id, is_real, floorplan } ] }`。

- `id` ↔ chat/narration 的 `listing_id`
- `world_id` ↔ `GET /api/scene/{world_id}` 与 3D 世界
- `floorplan` 当前多为 `""`，可省略展示
- 失败 500：前端降级 `src/data/listings.ts` 硬编码（把上表 5 条抄一份即可）

### 3.2 `POST /api/agent/chat` — SPEC §3.1

必填：`session_id`、`world_id`；`user_text` 与 `audio` 二选一。

**新增可选 `listing_id`**（string）：

- **有**：价格 / 面积 / 朝向 / 楼层 / 挂牌卖点 **以 listing 为准**；与 scene_graph `house` 冲突时 **listing 赢**
- **null / 省略**：只用该 `world_id` 的 scene_graph（0330 的 price 仍是「待对拍」→ 会答「价格数据未提供」）

联调用例：选 0469 后问「这套多少钱」应出现 **490万**，不能出现 0330 的 430万。

### 3.3 `GET /api/agent/narration` — SPEC §3.4

query 增加可选 `listing_id`。讲解正文仍以房间 `story_card` 为准；带上即可与会话挂牌对齐。

### 3.4 会话隔离方案 A — SPEC §0 / §7

**前端换房必须重置 `session_id`（新 uuid）。** 建议在 `selectListing` 里做：

1. 写入当前 `listing`（含 `id` / `world_id`）
2. `session_id = crypto.randomUUID()`（或等价）
3. 用**新** `world_id` 拉 scene / camera_poses / 切 3D

不要把上一套的 history / current_room 带到下一套。

### 3.5 坐标铁律 — SPEC 附录 A

- scene JSON：Y-up，房屋中心原点（agent 只读这个）
- 玩家 / teleport 落点：点云系 **IG 原生 Z-up**，米
- **偏移每场景不同**，禁止把 0330 的 `0.573 / 1.087` 套到其它世界
- **优先**：`teleport(tp_id)` 查 **`GET /api/camera_poses/{world_id}`**，不要前端自己乘 0330 公式
- 若 `coords.ts` 的 `CLOUD_RULES` 仍要登记公式，用下表（与各 `mock/.../origin.json` 一致）：

| world_id | X_pc | Y_pc | Z_pc |
|---|---|---|---|
| `w_0330_840483` | `x + 0.573` | `1.087 − z` | `y` |
| `w_0469_840829` | `x + 2.839056` | `−3.219509 − z` | `y` |
| `w_0259_840804` | `x − 2.768704` | `−5.238312 − z` | `y` |
| `w_0309_840544` | `x − 3.938458` | `−0.707424 − z` | `y` |
| `w_0836_841149` | `x + 0.314266` | `−0.446865 − z` | `y` |

tp 白名单 = 该 world 的 `camera_poses.poses` 的 key；**禁止编造 tp_id**。

---

## 4. 前端待办清单（A 侧）

按依赖顺序，均可在 `frontend/` 完成。文件名以当前 main 上的结构为准（见 `docs/REPO_STRUCTURE.md`）。

1. **`src/types/api.ts`**
   - `AgentChatRequest` 增加 `listing_id?: string`
   - 新增 `Listing`（字段与 SPEC §2.6 一致，snake_case）
2. **`src/data/listings.ts`**
   - 把上文 5 条硬编码一份，作 `GET /api/listings` 失败兜底
3. **`src/services/listings.ts`**
   - real：`GET /api/listings`（走现有 `VITE_API_BASE` / 同源 `/api`）
   - 失败 / 非 200 → 降级本地 `listings.ts`，**不要阻断进房**
4. **`src/store/useAppStore.ts`**
   - 存 `listing: Listing | null`
   - `selectListing(listing)`：设 listing + **重置 `session_id`** + 清上一套房会话态
5. **`src/App.tsx`（及 Splash 列表）**
   - 去掉写死的 `HOUSE_ID = 'w_mock_001'` 作为唯一世界
   - 列表渲染 `listings`；选房 → `selectListing` → 订阅 `listing.world_id` 再加载 scene / 切 3D
6. **`src/components/WalkHud.tsx` / `src/scene/narration.ts` / `src/services/agent.ts`**
   - chat / narration 请求带 `listing_id: useAppStore.getState().listing?.id`
   - 同时带当前 `world_id`、`session_id`
7. **`src/scene/coords.ts`**
   - `CLOUD_RULES` 登记上表 5 套（或只信网关 poses、规则表可空）
8. **camera_poses**
   - real 模式 **`GET /api/camera_poses/{world_id}`**，不要只读 `public/mock/real_0330/camera_poses.json`
9. **3D 资源（与列表强相关）**
   - 视口当前多用 `VITE_WORLD_ID` / 群核世界；选房后必须跟 `listing.world_id` 走
   - 4 套新场景 ply **不在 git**，加载方式 **待确认**（见 §7）

不要改 `backend/`。不要把数据盘 ply 提交进仓库。

---

## 5. 联调步骤

1. **起后端**：`backend` 目录 `uvicorn app.main:app --reload --port 8000`。确认 `/health`、`/api/listings`。
2. **起前端**：`frontend` 目录 `npm run dev`（5173）。`.env.local`：`VITE_API_MODE=real`，`VITE_API_BASE` 空（同源代理）或 `http://127.0.0.1:8000`。
3. **列表页**：应看到 5 张真实房源卡；`is_real === true` 可打实景徽标。断网或把后端关掉，应落到本地硬编码、页面不崩。
4. **选房**：点 0469（或任意一套）→ `selectListing` → 新 `session_id` → 请求 `GET /api/scene/w_0469_840829` 与 `GET /api/camera_poses/w_0469_840829` 均为 200。
5. **3D 漫游**：进入对应世界（0330 若已有点云应能走；其它套若 ply 未接，至少 HUD/对话按该 world 工作）。
6. **带 listing_id 提问**：HUD 问「这套多少钱」。
   - 0469 + `listing_0469_840829` → 答 **490万**
   - 0330 + `listing_0330_840483` → **430万**
   - 故意不带 `listing_id` 问 0330 → 应为「价格数据未提供」（对照：挂牌优先是否接上）
7. **换房**：再选 0259，确认 `session_id` 已变；问「这套多少钱」→ **460万**，不能仍是 490万。

---

## 6. 验收清单

- [ ] 列表展示 **5 套**真实房源（卡片信息与上表一致；实景徽标可用 `is_real`）
- [ ] 选任意一套 → scene / camera_poses 打到对应 `world_id`（网络面板可见）
- [ ] 能进入该套 3D（0330 必过；其它套取决于 ply 加载，见待确认）
- [ ] 问「这套多少钱」→ **当前挂牌价**（0469 → 490万，不是 0330 占位）
- [ ] 换房后再问 → **新房源口径**（session 已重置）
- [ ] 未知 `world_id` → 后端 404；前端 toast/降级，**不白屏**
- [ ] `GET /api/listings` 失败 → 本地硬编码列表，**不崩**
- [ ] chat 请求 JSON 含 `listing_id`（有选房时）；字段 snake_case

---

## 7. 待确认（不阻塞列表/对话联调）

1. **4 套新场景的 3DGS 从哪加载**：数据盘 `3dgs_compressed.ply` / 群核 world id / 是否拷到 `frontend/public`。仓库 **不入库 ply**。
2. 碰撞体素 `public/collision/` 目前按 0330 做的，换房后是否每套一份——**待确认**。
3. `App.tsx` 旧 `HOUSE_ID = w_mock_001` 与 `VITE_WORLD_ID` 如何彻底换成 `listing.world_id`。
4. listing 的 `world_id` 与 chat 的 `world_id` 不一致时，后端当前**不覆盖**挂牌（请前端保证二者来自同一 `selectListing`）。

---

## 8. 快速对照（给抓包）

```
GET  /api/listings
GET  /api/scene/w_0469_840829
GET  /api/camera_poses/w_0469_840829
POST /api/agent/chat
     { "session_id": "<新uuid>", "world_id": "w_0469_840829",
       "listing_id": "listing_0469_840829", "user_text": "这套多少钱" }
```

期望 `reply_text` 含 `490万`。
