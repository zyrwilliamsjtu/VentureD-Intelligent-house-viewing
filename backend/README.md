# Backend 开发技术文档（PI 后端板块）

> 本文件是 backend 板块的**唯一总览**。项目一页见 [`docs/PROJECT_OVERVIEW.md`](../docs/PROJECT_OVERVIEW.md)；接口字段以根目录 [`SPEC.md`](../SPEC.md) 为准。  
> 实现细节（不在本文展开）：[`docs/AGENT_DEV.md`](../docs/AGENT_DEV.md) · [`docs/REFACTOR_PLAN.md`](../docs/REFACTOR_PLAN.md) · [`docs/REPO_STRUCTURE.md`](../docs/REPO_STRUCTURE.md)。  
> 任何代码结构、接口、数据流的变更：先更新本文件与 SPEC（若动契约）、再改代码。

## 1. 定位与边界

- 本板块由 **PI 负责**，提供三端统一后端网关。
- **职责**：
  - `GET /api/scene/{world_id}` — 理解层产出 `scene_graph`（当前 GTProvider；**5 套真实世界** + 手写 mock）
  - `GET /api/camera_poses/{world_id}` — `tp_id` → 点云坐标
  - `GET /api/listings` — 挂牌列表（`mock/listings.json`；可选查询 `layout` / `price_min` / `price_max` / `q`，无参返回全部；失败 500，前端硬编码兜底）
  - **agent 语义服务**：SPEC v2.3 的 `chat` / `asr` / `tts` / `narration` / `tour` / **`recommend`（只增）**（`backend/app/services/agent/`；chat 可选 `listing_id`）
  - 统一错误 `{code,message}`、CORS、会话透传
- **边界**：不做前端渲染（A）。根目录 `agent/`（队友 Node）**不合并不改**。Spark / ply 托管是前端的事，不进本板块、不进 SPEC。

健康检查：`GET /health`（无 `/api` 前缀）。

## 1.5 理解层（GT Provider 为主，双引擎为后续）

### 定位（决策记录：2026-08-28）

- 目标场景：**5 套真实 InteriorGS** + 手写 `w_mock_001`；未知 world → 404。不做现场生成。
- **最简方案（PI 拍板）**：砍掉 VLM / CLIP / 房间截图 / 双通道核验 / 俯视图几何划分，仅用 GT；**保留 Provider 接口**便于将来换双引擎。
- **GT 三重角色**：生产数据 / 评测真值 / 失败兜底。
- 对外 `GET /api/scene/{world_id}` 不变；理解层是内部实现。

### 产出

`scene_graph`（SPEC 三级：`house` / `rooms[]` / `instances[]` + `coord` + `tour_path` + `topology`）。

消费：agent 知识库；前端图纸（polygon / 标注）。当前 `GTProvider` 透传 mock JSON；`DualEngineProvider` 为占位。工厂：`UNDERSTANDING_PROVIDER`（默认 `gt`）。

### 极简 pipeline

```
读 GT（mock/real_0330 或 mock/{scene_id}）
  → 房间划分（GT rooms polygon）
  → 实例已在 GT 内（钩子只收集）
  → 组装 coord + tour_path + topology
```

代码：`backend/app/services/understanding/`。

### 重构状态

SpatialLM **S0 受阻**（flash-attn 编译 OOM），降级为可选加分；demo **永不依赖**理解层真引擎。阶段账本：`docs/REFACTOR_PLAN.md`。后续主线 = agent。

## 1.6 AI agent（网关内模块）

- **拍板**：Python 做在网关内 `backend/app/services/agent/`，与理解层解耦。
- **本阶段**：chat 接方舟推理接入点（`chat/completions`）；ASR 豆包 WebSocket；TTS 豆包 V3 SeedTTS2.0。细节与变量名见 `docs/AGENT_DEV.md` §13。
- **人设**：规则版 / 带看 speech / LLM prompt 自称「**小驻**」（不编造事实，只改口吻）。「介绍这个房间」走当前 `room_id` 快路径；睡觉/看书等别名见 `synonyms.py`。无 `room_id` 时当前房介绍回落引导。**# 待确认**：某房无邻接/家具则介绍句自然省略，不硬凑。
- **铁律**：只出 scene 已有 `tp_id`；**不输出 `position`**；不翻轴。挂牌问答走 `listing_id`（优先于 scene_graph `house` 占位）。
- key **只在 `backend/.env`、不入库**。

