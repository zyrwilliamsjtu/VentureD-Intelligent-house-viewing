# 仓库结构文档（REPO_STRUCTURE）

> **高层总览改读 [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)**。前端唯一文档 [`frontend/docs/FRONTEND_ARCH.md`](../frontend/docs/FRONTEND_ARCH.md)；后端唯一总览 [`backend/README.md`](../backend/README.md)。  
> **性质**：目录地图（参考）。部分段落仍描述早期 main（如 Aholo / agent 目录尚空），**以三份唯一文档 + `SPEC.md` 为准**，本文不臆测补全。
> **标注**：不确定处写 **待确认**，不自行判断。

---

## 0. 仓库总览

产品：输入一句话或视频生成/重建一套房，AI 置业顾问在 3D 房里带看、答问、讲卖点。

三板块通过 **backend 网关**对接，不直接互连：

```
A 前端 (React/Vite)  ──HTTP──►  backend 网关 (FastAPI)
B agent (Python，目录尚空) ──待接入──►  backend /api/agent/*
PI 理解层 (GTProvider → scene_graph)  在 backend 内部
```

| 路径 | 职责 | CODEOWNERS |
|------|------|------------|
| `backend/` | 理解层 + 场景/相机接口 + agent 契约网关 | `@zyrwilliamsjtu`（PI） |
| `frontend/` | 第一人称 3D 漫游 + Agent 对话 HUD | `@XT0018R`（A） |
| `agent/` | 销售 agent（目前仅 `.gitkeep`） | `@jimmy723`（B） |
| `mock/` | 场景与 agent 样例数据 | `@zyrwilliamsjtu` |
| `SPEC.md` | 全队唯一接口事实源（v2.2） | `@zyrwilliamsjtu` |
| `docs/` | 工作流、交接、本结构文档 | 见各文件 |

分支（以 `docs/GIT_WORKFLOW.md` 为准，**待确认** 文中仍写 `dev-frontend`，远程实际前端分支为 `origin/dev/frontend`）：

```
main              ← 演示版，可运行
  ├── dev-backend   ← PI 后端
  ├── dev-agent     ← B 的 agent
  └── origin/dev/frontend  ← A 的前端（带斜杠）
```

另有远程 `origin/dev-frontend`（仅含测试文件 `frontend/hello.md`），**不要与 `dev/frontend` 混淆**。

---

## 1. 根目录文件

| 文件 | 作用 |
|------|------|
| `README.md` | 项目简介 + 顶层目录；接口指向 `SPEC.md` |
| `SPEC.md` | **接口契约唯一事实源**（v2.2）：坐标、scene_graph、agent chat/asr/tts、camera_poses、错误码 |
| `CODEOWNERS` | 目录责任制；PR 自动请求对应负责人审查 |
| `.gitignore` | Python venv / `.env`、Node `node_modules`/`dist`、IDE；**不入库密钥与大 ply** |
| `.github/workflows/deploy-pages.yml` | 推 `main` 或 `dev/frontend` 且改动 `frontend/**` 时，构建前端并部署 GitHub Pages（需 repo Secrets） |

`README.md` 中 mock 的「待对拍」标注相对前端 WORKLOG（已对拍转正）可能落后——**待确认**是否与 `mock/real_0330/SOURCE.md` 对齐后再改 README（本任务不改 README）。

---

## 2. `backend/` — 网关 + 理解层

单一事实源：`backend/README.md`。技术栈：**Python + FastAPI**，入口 `app/main.py`，运行 `uvicorn app.main:app --reload`。

### 2.1 职责与边界

- **做**：`GET /api/scene/{world_id}`、`GET /api/camera_poses/{world_id}`、`GET /api/listings`、agent 契约（chat/asr/tts/narration/tour）、统一错误 `{code,message}`、CORS。
- **不做**：agent 语义（B）、前端渲染（A）。

理解层当前默认 `GTProvider`（读 `mock/real_0330`）；`UNDERSTANDING_PROVIDER=dual_engine` 为未来占位。对外格式始终 SPEC v2.2。重构路线见 `docs/REFACTOR_PLAN.md`（本分支有，**main 上尚无此文件**）。

### 2.2 目录

