# Backend 开发技术文档（PI 后端板块）

> 本文件是 backend 板块的**单一事实源**。任何代码结构、接口、数据流的变更，先更新本文件、再改代码。

## 1. 定位与边界

- 本板块由 **PI 负责**，提供三端（A 前端 / Agent 语义 / PI 理解层）的统一后端网关。
- **职责**：
  - 提供 `GET /api/scene/{world_id}`（理解层产出 `scene_graph`，当前 GTProvider）
  - 提供 `GET /api/camera_poses/{world_id}`（tp → 点云坐标映射，已实现）
  - 提供 **agent 语义服务（开发中）**：SPEC v2.2 的 `chat` / `asr` / `tts` / `narration` / `tour`（`backend/app/services/agent/`，L0 规则版铺路中；详见 `docs/AGENT_DEV.md`）
  - 统一错误格式、CORS、会话透传
- **边界**：不做前端渲染（A 的活）。根目录 `agent/`（队友 Node 实现）**不合并不改**。**不越界。**

## 1.5 理解层架构（PI 板块核心 · 最简方案：GT Provider 为主，双引擎为后续）

### 定位（决策记录：2026-08-28）
- 目标场景**仅 0330**；不做未知场景、不做现场生成。
- **最简方案（PI 拍板）**：理解层砍掉 VLM / CLIP / 房间截图 / 双通道核验 / 俯视图几何划分，
  仅用 GT 已知信息；但**保留 Provider 统一接口**，保证将来无缝切换真双引擎。
- **GT 三重角色**：生产数据 / 评测真值 / 失败兜底。
- 对外接口 `GET /api/scene/{world_id}` 不变（SPEC v2.2），理解层是内部实现。

### 理解层产出（PI 核心交付物）
- **产出对象**：`scene_graph`（SPEC v2.2 三级语义结构：`house` / `rooms[]` / `instances[]` + `coord` + `tour_path` + `topology`）。
- **产出内容**（对应 PI 原定职责）：
  - 三级拓扑结构（house → rooms → instances 层级 + `topology.adjacency`）
  - 房间位置（`rooms[].polygon` + `trajectory_point_id`）
  - 实例位置（`instances[].position` + `bbox3d` + `trajectory_point_id`）
- **消费方**：
  - **Agent 语义服务**（`services/agent/`）：作为场景知识库（房间/实例/坐标/拓扑）
  - **A 的前端**：作为图纸（小地图/标注/镜头映射）
- **来源机制**：当前由 `GTProvider` 从 GT 数据透传；未来由 `DualEngineProvider`（理解层推理）计算产出。对外格式始终遵循 SPEC v2.2。

### 架构：Provider 统一接口
```
GET /api/scene/{world_id}
  → scene_service.get_scene(world_id)
  → provider.get_scene_graph()
  → SceneUnderstandingProvider（统一接口）
      ├─ GTProvider（当前默认，读 mock/real_0330）
      └─ DualEngineProvider（未来占位 Stub）
  → pipeline：房间划分(GT) → 实例(GT) → scene_graph 组装
  → SPEC v2.2 scene_graph → B / A
```
- Provider 工厂按 `UNDERSTANDING_PROVIDER` 环境变量路由（默认 `gt`）。
- 换双引擎 = 新增 provider 实现 + 改配置，下游 B/A 无感。

### GT 极简 pipeline（当前生效）
```
读 GT 场景数据（mock/real_0330/scene_graph.json + labels/structure）
  → 房间划分（segmenter.py：直接用 GT rooms polygon）
  → 实例已在 GT scene_graph 内；GTInstanceSource 钩子只收集、不重算（映射已在 GT JSON 完成）
  → scene_graph 组装（pipeline.py：房间+实例+coord+tour_path+topology）
```
- **不做**：俯视图生成、房间截图、识别/核验（留给未来双引擎）。

### 代码位置
- `backend/app/services/understanding/`：`output.py`（产出类型）、`providers/`（base/gt/dual_engine/factory）、`room/segmenter.py`、`instance/instance_source.py`、`pipeline.py`

### 与 SPEC 的关系
- 对外契约（`GET /api/scene` 返回格式）由 SPEC v2.2 定义，理解层不改变它。
- scene_graph 的数据来源（GT provider / 未来理解层）属内部实现。

### 理解层重构（进行中）
- 理解层当前为"GT 兜底为主"。**SpatialLM（S0）部署验证受阻**，降级为可选加分；详见 **`docs/REFACTOR_PLAN.md`**。
- 完整重构计划、阶段状态、变更/踩坑记录见 `docs/REFACTOR_PLAN.md`（单一事实源）。
- 每完成一个阶段：更新 `docs/REFACTOR_PLAN.md`（标 ✅）+ 本文件对应章节。
- 原则：一次只换一个步骤；每步有验收（vs GT）+ 回退；**demo 主线永不依赖理解层**。后续开发主线 = **AI agent（M1 规则版 chat）**，S0 不再阻塞。

