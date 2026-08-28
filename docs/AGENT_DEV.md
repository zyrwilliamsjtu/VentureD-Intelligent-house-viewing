# AI Agent 开发文档（AGENT_DEV）

> **性质**：本文件是 **PI 开发的 AI agent** 的**单一事实源**。接口字段仍以根目录 `SPEC.md` v2.2 为准；本文件管架构、坐标铁律、事实约束、分层与里程碑。
> **位置**：`backend/app/services/agent/`（Python / FastAPI **网关内模块**），与理解层（`services/understanding/`）**解耦并行**。
> **不合并**：根目录 `agent/` 为队友 Node 实现，**不动、不合入本模块**。

---

## 1. 定位

PI 在网关内实现 SPEC v2.2 五接口：

| 接口 | 本阶段 | 目标 |
|------|--------|------|
| `POST /api/agent/chat` | **M1 规则版**（intent → grounding → responder → actions） | L1 LLM 增强 |

| `POST /api/agent/asr` | P0 stub `{text:"", duration_ms:0}` | 有 key 后真实 ASR |
| `POST /api/agent/tts` | P0 stub `{}`（omit `audio_url`） | 有 key 后真实 TTS |
| `GET /api/agent/narration` | 简单实现：`story_card` / `selling_points` | M2 打磨 |
| `POST /api/agent/tour` | **handle 仍返回 `steps: []`**（保现有网关测试）；`tour.build_tour` 已能从 `tour_path` 拼 steps | M2 接入 handle_tour |

前端只打网关，不直连其它服务。A 负责点云落点；agent **只决定讲什么、去哪个语义锚点（tp_id）**。

---

## 2. 架构

```
A 前端 (agent.ts / asr.ts / narration.ts)
        │  HTTP
        ▼
backend/app/routers/agent.py          # 校验 session_id/world_id、错误码
        │
        ▼
app.services.agent.service             # handle_chat / asr / tts / narration / tour
        │
        ├── chat/                      # M1：intent → grounding → responder + actions
        ├── narration/                 # 进房讲解
        ├── tour/                      # 带看动线
        ├── asr/  tts/                 # 语音 stub → 日后真实引擎
        ├── session/store.py           # session_id → 上下文（内存 dict）
        └── facts.py                   # 复用 app.data.scene_store.load_scene_graph
```

理解层只负责产出 `GET /api/scene` 的 scene_graph；agent **读同一份 GT JSON**（`facts.load`），不调用 SpatialLM、不改 mock 文件。

---

## 3. 坐标规则（铁律）

1. **只读 scene_graph（Y-up，米，房屋中心原点）**，用 `rooms[].polygon` / `instances[].position` / `trajectory_point_id`。
2. **动作只输出 `tp_id`**（scene JSON 里已有的 `trajectory_point_id`）。**禁止编造 tp_id。**
3. **不输出 `position` 型 teleport/highlight**（点云系由前端用网关 `GET /api/camera_poses/{world_id}` 或本地表换算）。
4. **不翻轴、不混算** scene 与点云。点云 Z-up 映射只存在于 A 的 `coords.ts` / PI 的 camera_poses 表。
5. `player_position` 若出现在请求里：可忽略或仅日志；**不要拿它去乘旋转矩阵**。坐标系以 SPEC 附录 A 为准（点云 **Z-up**）。

---

## 4. 事实约束（防幻觉）

- 只陈述 **当前 world 的 scene_graph 里有的** `house` / `rooms` / `instances` / `selling_points` / `story_card` / `attrs`。
- 问不存在的物体或房间：**明确说没有可靠信息**，不猜、不从常识补。
- **0330 无 `stove`（灶台）** 实例；厨房不要讲灶台配置。
- `house.orientation` / `floor` / `price` 及部分 tags 在 0330 为 **「待对拍」占位**（见 `mock/real_0330/scene_graph.json` `_notes`）：**不要深加工成卖点**；被问到就说数据未提供。
- `confidence` 仅内部参考，不向用户报模型分数。

---

## 5. 接口契约速查（SPEC v2.2 §3）

字段命名 snake_case；可选无值 **omit**（不发 `null` / 空 `actions`）。错误顶层 `{code, message}`。

| 方法 | 必填 | 成功体要点 |
|------|------|------------|
| `POST /chat` | `session_id`, `world_id`；`user_text` 与 `audio` 二选一（`enter_room` 可无文本） | `{reply_text}`；可选 `tts_url`, `actions` |
| `POST /asr` | multipart `audio` | `{text, duration_ms?}`；空语音 `text=""` |
| `POST /tts` | JSON `text` | `{audio_url}` 或 `{}` |
| `GET /narration` | `world_id`, `room_id` | `{reply_text}`；无内容 **404** |
| `POST /tour` | `world_id`, `session_id` | `{steps:[]}` |