```
backend/
├── README.md
├── .env.example          # 配置样例；真实 .env 不入库
├── requirements.txt
├── app/
│   ├── main.py           # FastAPI 入口、CORS、异常处理；GET /health
│   ├── config.py         # CORS_ORIGINS、UNDERSTANDING_PROVIDER
│   ├── routers/
│   │   ├── scene.py      # GET /api/scene/{world_id}
│   │   ├── camera.py     # GET /api/camera_poses/{world_id}
│   │   └── agent.py      # POST /api/agent/chat|asr|tts；GET narration/tour（stub）
│   ├── services/
│   │   ├── scene_service.py
│   │   ├── camera_service.py
│   │   └── understanding/    # Provider 工厂 + GT 管线
│   ├── data/             # 读 mock scene_graph / camera_poses
│   └── schemas/          # GatewayError（scene/agent 响应未用 Pydantic 校验）
└── tests/                # 对齐 SPEC：scene / camera / agent stub / understanding / acceptance
```

健康检查是 **`GET /health`**（无 `/api` 前缀），与前端 `realApi.ts` 的 `/api/health` **不一致**（见 §3.6）。

---

## 3. `frontend/` — Web 客户端（main `b2cec81`）

### 3.1 技术栈（以 `package.json` / `vite.config.ts` / `tsconfig.json` 为准）

| 项 | 实际 |
|----|------|
| 包名 | `ai-house-tour-frontend` 0.1.0 |
| 语言 | TypeScript 5.6，`strict: true`，`jsx: react-jsx`，include 仅 `src`，**exclude `src/_parked`** |
| 框架 | React 18.3 + Vite 5.4（`@vitejs/plugin-react`） |
| 3D | `@manycore/aholo-viewer` ^1.8.1（当前视口） |
| 状态 | zustand ^4.5.5 |
| 其它依赖 | `three` / `@react-three/fiber` / `@react-three/drei` **仍在 package.json**，main 上无使用它们的 src 文件——**待确认**是否为旧上帝视角残留、可否卸 |
| 脚本 | `npm run dev`（Vite 5173）、`build`（`tsc && vite build`）、`preview` |
| 部署 | `base: './'`，可挂任意子路径 / GitHub Pages |
| Dev 代理 | `server.proxy['/api']` → `VITE_API_BASE` 或 `http://127.0.0.1:8000`（同源免 CORS） |

环境：复制 `frontend/.env.example` 为 `.env.local`（不入库）。关键变量：`VITE_API_MODE`（mock/real）、`VITE_API_BASE`（空=同源）、`VITE_AHOLO_*`、`VITE_WORLD_ID`。

### 3.2 目录职责（main 上实际文件，无 `_parked/`）

```
frontend/
├── index.html
├── package.json / package-lock.json / tsconfig.json / vite.config.ts
├── .env.example / .gitignore / .gitkeep
├── README.md / WORKLOG.md
├── docs/
│   ├── agent-api.md           # Agent 契约实现版（v1.1）
│   └── backend-handbook.md    # 联调手册（步骤 + 数据字典 + 已知坑）
├── public/
│   ├── collision/             # splat-transform Voxel：voxel.bin + voxel-meta.json
│   └── mock/                  # 静态可 fetch 的 scene_graph / camera_poses / timeline
│       └── real_0330/         # 0330 真实数据副本（与仓库根 mock/ 同源意图）
└── src/
    ├── main.tsx / App.tsx / styles/global.css / vite-env.d.ts
    ├── components/            # Splash 开场页、WalkHud 漫游 HUD
    ├── scene/                 # Aholo 视口、碰撞、坐标、Agent 动作/进房讲解
    ├── services/              # 网关 / Agent / ASR / Aholo / mock|real
    ├── store/useAppStore.ts   # zustand 全局态
    └── types/api.ts           # TS 契约类型
```

`frontend/.gitkeep` 在前端落地后仍在——**待确认**是否删除。  
`tsconfig` 排除 `src/_parked`，且 main **未合入**任何 `_parked/` 文件；`frontend/README.md` 目录树仍写 `_parked/`（代码在 `origin/dev/frontend`）——**待确认** README 是否应改为「未合入 main」。

### 3.3 关键文件

**入口**

| 文件 | 作用 |
|------|------|
| `index.html` | 挂载 `#root`，加载 `/src/main.tsx` |
| `src/main.tsx` | `createRoot` + `StrictMode`；dev 下把 `__appStore` 挂 `window` 便于 console 联调 |
| `src/App.tsx` | 拉房源 → `AholoViewport` + 未进入时 `Splash` + 进入后 `WalkHud` |

