# Backend 开发技术文档（PI 后端板块）

> 本文件是 backend 板块的**单一事实源**。任何代码结构、接口、数据流的变更，先更新本文件、再改代码。

## 1. 定位与边界

- 本板块由 **PI 负责**，提供三端（A 前端 / B agent / PI 理解层）的统一后端网关。
- **职责**：
  - 提供 `GET /api/scene/{world_id}`（按 world_id 路由真实/手写 mock）
  - 暴露 agent 契约接口（`chat` / `asr` / `tts` / `narration` / `tour`）——**由 B 实现，经本网关透传/聚合**
  - 提供 `camera_poses` / tp 相关查询（供 A 的 teleport 映射）
  - 统一错误格式、CORS、会话透传
- **边界**：不做 agent 语义逻辑（B 的活）、不做前端渲染（A 的活）。**不越界。**

## 1.5 理解层架构（PI 板块核心）

### 定位
- 目标场景**仅 0330**（InteriorGS `0330_840483`）；**不做未知场景、不做现场生成**。
- 目标：在 0330 上跑通"俯视图划房 → 逐房识别"的理解 pipeline，产出与 GT 对比验证的 scene_graph。
- **GT 三重角色**：生产数据（demo 主线）/ 评测真值 / 失败兜底。

### Pipeline（单场景，俯视图先行）

```
0330 3DGS(ply) + 相机位姿
  → ① 生成俯视图（top-down 占用图，仿 occupancy.png）
  → ② 俯视图房间划分与定位（墙/门 → 房间 polygon + 中心）
  → ③ 逐房间渲染取图（每房 1-2 张）
  → ④ 双引擎识别（VLM 语义主 + CLIP 定位辅）
  → ⑤ 3D 投影定位（2D 框 → 3D 坐标）
  → ⑥ scene_graph 组装（SPEC v2.2）
  → ⑦ 评测/回退（与 GT 对比）
```

### 双引擎
- 引擎 B（VLM）：识别房间图 → 房间/物体语义（主）
- 引擎 A（CLIP/GroundingDINO）：检测物体 2D 框 → 3D（辅）
- 冲突处理：语义以 VLM 为准，坐标以检测为准
- 实现：CLIP 部分借鉴开源项目（待选型，HOV-SG/ConceptGraphs 系）

### 评测与回退（核心）
- 与 GT（`mock/real_0330/scene_graph.json` + 本地 `occupancy.png`/`structure.json`）对比：
  房间划分一致 / 实例一致 / 坐标误差 / 耗时 / 稳定
- 达标 → 用理解层结果；不达标/超时/失败 → 用 GT
- `GET /api/scene` 默认返回 GT；理解层作为"实时理解演示"（达标时展示）

### 上下游
- 上游：0330 ply（本地，不入库）+ 相机位姿
- 下游：scene_graph → `GET /api/scene` → B/A；评测报告 → 路演

### 依赖（待确认）
- 点云投影工具链（生成俯视图）
- 俯视图房间划分（开源/手工辅助）
- 渲染取图（Aholo 渲染器 / 3DGS 渲染库）
- VLM 资源（多模态大模型 key / 本地模型）
- CLIP / 开放词汇开源选型

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
│   │   ├── agent.py     # agent 契约透传（chat/asr/tts/narration/tour）
│   │   └── camera.py    # camera_poses / tp 查询
│   ├── services/        # 业务逻辑（scene 路由、scene_graph 加载、world 索引）
│   ├── data/            # 数据访问（读 mock、真实 scene_graph）
│   └── schemas/         # Pydantic 模型（对齐 SPEC 字段）
├── tests/               # 测试（对齐 SPEC 验收标准）
└── requirements.txt
```

## 4. 数据流（谁调谁，白盒）

```
A 前端 ──GET /api/scene/{world_id}──> backend 网关
A 前端 ──POST /api/agent/chat──────> backend 网关 ──转发──> B agent
A 前端 ──POST /api/camera/target───> backend 网关（或 A 本地查 camera_poses）
backend ──读 mock/real_0330/scene_graph.json / mock/scene_graph.json──> 返回 scene JSON
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
| 2026-08-27 | GET /api/scene/{world_id} | 按 world_id 路由 mock / real_0330，coord 校验 |

## 8. 与本仓库其他板块的关系

- `mock/`：场景数据来源（手写 + real_0330）
- `SPEC.md`：接口契约
- `docs/GIT_WORKFLOW.md`：Git 推送规则（backend 同样遵守）
- B 的 agent / A 的前端：通过本网关对接，不直接互连