超时：chat 30s / asr 10s / tts 15s。`session_id` **前端生成**，后端按它记 history / current_room / tour_index。

---

## 6. 实现分层

| 层 | 内容 | 依赖 |
|----|------|------|
| **L0 规则版（当前目标）** | 关键词意图 + scene_graph 检索 + 模板回复 + tp_id 动作 | 无 LLM key；全可测；保 demo |
| **L1 LLM 增强** | 同一 grounding，LLM 只改写话术；事实仍来自 graph | API key；失败回退 L0 |
| **ASR / TTS 真实** | 替换 asr/tts stub | 语音 key；失败保持 stub 形状 |

L0 与 L1 **共用** facts / session / actions 铁律，避免两套幻觉源。

---

## 7. 与前端对接

PI 已定（2026-08-28）：

- 演示世界 **`world_id = w_0330_840483`**（0330）。
- **camera_poses 走网关** `GET /api/camera_poses/{world_id}`（前端执行 tp→点云；agent 仍只出 tp_id）。

| 前端 | 打网关 |
|------|--------|
| `frontend/src/services/agent.ts` | `POST /api/agent/chat`（JSON，30s） |
| `frontend/src/services/asr.ts` | `POST /api/agent/asr`（multipart，10s） |
| `frontend/src/scene/narration.ts` | chat `event=enter_room` 为主；可选 `GET /api/agent/narration` |

`VITE_API_MODE=real` 且 `VITE_API_BASE` 空 = 同源 `/api`（Vite 代理 8000）。  
`frontend/src/services/realApi.ts` 仍含旧 `/api/houses`、`/api/chat`——**待确认**废弃，不在本模块处理。

HUD 动作：`teleport.tp_id` → `coords.resolveTeleportCloud` → 体素贴地。agent 不要发 `position`。

---

## 8. 里程碑

| ID | 内容 | 状态 |
|----|------|------|
| **M0** | 骨架 + facts/session + asr/tts stub + narration 简单实现 + chat stub + AGENT_DEV | ✅ |
| **M1** | 规则版 `handle_chat`：intent / grounding / responder / actions | ✅ |

| **M2** | narration 打磨；`handle_tour` 接入 `build_tour` | 未开始 |
| **M3** | router 与契约测试对齐（本提交已把 router 接到 handle_* stub） | 进行中 |
| **M4** | L1 LLM 增强（需 key） | 未开始 |

---

## 9. 数据源

| 数据 | 路径 | 用途 |
|------|------|------|
| GT scene_graph | `mock/real_0330/scene_graph.json` | 0330：10 房、75 实例，`coord.up=Y` |
| 手写 mock | `mock/scene_graph.json` | `w_mock_001` 开发基线 |
| 加载代码 | `backend/app/data/scene_store.py` | `facts.load` **只包装**，不复制读盘 |
| tp 表 | `mock/real_0330/camera_poses.json` | 前端/网关；agent **不读点云坐标** |

未知 `world_id`：`facts.load` → `None`（与 scene 路由 `WORLD_NOT_FOUND` 同源表）。

---

## 10. 开发原则

1. **与理解层解耦**：不改 pipeline/provider；agent 失败不影响 `GET /api/scene`。
2. **独立可测**：`backend/tests/test_agent_service.py` 不依赖 LLM。
3. **GT 兜底**：事实只来自入库 JSON；理解层换 DualEngine 后仍可先绑 GT world。
4. **契约稳定**：先 SPEC 再改字段；omit 空可选。
5. **小步提交**：chat 规则版不接 LLM。

---

## 11. 代码地图

```
backend/app/services/agent/
├── __init__.py          # 导出 handle_*
├── service.py           # 统一入口
├── facts.py             # load + 简单检索
├── session/store.py     # 内存 load/save/clear
├── chat/                # M1 规则版：understand / retrieve / generate / build
├── narration/service.py
├── tour/service.py      # build_tour（handle_tour 尚未接入）
├── asr/service.py
└── tts/service.py
```

会话存储为**进程内 dict**，重启丢失——多 worker **待确认**是否改 Redis（demo 单进程可接受）。

---

## 12. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-28 | 建立骨架、facts/session、asr/tts stub、narration 简单实现、chat stub、router 接入 handle_* |
| 2026-08-28 | M1 规则版 handle_chat（intent/grounding/responder/actions）；SPEC §3.1 改为点云 Z-up |
