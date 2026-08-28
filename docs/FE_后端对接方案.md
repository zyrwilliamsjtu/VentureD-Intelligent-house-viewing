# 前端 × 后端对接方案（roadmap）

> **性质**：后端管线已冻结阶段下，前端如何把网关能力接到视口/HUD。不改 SPEC / agent / 后端实现。  
> **日期**：2026-08-28 · 前端分支 `feat/frontend-spark`  
> **渲染事实源**：`frontend/docs/RENDER_ARCH.md`

---

## 1. 现状盘点（8 条能力）

后端网关（`GET /api/scene` · `camera_poses` · `listings` + SPEC §3 五接口）已经能演示。前端命令式 Spark 视口 + 5 套切换已跑通。缺口在**播放层**，不是再造语义。

| # | 能力 | 后端 | 前端 | 结论 |
|---|---|---|---|---|
| 1 | 场景语义 + 房间归因 | `GET /api/scene/{world_id}` | `loadRoomPolys` + `CLOUD_RULES` + `roomAtCloud` | **已接全** |
| 2 | 落点表 / teleport | `GET /api/camera_poses/{world_id}` | `loadTpTable` → `teleportCmd` | **已接全** |
| 3 | 五套选房 + 挂牌 | `GET /api/listings` | `worlds.ts` 芯片栏；chat 带 `listing_id` | **已接全** |
| 4 | 问答 + PTT + 进房讲解 | `POST /chat` · `/asr`；`event=enter_room` | WalkHud + `narration.ts` + TTS 播 `tts_url` | **已接全**（chat 内 TTS；独立 TTS 多为 stub） |
| 5 | **自主带看 tour** | `POST /api/agent/tour` → `{steps[]}` | 步 1：拉 steps → 依次 teleport + 讲解 | **步 1 接通** |
| 6 | 动作 3D 渲染 | chat `actions.highlight` | 仅 toast | **缺口** → 步 2 |
| 7 | 信息卡 UI | `actions.show_card` | 仅 toast | **缺口** → 步 3 |
| 8 | 独立 narration + 错误/托管 | `GET /narration`；TTS provider；ply 对象存储 | 未打 GET；ply 仅本地 `/ply` 回落 | **缺口** → 步 4–5 |

已接全 4 条（语义/落点/选房/问答）。缺口 4 条（tour 播放刚接、highlight、信息卡、narration GET + 托管/降级）。

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

### 步 2 · 动作渲染

| | |
|---|---|
| **目标** | `highlight` 在点云落点出现可见标记（sprite/环），不挡漫游 |
| **时间** | 2–3h |
| **验收** | 问「冰箱在哪」除 teleport 外有标记；无 tp 则仍 toast |
| **止损** | 标记与 Z-up 对不齐 → 退回 toast，不改 coords 公式 |

### 步 3 · 信息卡

| | |
|---|---|
| **目标** | `show_card` 用独立卡片（标题 + lines），不再挤 2.6s toast |
| **时间** | 1.5–2h |
| **验收** | 问答弹出的卡可手动关；带看 selling_points 可进卡 |
| **止损** | 与 HUD z-index 冲突 → 只加宽 toast，不重做 WalkHud |

### 步 4 · narration GET

| | |
|---|---|
| **目标** | 进房优先 `GET /api/agent/narration`；失败再回 chat `enter_room` |
| **时间** | 1–2h |
| **验收** | 0469 进厨房有讲解；404 静默；session 去重不刷屏 |
| **止损** | GET 与 chat 文案不一致 → 保持现 chat 路径，GET 标 **# 待确认** |

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
- **# 待确认**：0309/0836 无 `tp_living`；生产 OSS/COS **未上传**。

---

## 4. 非目标（本 roadmap 不做）

- 改 WalkHud 对话协议、改 agent 规则版、改 SPEC、复制 ply 进 git、直 push main。
- 把视口改成 R3F `<Canvas>`。
- 编造缺失的 `tp_id` / 房间偏移。