`App.tsx` 写死 `HOUSE_ID = 'w_mock_001'`（注释：仓库 mock 唯一事实源），而视口 `AholoViewport` 用 `VITE_WORLD_ID`（README 示例 `w_0330_840483`）。**两套 world id 并存——待确认**是否有意（mock 户型卡 vs 0330 点云）。

**场景**

| 文件 | 作用 |
|------|------|
| `src/scene/AholoViewport.tsx` | 群核 Viewer：LOD 点云、WASD+Pointer Lock、体素碰撞、点击传送、订阅 `teleportCmd`、每 200ms 发布玩家上下文到 store |
| `src/scene/voxel.ts` | 读取 `public/collision/`，胶囊推出 + 贴地 |
| `src/scene/coords.ts` | scene(Y-up) ↔ 点云(IG Z-up)；`CLOUD_RULES` 仅登记 `w_0330_840483`；房间 polygon 归因；`resolveTeleportCloud`（tp_id 查表） |
| `src/scene/agentActions.ts` | 执行 Agent `teleport` / `show_card` / `highlight`（highlight 降级 toast）；播放 `tts_url` |
| `src/scene/narration.ts` | `room_id` 切换防抖 → `event=enter_room` → toast + TTS；每房间每会话一次 |

`coords.ts` 注释引用 `docs/0330-align-report.md`，**仓库内无此文件**——**待确认**是外置报告还是未入库。

**组件 / 状态 / 样式**

| 文件 | 作用 |
|------|------|
| `src/components/Splash.tsx` | 开场页；点击进入并尝试 Pointer Lock |
| `src/components/WalkHud.tsx` | 漫游 HUD：房源信息 / 当前房间 / Agent 对话与 PTT（以 README + 文件存在为准） |
| `src/store/useAppStore.ts` | `entered`、`house`、`player`、`teleportCmd`、toast；坐标约定为点云系 |
| `src/styles/global.css` | 全局样式 |

**服务**

| 文件 | 作用 | 实际请求 |
|------|------|----------|
| `src/services/api.ts` | mock/real 开关；`getHouse` / `getTour` / `sendChat` | real 失败时 `getHouse` **降级 mock**（注释写明后端无 `/api/houses`） |
| `src/services/realApi.ts` | 旧「House」契约客户端 | `GET /api/houses/{id}`、`GET /api/houses/{id}/tour`、`POST /api/chat`、`GET /api/health` |
| `src/services/agent.ts` | SPEC Agent 客户端；session_id 前端生成 | `POST /api/agent/chat`（JSON，30s）；mock 按 scene_graph 关键词 + 真实 tp_id |
| `src/services/asr.ts` | 语音识别 | `POST /api/agent/asr`（multipart，10s）；mock 轮换「主卧在哪 / 冰箱在哪 / 这套房多大」 |
| `src/services/recorder.ts` | PTT `MediaRecorder`（webm/mp4，≤15s） | 无 HTTP |
| `src/services/aholo.ts` | 群核开放平台：生成/重建/列表/世界详情 | `https://api.aholo3d.cn`（`VITE_AHOLO_GATEWAY`） |
| `src/services/mock/data.ts` | 从 `public/mock/` 加载并适配为 `House` 类型 | fetch 静态 JSON |
| `src/services/mock/index.ts` | 旧 chat/tour mock（`fly_to_zone` 等动作） | 给 `api.ts` 用，**不是** `agent.ts` 的 mock |

`aholo.ts` 注释引用 `docs/aholo-kb/openapi.yaml`，**仓库内无此路径**——**待确认**。

**类型**

`src/types/api.ts` 同时包含：

1. **旧 House 模型**：`House` / `Zone` / `HouseObject` / `CameraAction`（`fly_to_zone` 等）/ `ChatRequest` — 给 `api.ts` / HUD 户型卡。
2. **SPEC Agent 模型**：`AgentChatRequest` / `AgentChatResponse` / `AgentAction`（`teleport`/`highlight`/`show_card`）/ `AsrResponse`。

改字段需与 `SPEC.md` 及群同步。

**静态资源**

- `public/collision/voxel.bin`（约 344 KB）+ `voxel-meta.json`：碰撞网格。
- `public/mock/*.json`：前端可直接 `fetch`；与仓库根 `mock/` **内容同源意图**，合入时未覆盖根目录 `mock/`。

### 3.4 与后端 / SPEC 的对接点

**已对齐 SPEC v2.2、走网关（`agent.ts` / `asr.ts`）**

