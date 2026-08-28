# AI 代看房 · 前端（VentureD 黑客松 48H）

仓库：`VentureD-Intelligent-house-viewing` · 目录：`frontend/`

第一人称 3DGS 漫游 + 网关 Agent（传送 / 带看 / 讲解 / PTT）。桌面 Chrome / Edge 优先。

> **前端唯一文档：[`docs/FRONTEND_ARCH.md`](./docs/FRONTEND_ARCH.md)** — 视口、坐标、HUD（PlaceFacts / InfoCard / TourBar / B 键）、8 接口用法。  
> **项目总览**：[`../docs/PROJECT_OVERVIEW.md`](../docs/PROJECT_OVERVIEW.md)。接口字段：根目录 [`SPEC.md`](../SPEC.md)。  
> **接管日志**：[`WORKLOG.md`](./WORKLOG.md)（决策史；先读 FRONTEND_ARCH 再查时间线）。

## 文档导航

| 你是 | 先读 |
|---|---|
| 任何人（前端） | **[docs/FRONTEND_ARCH.md](./docs/FRONTEND_ARCH.md)** |
| 改 3D / ply / 坐标 | 同上（旧稿 [docs/RENDER_ARCH.md](./docs/RENDER_ARCH.md) 仅对照） |
| 后端 / Agent 同学 | 根目录 `SPEC.md` + [`../backend/README.md`](../backend/README.md)；联调笔记 [docs/backend-handbook.md](./docs/backend-handbook.md)（部分落后，以 SPEC / FRONTEND_ARCH 为准） |
| 对接 roadmap | [`../docs/FE_后端对接方案.md`](../docs/FE_后端对接方案.md) |
| 改 UI 护栏 | [`../docs/ui-handoff.md`](../docs/ui-handoff.md) + WORKLOG |

## 快速开始

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

默认 **mock 模式**：无需后端即可 WASD 漫游。出画走 **THREE 0.180 + Spark 2.1**（命令式 rAF，**不挂 R3F**）。开发 ply：`/ply/{scene}.ply`（Vite 只读映射数据盘，禁止 ply 入库）。生产配 `VITE_SPLAT_URL_*`（见 FRONTEND_ARCH）。

`.env.local`（不入库）：

```
VITE_API_MODE=real                # 联调网关；留空 mock
VITE_WORLD_ID=w_0330_840483       # 缺省世界；选房 UI 会覆盖
# VITE_SPLAT_URL_w_0330_840483=   # 生产 ply；不填则 /ply 本地回落
```

参照 `.env.example`。群核 Aholo API Key **已不再用于主视口**。

## 当前能力（main 已跑通）

| 能力 | 说明 |
|---|---|
| 第一人称漫游 | WASD + Pointer Lock + Shift 快走 |
| 3DGS | Spark `SplatMesh`；5 套可切换 |
| 自主带看 | 「开始带看」或 **B** → `POST /api/agent/tour` |
| Agent 动作 | `teleport` / `show_card`（InfoCard）/ `highlight`（点云光柱） |
| 常驻信息 | PlaceFacts：挂牌 + 当前房间 `story_card` |
| 进房讲解 | GET `/api/agent/narration`，失败回落 `enter_room` |
| 坐标 / 归因 | scene Y-up ↔ 点云 Z-up；5 套 `CLOUD_RULES`；`player.room_id` |
| PTT | 按住 → `/api/agent/asr` → 自动 chat |

细节与待确认项见 FRONTEND_ARCH §7，不在此重复。

## Git

遵守 [`../docs/GIT_WORKFLOW.md`](../docs/GIT_WORKFLOW.md)：只 add 自己的文件；不提交 `.env` / ply。
