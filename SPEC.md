# 接口契约 SPEC v2.1（整合版 · 全队唯一事实源）

> **性质**：本文件是**全队唯一接口事实源**，整合了 A 的前端需求与 B 的 Agent 需求。任何改动先更新本文件、通知全员、再改代码。
> **基线**：在 v2.0 基础上修正坐标表述、补全 camera/render 契约、新增 `coord` 块与 30 秒 mock。全部新增字段可选，符合"只增不改"冻结规则。

---

## 0. 全局约定

| 项 | 约定 |
|---|---|
| **字段命名** | 全 snake_case 小写（`world_id`、`session_id`、`total_area`、`trajectory_point_id`）——任何 camelCase 一律按此修正 |
| **坐标（双坐标层）** | 见下方"坐标体系" |
| **空值约定** | 数组为空发 `[]`，**不用 `null`**；可选字段无值时省略该字段（omit），不发送 |
| **时间** | Unix 毫秒 |
| **编码** | JSON，UTF-8；JSON 字符串值内**不要出现反引号** |
| **会话** | `session_id` 由**前端生成**（时间戳+随机数，如 `s_1770000001234_x8f2`），每次请求透传；后端按 `session_id` 维护多轮上下文 |
| **语音（可选加分）** | 文字问答为核心链路；音频（ASR/TTS）为**可选**，未接通则前端本地 TTS 降级，**不阻塞主流程** |
| **ID 稳定性承诺** | `trajectory_point_id` / 实例 `id` 在 48h 内**不随意更改**；如需改，先通知全员并同步 mock |
| **超时** | `ask` 目标 1-3s、可接受 3-8s、硬上限 30s；`scene`/`tour` 目标 <1s（缓存后） |
| **跨域** | 后端对前端域名开 CORS（GET + POST multipart/form-data） |
| **密钥** | 所有 API Key 只存后端 `.env`；禁止进前端代码、日志、公开仓库 |
| **冻结** | 开赛后 24h 接口冻结（只增不改）；变更走：群里说 → 更新本文件 → 通知全员 → 再改代码 |

### 坐标体系（双坐标层）

> 群核云端固定 **1 单位 = 1 毫米、Z-up、行向量矩阵（平移在第 4 行）**。我们内部约定为**米 + Y-up**，两套坐标必须在 PI 的 USDA 生成层转换。**A/B 全程只见 scene 层这一套。**

| 层 | 单位 | Up 轴 | 使用者 |
|---|---|---|---|
| **scene JSON / agent 契约层** | 米 | Y-up，房屋中心原点，X/Z 地面平面，右手系 | A、B 全程只见这一套 |
| **USDA / RenderCloud 层** | 毫米（×1000） | Z-up | 仅 PI 的 USDA 生成层可见 |

- **米→毫米、Y-up→Z-up 的转换只发生在 PI 构造 USDA 的一处代码里**；A/B 永远不感知。
- 相机矩阵按官方行向量约定（平移在第 4 行）拼装。
- agent 契约维持 v2.0 原则不变：导航一律输出 `trajectory_point_id`，不输出相机矩阵。
- **转换公式见附录 A（待对拍验证）**。

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

> 主卧/次卧不设独立枚举，用 `room.type = bedroom` + `rooms[].name`（"主卧"/"次卧"）区分。

### 1.2 实例类别 `instance_category`（20 类，可扩展）

`bed` 床 · `sofa` 沙发 · `tv_cabinet` 电视柜 · `stove` 灶台 · `dining_table` 餐桌 · `chair` 椅子 · `wardrobe` 衣柜 · `desk` 书桌 · `refrigerator` 冰箱 · `washing_machine` 洗衣机 · `toilet` 马桶 · `shower` 淋浴 · `sink` 洗手台/水槽（通用 basin） · `cabinet` 橱柜 · `coffee_table` 茶几 · `lamp` 灯 · `curtain` 窗帘 · `bedside_table` 床头柜 · `bookshelf` 书架 · `plant` 绿植

> 不在枚举内的类别（如抽油烟机 `range_hood`），B 内部做 adapter 映射到外部枚举；确需新增枚举，走变更流程，不私下加。

---

## 2. 数据契约：`GET /api/scene/{world_id}` — 三级语义 JSON（P0 · PI 提供）

前端进页面第一个请求；渲染分区、标注、镜头映射、Agent 场景知识库全部依赖它。幂等可缓存。