### 真实 API + 降级链（demo 不挂）

```
chat：规则版始终先跑 → 方舟 chat/completions（失败则 responses）成功才替换 reply_text
      失败/未配置 → 保持规则版；actions 仍由规则版产出

recommend：方舟 8s 结构化 {listing_id,reason} → 校验 ∈ 真实 5 套；失败/未配置 → 关键词规则版
           # 待确认：AGENT_ROUTE_MODEL lite 未开通时仅规则版

ASR： volcengine WebSocket（ffmpeg → pcm16k，超时 10s）→ stub {text:"", duration_ms:0}

TTS： volcengine V3 HTTP Chunked（超时 15s）+ 同文本缓存 → {}（omit audio_url）
```

热切换：改 `.env` 的 `*_PROVIDER` 后重启 uvicorn。pytest 默认 stub，避免 CI 打外网；真实冒烟需 `AGENT_LIVE_VOICE=1`。

## 1.7 五套 world 表

| scene_id | world_id | GT 目录 | listing_id |
|----------|----------|---------|------------|
| `0330_840483` | `w_0330_840483` | `mock/real_0330/` | `listing_0330_840483` |
| `0469_840829` | `w_0469_840829` | `mock/0469_840829/` | `listing_0469_840829` |
| `0259_840804` | `w_0259_840804` | `mock/0259_840804/` | `listing_0259_840804` |
| `0309_840544` | `w_0309_840544` | `mock/0309_840544/` | `listing_0309_840544` |
| `0836_841149` | `w_0836_841149` | `mock/0836_841149/` | `listing_0836_841149` |

另：`w_mock_001` ← `mock/scene_graph.json`（开发基线，无真实挂牌则 chat 可不带 `listing_id`）。未知 id → `WORLD_NOT_FOUND`。

偏移**逐场景**标定，禁止套用 0330 的 0.573/1.087。点云 **Z-up**（SPEC 附录 A）。

**# 待确认（数据事实，未编造）**：`0469` 无冰箱实例。`0309`/`0836` 无独立客厅，`tp_living` 复用已对拍 `tp_kitchen`。

## 2. 技术栈与运行

- 语言/框架：Python + FastAPI
- 入口：`app/main.py`
- 配置：`.env`（**不入库**）；样例 `.env.example` 只列变量名
- 运行：`uvicorn app.main:app --reload`（仓库根或 `backend/` 视 PYTHONPATH；以现有开发习惯为准）

## 3. 目录结构

```
backend/
├── README.md            # 本文档（板块唯一总览）
├── app/
│   ├── main.py          # FastAPI 入口 + 路由注册 + GET /health
│   ├── config.py
│   ├── routers/
│   │   ├── scene.py     # GET /api/scene/{world_id}
│   │   ├── listings.py  # GET /api/listings（可选 layout/price_min/price_max/q）
│   │   ├── agent.py     # chat|asr|tts|narration|tour
│   │   └── camera.py    # camera_poses
│   ├── services/
│   │   ├── understanding/  # Provider + GT 管线
│   │   └── agent/          # 规则版 chat + ASR/TTS/LLM Provider
│   ├── data/            # 读 mock
│   └── schemas/         # GatewayError；scene/agent 响应未用 Pydantic 校验（可选增强）
├── tests/
└── requirements.txt
```

## 4. 数据流

```
A 前端 ──GET /api/listings──> mock/listings.json
A 前端 ──GET /api/scene/{world_id}──> 理解层 GT ──> agent 知识库 / 前端图纸
A 前端 ──GET /api/camera_poses/{world_id}──> mock camera_poses.json
A 前端 ──POST chat|asr|tts|tour|recommend / GET narration──> services.agent
```

## 5. 接口契约对齐

- **以 `SPEC.md` 为唯一接口事实源**。路由、字段、错误码必须与 v2.3 一致。
- 新增/修改接口：先改 SPEC → 通知全员 → 再改代码。
- 渲染实现（Spark）不进 SPEC。