| 前端 | 方法 | 后端现状 |
|------|------|----------|
| `agentChat` | `POST /api/agent/chat` | stub：校验 session/world，返回固定 `reply_text` |
| `agentAsr` | `POST /api/agent/asr` | stub：返回 `text: ""` |
| （未在 src 中搜到独立调用） | `POST /api/agent/tts`、narration/tour | 后端有 stub；前端 TTS 主要播响应里的 `tts_url` |

`VITE_API_BASE` 为空时用相对路径 `/api/...`，dev 经 Vite 代理到 8000。

**未走当前网关 / 与 SPEC 不一致（`realApi.ts`）**

| 前端调用 | SPEC / 后端实际 |
|----------|-----------------|
| `GET /api/houses/{id}` | 无此路由；场景是 `GET /api/scene/{world_id}` |
| `GET /api/houses/{id}/tour` | 无；tour 在 `/api/agent/tour`（stub） |
| `POST /api/chat` | 应为 `POST /api/agent/chat` |
| `GET /api/health` | 后端是 `GET /health` |

`api.ts` 已注明 realGetHouse 常态降级 mock，**不阻塞进入漫游**；Agent 对话仍走 `agent.ts`。是否废弃 `realApi.ts` 旧路径——**待确认**（本任务不改前端）。

**前端未直接调用、但 SPEC/后端已提供**

- `GET /api/scene/{world_id}`：前端 mock 模式读 `public/mock/`；real 户型走旧 `/api/houses`。
- `GET /api/camera_poses/{world_id}`：前端传送用 `public/mock/.../camera_poses.json`（`coords.ts`），**未见**调用后端 camera_poses——**待确认** real 模式是否应改为打网关。

坐标铁律（与 SPEC 附录 A / `coords.ts` 一致）：穿网关的 `player_position` / `actions.position` 为点云系 **Z-up**；后端不要自行翻轴。

### 3.5 前端技术文档入口

| 文档 | 给谁 | 内容 |
|------|------|------|
| `frontend/README.md` | 全员 / 接手前端 | 快速开始、能力表、坐标公式、目录、Agent 状态、TODO |
| `frontend/WORKLOG.md` | 接手执行 | 时间线、决策 D1–D6、验证事实、跨域待办 |
| `frontend/docs/backend-handbook.md` | PI / B 联调 | 五分钟跑前端、接口优先级、数据字典、已知坑 |
| `frontend/docs/agent-api.md` | 实现 chat/asr 的人 | Agent 契约实现版（动作语义、降级矩阵） |
| `docs/agent-handoff.md` | 新 Agent 执行方 | 自包含需求书 |
| `docs/ui-handoff.md` | 改 UI | 固定类名 / store 只读 / 层级 / 体验底线 |
| `SPEC.md` | 全队 | 字段级唯一事实源 |

---

## 4. `agent/`

仅 `agent/.gitkeep`。业务逻辑待 B 接入网关；接口形状见 `SPEC.md` §3 与 `backend/app/routers/agent.py` stub。

---

## 5. `docs/`

| 文件 | 在哪条分支 | 作用 |
|------|------------|------|
| `GIT_WORKFLOW.md` | main + 本分支 | Git 分支/提交/禁止 force；Cursor 必守 |
| `agent-handoff.md` | **main**（`b2cec81`） | Agent 板块自包含交接 |
| `ui-handoff.md` | **main** | UI 重设计护栏 |
| `REFACTOR_PLAN.md` | **仅 dev-backend**（尚未合 main） | 理解层 S0–S5：GT → SpatialLM/几何 |
| `REPO_STRUCTURE.md` | **本文件**（dev-backend 起草） | 仓库结构 |

未跟踪（工作区有、未 git add）：`docs/SpatialLM_接入方案.md`、`SpatialLM_白盒报告.md`、`SpatialLM_部署指南.md`、`docs/backend_验收报告.md`。与 S0 / 验收相关，**待确认**入库时机。

---

## 6. `mock/`

仓库根 mock 是 **backend 理解层与契约测试** 的数据源；前端另有 `frontend/public/mock/` 供浏览器静态加载。