### 2.1 完整示例（含 `coord` 块）

```json
{
  "world_id": "w_mock_001",
  "coord": {
    "unit": "m",
    "up": "Y",
    "origin": "house_center",
    "handedness": "right",
    "polygon_axis": "XZ",
    "polygon_winding": "ccw_top"
  },
  "house": {
    "title": "阳光里 · 两室一厅 1203",
    "type": "两室一厅",
    "total_area": 89,
    "orientation": "南向",
    "floor": "12/28",
    "price": "430万",
    "tags": ["南北通透", "全明户型", "近地铁", "精装修"],
    "facts": {
      "ceiling_height": 2.8,
      "property_fee": "4.2元/㎡·月",
      "usable_ratio": 0.82,
      "floor": "12/28",
      "built_year": 2023
    },
    "model_url": "https://cdn.example.com/house88001.glb"
  },
  "rooms": [
    {
      "id": "room_living",
      "type": "living_room",
      "name": "客厅",
      "area": 24,
      "polygon": [[-2, -4], [4.5, -4], [4.5, 0], [-2, 0]],
      "adjacent_rooms": ["room_entrance", "room_balcony", "room_kitchen", "room_bedroom_second", "room_bedroom_master"],
      "trajectory_point_id": "tp_living",
      "image_url": "https://cdn.example.com/room_living.jpg",
      "selling_points": ["南向全景落地窗，直连阳台", "开间进深比约1:1.5，采光充足"],
      "story_card": "24平朝南客厅，全景落地窗直连阳台，沙发到电视墙约3米，动线开阔。",
      "instances": [
        {
          "id": "inst_sofa",
          "category": "sofa",
          "position": [-0.5, 0.4, -3.5],
          "bbox3d": { "center": [-0.5, 0.4, -3.5], "size": [2.4, 0.9, 0.9] },
          "tag": "3人位",
          "attrs": { "type": "三人位布艺沙发", "material": "棉麻", "color": "浅灰" },
          "confidence": 0.96,
          "trajectory_point_id": "tp_sofa"
        }
      ]
    }
  ],
  "tour_path": ["room_entrance", "room_living", "room_balcony", "room_kitchen", "room_bathroom", "room_bedroom_second", "room_bedroom_master"],
  "topology": {
    "adjacency": [
      { "from": "room_entrance", "to": "room_living" },
      { "from": "room_living", "to": "room_balcony" },
      { "from": "room_living", "to": "room_kitchen" }
    ]
  }
}
```

### 2.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `world_id` | string | ✅ | 群核世界 id |
| `coord` | object | ✅ | 坐标元数据（机器可校验）。A/B 加载时断言 `coord.unit === "m"`，不符则报错 |
| `coord.unit` | string | ✅ | `"m"` |
| `coord.up` | string | ✅ | `"Y"` |
| `coord.origin` | string | ✅ | `"house_center"` |
| `coord.handedness` | string | ✅ | `"right"` |
| `coord.polygon_axis` | string | ✅ | `"XZ"`（polygon 用 x,z） |
| `coord.polygon_winding` | string | ✅ | `"ccw_top"`（俯视逆时针） |
| `house.title` | string | 可选 | 房源展示名；缺省前端用"示范房源" |
| `house.type` / `total_area` / `orientation` | string/number | ✅ | 户型/面积（㎡）/朝向（中文） |
| `house.floor` / `price` / `tags[]` | string/array | 可选 | 展示字段；缺省前端隐藏对应 UI |
| `house.facts` | object | 可选 | **业务事实**（层高/物业费/得房率等），是 B 生成卖点的可靠事实来源，不是推断 |
| `house.model_url` | string | 可选 | GLB 直链（仅 A 本地 3D 保底需要；Y-up、米制、Draco、<20MB、无鉴权、开 CORS）；为空时 A 用程序化 3D 户型兜底 |
| `rooms[].id` / `type` / `name` / `area` | — | ✅ | type 见 §1.1 |
| `rooms[].polygon` | `[[x,z],…]` | 可选 | 分区地面多边形（≥3 顶点，俯视逆时针）；提供则有小地图/精确高亮/自动镜头；缺省 A 按 area 自动布局 |
| `rooms[].adjacent_rooms[]` | string[] | 可选 | 相邻房间 id |
| `rooms[].trajectory_point_id` | string | ✅ | 对应 Aholo 轨迹点 id（镜头映射依据） |
| `rooms[].image_url` | string | 可选 | 房间截图公网直链；拿不到就不填 |
| `rooms[].selling_points[]` | string[] | 可选 | 房间卖点（供前端讲解卡） |
| `rooms[].story_card` | string | 可选 | 40-80 字讲解兜底词；缺省前端按 name+area+selling_points 拼 |
| `rooms[].instances[]` | array | 可空 `[]` | 实例列表 |
| `instances[].id` | string | ✅ | 实例唯一 id（48h 内稳定） |
| `instances[].category` | string(枚举) | ✅ | 见 §1.2 |
| `instances[].position` | [x,y,z] | ✅ | 实例中心坐标（米，房屋中心原点） |
| `instances[].bbox3d` | object | 可选 | `{center, size}`；缺省 A 按类别默认尺寸表渲染 |
| `instances[].tag` | string | 可选 | 短标签（"501L"/"3人位"），3D 标注胶囊显示 |
| `instances[].attrs` | object | 可选 | 键值属性（品牌/容量等），**问答语料来源** |
| `instances[].confidence` | number | 可选 | 0-1，调试用；无值则省略 |
| `instances[].trajectory_point_id` | string | 可选 | 实例轨迹点；无对应轨迹点就不填（前端按所属房间定位） |
| `tour_path[]` | string[] | ✅ | 带看动线 room_id 顺序 |
| `topology.adjacency[]` | array | 可选 | 房间拓扑（与 `adjacent_rooms` 二选一或并存） |

