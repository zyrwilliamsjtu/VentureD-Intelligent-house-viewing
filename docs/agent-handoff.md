# AI Agent 开发需求书（VentureD 智能看房 · B 板块交接版）

> **交接背景**：原 B（Agent 板块）同学退出，该板块由 A（前端）与 PI（后端）承接。本文是**完整、自包含**的需求书，交给任何 AI/开发者即可开工，无需其他上下文。
> 事实源：仓库 `VentureD-Intelligent-house-viewing` 的 `SPEC.md` v2.2（接口契约）+ `frontend/docs/backend-handbook.md`（前端实测行为）。本文已修正 SPEC 正文的过时描述（见 §10 已知坑 #1）。
> 日期：2026-08-28 · 黑客松 48H 项目，剩约 24h，**按最小可用优先**。

---

## 1. 一句话任务

实现 AI 置业顾问 Agent：接收用户问题 + 玩家在 3D 房间里的实时位置，返回**带看话术 + 可执行动作**（传送/弹卡），并支持语音识别（ASR）与合成（TTS）。前端已 100% 就绪等你接口。

## 2. 项目全貌（你在哪一环）

```
用户 ──浏览器(前端 A 已就绪)──> PI 后端网关(FastAPI, 已就绪) ──> 你：Agent 语义服务(本文档)
                                   │
                                   ├── GET /api/scene/{world_id}   ← PI 已实现
                                   └── /api/agent/*                ← 全部待你实现
```

- **前端已跑通**：第一人称 3D 漫游（3DGS 点云）、点击传送、Agent 对话面板（mock 应答已实测）、动作执行链（teleport/show_card/highlight）、TTS 播放。
- **你的代码落位**：PI 网关仓库 `backend/app/routers/agent.py`（现为透传占位）+ `backend/app/services/`。**前端只打网关，不直连你的服务**；你可以把语义逻辑做成本地模块（推荐，省一次部署）或独立微服务由网关转发。
- **前端切换方式**：后端就绪后前端改 `.env.local`（`VITE_API_MODE=real` + `VITE_API_BASE`）即接入，前端代码零改动。

## 3. 交付物清单（按优先级）

| 优先级 | 接口 | 说明 |
|---|---|---|
| **P0** | `POST /api/agent/chat` | 核心对话，Golden Path 咽喉 |
| **P0** | `POST /api/agent/asr` | 语音转文本（没有它只能打字） |
| P1 | chat 内嵌 `tts_url` | 回答自带音频直链 |
| P2 | `POST /api/agent/tts` | 仅 chat 不内嵌时才需要 |
| P2 | `GET /api/agent/narration` | 进房主动讲解 |
| 可选 | `POST /api/agent/tour` | 整条带看动线，不阻塞主线 |

**Golden Path（联调第一件事，SPEC §7）**：用户问「沙发在哪里」→ chat 返回 `reply_text` + `actions.teleport(tp_id=...)` → 前端瞬移 + 显示回答。这条不通一切白搭。

## 4. 接口契约（完整字段定义）

### 4.1 `POST /api/agent/chat`

**请求**（前端今天实际发的就是 JSON 纯文本形态；音频走 §4.2 ASR 后再 chat）：

