# 接口契约 SPEC v2.3（整合版 · 全队唯一事实源）

> **性质**：本文件是**全队唯一接口事实源**。任何改动先更新本文件、通知全员、再改代码。
> **基线**：在 v2.2 基础上只增：`GET /api/listings`、chat/narration 可选 `listing_id`、5 套真实世界、会话隔离方案 A。全部新增字段可选，符合"只增不改"。

---

## 0. 全局约定

| 项 | 约定 |
|---|---|
| **字段命名** | 全 snake_case 小写（`session_id`、`world_id`、`reply_text`、`player_position`）。任何 camelCase 一律按此修正 |
| **坐标（两层）** | 见下方"坐标体系" |
| **空值约定** | 数组为空发 `[]`，不用 `null`；可选字段无值时省略（omit），不发送 |
| **时间** | Unix 毫秒 |
| **编码** | JSON，UTF-8（除上传音频为 multipart）；JSON 字符串内不要出现反引号 |
| **会话** | `session_id` 由**前端生成**（首次进房生成、全程复用），每次请求透传；后端按它维护多轮上下文。**换房隔离（方案 A）**：前端切换房源时**重置 `session_id`**（生成新 uuid），不把上一套的 history/current_room 带到下一套 |
| **鉴权（可选）** | 赛事内网可先不做；如需，前端在 Header 带静态 token `X-Agent-Token` |
| **CORS** | 后端对前端域名开 CORS，开发期含 `http://localhost:5173` |
| **超时** | `chat` 30s / `asr` 10s / `tts` 15s；超时返回统一错误格式 |
| **ID 稳定性承诺** | `trajectory_point_id` / 实例 `id` 48h 内不随意更改；改则先通知并同步 mock |
| **冻结** | 开赛后 24h 接口冻结（只增不改）；变更走：群里说 → 更新本文件 → 通知全员 → 再改代码 |

### 坐标体系（两层）

> 前端第一人称漫游在 A 本地（视口 + 3DGS 点云）运行，**无 RenderCloud 云端渲染层**。两套坐标必须对拍对齐；跨坐标系数值**禁止混算**。渲染实现细节不在本契约内。

| 层 | 单位 | Up 轴 | 使用者 |
|---|---|---|---|
| **scene JSON / agent 契约层** | 米 | Y-up，房屋中心原点，X/Z 地面平面，右手系 | B 的 agent 读场景、生成话术与动作 |
| **点云坐标系（玩家/传送）** | 米 | InteriorGS 原生 **Z-up**（实测，见附录 A）；平移量逐场景，禁止套用 0330 数值 | A 的玩家位置、`teleport`/`highlight` 落点 |

- **转换只发生在 A 本地的一处映射层**（或由 PI 提供 tp→点云坐标映射表）；B 不感知点云坐标。
- **5 套真实世界已对拍**（附录 A）：前端按 polygon 归因并透传 `room_id`；未登记世界仍为 `null`。B 不感知点云、不做跨坐标系混算。
- **对拍任务见附录 A**。

---

## 1. 枚举表（权威定义，改动必须同步本表）

### 1.1 房间类型 `room_type`

| 枚举值 | 中文 |
|---|---|
| `living_room` | 客厅 |
| `bedroom` | 卧室 |
| `kitchen` | 厨房 |
| `bathroom` | 卫生间 |
| `dining_room` | 餐厅 |
| `balcony` | 阳台 |
| `study` | 书房 |
| `entrance` | 玄关 |

> 主卧/次卧用 `room.type = bedroom` + `rooms[].name`（"主卧"/"次卧"）区分。

### 1.2 实例类别 `instance_category`（20 类，可扩展）

`bed` 床 · `sofa` 沙发 · `tv_cabinet` 电视柜 · `stove` 灶台 · `dining_table` 餐桌 · `chair` 椅子 · `wardrobe` 衣柜 · `desk` 书桌 · `refrigerator` 冰箱 · `washing_machine` 洗衣机 · `toilet` 马桶 · `shower` 淋浴 · `sink` 洗手台/水槽（通用 basin） · `cabinet` 橱柜 · `coffee_table` 茶几 · `lamp` 灯 · `curtain` 窗帘 · `bedside_table` 床头柜 · `bookshelf` 书架 · `plant` 绿植

> 不在枚举内的类别，B 内部做 adapter 映射；确需新增走变更流程。

