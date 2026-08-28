# 项目总览（PROJECT_OVERVIEW）

> **性质**：PI / 全队一页看全。接口字段仍以根目录 `SPEC.md` 为准；本文记板块、数据流与 demo 路径。  
> **日期**：2026-08-29 · **已合 `main` 的最终版**（含 `feat/agent-ux` 全部成果）。  
> **打开网页**：请用 **Cursor IDE 内置 Simple Browser / Preview** 打开 `http://localhost:5173`（步骤见根目录 [`README.md`](../README.md)）。  
> **不虚构**：未拍板的标 `# 待确认`。

---

## 一句话

第一人称 3DGS 看房 + 网关内 AI 置业顾问：5 套真实 InteriorGS 世界里走、被提问、主动讲卖点、按动线带看。

---

## 三板块

```
┌─────────────────┐     HTTP /api/*      ┌──────────────────────────────┐
│ A 前端 · Spark  │ ──────────────────► │ PI 后端网关 (FastAPI)         │
│ 视口 + HUD      │                      │  ├─ 理解层 GTProvider         │
│ （只打网关）     │ ◄────────────────── │  └─ agent 语义服务            │
└─────────────────┘                      └──────────────────────────────┘
        │                                              │
        │ ply 同域 /ply 或 VITE_SPLAT_*                │ mock/{scene}/ GT JSON
        ▼                                              ▼
  InteriorGS compressed ply                    scene_graph + camera_poses
                                               + listings.json
```

| 板块 | 目录 | 做什么 | 不做什么 | 唯一文档 |
|------|------|--------|----------|----------|
| **理解层 GT** | `backend/app/services/understanding/` | `GET /api/scene` 产出 `scene_graph`（GT 透传；Provider 可换双引擎） | 现场生成点云；demo 不依赖 SpatialLM | [`backend/README.md`](../backend/README.md) |
| **AI Agent** | `backend/app/services/agent/` | chat / asr / tts / narration / tour；只出 `tp_id` | 不感知点云坐标；根目录 `agent/`（队友 Node）不合并不改 | 同上 + [`AGENT_DEV.md`](./AGENT_DEV.md) |
| **前端 Spark** | `frontend/` | 命令式 THREE + Spark 出画、WASD、HUD、九接口播放 | 不改契约字段；ply 不入库 | [`frontend/docs/FRONTEND_ARCH.md`](../frontend/docs/FRONTEND_ARCH.md) |

三端只经网关对接，不直连。

---

## 数据流（ASCII）

```
浏览器
  │  Splash → HouseList
  │  列表  GET /api/listings[?layout=&price_min=&price_max=&q=]
  │  选房  GET /api/scene/{world_id}
  │        GET /api/camera_poses/{world_id}
  │  出画  /ply/{scene}.ply  或  VITE_SPLAT_URL_*
  │
  │  提问  POST /api/agent/chat     → reply_text + actions(tp_id)
  │  语音  POST /api/agent/asr      → text → 再 chat
  │        POST /api/agent/tts      → audio_url（常 stub 空）
  │  进房  GET  /api/agent/narration → 404 则 chat event=enter_room
  │  带看  POST /api/agent/tour     → steps[] → 依次 teleport + 讲解
  ▼
网关 FastAPI
  ├─ listings / scene / camera_poses  ← mock JSON
  └─ agent：规则版 chat（失败前可走方舟）+ 豆包 ASR/TTS Provider + stub 兜底
```

动作落地：agent **只出 `tp_id`** → 前端用当前 `world_id` 查 camera_poses（点云 Z-up）→ teleport / highlight。

---

## 9 接口 → SPEC

契约定义只在 `SPEC.md`。实现与用法见后端 / 前端唯一文档。

| # | 接口 | SPEC | 最终版 |
|---|------|------|-----------|
| 1 | `GET /api/listings` | §2.6 | 已接；可选筛选参数；失败前端硬编码兜底 |
| 2 | `GET /api/scene/{world_id}` | §2 | 已接；5 套 GT + `w_mock_001` |
| 3 | `GET /api/camera_poses/{world_id}` | §4.4 | 已接；逐场景表 |
| 4 | `POST /api/agent/chat` | §3.1 | 已接；可选 `listing_id` |
| 5 | `POST /api/agent/asr` | §3.2 | 已接；豆包 WS，失败 `{text:""}` |
| 6 | `POST /api/agent/tts` | §3.3 | 已接；默认 stub，常 omit `audio_url` |
| 7 | `GET /api/agent/narration` | §3.4 | 已接；前端进房优先打，404 回落 `enter_room` |
| 8 | `POST /api/agent/tour` | §3.5 | 已接；「开始带看」/ **B 键** 播放 |
| 9 | `POST /api/agent/recommend` | §3.6 | **只增**；问问小驻找房；非法 listing_id 丢弃；LLM 失败规则回落 |

错误体统一 `{code, message}`（SPEC §6）。

---

## 坐标（一句话）

**scene JSON 是 Y-up**（房屋中心原点，polygon 在 XZ）；**玩家 / ply / teleport 是点云 InteriorGS 原生 Z-up**。转换只发生在前端 `CLOUD_RULES`（或网关 tp 表）。公式：`scene(x,y,z) → [x+tx, ty−z, y]`。**禁止把 0330 的 0.573/1.087 套到其它世界。** 数值与验收见 SPEC **附录 A**。