```json
{
  "session_id": "s_m8x2k1_ab12",
  "world_id": "w_0330_840483",
  "user_text": "主卧在哪",
  "player_position": [-3.822, 3.256, 0.5],
  "player_facing": [0.94, -0.3, 0.1],
  "room_id": "room_bedroom_master",
  "event": "button_press"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `session_id` | string | ✅ | 前端生成全程复用（存 sessionStorage），**你按它维护多轮记忆** |
| `world_id` | string | ✅ | `w_0330_840483`（demo 主线，真实数据）/ `w_mock_001`（手写 mock） |
| `user_text` | string | 否 | 用户问题；`event=enter_room` 时可为 null |
| `player_position` | number[3] | 可选 | 玩家眼位，**点云坐标系（IG 原生 Z-up，米）**，每 200ms 更新、请求时快照 |
| `player_facing` | number[3] | 可选 | 视线方向单位向量（同坐标系） |
| `room_id` | string \| null | 可选 | 当前房间 id，**前端已按 polygon 归因**（0330 世界有效；其他世界为 null，需自行降级） |
| `event` | string | 可选 | `button_press`（用户主动问）/ `enter_room`（进房触发，配合 narration） |

**响应 200**：

```json
{
  "reply_text": "好的，带您去主卧。15平南向主卧，放得下1.8米大床加整墙衣柜。",
  "tts_url": "https://xxx/audio/abc123.mp3",
  "actions": [
    { "type": "teleport", "tp_id": "tp_bedroom_master", "label": "带您去主卧" },
    { "type": "show_card", "title": "主卧", "lines": ["面积约 15 ㎡", "南向飘窗", "整墙衣柜"] }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `reply_text` | string | 回答正文（前端气泡显示，再播 TTS） |
| `tts_url` | string? | 读 `reply_text` 的音频直链（mp3/wav，GET 可播放）；没有则前端静音降级 |
| `actions` | array? | 动作指令，见下表 |

**动作载荷**（前端执行行为，已实测）：

| type | 载荷 | 前端行为 |
|---|---|---|
| `teleport` | `tp_id`（**推荐**）或 `position:[x,y,z]`（点云系），可带 `label` | 查表/直用 → 体素贴地校验 → 瞬移 + toast |
| `show_card` | `{title, lines[]}`（平铺，**推荐**；前端也兼容 `{data:{title,lines}}` 嵌套） | HUD 弹信息卡 |
| `highlight` | `tp_id` 或 `position` | toast 承接（3D 标记待做） |

**硬性约束**：前端 **30s 超时**主动断开；非 2xx 错误必须是顶层 `{code, message}`（见 §4.6）；`tp_id` 必须真实存在于 tp 表（§6.2），**禁止编造**。

### 4.2 `POST /api/agent/asr`

- 请求：`multipart/form-data`，字段 `audio`（webm/opus 或 mp4，16kHz，≤15s，浏览器 MediaRecorder 产物）
- 响应：`{ "text": "主卧能放下多大的床", "duration_ms": 3200 }`
- 空语音/纯噪音返回 `{"text": ""}`，**不要报错**

### 4.3 `POST /api/agent/tts`（P1，chat 内嵌 tts_url 时可不做）

- 请求：`{ "text": "主卧约15平", "voice": "female_sales" }`
- 响应：`{ "audio_url": "https://xxx/audio/abc.mp3" }`
- **同文本必须可缓存**（别重复合成）

### 4.4 `GET /api/agent/narration?world_id=&room_id=`

- 响应：`{ "reply_text": "这是24平朝南客厅…", "tts_url": "..." }`
- 无内容返回 404，前端静默跳过；无此接口前端用本地 mock 讲解词，不阻塞

### 4.5 `POST /api/agent/tour`（可选）

返回整条带看动线 `steps[]`（`room_id`/`trajectory_point_id`/`narration`/`selling_points`）。主动讲解以 §4.4 为主，本接口不阻塞。

### 4.6 统一错误格式（所有接口）

非 2xx + 顶层结构（**不是** `{error:{...}}`）：

```json
{ "code": "AGENT_TIMEOUT", "message": "AI 响应超时，请稍后再试" }
```

| code | 用途 |
|---|---|
| `WORLD_NOT_FOUND` / `SCENE_GRAPH_EMPTY` | world 不存在 / 语义数据空 |
| `AGENT_TIMEOUT` / `AGENT_ERROR` | 超时 / 内部错误（**不暴露 traceback**） |
| `ASR_FAILED` / `TTS_FAILED` | 语音失败（前端各自降级） |
| `RATE_LIMITED` | 限流 |

**网关要求**：CORS 放行 `http://localhost:5173`（POST + OPTIONS 预检）。

## 5. 坐标规则（最容易做错，单独一节）

> SPEC 正文 §3.1/§4.2 写的「-Y up」「对拍完成前 B 禁止输出 position」**已过时作废**，以 SPEC 附录 A 为准（对拍 2026-08-28 完成：75/75 实例 <1cm、10/10 房间命中、残差 0.0003m）。

1. **铁律：收到什么坐标原样回什么坐标，禁止翻轴/乘矩阵。**
   请求里的 `player_position`/`player_facing` 是**点云系（IG 原生 Z-up，米，地板 z≈0、天花板 z≈2.8）**；你输出的 `actions[].position` 也必须是点云系。
2. **优先输出 `tp_id`**（语义锚点，稳定，前端查表执行）。要输出 `position` 时两条路：
   - 直接抄 tp 表值（§6.2，已是点云系，无需换算）；或
   - 用 scene_graph 的 scene 系坐标（`instances[].position`、房间中心）按公式转换（仅 0330 标定）：

```
scene(Y-up) → 点云(Z-up)：  X = x + 0.573,  Y = 1.087 − z,  Z = y
点云(Z-up) → scene(Y-up)：  x = X − 0.573,  y = Z,          z = 1.087 − Y
```

3. **同一文件两套坐标警告**：`scene_graph.json` 里 `position`/`polygon` 是 scene 系（Y-up），而 `trajectory_point_id` 指向的 tp 表值是点云系（Z-up）。混用必错。

## 6. 数据字典（你的知识库）

### 6.1 `mock/real_0330/scene_graph.json`（10 房间 / 75 实例）

```jsonc
{
  "world_id": "w_0330_840483",
  "house": {
    "title": "阳光里 · 两室一厅 1203",      // ⚠️ 占位文案
    "type": "两室一厅", "total_area": 120.1, // 面积实测真实
    "orientation": "待对拍",                 // ⚠️ 占位
    "floor": "...", "price": "...",         // ⚠️ 占位
    "facts": { "ceiling_height": 2.8 }       // 实测真实
  },
  "rooms": [{
    "id": "room_bedroom_master", "type": "bedroom",  // 枚举见 SPEC §1.1
    "name": "主卧",                          // 中文名，话术直接用
    "area": 15.2,                            // ㎡
    "polygon": [[x, z], ...],               // scene 系俯视轮廓（CCW）
    "adjacent_rooms": ["room_03"],
    "trajectory_point_id": "tp_bedroom_master",
    "story_card": "15平南向主卧，放得下1.8米大床加整墙衣柜，还带南向飘窗。",  // 讲解词 GT
    "instances": [{
      "id": "582", "category": "refrigerator",  // 枚举 20 类见 SPEC §1.2
      "position": [x, y, z],                   // scene 系！
      "bbox3d": [...],
      "attrs": { "品牌": "...", "容量": "..." },
      "trajectory_point_id": "tp_refrigerator_582"
    }]
  }]
}
```

**房间全表（id 与 tp_id 一一对应，真实值）**：

| room_id | name | type | tp_id |
|---|---|---|---|
| `room_living` | 客厅 | living_room | `tp_living` |
| `room_bedroom_master` | 主卧 | bedroom | `tp_bedroom_master` |
| `room_bedroom_second` | 次卧 | bedroom | `tp_bedroom_second` |
| `room_bedroom_3` | 卧室3 | bedroom | `tp_bedroom_3` |
| `room_kitchen` | 厨房 | kitchen | `tp_kitchen` |
| `room_study` | 书房 | study | `tp_study` |
| `room_bathroom` / `_2` / `_3` | 卫生间×3 | bathroom | `tp_bathroom` 等 |
| `room_laundry` | 洗衣间 | bathroom | `tp_laundry` |

**20 类实例枚举**（中文话术参考）：bed床 / sofa沙发 / tv_cabinet电视柜 / stove灶台 / dining_table餐桌 / chair椅子 / wardrobe衣柜 / desk书桌 / refrigerator冰箱 / washing_machine洗衣机 / toilet马桶 / shower淋浴 / sink洗手台 / cabinet橱柜 / coffee_table茶几 / lamp灯 / curtain窗帘 / bedside_table床头柜 / bookshelf书架 / plant绿植。

### 6.2 `mock/real_0330/camera_poses.json`（tp 表，85 键，值 = 点云系）

```jsonc
{
  "_meta": { ... },                          // 忽略
  "tp_bedroom_master": [-3.822, 3.256, 0.5], // 房间型锚点（眼高 1.5m）
  "tp_kitchen": [x, y, z],
  "tp_refrigerator_582": [x, y, z]           // 实例型：tp_<category>_<实例id>
}
```

- **键名规则**：房间型 `tp_<房间语义>`（`tp_bedroom_master`/`tp_bedroom_second`/`tp_bathroom`/`tp_kitchen`…）；实例型 `tp_<category>_<id>`（id 来自 labels.json）
- 键名与 scene_graph 的 `trajectory_point_id` 一一对应——**你要下发的 tp_id 从 scene_graph 里取，别手拼**

## 7. LLM / ASR / TTS 选型

- 团队持有 **火山方舟 / 豆包语音** API（火山引擎大模型 + 语音生成、识别）。**有 key 就用火山方舟做 chat 推理、豆包做 TTS + ASR**；key 问题找 PI。
- 无 key / 超时的降级顺序（SPEC §8 降级矩阵，**demo 永远不挂**）：
  - chat → 关键词问答（规则匹配 scene_graph，前端 mock 已验证此逻辑可行，见 §8 第一版方案）
  - tts → 前端静音气泡；asr → 前端打字输入框（已上线）
- LLM prompt 要点：把 scene_graph 的 `house` + 当前 `room` + 候选实例 `attrs` 注入上下文；**回答只基于注入事实**；输出 JSON（reply_text + actions）时用结构化输出/函数调用，避免自由文本解析失败。

## 8. 推荐开发路线（24h 内最小可用）

**第一版（2h，先保 Golden Path 联调）**：关键词规则匹配，前端 mock 已验证同款逻辑，直接移植：

1. 文本含某 `rooms[].name`（如「主卧」）→ `reply_text` 用其 `story_card` + `teleport(tp_id=room.trajectory_point_id)` + `show_card(面积/卖点)`
2. 文本含实例中文名或 `attrs` 值 → `teleport(instance.trajectory_point_id)` + `show_card(attrs 前 4 条)`
3. 命中 `面积|多大|多少平|户型|朝向|价格|总价` → 用 `house` 字段答
4. `event=enter_room` → 返回该房间 `story_card`
5. 兜底 → 引导话术（「您可以问我某个房间或家具的位置」）

**联调冒烟**：先让 chat 对一切请求返回硬编码（前端 30s 超时内返回即可）：

```json
{ "reply_text": "联调成功", "tts_url": null,
  "actions": [{ "type": "teleport", "tp_id": "tp_bedroom_master", "label": "带您去主卧" }] }
```

**第二版（+4h）**：火山方舟 LLM 接入，scene_graph 上下文注入 + 事实约束 prompt + 结构化输出；`session_id` 多轮记忆（当前房间指代消解，如「这屋多大」）。
**第三版（+4h）**：TTS 内嵌 `tts_url`（同文本缓存）；ASR。
**可选**：narration/enter_room、tour。

## 9. 自测清单（联调前自己先过）

```bash
# chat 冒烟（tp_id 型动作）
curl -s -X POST http://localhost:8000/api/agent/chat -H "Content-Type: application/json" -d '{
  "session_id":"t1","world_id":"w_0330_840483","user_text":"主卧在哪",
  "player_position":[-3.8,3.2,0.5],"room_id":null,"event":"button_press"}'

# asr 冒烟
curl -s -X POST http://localhost:8000/api/agent/asr -F "audio=@test.webm"

# 错误格式（不存在的 world）
curl -s -X POST http://localhost:8000/api/agent/chat -H "Content-Type: application/json" -d '{"session_id":"t1","world_id":"w_xxx","user_text":"hi"}'
```

验收标准：
- [ ] 「主卧在哪」→ `reply_text` 含主卧信息 + `teleport.tp_id` 是 tp 表真实键名
- [ ] 「冰箱在哪」「这套房多大」「沙发怎么样」均有合理回答或诚实说无可靠信息
- [ ] `player_position` 原样体系内使用（点云系），无翻轴迹象
- [ ] 非 2xx 返回顶层 `{code,message}`；CORS 预检通过
- [ ] 响应 < 30s（前端超时线）；`session_id` 二轮对话有记忆
- [ ] 不编造：问「燃气灶」（本场景无）→ 明确说无，不现编参数

## 10. 已知坑（开工前必读）

1. **SPEC 正文与附录 A 矛盾**：正文 5 处（§0/§3.1/§4.2/§4.3/§9）仍写「-Y up」「B 禁止输出 position」「room_id 恒 null」——**全部作废，以附录 A 为准**（Z-up、可输出 position、room_id 前端已传）。已提醒 PI 同步正文，你写代码时别被正文带偏。
2. **本场景（0330）没有灶台**（数据集限制）：别生成「燃气灶」类话术。
3. **`house.title`/`orientation`/`price`/`floor`/`tags` 是占位假数据**：可以引用但别深加工成卖点；`total_area≈120.1㎡`、`ceiling_height=2.8` 是实测真实。
4. **话术可信度**（SPEC §5）：只讲 scene JSON 里的 `attrs`/`facts`/`selling_points`/`story_card`；层高/物业费/得房率/学区/地铁等不在 facts 里的**宁可不讲**；问不存在的实例明确说无，不猜。
5. **`show_card` 载荷双写法**：前端兼容平铺与 `data` 嵌套，但你**统一用平铺** `{title, lines[]}`。
6. **tp 表值就是点云系**：抄表即用，不要再套 §5 公式（公式只用于转换 scene_graph 里的 scene 系坐标）。
7. **前端 30s 超时**：LLM 慢就先流式跳过、控制 prompt 长度，或先返回 `tp_id` 型动作保底。

## 11. 代码落位与 Git 规范（仓库红线）

- 仓库：`VentureD-Intelligent-house-viewing`，你的分支：**`dev-agent`**（已存在但是空脚手架、落后 main 10+ 提交——**从最新 main 重建分支内容**再开工）。
- 代码：`backend/app/routers/agent.py`（路由）+ `backend/app/services/agent/`（语义逻辑，可自建目录）；测试放 `backend/tests/`。
- 提交规范（`docs/GIT_WORKFLOW.md`）：信息 `agent: 做了什么`；**禁止** `git add .`/`-A`、`push --force`、直推 main、提交 `.env`/token/大文件、改别人板块文件（`frontend/` 别碰）；push 前 pull；接口变更**先改 SPEC 再改代码**并群里通知。
- `.env` 放火山方舟 / 豆包语音的 key，绝不入库；PI 审查 PR 后合 main。

## 12. 联调支持（你随时可以找 A）

- 前端联调手册：仓库 `frontend/docs/backend-handbook.md`（含三步联调法）
- 前端契约实现版：`frontend/docs/agent-api.md`；契约事实源：根目录 `SPEC.md`
- 前端实测行为：mock 应答 7/7 步通过（2026-08-28），chat 客户端在 `frontend/src/services/agent.ts`，动作执行在 `frontend/src/scene/agentActions.ts`，坐标解析在 `frontend/src/scene/coords.ts`
- 前端 mock 的完整匹配逻辑可参考：`frontend/src/services/agent.ts` 的 `mockAgentChat()`

---

*本文由 A（前端）整理，2026-08-28。如与 `SPEC.md` 附录 A 冲突，以附录 A 为准并立即找 PI 修 SPEC。*