## 1.6 AI agent 语义服务（PI 开发 · 网关内模块）

- **拍板**：agent 由我方用 Python 做在网关内（`backend/app/services/agent/`），与理解层任务解耦并行。
- **单一事实源**：`docs/AGENT_DEV.md`（架构、坐标铁律、事实约束、L0/L1、里程碑）。
- **本阶段**：M2 `handle_tour` 已接入；narration 支持可选 session 去重；asr/tts 仍 stub。
- **消费**：A 前端 `agent.ts` / `asr.ts`；演示世界 `w_0330_840483`；tp 落点用 `GET /api/camera_poses`，agent 只出 `tp_id`。

## 2. 技术栈与运行

- 语言/框架：Python + FastAPI
- 入口：`app/main.py`
- 配置：`.env`（API Key 等，**不入库**）
- 运行：`uvicorn app.main:app --reload`

## 3. 目录结构（白盒约定）

```
backend/
├── README.md            # 本文档
├── app/
│   ├── main.py          # FastAPI 入口 + 路由注册
│   ├── config.py        # 配置加载（.env）
│   ├── routers/         # 各接口路由
│   │   ├── scene.py     # GET /api/scene/{world_id}
│   │   ├── agent.py     # agent 契约路由 → services.agent.handle_*
│   │   └── camera.py    # camera_poses / tp 查询
│   ├── services/        # 业务逻辑（scene 路由、scene_graph 加载、world 索引）
│   │   ├── understanding/  # 理解层：Provider 工厂 + GT 极简管线（L0+L1）
│   │   └── agent/          # AI agent：facts/session/chat 骨架/narration/tour/asr/tts
│   ├── data/            # 数据访问（读 mock、真实 scene_graph）
│   └── schemas/         # 目前仅 GatewayError；scene/agent 响应未用 Pydantic 校验（可选增强）
├── tests/               # 测试（对齐 SPEC 验收标准）
└── requirements.txt
```

## 4. 数据流（谁调谁，白盒）

```
A 前端 ──GET /api/scene/{world_id}──> backend 理解层产出 scene_graph ──> agent 知识库 / A 前端（图纸）
A 前端 ──GET /api/camera_poses/{world_id}──> backend（读 mock camera_poses.json）
A 前端 ──POST /api/agent/chat|asr|tts|tour / GET narration──> backend agent 语义服务（开发中，见 docs/AGENT_DEV.md）
```

## 5. 接口契约对齐

- **以 `SPEC.md` 为唯一接口事实源**。backend 的所有路由、字段、错误码必须与 SPEC v2.2 完全一致。
- 新增/修改接口：先改 SPEC → 通知全员 → 再改代码（走变更流程）。

## 6. 白盒化约定（重要）

1. **每次改动可解释**：每个提交说明"改了什么、为什么"。
2. **不写黑盒逻辑**：复杂逻辑要有注释、函数名自解释。
3. **不留死代码**：删除或注释掉的代码不长期留存。
4. **敏感信息零入库**：API Key、token 只在 `.env`，绝不 commit。
5. **测试对齐验收**：每个接口至少一个测试，对齐 SPEC 验收标准（如 coord 断言、错误码）。
6. **变更留痕**：重大变更在本文件"变更记录"节登记。

## 7. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-08-27 | 后端初始化 | 建立 FastAPI 骨架（main/config/routers 占位） |
| 2026-08-28 | 理解层产出显式化 | `UnderstandingOutput` + README/SPEC 标明 scene_graph 为 PI 核心产出、供 B/A 消费 |
| 2026-08-28 | camera / agent 网关 stub | `GET /api/camera_poses/{world_id}`；agent 五路由契约层 stub（SPEC §4 新增 camera_poses） |
| 2026-08-28 | 验收 Y 项清理 | README 架构图/GT 钩子/schemas 表述对齐代码；agent stub 空可选字段 omit；SPEC §0 点云层改为 Z-up |
| 2026-08-28 | agent 服务骨架 | 建立 `services/agent/`（facts/session/stub）+ `docs/AGENT_DEV.md`；router 改调 handle_* |
| 2026-08-28 | M1 规则版 chat | intent/grounding/responder/actions；问主卧 → teleport `tp_bedroom_master` |
| 2026-08-28 | M2 tour + narration | `handle_tour` 接入 `build_tour`；narration session 去重；SPEC §4.2 Z-up |
| 2026-08-28 | 理解层重构 S0 受阻 | SpatialLM 笔记本编译失败，止损存档；demo 主线继续 GT；后续主线转 agent |

## 8. 与本仓库其他板块的关系

- `mock/`：场景数据来源（手写 + real_0330）
- `SPEC.md`：接口契约
- `docs/GIT_WORKFLOW.md`：Git 推送规则（backend 同样遵守）
- `docs/AGENT_DEV.md`：AI agent 开发文档
- AI agent：网关内 `services/agent/`（PI）；根目录 `agent/` 不合并
- A 的前端：通过本网关对接，不直接连 agent 实现