---

## 2. 数据契约：`GET /api/scene/{world_id}` — 三级语义 JSON（P0 · PI 提供）

前端进页面第一个请求；渲染分区、标注、Agent 知识库全部依赖它。幂等可缓存。

> **产出定位**：本接口返回的 `scene_graph` 是**理解层的核心产出**（三级语义结构：house / rooms / instances + 坐标 + topology），由 PI 后端提供。
> - 供 **B 的 agent** 作为场景知识库（房间/实例位置/拓扑）
> - 供 **A 的前端**作为图纸（小地图/标注/镜头映射）
> - 当前由 GTProvider 提供（5 套真实世界见 §7；0330 数据在 `mock/real_0330/`，其余在 `mock/{scene_id}/`）；未来可切换 DualEngineProvider。对外格式始终遵循本契约。


### 2.1 结构要点（完整示例见 mock/scene_graph.json）

```json
{
  "world_id": "w_mock_001",
  "coord": {
    "unit": "m", "up": "Y", "origin": "house_center",
    "handedness": "right", "polygon_axis": "XZ", "polygon_winding": "ccw_top"
  },
  "house": {
    "title": "阳光里 · 两室一厅 1203",
    "type": "两室一厅", "total_area": 89, "orientation": "南向",
    "floor": "12/28", "price": "430万",
    "tags": ["南北通透", "全明户型", "近地铁", "精装修"],
    "facts": {
      "ceiling_height": 2.8, "property_fee": "4.2元/㎡·月",
      "usable_ratio": 0.82, "floor": "12/28", "built_year": 2023
    }
  },
  "rooms": [ { "id": "room_living", "type": "living_room", "name": "客厅", "area": 24,
    "polygon": [[-2,-4],[4.5,-4],[4.5,0],[-2,0]],
    "adjacent_rooms": ["room_entrance","room_balcony","room_kitchen","room_bedroom_second","room_bedroom_master"],
    "trajectory_point_id": "tp_living",
    "selling_points": ["南向全景落地窗，直连阳台"],
    "story_card": "24平朝南客厅，全景落地窗直连阳台。",
    "instances": [ { "id": "inst_sofa", "category": "sofa",
      "position": [-0.5,0.4,-3.5],
      "bbox3d": { "center": [-0.5,0.4,-3.5], "size": [2.4,0.9,0.9] },
      "tag": "3人位", "attrs": { "type": "三人位布艺沙发" },
      "confidence": 0.96, "trajectory_point_id": "tp_sofa" } ] } ],
  "tour_path": ["room_entrance","room_living","room_balcony","room_kitchen","room_bathroom","room_bedroom_second","room_bedroom_master"],
  "topology": { "adjacency": [ { "from":"room_entrance","to":"room_living" }, { "from":"room_living","to":"room_balcony" } ] }
}
```

真实场景完整示例见 `mock/real_0330/scene_graph.json`（world_id=`w_0330_840483`）。另 4 套：`w_0469_840829` / `w_0259_840804` / `w_0309_840544` / `w_0836_841149`（`mock/{scene_id}/`）。

### 2.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `world_id` | string | ✅ | 群核世界 id（Agent 用它索引房源知识库） |
| `coord` | object | ✅ | 坐标元数据；A 加载时断言 `coord.unit === "m"` 且 `coord.up === "Y"` |
| `coord.*` | — | ✅ | `unit:"m"` / `up:"Y"` / `origin:"house_center"` / `handedness:"right"` / `polygon_axis:"XZ"` / `polygon_winding:"ccw_top"` |
| `house.*` | — | — | title(可选)/type/total_area/orientation/floor(可选)/price(可选)/tags[](可选)/facts(可选) |
| `rooms[].id` / `type` / `name` / `area` | — | ✅ | type 见 §1.1 |
| `rooms[].polygon` | `[[x,z],…]` | 可选 | 分区地面多边形（俯视逆时针）；缺省 A 按 area 自动布局 |
| `rooms[].adjacent_rooms[]` | string[] | 可选 | 相邻房间 id |
| `rooms[].trajectory_point_id` | string | ✅ | 语义锚点 id（B 输出动作时引用） |
| `rooms[].selling_points[]` / `story_card` | — | 可选 | 卖点 / 讲解兜底词 |
| `rooms[].instances[]` | array | 可空 `[]` | 实例列表 |
| `instances[].id` / `category` / `position` | — | ✅ | id / 类别(§1.2) / 中心坐标(Y-up,米) |
| `instances[].bbox3d` / `tag` / `attrs` / `confidence` | — | 可选 | 包围盒 / 短标签 / 键值属性(问答语料) / 置信度 |
| `instances[].trajectory_point_id` | string | 可选 | 无对应则省略 |
| `tour_path[]` | string[] | ✅ | 带看动线 room_id 顺序 |
| `topology.adjacency[]` | array | 可选 | 房间拓扑 |

