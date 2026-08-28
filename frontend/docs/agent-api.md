# Agent 接口需求 v1.1（前端 → Agent/后端）· 对拍转正版

> v1.1 变更（2026-08-28）：**坐标系对拍完成**。`w_0330_840483` 点云为 IG 原生 Z-up（旧 -Y up 结论作废）；`room_id` 前端已归因可传；`actions.teleport` 新增 `tp_id`，前端传送链路已上线。
> v1.1.1（2026-08-28 下午）：**前端 Agent 已接线**——对话面板上线（mock/real 一键切换）、show_card/highlight 承接、TTS 播放；`show_card` 兼容 `data` 嵌套载荷。
> 前端现状：第一视角漫游 + 点击传送 + Agent 对话/传送/信息卡均已跑通（群核 Aholo Viewer + 3DGS 点云），HUD 右上角「AI 讲解 · 询问」即入口。
> 本文档定义把占位换成真 Agent 所需的**全部**接口。火山方舟/豆包语音（ASR/TTS）由你们在后端封装，前端只打你们的网关。

## 0. 总约定

| 项 | 约定 |
|---|---|
| 基地址 | 你们给一个 `https://xxx` 网关，所有接口挂它下面 |
| 数据格式 | 全 JSON（除 ASR 上传音频）`Content-Type: application/json`；UTF-8 |
| 错误格式 | 非 2xx 时返回 `{ "code": "AGENT_TIMEOUT", "message": "..." }`，code 用大写下划线 |
| 鉴权 | 赛事内网可先不做；要做得话给个静态 token 放 Header `X-Agent-Token` |
| CORS | 必须放行前端域名（开发期 `http://localhost:5173`） |
| 超时 | chat 30s / asr 10s / tts 15s，超时返回上面错误格式 |

## 0.5 坐标系（对拍转正，必读）

**所有穿网关的坐标（`player_position` / `player_facing` / `actions.position`）一律是点云坐标系：IG 原生、右手系、Z-up（地板 z≈0，层高 2.8m）、单位米。**

对拍过程：`labels.json` 500 实例 bbox 交叉验证 + `structure.json` 房间范围比对，75/75 实例误差 <1cm，锚点残差 0.0003m。

scene 语义 JSON（Y-up、原点 house_center）↔ 点云映射（仅前端用，Agent 不需要算）：

```
scene(x,y,z) → 点云:  [ x + 0.573, 1.087 − z, y ]
点云(X,Y,Z) → scene:   [ X − 0.573, Z, 1.087 − Y ]
```

| 世界 | 状态 | tp 表 |
|---|---|---|
| `w_0330_840483` | 已对拍转正 | `GET /mock/real_0330/camera_poses.json`（85 个 tp 点：75 物体锚点 + 10 房间锚点，点云系；已对 labels.json bbox 中心 75/75 复核 <2cm，房间锚点 7/7 落在 structure.json 房间轮廓内） |
| 其它新世界 | 未对拍 | 前端恒等降级（`room_id=null`，坐标不映射）；对拍后登记进 `scene/coords.ts` |

⚠️ 旧草稿「点云是 -Y up，映射 (x,−y,z)」**已作废**，别按旧文档实现。

## 1. `POST /api/agent/chat` —— 核心，必须有

前端把用户问题 + 玩家上下文发来，Agent 回回答 + 可执行动作。

**请求**