| 路径 | 作用 |
|------|------|
| `scene_graph.json` | 手写基线，`world_id = w_mock_001` |
| `camera_poses.json` | tp_id → 点云坐标（w_mock_001） |
| `agent_responses.json` | agent 接口响应样例 |
| `listings.json` | `GET /api/listings` 挂牌列表（5 套真实，snake_case） |
| `CONVERT_PIPELINE.md` | 0330 标准转换链路（已参数化）+ 硬编码点 |
| `real_0330/scene_graph.json` | InteriorGS 0330 → SPEC，`w_0330_840483` |
| `real_0330/camera_poses.json` | 对拍转正 tp 表（见 `SOURCE.md`） |
| `real_0330/SOURCE.md` | 数据来源、坐标映射、转换脚本路径 |
| `real_0330/fix_poses.py` / `final_check.py` | 0330 对拍遗留（硬编码偏移，勿用于新场景） |
| `0469_840829/` | 场景 0469：scene_graph / camera_poses / SOURCE.md |
| `0259_840804/` | 场景 0259（同上） |
| `0309_840544/` | 场景 0309（同上） |
| `0836_841149/` | 场景 0836（同上） |
| `tools/` | 参数化转换：make_scene_graph / calibrate / fix_poses / final_check |

原始 ply / labels **不入库**（见 `SOURCE.md`，数据盘路径）。

---

## 7. 未跟踪（工作区，未入库）

以下出现在当前工作区 `git status`，**不属于** `b2cec81` 合入范围，本任务不 add：

| 路径 | 说明 |
|------|------|
| `SpatialLM/` | 上游 SpatialLM 源码树；`REFACTOR_PLAN` S0 部署验证用 |
| `docs/SpatialLM_*.md` | 接入方案 / 白盒报告 / 部署指南 |
| `docs/backend_验收报告.md` | 后端验收记录 |
| `scripts/convert_supersplat_to_ply.py` | SuperSplat 压缩 ply → 标准 xyzrgb ply（输出写数据盘） |
| `外网受限环境_克隆与权重下载指南.md` | 根目录操作说明 |

**待确认**：哪些进 git、是否应进 `.gitignore`（尤其 `SpatialLM/` 体积与第三方代码）。

---

## 8. 技术文档索引

按「我要干什么」查表。契约冲突时以 **`SPEC.md` 为准**。

| 你要… | 先读 |
|--------|------|
| 仓库有哪些目录、前后端怎么接 | **本文** `docs/REPO_STRUCTURE.md` |
| 改接口 / 对字段 | `SPEC.md`（先改 SPEC 再改代码） |
| 跑后端 / 理解层架构 | `backend/README.md` |
| 跑前端 / 环境变量 | `frontend/README.md` + `.env.example` |
| 前端接手、决策史 | `frontend/WORKLOG.md` |
| 联调网关 + Agent | `frontend/docs/backend-handbook.md` |
| 实现 chat/asr 行为 | `frontend/docs/agent-api.md` + `SPEC.md` §3 |
| 新执行方做 Agent | `docs/agent-handoff.md` |
| 改 HUD/CSS 且不打穿漫游 | `docs/ui-handoff.md` |
| 0330 数据从哪来、坐标怎么转 | `mock/real_0330/SOURCE.md` + `SPEC.md` 附录 A |
| Git 怎么推 | `docs/GIT_WORKFLOW.md` |
| 理解层从 GT 换成真引擎 | `docs/REFACTOR_PLAN.md`（当前仅 dev-backend） |
| 谁审哪块 PR | `CODEOWNERS` |

---

## 9. 待确认汇总（PI）

1. `realApi.ts` 旧路径（`/api/houses`、`/api/chat`、`/api/health`）是否废弃，改为只走 `/api/scene` + `/api/agent/*` + `/health`。
2. 前端是否应 real 模式调用 `GET /api/camera_poses/{world_id}`，而不是只读 `public/mock`。
3. `App.tsx` 的 `w_mock_001` 与 `VITE_WORLD_ID=w_0330_840483` 如何统一。
4. `package.json` 里 `three` / r3f 是否仍需要。
5. `docs/0330-align-report.md`、`docs/aholo-kb/openapi.yaml` 是否存在于仓外、要不要入库。
6. main 上 `frontend/.gitkeep`、README 中的 `_parked/` 描述。
7. `GIT_WORKFLOW.md` 分支名 `dev-frontend` vs 实际 `dev/frontend`。
8. 未跟踪 SpatialLM / 验收文档 / 脚本的入库策略。
9. `docs/REFACTOR_PLAN.md` 何时合 main。

---

## 10. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-28 | 初稿：仓库总览 + backend/frontend/docs/mock/根文件/未跟踪 + 文档索引；前端按 main `b2cec81` 42 个新增文件（排除 `_parked/`）分析 |
| 2026-08-28 | mock 补 4 套真实场景 + listings.json；转换链路见 `mock/CONVERT_PIPELINE.md` |