**验收标准**：
- [ ] 所有 `trajectory_point_id` / `tour_path[]` / 引用 id 真实存在、可解析
- [ ] `coord` 块存在，`coord.unit === "m"` 且 `coord.up === "Y"`
- [ ] 所有坐标字段为 number、最多 3 位小数
- [ ] 示例 JSON 可 `JSON.parse` 通过（无反引号）

### 2.6 `GET /api/listings`（P0 · 房源列表）

前端开场页拉挂牌卡片。只读。字段一律 **snake_case**。

**响应 200**：

```json
{
  "listings": [
    {
      "id": "listing_0330_840483",
      "title": "InteriorGS 0330 · 三室一厅",
      "layout": "三室一厅",
      "area": 120.1,
      "orientation": "南向",
      "floor": "12/28",
      "price": "430万",
      "price_num": 430,
      "tags": ["南北通透", "全明户型"],
      "highlight": "三室一厅约120平，南向客厅连阳台。",
      "world_id": "w_0330_840483",
      "is_real": true,
      "floorplan": ""
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `listings` | array | ✅ | 挂牌列表；空则 `[]` |
| `listings[].id` | string | ✅ | 挂牌 id，与 chat/narration 的 `listing_id` **对齐**（`listing_{scene_id}`） |
| `title` / `layout` / `area` | string / string / number | ✅ | 标题 / 户型 / 面积（㎡） |
| `orientation` / `floor` | string | ✅ | 朝向 / 楼层（挂牌 mock，见 `_notes`） |
| `price` / `price_num` | string / number | ✅ | 展示价（如 `"430万"`）/ 数值万 |
| `tags` / `highlight` | string[] / string | ✅ | 标签 / 一句话卖点 |
| `world_id` | string | ✅ | 对应 `GET /api/scene/{world_id}` |
| `is_real` | boolean | ✅ | 真实 InteriorGS 场景为 `true`；手写 mock 房源若接入则为 `false` |
| `floorplan` | string | 可选 | 户型图 URL；无则 `""` 或 omit |

**查询参数（只增 · 全部可选）**：无参时返回全部（与现状兼容）；多个参数同时出现时取**交集**。

| 参数 | 类型 | 说明 |
|---|---|---|
| `layout` | string | 房型过滤，子串包含（如 `三室` 可命中 `三室一厅`） |
| `price_min` | number | 价格下限（按 `price_num`，单位：万），含边界 |
| `price_max` | number | 价格上限（按 `price_num`，单位：万），含边界 |
| `q` | string | 关键词，匹配 `title` / `layout` / `highlight` / `tags` / `orientation` / `floor`（不区分大小写） |

`price_min` / `price_max` 若提供且无法解析为数字 → 400 `{ "code": "AGENT_ERROR", "message": "price_min 无效" }`（或 `price_max`）。合法过滤无命中 → 200 `{ "listings": [] }`，不报错。

**数据源**：`mock/listings.json`。文件缺失或损坏 → 500 `{code,message}`；**前端有本地硬编码兜底**，demo 不挂。

**挂牌 vs scene_graph**：价格/朝向/楼层等以 **listing 为准**（数据集无这些字段，listing 为挂牌 mock）。scene_graph 的 `house.price` 等可仍为「待对拍」占位。

---

## 3. agent 契约（B 提供，经后端暴露）

> 所有接口统一挂在 PI 网关下。**A 只对接网关，不直接连 B 服务。**

### 3.1 `POST /api/agent/chat`（P0 · 核心，必有）

前端把用户问题（或音频）+ 玩家上下文发来，Agent 回回答 + 可执行动作。

**请求**：`multipart/form-data`（含音频时）或 `application/json`（纯文字时）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `session_id` | string | ✅ | 前端生成、全程复用，多轮记忆键 |
| `world_id` | string | ✅ | 群核世界 ID，Agent 索引对应房源知识库 |
| `user_text` | string | 否 | 用户问题文本；`event=enter_room` 时可为 null |
| `audio` | file | 否 | 录音（webm/opus 或 mp4，≤15s）；**前端直接传音频，不做文字处理**；与 `user_text` 二选一，同时存在以 `user_text` 为准 |
| `player_position` | number[3] | 可选 | 玩家眼位。`player_position` / `player_facing` 为点云系（**IG 原生 Z-up**，米；实测见附录 A），agent 可忽略或仅日志，不用于坐标计算。 |
| `player_facing` | number[3] | 可选 | 视线方向单位向量（同坐标系；agent 可忽略，不用于坐标计算） |
| `room_id` | string | 可选 | 当前房间。**5 套真实世界前端已归因并透传**；未登记世界可为 null。Agent 可用来选讲解房间，不用于点云坐标计算 |
| `listing_id` | string | 可选 | 当前挂牌 id（与 `GET /api/listings` 的 `id` 对齐）。**有则挂牌信息优先**（价格/面积/朝向/楼层/卖点）；`null` 或省略则 scene_graph 兜底。**listings 与 scene_graph 冲突以 listing 为准**（防幻觉） |
| `event` | string | 可选 | `button_press`（主动问）/ `enter_room`（进房主动讲，配合 §3.4） |

**响应 200**：

```json
{
  "reply_text": "主卧约 15 平，1.8 米大床加整墙衣柜都放得下。",
  "tts_url": "https://xxx/audio/abc123.mp3",
  "actions": [
    { "type": "teleport", "tp_id": "tp_bedroom_master", "label": "带您去主卧" }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `reply_text` | string | 回答正文（前端先气泡显示，再播 TTS） |
| `tts_url` | string? | 读 `reply_text` 的音频直链（mp3/wav，GET 可播放）；没有则前端本地 TTS 或调 §3.3 |
| `actions` | array? | 动作指令，见 §4 |

**流式（可选，P2）**：支持 SSE（`text/event-stream`），逐 token 发 `data:{"delta":"主卧"}`，最后 `data:{"done":true,"tts_url":"...","actions":[...]}`；无 SSE 则整段返回。

### 3.2 `POST /api/agent/asr`（P0 · 语音转文本）

前端按住录完一段（webm/opus，16kHz，≤15s）整段上传，**由后端做语音识别**。

- 请求：`multipart/form-data`，字段 `audio`（文件）
- 响应：`{ "text": "主卧能放下多大的床", "duration_ms": 3200 }`
- 空语音/噪音返回 `{"text": ""}`，不要报错

### 3.3 `POST /api/agent/tts`（P1 · 可选，chat 不内嵌时才需要）

- 请求：`{ "text": "主卧约15平", "voice": "female_sales" }`
- 响应：`{ "audio_url": "https://xxx/audio/abc.mp3" }` 或直接二进制 `audio/mpeg`
- **同文本必须可缓存**（同一句话别重复合成）

### 3.4 `GET /api/agent/narration?world_id=&room_id=`（可选 · 进房主动讲解）

- 查询参数：`world_id`、`room_id` 必填；`session_id` 可选（去重）；**`listing_id` 可选**（有则会话可挂当前挂牌，讲解正文仍以房间 `story_card` 为准）
- 响应：`{ "reply_text": "这是24平朝南客厅…", "tts_url": "..." }`
- 没有对应内容时返回 404，前端静默跳过
- **前端用法（main）**：进房优先打本接口；404/失败再回落 chat `event=enter_room`
- 无此接口前端用本地 mock 讲解词，不阻塞

### 3.5 `POST /api/agent/tour`（P1 · 已实现）

一次性返回整条带看动线 `steps[]`。网关 `handle_tour` / `build_tour` 已接入；前端「开始带看」播放。进房主动讲解仍走 §3.4 `narration`（失败可回落 `event=enter_room`），与 tour 步骤互不替代。

请求：`{ "world_id": "...", "session_id": "..." }`

响应 `steps[]` 每步：

| 字段 | 必填 | 说明 |
|---|---|---|
| `index` | 是 | 从 0 起 |
| `room_id` | 是 | 房间 id |
| `trajectory_point_id` | 是 | 该房 `tp_id`（只出 tp，不出 `position`） |
| `narration` | 否 | **短句**，供 HUD 上屏 |
| `speech` | 否 | **只增**：长讲解稿，**仅供 TTS 发声、不上屏**；无则前端回落 `narration` 或静音，不阻塞 |
| `selling_points` | 否 | 房间卖点列表；无则 omit |

`speech` 由规则模板从 `scene_graph`（及可选 listing 亮点）组装，**不进 LLM**。面积/实例/邻接必须来自真实字段，不编造。数据不足时允许只有「房间名+面积」（最小模板）。

### 3.6 agent 契约共同约定

- **会话**：`session_id` 前端生成透传，B 按它维护上下文
- **回答必须基于 scene JSON 的 `attrs`/`facts`/`selling_points`/`house` 事实，不编造冲突信息**；问不存在的实例 → 明确说无可靠信息，不猜
- **有 `listing_id` 时**：价格 / 面积 / 朝向 / 楼层 / 挂牌卖点以 listing 为准；与 scene_graph `house` 冲突时 **listing 赢**
- **坐标系边界**：B 只读 scene JSON（Y-up），**不感知点云坐标**。5 套已对拍，前端透传 `room_id`；B **当前只出 `tp_id`，不输出 `position` 型坐标**（落点由 A 查 `camera_poses`）
- 职责链：**B 决定"讲什么/去哪个语义锚点"，A 负责把动作落到点云坐标（本地映射或 PI 映射表）**

---

## 4. 导航与动作（取代原相机契约）

### 4.1 `actions` 动作系统（A 前端已支持）

| type | 载荷 | 前端行为 | 状态 |
|---|---|---|---|
| `teleport` | `position:[x,y,z]`（点云坐标）或 `tp_id`（语义锚点） | 玩家瞬移过去（带淡入） | **已实现**（当前 agent 只出 `tp_id`） |
| `highlight` | `position:[x,y,z]` 或 `tp_id` | 在该位置放高亮标记 | **已实现**（点云系光柱；无落点则 toast） |
| `show_card` | `{ title, lines[] }` | HUD 弹信息卡 | **已实现**（InfoCard，可关 / 数秒消失） |

### 4.2 载荷约定

- `position` 一律用点云系：**IG 原生 Z-up**（米，实测见附录 A）；前端/网关处理坐标，agent 只输出 `tp_id`。
- `tp_id` 是 scene JSON 里的 `trajectory_point_id`；**tp → 点云坐标的映射由 PI 提供（`mock/camera_poses.json` 或映射表）**，A 本地执行。
- **B 输出时**：优先输出 `tp_id`（语义锚点，稳定）；若已拿到映射、对拍完成，可输出 `position`。**对拍完成前禁止 B 输出 `position` 型坐标。**

### 4.3 降级

- 映射表缺失或 `tp_id` 不在表中 → 纯文本回答；A 不瞬移（toast 提示）。
- `highlight` / `show_card` **已实现**；无落点或载荷空则 toast / 不弹卡，**不影响** `reply_text` 展示。

### 4.4 `GET /api/camera_poses/{world_id}`（P0 · PI 提供）

A 查询 `tp_id` → **点云坐标**映射，供 `teleport` / `highlight` 落点。只读。

**请求**：path `world_id`（与 scene 相同：5 套真实 `w_{scene_id}` 或手写 `w_mock_001`）

**响应 200**：

```json
{ "world_id": "w_0330_840483", "poses": { "tp_living": [0.061, 0.934, 0.5] } }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `world_id` | string | 回显请求的世界 id |
| `poses` | object | `tp_id` → `[x,y,z]`（点云坐标系，米；0330 为 IG 原生 Z-up，见附录 A） |

未知 `world_id` → 404 `{ "code": "WORLD_NOT_FOUND", "message": "世界不存在" }`。

**数据源**：真实世界 `mock/real_0330/camera_poses.json` 或 `mock/{scene_id}/camera_poses.json`（各自对拍）；手写 mock 为 `mock/camera_poses.json`。**偏移每场景独立，禁止套用 0330 的 0.573/1.087。**

---

## 5. 事实数据边界（B 卖点生成的可信度原则）

- **上游事实（PI 提供）**：`house`、`rooms`、`instances`、`image_url`
- **允许 B 推断**：面积对比、空间布局关系、功能区合理性、基于 facts 的卖点组合
- **禁止 B 编造**：层高/物业费/得房率/学区/地铁/噪音/日照等**不在 facts 里的事实** → 宁可不讲，不要编
- **话术以 scene JSON 文案为准，不要现场"看图说话"**（点云场景家具可能与 scene JSON 描述有出入）

---

## 6. 统一错误格式（三端共用）

所有接口错误统一非 2xx +：

```json
{ "code": "AGENT_TIMEOUT", "message": "AI 响应超时，请稍后再试" }
```

> code 用大写下划线。注：此处由 `{error:{...}}` 简化为 `{code,message}` 顶层结构，与 A 侧约定一致；**全队统一用这一种**。

| code | 含义 |
|---|---|
| `WORLD_NOT_FOUND` | 世界不存在 |
| `SCENE_GRAPH_EMPTY` | 场景语义数据为空 |
| `AGENT_TIMEOUT` | agent 超时 |
| `AGENT_ERROR` | agent 内部错误（不暴露 traceback） |
| `ASR_FAILED` | 语音识别失败（前端降级：隐藏用户气泡，仅显示回答/提示） |
| `TTS_FAILED` | 语音合成失败（前端降级：本地 TTS 朗读） |
| `RATE_LIMITED` | 限流 |
| `LISTINGS_UNAVAILABLE` | 挂牌列表数据不可用（`mock/listings.json` 缺失或损坏） |

---

## 7. 协作与节奏（全队确认）

| 项 | 约定 |
|---|---|
| **接口冻结** | 开赛后 24h，只增不改；新增也先通知 |
| **联调窗口** | 开赛后 36h 起 |
| **里程碑合并** | 4h / 12h / 24h / 36h，PI 主持合 main |
| **站会** | 早 9 点对契约、晚 9 点对进度，各 10 分钟 |
| **统一 demo 场景** | **5 套真实房源**（InteriorGS）：`w_0330_840483`、`w_0469_840829`、`w_0259_840804`、`w_0309_840544`、`w_0836_841149`。0330 产物在 `mock/real_0330/`，其余在 `mock/{scene_id}/`。手写 mock `w_mock_001` 作开发基线保留。未知 `world_id` → 404 `WORLD_NOT_FOUND`。 |
| **字段命名** | 全接口 **snake_case**（`world_id` / `is_real` / `price_num` / `listing_id` / `session_id`）。camelCase 一律按此修正 |
| **listing_id** | 与 `GET /api/listings` 的 `listings[].id` 对齐，格式 `listing_{scene_id}`（如 `listing_0469_840829`） |
| **会话隔离** | **方案 A**：前端换房重置 `session_id`；后端不在同一 session 上切换 world（若请求 world_id 与 session 已绑 world 不一致——**待确认**是否 400；当前按新 world 覆盖写入） |
| **多世界接入铁律** | 点云 **Z-up**（米）；`teleport` 只用 scene 已有 `tp_id` 白名单；**坐标偏移逐场景标定 + 对拍**，禁止套用 0330 公式；对拍见各 `mock/.../SOURCE.md` |
| **接口变更流程** | 群里说 → 更新本文件 → 通知全员 → 才改代码 |
| **Mock 先行** | PI 先提交 mock 数据 + API stub，B/A 对 mock 开发 |
| **Golden Path（联调第一件事）** | 跑通：问"沙发在哪里" → `chat` 返回 `reply_text` + `actions.teleport(tp_id=tp_sofa)` → A 查映射表瞬移到沙发前 + 显示回答。**这条不通，一切白搭；先保它** |

---

## 8. 降级矩阵（任一环节缺失，demo 不挂）

| 缺失项 | 降级方案 |
|---|---|
| `GET /api/listings` | 前端本地硬编码挂牌列表 |
| `chat` 全接口 | 内置关键词问答（前端/本地 mock） |
| `asr` | 打字输入框 |
| `tts` / `tts_url` | 前端本地 TTS 或静音气泡 |
| `actions.teleport` | 纯文本回答 |
| `actions.highlight` / `show_card` | **已实现**；失败则 toast，回答仍展示 |
| `narration` | 前端 GET 失败则 chat `enter_room`；再失败则跳过讲解 |
| `tour` | **`POST /api/agent/tour` 已接**；失败 toast「带看暂不可用」，不改用 enter_room 冒充整条动线 |
| 某世界未对拍 / 未登记 | B 仍只出 `tp_id`；该世界 `room_id` 可为 null |

---

## 9. 待拍板遗留项

| # | 项 | 当前状态 |
|---|---|---|
| 1 | `tour` | **已实现**（`POST /api/agent/tour` + 前端播放 / B 键） |
| 2 | 语音链路真实接入 | ASR：豆包 WS 已通；TTS：V3 已冒烟、独立接口常 omit `audio_url`。无 key 则 stub + 前端降级。原「MOSS」供应商名作废 |
| 3 | **坐标对拍（scene Y-up ↔ 点云 Z-up）** | **5 套真实世界已对拍**（附录 A）；前端归因 `room_id`。未登记世界 `room_id` 仍 null。B 不输出点云 `position` |
| 4 | `tp_id` → 点云坐标映射表由谁提供 | **已由 PI 提供**（`GET /api/camera_poses/{world_id}` / 各 `mock/.../camera_poses.json`） |

§7 **会话隔离**「world 与 session 已绑不一致是否 400」仍为 **待确认**；当前实现按新 world **覆盖写入**。此项涉及错误码行为，**本轮不改契约**。

---
## 附录 A：坐标映射（已对拍转正 · **逐场景标定**）

> **铁律**：平移量 **每场景特有**，禁止把 0330 的 0.573 / 1.087 套到其它世界。形态公式相同，数值见各场景 `mock/.../SOURCE.md` + `origin.json`。
>
> 0330 坐标对拍完成（2026-08-28，A 实测：75/75 实例 <1cm、10/10 房间命中、残差 0.0003m）。以下 **0330 数值** 写死为该场景约定。

**背景**：
- scene JSON：米，Y-up，原点 house_center（`coord.up="Y"`）
- 点云（0330 ply）：IG 原生坐标系，右手系，**Z-up**（地板 z≈0、天花板 z≈2.8），原点在户型左下角附近
- ⚠️ 重要更正：SPEC v2.2 曾假设"点云为 -Y up"，**实测不成立**；0330 ply 为 IG 原生 Z-up，aholo-viewer 原样渲染、无轴变换

**正向（scene → 点云，teleport 用）**：
```
X_pc = x + 0.573
Y_pc = 1.087 − z
Z_pc = y
```

**逆向（点云 → scene，点击拾取用）**：
```
x = X_pc − 0.573
y = Z_pc
z = 1.087 − Y_pc
```

- 变换保持右手系（行列式 +1，无镜像）
- 语义：scene 原点 = IG 坐标 − (0.573, −1.087)
- **标定范围：逐场景**。0330 用上式数值；0469 / 0259 / 0309 / 0836 各自 `ox` / `Y_const=(-oz)`，见对应 `SOURCE.md`

**应用**：
- A 前端：`teleport(tp_id)` 查 `mock/real_0330/camera_poses.json`（fixed 转正版）；或按正向公式从 scene 坐标计算。**ply 加载后 viewer 无需任何旋转变换**（原生 Z-up 直接显示）。
- B Agent：对拍已完成；**当前实现只出 `tp_id`**，点云落点由 A 查 `camera_poses`（与 §4.2 优先 `tp_id` 一致）。契约仍允许 `position` 字段，本轮不删。

---

**版本历史**：
- v2.1 → v2.2（抛弃 RenderCloud 轨道、坐标系改两层并新增点云层、agent 契约按 chat/actions/asr/tts/narration 重构、语音按 A 意见、删除附录 B、Golden Path 与降级矩阵更新）。
- v2.2 → v2.3（`GET /api/listings`；chat/narration 可选 `listing_id`；5 套真实世界；snake_case / 会话隔离方案 A / 逐场景坐标铁律写入 §7）。
- v2.3 状态对齐 main（2026-08-28）：§9 坐标改为 Z-up 且 5 套已对拍；§4.1/§8 tour·highlight·show_card 标已实现；§3.1 示例改为 `tp_bedroom_master` 且只出 `tp_id`。**未改字段语义、未改 §7 会话 400 行为**。
- v2.3 只增（2026-08-28）：§3.5 `steps[].speech` 可选长稿（TTS 专用、不上屏）；既有 `narration` 语义不变。
- v2.3 只增（2026-08-29）：§2.6 `GET /api/listings` 可选查询 `layout` / `price_min` / `price_max` / `q`；无参仍返回全部。