## 6. 白盒化约定

1. 每次改动可解释。
2. 不写黑盒逻辑。
3. 不留死代码。
4. 敏感信息零入库。
5. 测试对齐 SPEC 验收（coord、错误码）。
6. 重大变更在本文件「变更记录」登记。

## 7. 测试现状

`backend/tests/`（pytest + FastAPI TestClient；默认不打外网）：

| 文件 | 覆盖 |
|------|------|
| `test_scene.py` / `test_camera.py` / `test_listings_multiworld.py` | 场景 / tp 表 / 5 套 listings |
| `test_understanding.py` | GT Provider 管线 |
| `test_agent_gateway.py` / `test_agent_service.py` / `test_agent_chat.py` | 契约层 + 规则版 chat |
| `test_agent_chat_llm.py` | 方舟路径（可 mock） |
| `test_agent_asr.py` / `test_asr_volcengine.py` | ASR；live 用例需 `AGENT_LIVE_VOICE=1` |
| `test_agent_tts.py` / `test_tts_volcengine.py` | TTS；live 同上 |
| `test_agent_tour_narration.py` | tour `steps[]` + narration 去重 |
| `acceptance/test_backend_acceptance.py` | L1 契约 + L2 数据 |
| `acceptance/test_agent_full_link.py` | agent 全链路（可 skip 无 key） |

跑：`cd backend && python -m pytest tests/ -q`。不把 live 语音当 CI 必过。本文不虚构某一时刻的 passed 条数。

## 8. 里程碑

| ID | 内容 | 状态 |
|----|------|------|
| 理解层 GT | 5 套 scene_graph 经网关可取 | ✅ |
| SpatialLM S0 | 部署验证 | 🔴 受阻（见 REFACTOR_PLAN） |
| M0 | agent 骨架 + stub | ✅ |
| M1 | 规则版 chat（intent → grounding → actions） | ✅ |
| M2 | narration 去重 + `handle_tour` / `build_tour` | ✅ |
| M3 | router 与契约测试 | ✅ |
| P0 ASR | 豆包 WS 真识别（ffmpeg→pcm16k） | ✅ |
| P1 TTS | V3 SeedTTS2.0 | ⏳ 已冒烟；独立接口常 `{}` |
| P2 chat LLM | 方舟 ep `chat/completions` | ⏳ 失败回规则版 |

前端消费（main 已接，不在本目录改）：tour 播放、show_card、highlight、narration GET、B 键。见 `frontend/docs/FRONTEND_ARCH.md`。

## 9. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-08-27 | 后端初始化 | FastAPI 骨架 |
| 2026-08-28 | 理解层产出显式化 | scene_graph 为 PI 核心产出 |
| 2026-08-28 | camera / agent 网关 | camera_poses；agent 五路由 |
| 2026-08-28 | M1–M2 agent | 规则版 chat；tour + narration |
| 2026-08-28 | S0 受阻 | SpatialLM 止损；demo 继续 GT |
| 2026-08-28 | 真实 API | 方舟 chat + 豆包 ASR/TTS + stub |
| 2026-08-28 | 多世界 + listings | 5 套索引；`listing_id`；SPEC v2.3 |
| 2026-08-28 | 文档升格 | 本文改为板块唯一总览；链 AGENT_DEV / REFACTOR_PLAN |
| 2026-08-29 | listings 筛选 | `GET /api/listings` 可选 `layout`/`price_min`/`price_max`/`q`（只增；无参兼容） |
| 2026-08-29 | 楼盘名 + code | listings `title` 改为楼盘名；只增 `code`（0330 等编号） |

## 10. 与其他板块

- `mock/`：GT 与 listings
- `SPEC.md`：接口契约（字段语义）
- `docs/GIT_WORKFLOW.md`：Git
- `docs/AGENT_DEV.md`：agent 实现 / 凭证变量 / live 测试
- `docs/REFACTOR_PLAN.md`：理解层阶段账本
- `docs/REPO_STRUCTURE.md`：仓库目录地图（参考；可能落后）
- 前端：只经本网关；架构见 `frontend/docs/FRONTEND_ARCH.md`