---

## main 最终版（2026-08-29）

- 三层流转：Splash → 列表（筛选 + **问问小驻**）→ 2D 详情 → 3D
- 5 套真实世界切换出画（Spark 2.1 + three 0.180；命令式 rAF，不挂 R3F）
- 选房 listings + `listing_id` 挂牌优先；户型图真实 polygon、不画家具门窗
- chat Golden Path：问房间/家具 → `teleport(tp_id)`；小驻人设；当前房介绍；别名
- `show_card` HUD、`highlight` 点云光柱；PlaceFacts 去重
- 自主带看 tour + **B**；进房 narration；**M** 俯瞰定位；**V** 回起点
- `POST /api/agent/recommend` 只从真实 5 套荐 1 套
- 局域网：FastAPI 托管 `dist` + `/ply` 映射（ply 仍不入库）
- 理解层 GT；SpatialLM S0 **受阻**，demo 不依赖
- 演示打开方式：**Cursor 内置预览**（外置 Chrome 易卡，见根 README）

**# 待确认（不是未合功能）**

- 生产 ply 对象存储 bucket / 权限（未配则本地 `/ply` 或 3D 失败层）
- `0309` / `0836` 无独立客厅：`tp_living` 复用已对拍 `tp_kitchen`
- `0469` 无冰箱实例
- TTS 独立接口常返回 `{}`（chat 内 `tts_url` 才有声）
- SPEC §7 会话隔离：world 不一致是否 400 — **未改契约**
- 开源许可证若需非 MIT：替换根目录 `LICENSE`

---

## 分支状态

收官：`feat/agent-ux` **快进合入 `main` 并推送**（PI 授权）。演示以 `main` HEAD 为准。

远程可能仍留主题分支作历史指针。根目录 `agent/`（队友 Node）仍空，**不合并不改**。

UX 历轮说明：[`AGENT_UX_收官记录.md`](./AGENT_UX_收官记录.md)。

---

## 决策摘要（链出去）

| 主题 | 读 |
|------|-----|
| 接口字段 / 坐标附录 A | [`SPEC.md`](../SPEC.md) |
| 仓库地图 | [`REPO_STRUCTURE.md`](./REPO_STRUCTURE.md) |
| Git | [`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md) |
| 5 套 world + listing | [`FE_房源列表联调指南.md`](./FE_房源列表联调指南.md) |
| 前端对接 roadmap | [`FE_后端对接方案.md`](./FE_后端对接方案.md) |
| Agent 实现 / 真实 API | [`AGENT_DEV.md`](./AGENT_DEV.md) |
| 理解层重构 / SpatialLM | [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) |
| 前端视口 / HUD / 九接口用法 | [`frontend/docs/FRONTEND_ARCH.md`](../frontend/docs/FRONTEND_ARCH.md) |
| Agent UX 历轮 | [`AGENT_UX_收官记录.md`](./AGENT_UX_收官记录.md) |
| 后端边界 / 测试 / 里程碑 | [`backend/README.md`](../backend/README.md) |
| 局域网部署（P1） | [`DEPLOY_局域网.md`](./DEPLOY_局域网.md) |
| 开源 README / Cursor 预览 | [`../README.md`](../README.md) |

---

## 一条 demo 路径

1. **进入** — Cursor 打开仓库。终端：`cd frontend && npm run dev`；`cd backend && python -m uvicorn app.main:app --reload --port 8000`。前端 `.env.local`：`VITE_API_MODE=real`。命令面板 **Simple Browser: Show** → `http://localhost:5173`（详见根 README）。局域网：[`DEPLOY_局域网.md`](./DEPLOY_局域网.md)。
2. **Splash** — 品牌「小驻看房」/ inNest，点「进入看房」。
3. **HouseList** — `GET /api/listings`，卡片显示楼盘名 + 编号；可点 **问问小驻** 说需求 → 推荐 1 套 → 查看详情。
4. **详情弹窗** — 点卡片或推荐结果：2D 户型图（真实 polygon 墙体/功能配色，居中；不画家具；无门窗数据不编造）+ 挂牌介绍 + 房间清单；点「进入3D空间」才进漫游。
5. **3D WalkHud** — Spark 加载 ply；WASD + 鼠标（Pointer Lock）；左上 PlaceFacts +「返回列表」；右上「小驻AI·询问」；**M** 俯瞰图（去文字 + 当前位置光点）。
6. **带看** — 点「开始带看」或漫游中按 **B** → `POST /tour` 按 `steps[]` 走房；**每次切房强制拉回对应房间**（介绍期可走动）；再按 B 停止。
7. **提问** — HUD 输入「主卧在哪」→ chat 回 `reply_text` + `teleport(tp_bedroom_master)`；问家具可叠加 highlight / show_card。
8. **PTT** — 按住说话 → `POST /asr` → 识别文本自动送 chat；无权限或空文本则打字。

换房：先「返回列表」再选另一套；前端重置 `session_id`（SPEC 方案 A），不要把上一套 history 带到下一套。