```json
{
  "session_id": "uuid-由前端生成并全程携带",
  "world_id": "w_0330_840483",
  "user_text": "主卧能放下多大的床？",
  "player_position": [3.84, -0.66, 1.5],
  "player_facing": [0.1, 0.0, -0.9],
  "room_id": "room_bedroom_master",
  "event": "button_press"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `session_id` | string | 多轮对话记忆键，前端首次进房生成，一直复用 |
| `world_id` | string | 世界 ID，Agent 用它索引对应房源知识库与 tp 表 |
| `user_text` | string? | 用户语音转出的文本；`event=enter_room` 主动讲解时可为 null |
| `player_position` | number[3] | 玩家眼位（点云坐标系，**Z-up**，米；前端节流 200ms 发布） |
| `player_facing` | number[3] | 视线方向单位向量（同坐标系） |
| `room_id` | string? | 当前房间（对拍世界前端按 polygon 已归因，如 `room_bedroom_master`）；未对拍世界为 null，Agent 需容忍 |
| `event` | string | `button_press`（用户主动问）/ `enter_room`（进房主动讲，配合接口 4） |

**响应**

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
| `tts_url` | string? | 读 `reply_text` 的音频直链（GET 可播放，mp3/wav 均可）；没有就调接口 3 |
| `actions` | array? | 动作指令，见下 |

**actions 类型**

| type | 载荷 | 前端行为 | 状态 |
|---|---|---|---|
| `teleport` | `tp_id`（推荐）或 `position: [x,y,z]`（点云系），均可带 `label` | 解析落点 → 体素贴地校验 → 瞬移 + toast | **已上线**（优先 `tp_id`，表见 0.5 节） |
| `highlight` | `position: [x,y,z]`（点云系）或 `tp_id` | 在该位置放高亮标记 | toast 承接已上线；3D 标记待做 |
| `show_card` | `{ title, lines[] }`（也兼容 `{ data: { title, lines[] } }` 嵌套写法） | HUD 弹信息卡 | **已上线**（toast 信息卡） |

`teleport` 解析优先级：`position` 直接用（已是点云系，**别再做任何变换**）> `tp_id` 查表 > 都没有则前端降级纯文本。落点非法（墙里/悬空）由前端贴地探测兜底，Agent 不用管。

**流式（可选但强烈建议）**：chat 支持 SSE，`Content-Type: text/event-stream`，逐 token 发 `data: {"delta":"主卧"}`，最后 `data: {"done":true,"tts_url":"...","actions":[...]}`。没有 SSE 就整段返回，前端气泡打字机效果照做。

## 2. `POST /api/agent/asr` —— 语音转文本，必须有

前端按住按钮录完一段（webm/opus，16kHz，≤15s），整段上传。

- 请求：`multipart/form-data`，字段 `audio`（文件）
- 响应：`{ "text": "主卧能放下多大的床", "duration_ms": 3200 }`
- 空语音/噪音返回 `{"text": ""}`，不要报错

## 3. `POST /api/agent/tts` —— 文本转语音（chat 不内嵌时才需要）

- 请求：`{ "text": "主卧约15平", "voice": "female_sales" }`
- 响应：`{ "audio_url": "https://xxx/audio/abc.mp3" }` 或直接二进制 `audio/mpeg`
- 同文本必须可缓存（同一句话别重复合成）

## 4. `GET /api/agent/narration?world_id=&room_id=` —— 进房主动讲解（可选）

- 响应：`{ "reply_text": "这是24平朝南客厅…", "tts_url": "..." }`
- 没有 world/room 对应内容时返回 404，前端静默跳过
- 没有此接口前端就用本地 mock 讲解词（已写好），不阻塞

## 5. 你们需要的输入（前端/队友侧提供）

1. 房源知识库：scene JSON（户型、卖点、家具清单）——**你们后端持有**，按 `world_id` 索引；0330 版在 `mock/real_0330/scene_graph.json`（scene Y-up 系，房间 polygon 在 XZ 平面）
2. tp 表：`mock/real_0330/camera_poses.json`（**点云系**，85 点，键名即 `tp_id`）
3. 讲解人设：销售风格、称呼、话术框架——你们定，前端不管
4. 群核 InteriorGS 数据集可作为泛化知识（labs.aholo3d.cn）

## 6. 优先级（48h 内）

| 优先级 | 接口 | 没有它的降级方案 |
|---|---|---|
| P0 | chat（非流式版） | **前端 mock 已接管**（scene_graph 关键词匹配 + 真 tp 表传送），接口就绪改 `VITE_API_MODE=real` 即切 |
| P0 | asr | 打字输入框（已上线） |
| P1 | chat 内嵌 tts_url | 静音气泡（播放逻辑已上线，失败静默） |
| P1 | actions.teleport（tp_id） | 纯文本回答 |
| P2 | SSE 流式 | 整段返回 |
| P2 | narration | 本地 mock 讲解词 |

## 7. 已知风险（提前对齐）

- **坐标系**：对拍已完成（见 0.5 节）。Agent 侧唯一铁律：收到什么坐标就用什么坐标，**不要自己再乘矩阵/翻轴**。若拿 scene 系数据（如 scene_graph.json 的 polygon/instance position），必须先用 0.5 节公式转成点云系再下发给前端。
- 新世界接入必须先对拍（登记 `scene/coords.ts` 的 `CLOUD_RULES`），否则前端恒等降级、`room_id=null`，Agent 只能靠 `world_id` 查库。
- 点云场景是 AI 生成的，家具和 scene JSON 描述可能对不上，Agent 话术以 scene JSON 文案为准，别现场"看图说话"。
