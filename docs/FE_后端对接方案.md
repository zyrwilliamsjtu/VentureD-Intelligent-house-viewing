# 前端 × 后端对接方案（roadmap）

> **性质**：对接 roadmap（历史编号步 1–5）。**前端唯一文档**改为 [`../frontend/docs/FRONTEND_ARCH.md`](../frontend/docs/FRONTEND_ARCH.md)；项目总览 [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)。  
> **日期**：2026-08-28 · 对照 main `e10f7d7`（步 1–4 已合；步 5 ply 托管 **# 待确认** bucket）  
> **不改** SPEC 字段 / agent / 后端实现。

---

## 1. 现状盘点（8 条能力）

后端网关（`GET /api/scene` · `camera_poses` · `listings` + SPEC §3 五接口）已经能演示。前端命令式 Spark 视口 + 5 套切换已跑通。播放层步 1–4 已合 main；剩余见下表步 5。

| # | 能力 | 后端 | 前端 | 结论 |
|---|---|---|---|---|
| 1 | 场景语义 + 房间归因 | `GET /api/scene/{world_id}` | `loadRoomPolys` + `CLOUD_RULES` + `roomAtCloud` | **已接全** |
| 2 | 落点表 / teleport | `GET /api/camera_poses/{world_id}` | `loadTpTable` → `teleportCmd` | **已接全** |
| 3 | 五套选房 + 挂牌 | `GET /api/listings` | `worlds.ts` 芯片栏；chat 带 `listing_id` | **已接全** |
| 4 | 问答 + PTT + 进房讲解 | `POST /chat` · `/asr`；`event=enter_room` | WalkHud + `narration.ts` + TTS 播 `tts_url` | **已接全**（chat 内 TTS；独立 TTS 多为 stub） |
| 5 | **自主带看 tour** | `POST /api/agent/tour` → `{steps[]}` | 拉 steps → 依次 teleport + 讲解；**B 键**开关 | **已合 main** |
| 6 | 动作 3D 渲染 | chat `actions.highlight` | `tp_id` → camera_poses（点云 Z-up）→ 视口光柱标记 | **已合 main** |
| 7 | 信息卡 UI | `actions.show_card` | HUD `InfoCard`（title + lines，可关 / 6s 消失） | **已合 main** |
| 8 | 独立 narration + 错误/托管 | `GET /narration`；TTS provider；ply 对象存储 | 进房优先 GET，404 回落 `enter_room`；ply 本地 `/ply` | **步 4 已合 main**；步 5 bucket **# 待确认** |

步 1–4 已在 main。剩余缺口只有生产 ply 对象存储（骨架已在，未上传）。

---

## 2. 小步快走

后端此阶段**冻结**。每步只动 `frontend/`（及本文档），失败就降级，不改网关。

```
步 1 自主带看  →  步 2 动作渲染  →  步 3 信息卡  →  步 4 narration GET  →  步 5 错误/降级 + ply 托管
```

### 步 1 · 自主带看（本轮）

| | |
|---|---|
| **目标** | 点「开始带看」→ `POST /api/agent/tour` → 按 `steps[]` 依次 teleport + toast 讲解 + 可选 TTS；可停止；换世界用新 `world_id` |
| **时间** | 3–4h |
| **验收** | 0469：10 房走完（主卧讲解含 17.7㎡）；中途可停；换 0330 后 steps 换套；F12 无红错 |
| **止损** | tour 接口失败 → toast「带看暂不可用」，尝试用 `GET /api/scene` 的 `tour_path` 本地拼 steps；拼不出则只留按钮+提示。卡 >1h 停 |

实现要点：`services/tour.ts` + `scene/tourPlayer.ts`；复用 `resolveTeleportCloud` / `requestTeleport`；带看期间跳过 `enter_room` 防双讲。

### 步 2 · 动作渲染（已做）

| | |
|---|---|
| **目标** | `highlight` 点云落点 3D 光柱；`show_card` 独立信息卡 |
| **验收** | 0469「沙发在哪」teleport+光柱；「这套房多大」弹出 title+lines；0330「冰箱在哪」teleport+光柱 |
| **坐标** | **不用** scene_graph `instances[].position`。Agent 只出 `tp_id`，前端 `resolveTeleportCloud` 查当前 world 的 camera_poses（已是点云 Z-up），与 teleport 同源。 |
| **# 待确认** | 0469 **无冰箱实例**，问「冰箱多大」不会出卡（0330 有 `tp_refrigerator_582`）。沙发 attrs 常为空，卡上可能只有「没有更多信息」 |

### 步 3 · 信息卡

已并入步 2（`InfoCard`）。本节保留作历史编号。

### 步 4 · narration GET

**状态（main `80f4c76`）**：已合。进房优先 GET；404/失败回落 `enter_room`；带看中跳过。

| | |
|---|---|
| **目标** | 进房优先 `GET /api/agent/narration`；失败再回 chat `enter_room` |
| **验收** | 0469 进厨房有讲解；404 静默；session 去重不刷屏 |

### 步 5 · 错误/降级 + ply 托管

| | |
|---|---|
| **目标** | 统一 `{code,message}` 提示；`VITE_SPLAT_URL_*` 指向对象存储后 5 套出画；未配置仍 `/ply` |
| **时间** | 1–2h + **等 PI bucket** |
| **验收** | 配 URL 后切房出画；断网 tour/chat 有中文提示；无 ply/.env 入库 |
| **止损** | 存储位置未定 → 只保留骨架（已做），不上传 ply |

---

## 3. 坐标与 world 铁律（对接时勿破）

- Agent **只出 `tp_id`**，前端用**当前选中** `world_id` 查 camera_poses。
- 0330 的 `0.573/1.087` **禁止**套 0469/0259/0309/0836。
- **# 待确认**：生产 OSS/COS **未上传**。`0309`/`0836` 已补 `tp_living`（复用已对拍 `tp_kitchen`）。

---

## 4. 非目标（本 roadmap 不做）

- 改 WalkHud 对话协议、改 agent 规则版、改 SPEC、复制 ply 进 git、直 push main。
- 把视口改成 R3F `<Canvas>`。
- 编造缺失的 `tp_id` / 房间偏移。