**验收标准**：
- [ ] 所有 `trajectory_point_id` / `tour_path[]` / 引用 id 均真实存在、可解析
- [ ] `position`/`bbox3d` 坐标落在所属 room 范围内（有 polygon 时），误差 <0.3m
- [ ] `coord` 块存在，且 `coord.unit === "m"`
- [ ] **所有坐标字段 JSON 类型为 number**（禁止字符串）
- [ ] 坐标数值最多 3 位小数（毫米级）
- [ ] 示例 JSON 可 `JSON.parse` 通过（无反引号）

---

## 3. agent 契约（B 提供，经后端暴露）

### 3.1 主动带看：`POST /api/agent/tour`

**请求**：`multipart/form-data`（无音频时也可 `application/json`，二选一，字段相同）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `world_id` | string | ✅ | 世界 id |
| `session_id` | string | ✅ | 前端生成透传 |

**响应 200**：

```json
{
  "steps": [
    {
      "index": 0,
      "room_id": "room_entrance",
      "trajectory_point_id": "tp_entrance",
      "narration": "欢迎来到阳光里 1203，我是 AI 置业顾问小安，接下来带您把全屋看一遍。",
      "selling_points": [],
      "audio": { "mime": "audio/mp3", "base64": "..." }
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `steps[].index` | number | ✅ | 0 起连续递增 |
| `steps[].room_id` | string | ✅ | 所属房间（前端同步左栏/小地图/讲解状态） |
| `steps[].trajectory_point_id` | string | ✅ | **只引用 PI 的轨迹点，不自己造** |
| `steps[].narration` | string | ✅ | 40-90 字中文讲解词 |
| `steps[].selling_points[]` | string[] | 可空 `[]` | 卖点卡片 |
| `steps[].audio` | object | 可选 | mp3 base64；服务端预合成缓存则首响 <1s；缺省前端本地 TTS |

**约定**：`tour` **一次性全量返回，不流式**；段 0 开场欢迎、末段收尾 + 预约线下实看引导。

### 3.2 开放问答：`POST /api/agent/ask`

**请求**：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `world_id` | string | ✅ | 世界 id |
| `session_id` | string | ✅ | 前端生成透传（后端取多轮上下文） |
| `question` | string | 否 | 文字提问；与 `audio` 二选一，同时存在以 `question` 为准 |
| `audio` | file | 否 | 录音（webm/opus 或 mp4），0.5-15s；未接 ASR 则前端不上传 |
| `current_room` | string | 否 | 用户当前所在 room_id（空 = 全屋总览） |
| `tour_index` | number | 否 | 当前带看站序号 |

**响应 200**：

```json
{
  "asr_text": "冰箱容量多大",
  "answer": "厨房这台是双开门冰箱，501 升，三口之家囤一周的菜完全没问题。",
  "answer_audio": { "mime": "audio/mp3", "base64": "..." },
  "camera_target": "tp_kitchen",
  "highlight_instances": ["inst_refrigerator"],
  "source": "glm4",
  "elapsed_ms": 2400
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `asr_text` | string | ✅ | 语音识别结果（前端上屏当用户气泡）；文字提问时回显 `question` |
| `answer` | string | ✅ | 50-120 字销售话术，口语化 |
| `answer_audio` | object | 可选 | mp3 base64；缺省前端本地 TTS |
| `camera_target` | string | 可选 | 轨迹点 id；**不需要切镜头就不返回该字段**（不返回 = 不动） |
| `highlight_instances[]` | string[] | 可空 `[]` | 涉及的实例 id（高亮执行见 §5） |
| `source` / `elapsed_ms` | — | 可选 | 链路标注/耗时（调试用） |

**质量要求**：回答**必须基于 scene JSON 的 `attrs`/`facts`/`selling_points`/`house` 事实，不编造冲突信息**；导航意图（"带我去 X"）返回对应 `camera_target`；问到不存在的实例 → 明确说无可靠信息，不猜。

### 3.3 agent 契约共同约定

- **导航一律输出轨迹点 id，不输出相机矩阵**（坐标系由 PI 后端处理）
- **同步返回**：`tour` 目标 1-3s、硬上限 30s；`ask` 目标 1-3s、硬上限 30s
- **会话**：`session_id` 前端生成透传，B 按它维护上下文
- **职责链（已确认）**：**B 决定"看什么"（轨迹点/实例），PI 决定"相机怎么过去"（RenderCloud），A 负责"串起来"（调接口、显示）**

---

## 4. 相机契约（双轨）

> 主画面 = RenderCloud 实时流（核心 wow + 群核绑定）；保底 = A 前端本地 3D。**主备切换由 PI 封装在后端，契约对 B/A 不变。**

### 4.1 轨道

| 轨道 | 内容 | 状态 |
|---|---|---|
| **主画面（默认）** | `POST /api/camera/target` → PI 后端触发 RenderCloud 实时流推相机 → 前端接 WS 二进制视频流 | **待关键实验**（3DGS→RenderCloud→出画面+推相机） |
| **保底画面** | 前端本地 3D：收到 `camera_target` 后，经前端内置 tp→room/instance→本地机位映射自动飞行；前端不碰 RenderCloud | A 已做（需当场演示验证） |

### 4.2 `POST /api/camera/target`

**请求**：

```json
{ "world_id": "w_mock_001", "trajectory_point_id": "tp_sofa", "session_id": "s_1770000001234_x8f2" }
```

**响应 200 · 云渲染轨道**：

```json
{ "mode": "rendercloud", "move_ms": 1200 }
```

**响应 200 · 本地 3D 保底轨道**：

```json
{ "mode": "local_3d" }
```

**404**：

```json
{ "error": { "code": "CAMERA_TARGET_NOT_FOUND", "message": "轨迹点不存在" } }
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `world_id` | ✅ | 世界 id |
| `trajectory_point_id` | ✅ | 只引用 PI 的轨迹点，A 绝不自行构造 |
| `session_id` | ✅ | 透传，PI 可按会话做幂等（重复请求同一 tp 不重飞） |
| `mode`（响应） | ✅ | `rendercloud` → A 挂视频层等画面；`local_3d` → A 按内置映射自己飞 |
| `move_ms`（响应） | 可选 | 预计画面到位耗时；A 用于 UI 进度提示，不用于计时控制 |

### 4.3 `GET /api/render/mode?world_id=...`

前端进页面时确定初始轨道（`rendercloud` / `local_3d`），避免第一次点房间才知道走哪条轨。

### 4.4 WS 四参数下发

- 建流成功后 PI 持有 `host / nodeId / streamId / token` 四参数。
- **首次调用 `camera/target`（或 `render/mode`）响应内嵌四参数**，A 存会话级缓存。
- 流断开重连时 PI 换发新 token 并通过原响应字段下发。
- ⚠️ **token 单次有效期待 PI 实测确认**（能否覆盖 10 分钟 demo；不能则需中途换 token 逻辑）。

### 4.5 约定

- A 只消费 `trajectory_point_id`，**绝不自行构造**
- A 不碰 RenderCloud API，只接渲染画面（或本地 3D）
- 插值/缓动：RenderCloud 轨道由 PI 处理；本地 3D 轨道由 A 处理
- **主备切换由 PI 在 `POST /api/camera/target` 内部完成**，B/A 无感

---

## 5. 高亮执行责任（双轨对应）

| 画面轨道 | 高亮由谁执行 |
|---|---|
| **A 本地 3D** | **A 自己高亮**（直接操作本地场景，简单） |
| **RenderCloud 主画面** | **v1 默认降级**：高亮先不做，`highlight_instances` 仍返回，A 可用 **2D overlay 标注**或文字提及兜底；若时间富余，由 PI 在 RenderCloud 层实现 |

> 优先级：**Golden Path（问答→切镜头→画面到正确位置）优先于高亮**。高亮做不了不阻塞主流程。

---

## 6. 事实数据边界（B 卖点生成的可信度原则）

- **上游事实（PI 提供，B 直接使用）**：`house`（type/total_area/orientation/floor/price/tags/facts）、`rooms`（name/area/polygon/adjacent_rooms）、`instances`（category/position/bbox3d/tag/attrs）、`image_url`
- **允许 B 推断**：面积大小对比、空间布局关系、功能区合理性、基于 facts 的卖点组合（如"层高 2.8m 采光好"）
- **禁止 B 编造**：层高/物业费/得房率/学区/地铁/噪音/日照时长等**不在 facts 里的事实** → **宁可不讲，不要编**
- 原则：`house.facts` 是"可信卖点"的唯一事实来源；无 `facts` 时 B 只讲可推断内容

---

## 7. 统一错误格式（三端共用）

所有接口错误统一 HTTP 4xx/5xx +：

```json
{ "error": { "code": "AGENT_TIMEOUT", "message": "AI 响应超时，请稍后再试" } }
```

| code | 含义 |
|---|---|
| `WORLD_NOT_FOUND` | 世界不存在 |
| `SCENE_GRAPH_EMPTY` | 场景语义数据为空 |
| `AGENT_TIMEOUT` | agent 超时 |
| `AGENT_ERROR` | agent 内部错误（不暴露 traceback） |
| `CAMERA_TARGET_NOT_FOUND` | 轨迹点不存在 |
| `RATE_LIMITED` | 限流 |
| `ASR_FAILED` | 语音识别失败（前端降级：隐藏用户气泡，仅显示回答） |
| `TTS_FAILED` | 语音合成失败（前端降级：本地 TTS 朗读） |

---

## 8. 协作与节奏（全队确认）

| 项 | 约定 |
|---|---|
| **接口冻结** | 开赛后 24h，只增不改；新增也先通知 |
| **联调窗口** | 开赛后 36h 起 |
| **里程碑合并** | 4h / 12h / 24h / 36h，PI 主持合 main |
| **站会** | 早 9 点对契约、晚 9 点对进度，各 10 分钟 |
| **统一 demo 场景** | 全队用同一套场景（PI 提供 world_id，见 `mock/`） |
| **接口变更流程** | 群里说 → 更新本文件 → 通知全员 → 才改代码 |
| **Mock 先行** | PI 先提交 mock 数据 + API stub，B/A 对 mock 开发 |
| **Golden Path（联调第一件事）** | 跑通：问"沙发在哪里" → B 返回 `tp_sofa` + `["inst_sofa"]` → A 收到 → PI `POST /api/camera/target(tp_sofa)` → RenderCloud/本地画面到沙发。**这条不通，一切白搭；先保它** |

---

## 9. 降级矩阵（任一环节缺失，demo 不挂）

| 缺失项 | 降级方案 |
|---|---|
| RenderCloud 实时流 | 切 **A 本地 3D** 为主画面（PI 内部切换，契约不变） |
| `model_url` / GLB | A 程序化 3D 户型（按 scene JSON 画墙/分区/家具） |
| `answer_audio` / `steps[].audio` | 浏览器本地 TTS 朗读 |
| `ask` 全接口 | 内置关键词问答 + 镜头联动 |
| `tour` 全接口 | 内置导览脚本 |
| `rooms[].polygon` | A 按 area 自动布局 |
| `house` 展示字段 | 占位文案 |
| ASR / TTS | 文字问答为主，音频全链路可选 |

---

## 10. 待拍板遗留项

| # | 待拍板项 | 当前默认 |
|---|---|---|
| 1 | `tour_path` 必填还是可选 | 必填 |
| 2 | `model_url`（GLB）是否需要 | 可选；取决于 A 本地 3D 是否用 GLB——开会时让 A 演示并说清来源 |
| 3 | 语音链路（ASR/TTS）是否纳入核心 | 文字为核心，语音可选加分 |
| 4 | **坐标转换公式（对拍）** | **待 A 对拍验证后写死进附录 A** |
| 5 | **WS token 有效期** | **待 PI 实测**（能否覆盖 10 分钟 demo） |
| 6 | **30 秒 mock 形态** | **形态 A（mock WS server），今天给** |
| 7 | **A 侧画面形态确认** | 待会上确认（程序化户型 vs SPZ 实验） |

---

## 附录 A：坐标转换候选公式（待对拍验证）

> ⚠️ **群核 API 文档未给出此公式**（文档只确认毫米/Z-up/行向量）。以下为候选公式，**必须实测对拍后才可写死为正式约定。**

**候选公式**（Y-up → Z-up 常规映射）：

```text
(x, y, z)_米_Y-up  →  (x*1000, z*1000, -y*1000)_毫米_Z-up
```

**对拍用例**（来自 mock 沙发）：

- scene JSON：`position: [-0.5, 0.4, -3.5]`（米，Y-up）
- 按候选公式 → USDA 中应为 `[-500, -3500, -400]`（毫米，Z-up）

**对拍要求（必做）**：

1. PI 在 USDA 生成层加单测断言该三元组。
2. A 在 scene JSON 加载时断言 `coord.unit === "m"`。
3. **双方各跑一遍官方示例实测**，确认画面位置正确后，把公式写死进本附录（转正）。
4. ⚠️ **注意**：群核文档 `semanticsMetadata.upAxis` 说明 3DGS 服务可能本身是 **Z-up**（`Z` = 本服务 3DGS 约定）。若真实场景是 Z-up，转换可能不是单一 Y-up→Z-up 映射，**对拍时必须确认场景实际 up 轴**。

---

## 附录 B：30 秒模拟云流（mock 资产，不进契约）

**目的**：让 A 在 RenderCloud 实验出结论前，先把"接收云流画面"链路写完调稳。

**能力边界**：能测播放链路（WS 建连/JPEG 渲染/断线重连/性能），**测不了交互闭环**（camera/target→画面变化）。**不是 RenderCloud 实验替代品，是并行的去风险线。**

**交付形态 A（推荐）**：10 行代码的 mock WS server。PI 按 timeline 定时推 JPEG，握手先发 `{"type":3,...}`，中途插一条 `code:"2001"` 错误样例。前端零改动直连。

**5 条交付边界**（缺一条测试价值减半）：

1. 必须以**最终运行形态**交付（JPEG Blob 序列，**非 mp4**）
2. 覆盖 Golden Path 节奏：30s 内至少 5 段相机推进，对应 tour_path 5 站，每段 4-6s
3. 带**帧-轨迹点时间轴**（timeline.json，见下）
4. **确定性、可重放**、48h 内链接有效
5. 标注**真实规格**（分辨率/帧率≥15fps/单帧 JPEG 体积）

**timeline.json 示例**：

```json
{
  "duration_ms": 30000,
  "fps": 15,
  "resolution": "1920x1080",
  "segments": [
    { "start_ms": 0,     "end_ms": 5500,  "tp_id": "tp_entrance", "note": "玄关推入客厅" },
    { "start_ms": 5500,  "end_ms": 11000, "tp_id": "tp_living",   "note": "客厅环绕" },
    { "start_ms": 11000, "end_ms": 16500, "tp_id": "tp_balcony",  "note": "走向阳台" },
    { "start_ms": 16500, "end_ms": 23000, "tp_id": "tp_bedroom",  "note": "主卧细节" },
    { "start_ms": 23000, "end_ms": 30000, "tp_id": "tp_kitchen",  "note": "厨房收尾" }
  ]
}
```

**验收标准**：

- [ ] A 前端用真实代码路径（`ws.binaryType='blob'` → FileReader → `<img>`）完整播完 30s，无第二套播放分支
- [ ] 按 timeline 时间轴，房间标签/讲解状态与画面段一一对应
- [ ] 拔线重连一次成功；收到 2001 样例时不误判为断线
- [ ] mock 素材链接 48h 内有效，文件名/tp_id 与 scene JSON 完全一致

---

**版本历史**：v2.0 → v2.1（修正坐标表述为双坐标层、新增 `coord` 块与 `polygon_winding`、补全 `camera/target` 与 `render/mode`、WS 四参数下发、新增附录 A 坐标转换候选公式待对拍、新增附录 B 30 秒模拟云流）。