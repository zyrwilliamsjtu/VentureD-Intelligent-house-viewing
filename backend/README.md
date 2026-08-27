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
| （待填） | 后端初始化 | 建立骨架 |

## 8. 与本仓库其他板块的关系

- `mock/`：场景数据来源（手写 + real_0330）
- `SPEC.md`：接口契约
- `docs/GIT_WORKFLOW.md`：Git 推送规则（backend 同样遵守）
- B 的 agent / A 的前端：通过本网关对接，不直接互连
