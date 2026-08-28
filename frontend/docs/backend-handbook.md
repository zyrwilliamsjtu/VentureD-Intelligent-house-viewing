# 后端 / Agent 接手联调手册

> 面向：后端（PI 网关）与 Agent（B 语义）开发同学。前端已全链路跑通，本文告诉你**从哪接、怎么联调、怎么自测**。
> 契约唯一事实源是根目录 `SPEC.md`（v2.2）；本文不重复定义字段，只补充**前端实测行为 + 数据字典 + 联调步骤**。
> 前端实现细节与决策史见 `frontend/WORKLOG.md`。

## 0. 文档地图（先读哪份）

| 文档 | 管什么 | 谁维护 |
|---|---|---|
| `SPEC.md` | **接口契约唯一事实源**（字段/枚举/错误码/附录 A 坐标公式） | PI |
| `backend/README.md` | 后端网关架构、目录、数据流 | PI |
| `mock/real_0330/SOURCE.md` | 0330 数据怎么从 InteriorGS 转出来的 | PI |
| `frontend/docs/agent-api.md` | Agent 契约实现版（动作语义、降级矩阵、前端执行行为） | A（前端） |
| `frontend/WORKLOG.md` | 前端全部决策记录（D1-D6）与验证数据 | A |
| **本文** | 联调步骤 + 数据字典 + 已知坑 | A |

