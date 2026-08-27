# 接口契约 SPEC v1.1

> 本文件是**全队唯一接口事实源**。任何接口改动必须先更新本文件、通知全员，再改代码。
> 约定：
> - **字段命名**：全小写下划线（snake_case），前后端统一
> - **坐标**：单位米（m），以房屋中心为原点；坐标系见附注
> - **空值约定**：空数组用 `[]`，**不用 `null`**（前端判空更安全）
> - **时间**：所有时间戳为 Unix 毫秒
> - **冻结规则**：开赛后 24h 接口冻结（只增不改）；新增字段也必须先通知
> - **联调**：开赛后 36h 起全链路联调

---

## 0. 枚举表（权威定义，改动必须同步本表）

### 房间类型 `room_type`

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

### 实例类别 `instance_category`（先列 20 个够 demo）

| 枚举值 | 中文 |
|---|---|
| `bed` | 床 |
| `sofa` | 沙发 |
| `tv_cabinet` | 电视柜 |
| `stove` | 灶台 |
| `dining_table` | 餐桌 |
| `chair` | 椅子 |
| `wardrobe` | 衣柜 |
| `desk` | 书桌 |
| `refrigerator` | 冰箱 |
| `washing_machine` | 洗衣机 |
| `toilet` | 马桶 |
| `shower` | 淋浴 |
| `sink` | 洗手台 |
| `cabinet` | 橱柜 |
| `coffee_table` | 茶几 |
| `lamp` | 灯 |
| `curtain` | 窗帘 |
| `bedside_table` | 床头柜 |
| `bookshelf` | 书架 |
| `plant` | 绿植 |

---

## 1. 数据契约：三级语义结构 JSON（PI → B，也供 A 展示用）

> 这是**理解层的标准输出**，B 的 agent 和 A 的前端都消费它。

### 1.1 结构定义

```json
{
  "worldId": "w_xxx",
  "house": {
    "type": "两室一厅",
    "totalArea": 89,
    "orientation": "南向",
    "rooms": [
      {
        "id": "room_living",
        "type": "living_room",
        "name": "客厅",
        "area": 24,
        "trajectory_point_id": "tp_living",
        "image_url": "https://.../room_living.jpg",
        "instances": [
          {
            "id": "inst_sofa",
            "category": "sofa",
            "position": [0.5, 0.0, 2.0],
            "confidence": 0.9,
            "trajectory_point_id": "tp_sofa"
          }
        ]
      }
    ]
  }
}
```

### 1.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `worldId` | string | ✅ | 群核世界 id |
| `house.type` | string | ✅ | 户型描述（中文） |
| `house.totalArea` | number | ✅ | 总面积（㎡） |
| `house.orientation` | string | ✅ | 朝向（中文） |
| `rooms[].id` | string | ✅ | 房间唯一 id（PI 定，如 `room_living`） |
| `rooms[].type` | string(枚举) | ✅ | 见枚举表 |
| `rooms[].name` | string | ✅ | 房间中文名 |
| `rooms[].area` | number | ✅ | 面积（㎡） |
| `rooms[].trajectory_point_id` | string | ✅ | 对应 Aholo 轨迹点 id |
| `rooms[].image_url` | string | **可选** | 房间截图 URL（公网可访问）。PI 能拿到就填，**拿不到先不填**，B 先靠拓扑/坐标/文字生成卖点 |
| `rooms[].instances[]` | array | 可空（`[]`） | 实例列表 |
| `instances[].id` | string | ✅ | 实例唯一 id |
| `instances[].category` | string(枚举) | ✅ | 见枚举表 |
| `instances[].position` | [x,y,z] | ✅ | 实例中心坐标（米，房屋中心原点） |
| `instances[].confidence` | number | 可空 | 0~1，调试用，前端不依赖 |
| `instances[].trajectory_point_id` | string | ✅ | 实例对应轨迹点 id |

---

## 2. agent 契约（B 提供，经后端暴露）

### 2.1 主动带看：`POST /api/agent/tour`

**请求**：

```json
{ "worldId": "w_xxx", "sessionId": "s_001" }
```

**响应 200**：

```json
{
  "steps": [
    {
      "trajectory_point_id": "tp_living",
      "narration": "这里是客厅，采光很好……",
      "selling_points": ["南向双阳台", "层高 2.8m"]
    }
  ]
}
```

**字段说明**：
- `steps`：**一次性全量**返回，不流式
- `steps[].trajectory_point_id`：必填，轨迹点 id（B 只引用，不自己造）
- `steps[].narration`：必填，讲解词（中文）
- `steps[].selling_points`：可空 `[]`，卖点列表（**B 基于场景事实数据自行生成**）

### 2.2 开放问答：`POST /api/agent/ask`

**请求**：

```json
{ "worldId": "w_xxx", "sessionId": "s_001", "question": "这房子适合三代同堂吗？" }
```

**响应 200**：

```json
{
  "answer": "这套两居室有 89 平，客厅 24 平……",
  "camera_target": "tp_living",
  "highlight_instances": ["inst_sofa", "inst_tv_cabinet"]
}
```

**字段说明**：
- `answer`：必填，回答文本（中文）
- `camera_target`：**可选，不需要切镜头时直接不返回该字段**（不返回 = 不切镜头）
- `highlight_instances`：可空 `[]`，回答中涉及的高亮实例 id（前端可高亮）

### 2.3 agent 契约共同约定

- **导航一律输出轨迹点 id，不输出相机矩阵**（坐标系由 PI 后端处理）
- **同步返回**：前端可接受数秒延迟；建议 agent 端设内部超时（如 30s）
- **会话**：`sessionId` 由**前端（A）生成**（随机 id，如时间戳+随机数），每次请求透传；agent 内部按 sessionId 维护上下文

---

## 3. 相机契约（PI → A）

- `POST /api/camera/target`（入参 `trajectory_point_id`）→ 触发 RenderCloud 渲染流推相机
- **A 不碰 RenderCloud，只接渲染画面 WS**（WebSocket 二进制流）
- 相机移动的插值/缓动由 PI 后端处理，前端只接收画面

---

## 4. 统一错误格式（三端共用）

所有接口错误统一返回 HTTP 4xx/5xx + 以下结构：

```json
{
  "error": {
    "code": "AGENT_TIMEOUT",
    "message": "AI 响应超时，请稍后再试"
  }
}
```

**常用错误码**：

| code | 含义 |
|---|---|
| `WORLD_NOT_FOUND` | 世界不存在 |
| `AGENT_TIMEOUT` | agent 超时 |
| `AGENT_ERROR` | agent 内部错误 |
| `SCENE_GRAPH_EMPTY` | 场景图为空 |
| `CAMERA_TARGET_NOT_FOUND` | 轨迹点不存在 |
| `RATE_LIMITED` | 限流 |

---

## 5. 协作与节奏（全队确认）

| 项 | 约定 |
|---|---|
| **接口冻结** | 开赛后 24h，只增不改；新增也先通知 |
| **联调窗口** | 开赛后 36h 起 |
| **里程碑合并** | 4h / 12h / 24h / 36h，PI 主持合 main |
| **站会** | 早 9 点对契约、晚 9 点对进度，各 10 分钟 |
| **统一 demo 场景** | 全队用同一套场景（PI 提供 worldId，见 `mock/`） |
| **接口变更流程** | 群里说 → 更新本文件 → 通知全员 → 才改代码 |
| **Mock 先行** | PI 先提交 mock 数据 + API stub，B/A 对 mock 开发 |
