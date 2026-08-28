# 项目总览（PROJECT_OVERVIEW）

> **性质**：PI / 全队一页看全。接口字段仍以根目录 `SPEC.md` 为准；本文只记 **main 已落地** 的板块、数据流与 demo 路径。  
> **日期**：2026-08-28 · 对照 `origin/main` `e10f7d7`（含 narration GET + B 键）  
> **不虚构**：未合 main 的标 `# 待合入`；未拍板的标 `# 待确认`。

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
        │ ply 本地 /ply 或 VITE_SPLAT_*                │ mock/{scene}/ GT JSON
        ▼                                              ▼
  InteriorGS compressed ply                    scene_graph + camera_poses
                                               + listings.json
```

| 板块 | 目录 | 做什么 | 不做什么 | 唯一文档 |
|------|------|--------|----------|----------|
| **理解层 GT** | `backend/app/services/understanding/` | `GET /api/scene` 产出 `scene_graph`（GT 透传；Provider 可换双引擎） | 现场生成点云；demo 不依赖 SpatialLM | [`backend/README.md`](../backend/README.md) |
| **AI Agent** | `backend/app/services/agent/` | chat / asr / tts / narration / tour；只出 `tp_id` | 不感知点云坐标；根目录 `agent/`（队友 Node）不合并不改 | 同上 + [`AGENT_DEV.md`](./AGENT_DEV.md) |
| **前端 Spark** | `frontend/` | 命令式 THREE + Spark 出画、WASD、HUD、8 接口播放 | 不改契约字段；ply 不入库 | [`frontend/docs/FRONTEND_ARCH.md`](../frontend/docs/FRONTEND_ARCH.md) |

三端只经网关对接，不直连。

---

## 数据流（ASCII）

```
浏览器
  │  开场  GET /api/listings
  │  进房  GET /api/scene/{world_id}
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

## 8 接口 → SPEC

契约定义只在 `SPEC.md`。实现与用法见后端 / 前端唯一文档。

| # | 接口 | SPEC | main 状态 |
|---|------|------|-----------|
| 1 | `GET /api/listings` | §2.6 | 已接；失败前端硬编码兜底 |
| 2 | `GET /api/scene/{world_id}` | §2 | 已接；5 套 GT + `w_mock_001` |
| 3 | `GET /api/camera_poses/{world_id}` | §4.4 | 已接；逐场景表 |
| 4 | `POST /api/agent/chat` | §3.1 | 已接；可选 `listing_id` |
| 5 | `POST /api/agent/asr` | §3.2 | 已接；豆包 WS，失败 `{text:""}` |
| 6 | `POST /api/agent/tts` | §3.3 | 已接；默认 stub，常 omit `audio_url` |
| 7 | `GET /api/agent/narration` | §3.4 | 已接；前端进房优先打，404 回落 `enter_room` |
| 8 | `POST /api/agent/tour` | §3.5 | 已接；「开始带看」/ **B 键** 播放 |

错误体统一 `{code, message}`（SPEC §6）。

---

## 坐标（一句话）

**scene JSON 是 Y-up**（房屋中心原点，polygon 在 XZ）；**玩家 / ply / teleport 是点云 InteriorGS 原生 Z-up**。转换只发生在前端 `CLOUD_RULES`（或网关 tp 表）。公式：`scene(x,y,z) → [x+tx, ty−z, y]`。**禁止把 0330 的 0.573/1.087 套到其它世界。** 数值与验收见 SPEC **附录 A**。

---

## main 已绿（对照 HEAD `e10f7d7`）

- 5 套真实世界切换出画（Spark 2.1 + three 0.180；命令式 rAF，不挂 R3F）
- 选房 listings + `listing_id` 挂牌优先
- chat Golden Path：问房间/家具 → `teleport(tp_id)` 瞬移
- `show_card` HUD 卡、`highlight` 点云光柱
- 常驻房源/房间卡 PlaceFacts
- 自主带看 tour + 漫游中 **B** 键开关
- 进房讲解：GET narration → 回落 `enter_room`
- 理解层 GT；SpatialLM S0 **受阻**，demo 不依赖（见 `REFACTOR_PLAN.md`）

**# 待确认（不是未合分支）**

- 生产 ply 对象存储 bucket / 权限（骨架 `VITE_SPLAT_*` 已在；未配则本地 `/ply`）
- `0309` / `0836` 无 `tp_living`（camera_poses 事实，未编造）
- `0469` 无冰箱实例
- TTS 独立接口常返回 `{}`（chat 内 `tts_url` 才有声）
- SPEC §7 会话隔离：world 不一致是否 400 — **未改契约**，当前覆盖写入

---

## 分支状态

任务 0 已把 `feat/narration-hud`（`80f4c76` + `e10f7d7`）快进合入 `main` 并推送。演示相关功能分支均已在 main 上，**无 `# 待合入` 功能残留**。

远程仍留着已合过的主题分支（`feat/frontend-spark`、`feat/agent-actions`、`feat/room-info-card`、`feat/narration-hud` 等），仅作历史指针，不要当未交付缺口。

根目录 `agent/`（队友 Node）仍空，**不合并不改**。

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
| 前端视口 / HUD / 8 接口用法 | [`frontend/docs/FRONTEND_ARCH.md`](../frontend/docs/FRONTEND_ARCH.md) |
| 后端边界 / 测试 / 里程碑 | [`backend/README.md`](../backend/README.md) |

---

## 一条 demo 路径

1. **进入** — `cd frontend && npm run dev`；`cd backend && uvicorn app.main:app --reload`。前端 `.env.local`：`VITE_API_MODE=real`（联调网关）。
2. **选房** — 开场页拉 `GET /api/listings`，点一套（如 0469）。
3. **3D** — Spark 加载 ply；WASD + 鼠标（Pointer Lock）；左上 PlaceFacts 显示挂牌 + 当前房间。
4. **带看** — 点「开始带看」或漫游中按 **B** → `POST /tour` 按 `steps[]` 走房；再按 B 停止。
5. **提问** — HUD 输入「主卧在哪」→ chat 回 `reply_text` + `teleport(tp_bedroom_master)`；问家具可叠加 highlight / show_card。
6. **PTT** — 按住说话 → `POST /asr` → 识别文本自动送 chat；无权限或空文本则打字。

换房：前端重置 `session_id`（SPEC 方案 A），不要把上一套 history 带到下一套。