## 1. 五分钟跑通前端（联调前置）

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173，默认 mock 模式，无需后端
```

能看到：开场页 → 进入漫游 → 第一人称 WASD 走动 → 右上角「小驻AI·询问」可对话（mock 应答，问「主卧在哪」会触发传送 + 信息卡）。

**这一步的作用**：确认你手里的前端是好的，联调出问题时能排除前端侧。

## 2. 你要实现的接口（按优先级）

| 优先级 | 接口 | 契约定义 | 前端调用点 | 前端已备好的行为 |
|---|---|---|---|---|
| P0 | `POST /api/agent/chat` | SPEC §3.1 | `frontend/src/services/agent.ts` → `realAgentChat()` | 30s 超时；错误顶层 `{code,message}` 解析进对话气泡；`actions` 自动执行（§4） |
| P0 | `POST /api/agent/asr` | SPEC §3.2 | 待接（当前打字输入） | — |
| P1 | chat 内嵌 `tts_url` | SPEC §3.1 响应字段 | `frontend/src/scene/agentActions.ts` → `playTts()` | 直链播放，失败静默降级 |
| P1 | `POST /api/agent/tts` | SPEC §3.3 | 仅 chat 不内嵌时需要 | — |
| P2 | `GET /api/agent/narration` | SPEC §3.4 | 待接（`event=enter_room` 请求体已支持） | — |
| 已交付 | `GET /api/scene/{world_id}` | SPEC §2 | `frontend/src/services/realApi.ts` | ✓ PI 已实现（2026-08-27 合并） |

**前端切换 real 模式**（后端就绪后，改 `frontend/.env.local`）：

```ini
VITE_API_MODE=real
VITE_API_BASE=http://localhost:8000   # 网关地址
```

## 3. 数据文件字典（后端要读的）

### 3.1 world_id 路由

| world_id | 数据位置 | 说明 |
|---|---|---|
| `w_0330_840483` | `mock/real_0330/` | InteriorGS 真实场景（demo 主线），10 房间 / 75 实例 / 85 tp 点 |
| `w_mock_001` | `mock/scene_graph.json` | 手写 mock（冒烟用） |

### 3.2 `camera_poses.json`（tp 表，teleport 的数据源）

```jsonc
{
  "_meta": { ... },              // 元信息，忽略
  "tp_bedroom_master": [-3.822, 3.256, 0.5],   // 房间型锚点：眼高 1.5m
  "tp_refrigerator_582": [x, y, z]             // 实例型：tp_<类别>_<实例id>
}
```

- **键名规则**：房间型 `tp_<房间语义>`（如 `tp_bedroom_master`）；实例型 `tp_<category>_<实例id>`（id 来自 `labels.json`，如 `582`）
- **值**：`[x, y, z]`，**点云坐标系（IG 原生 Z-up，米）**，三位小数
- **对应关系**：`scene_graph.json` 里每个 `rooms[].trajectory_point_id` 与 `instances[].trajectory_point_id` 的值就是这里的键名
- 前端解析逻辑：`frontend/src/scene/coords.ts` → `resolveTeleportCloud()`

### 3.3 `scene_graph.json` 字段速查（完整定义见 SPEC §2.2）

```jsonc
{
  "world_id": "w_0330_840483",
  "house": { "title", "type", "total_area", "orientation", "floor", "price", "tags", "facts": { "ceiling_height" } },
  "rooms": [{
    "id", "type",            // 枚举见 SPEC §1.1
    "name",                  // 中文名，如「主卧」——Agent 话术直接用
    "area",                  // ㎡
    "polygon": [[x, z], ...], // scene 系（Y-up）俯视轮廓，CCW
    "adjacent_rooms": [],
    "trajectory_point_id",   // → camera_poses 键名
    "story_card",            // 讲解词（GT）
    "instances": [{
      "id", "category",      // 枚举见 SPEC §1.2（20 类）
      "position": [x, y, z], // scene 系
      "bbox3d": [...],
      "attrs": { "品牌": "...", ... },
      "trajectory_point_id"  // → camera_poses 键名
    }]
  }]
}
```

**⚠️ 同一文件里有两套坐标**：`position` / `polygon` 是 **scene 系（Y-up）**，而 `trajectory_point_id` 指向的 tp 表值是**点云系（Z-up）**。Agent 下发动作时的坐标转换见 §5。

## 4. `actions` 前端执行行为（Agent 下发即生效）

实现：`frontend/src/scene/agentActions.ts`，已实测通过。

| 动作 | 前端行为 | 注意 |
|---|---|---|
| `teleport` | `position` 直用，或 `tp_id` 查 tp 表 → 体素向下探测贴地 → 瞬移 + toast | **优先给 `tp_id`**（表里是已验证安全落点）；`position` 是点云系 |
| `show_card` | HUD 中央弹信息卡 | **兼容两种载荷**：平铺 `{title,lines}`（SPEC 正文）与嵌套 `{data:{title,lines}}`（PI 样例）——建议统一平铺 |
| `highlight` | toast 承接（3D 标记待做） | 给 `tp_id` 或点云系 `position` |

## 5. 坐标铁律（最容易做错的地方）

**后端/Agent 收到什么坐标就原样回什么坐标，禁止自己翻轴。**

请求里的 `player_position` / `player_facing`（SPEC §3.1）是**点云系**（视口每 200ms 发布，前端 `store.player`）；响应 `actions` 里的坐标也必须是**点云系**。

只有当你想用 `scene_graph.json` 里的 scene 系数据（`position` / `polygon`）换算成动作坐标时，才需要转换（SPEC 附录 A，0330 标定）：

```
scene(Y-up) → 点云(Z-up)：  (x, y, z) → (x + 0.573, 1.087 − z, y)
点云(Z-up) → scene(Y-up)：  (x, y, z) → (x − 0.573, z, 1.087 − y)
```

验证数据（`frontend/WORKLOG.md` §5）：75/75 实例 tp 锚点与 `labels.json` bbox 中心偏差 <2cm（实测亚毫米级）；7/7 房间锚点落在对应 polygon 内。

## 6. 联调三步（建议顺序）

**第一步 · 前端 mock 自证**（不用后端）
按 §1 跑 mock 模式，问「主卧在哪」「冰箱在哪」「这套房多大」，确认传送和信息卡工作。这一步证明前端执行链路无恙。

**第二步 · real 冒烟**（后端最小实现后）
后端起服务，前端切 `VITE_API_MODE=real`，chat 接口先返回**硬编码 JSON**：

```json
{
  "reply_text": "联调成功",
  "tts_url": null,
  "actions": [{ "type": "teleport", "tp_id": "tp_bedroom_master", "label": "带您去主卧" }]
}
```

前端应显示回复并瞬移到主卧。通了就说明：CORS ✓、字段名 ✓、动作链 ✓。

**第三步 · 全量验收清单**

- [ ] CORS 放行 `http://localhost:5173`（POST + OPTIONS 预检）
- [ ] 非 2xx 返回 `{code, message}`（SPEC §6），前端会显示 `Agent 暂不可用：[code] message`
- [ ] `actions.teleport` 用真实 `tp_id`（从 `camera_poses.json` 取键名，别编造）
- [ ] `session_id` 透传（前端生成复用，存 sessionStorage）
- [ ] 超时行为：>30s 前端主动断开显示「Agent 响应超时」

## 7. 已知坑（读代码/读 SPEC 前先看）

1. **SPEC 正文与附录 A 坐标描述不一致（截至 2026-08-28）**：正文 §0 坐标表 / §3.1 / §4.2 / §4.3 / §9 仍写「点云 -Y up」「对拍完成前 room_id 恒 null / B 禁止输出 position」；**附录 A 才是对的**（点云为 IG 原生 Z-up，对拍已完成，B 可输出 position）。以附录 A 为准，等 PI 同步正文。
2. **`room_id` 前端已归因**：对拍世界（0330）下前端按 polygon 归因后随请求上传，B 可直接用于房间上下文；非对拍世界为 `null`，B 需自行降级。
3. **`show_card` 载荷双写法**：见 §4，建议新代码统一平铺。
4. **`total_area` 约 120.1㎡ 是实测房间面积之和**；`title`/`orientation`/`price` 等是占位文案，B 生成话术时别当真实数据深加工（SPEC §5 可信度原则）。
5. **本场景无灶台**（数据集限制，见 SOURCE.md 房间推断表），别生成「燃气灶」类卖点话术。

## 8. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 初版：联调三步 + 数据字典 + 坐标铁律 + 已知坑（对应前端 Agent 接线交付） |
