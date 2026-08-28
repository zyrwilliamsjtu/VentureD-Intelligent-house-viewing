# AI 代看房 · 前端（VentureD 黑客松 48H）

仓库：`VentureD-Intelligent-house-viewing` · 目录：`frontend/` · 分支：`feat/frontend-spark`

第一人称 3D 漫游 + Agent 传送。桌面 Chrome / Edge 优先，适配 1280-1440。

> **接管/协作前必读：[WORKLOG.md](./WORKLOG.md)** —— 全程执行日志（时间线、关键决策 D1–D7、已验证事实、接管指引、跨域待办）。任何 AI 或人接手先读它。  
> **渲染层单一事实源：[docs/RENDER_ARCH.md](./docs/RENDER_ARCH.md)**（Spark 视口 / CLOUD_RULES / ply 托管）。对接 roadmap：`../docs/FE_后端对接方案.md`。

## 文档导航

| 你是 | 先读 |
|---|---|
| 改 3D / ply / 坐标 | **[docs/RENDER_ARCH.md](./docs/RENDER_ARCH.md)** |
| 后端 / Agent 同学 | **[docs/backend-handbook.md](./docs/backend-handbook.md)**（联调三步 + 数据字典 + 坐标铁律 + 已知坑） |
| 要实现 chat/asr 接口 | [docs/agent-api.md](./docs/agent-api.md)（Agent 契约实现版）+ 根目录 `SPEC.md` §3（唯一事实源） |
| 承接 Agent 板块（新执行方） | 根目录 **`docs/agent-handoff.md`**（自包含需求书：接口契约/坐标铁律/数据字典/路线图/自测清单） |
| 对接 tour / 信息卡 / 托管 | 根目录 **`docs/FE_后端对接方案.md`** |
| 改 UI | **`../docs/ui-handoff.md`**（护栏说明：store 只读字段/固定类名/层级约定/体验底线）+ WORKLOG D6 |

## 快速开始

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

默认 **mock 模式**：无需后端即可 WASD 漫游。出画走 **THREE 0.180 + Spark 2.1**（`SparkRenderer` + `SplatMesh`，命令式 rAF，**不挂 R3F**）。开发 ply 由 Vite 只读映射数据盘 `/ply/{scene}.ply`；生产配 `VITE_SPLAT_URL_*`（见 RENDER_ARCH）。

`.env.local`（不入库）需配置：

```
VITE_API_MODE=real                # 联调网关（tour/chat/scene）；留空 mock
VITE_WORLD_ID=w_0330_840483       # 缺省世界；选房 UI 会覆盖
# VITE_SPLAT_URL_w_0330_840483=   # 生产 ply；不填则 /ply 本地回落
```

参照 `.env.example` 复制填写。群核 Aholo API Key **已不再用于主视口**。

## 当前能力（全部跑通）

| 能力 | 说明 |
|---|---|
| 第一人称漫游 | WASD 移动 + 鼠标视角（Pointer Lock）+ Shift 快走 |
| 3DGS 点云渲染 | **Spark** `SplatMesh` 加载 InteriorGS compressed ply；5 套可切换 |
| 自主带看 | 「开始带看」→ `POST /api/agent/tour` → 依次 teleport + 讲解（可停止） |
| 体素碰撞 | splat-transform Voxel 产物（`public/collision/`）；InteriorGS 5 套默认关 |
| 点击传送 | 锁定时点击视线落点瞬移（解决关门房间不可达） |
| Agent 传送命令 | `store.teleportCmd` → 体素贴地校验 → 瞬移（已上线，等后端 chat 接口） |
| 坐标映射 | `scene/coords.ts`：scene(Y-up) ↔ 点云(IG 原生 Z-up)，对拍转正 |
| 房间归因 | 点云坐标 → scene 系 polygon point-in-polygon → `room_id` |
| 语音输入（PTT） | 按住说话 → `/api/agent/asr` → 识别文字自动发送（mock 轮换预设问题；权限拒绝/空文本降级） |
| 进房主动讲解 | `room_id` 切换防抖触发 `event=enter_room` → toast + TTS（每房间每会话一次） |

## 坐标系（对拍转正，2026-08-28）

**穿网关的坐标一律点云系：IG 原生、右手系、Z-up、米。**

```
scene(x,y,z) → 点云:  [ x + tx, ty − z, y ]
```

- **0330** 仍是 `tx=0.573, ty=1.087`（未改）。其它 4 套用各自 `origin.json`，禁止套 0330。
- 按 `world_id` 索引（`CLOUD_RULES`），未登记世界恒等降级（`room_id=null`）
- tp 表：`GET /api/camera_poses/{world_id}`（0330 可降级 `public/mock/real_0330/`）
- 完整表与 ply 回落见 [docs/RENDER_ARCH.md](./docs/RENDER_ARCH.md)

Agent 接口契约详见 `../docs/agent-api.md`（v1.1 对拍转正版）。

## 目录结构

```
src/
├── types/api.ts            # 接口契约类型（含 Agent 契约 v1.1；字段改动需群同步）
├── services/
│   ├── api.ts              # mock / real 一键切换
│   ├── aholo.ts            # 群核 Aholo API 客户端
│   └── mock/               # mock 数据加载（仓库 mock 为唯一事实源）
├── store/useAppStore.ts    # 全局状态（zustand）：player 上下文 / teleportCmd
├── scene/
│   ├── AholoViewport.tsx   # 命令式 Spark 视口（文件名历史包袱）
│   ├── worlds.ts           # 5 套 world_id ↔ ply URL
│   ├── voxel.ts            # 体素碰撞运行时查询
│   ├── coords.ts           # CLOUD_RULES / 房间归因 / tp 表
│   └── tourPlayer.ts       # 自主带看播放器
├── components/
│   └── WalkHud.tsx         # 漫游 HUD：房源信息 / 当前房间 / Agent 对话面板
├── services/
│   ├── agent.ts            # Agent 客户端：session_id + mock/real 双实现
│   ├── asr.ts              # 语音识别客户端（mock/real，10s 超时）
│   ├── tour.ts             # POST /api/agent/tour
│   └── recorder.ts         # PTT 录音器
├── scene/
│   ├── agentActions.ts     # Agent 动作执行器（teleport/show_card/highlight + TTS）
│   ├── narration.ts        # 进房主动讲解（room 切换 → enter_room → toast+TTS）
│   └── ...
└── _parked/                # 已下线的上帝视角+小安讲解代码，Agent 就绪后按需回迁
```

## Agent 接入状态

HUD 右上角 `AI 讲解 · 询问` 已接线为**真对话面板**（mock 模式实测通过）：

1. `services/agent.ts`：`VITE_API_MODE=mock|real` 一键切换；session_id 前端生成复用；real 走 `POST {VITE_API_BASE}/api/agent/chat`（30s 超时，错误顶层 `{code,message}`）
2. 请求自动携带玩家上下文：`player_position`/`player_facing`/`room_id`（视口每 200ms 节流发布到 store）
3. `actions` 执行（`scene/agentActions.ts`）：`teleport` → `resolveTeleportCloud` → 体素贴地瞬移；`show_card`/`highlight` → toast 承接（show_card 兼容平铺与 `data` 嵌套两种载荷）；`tts_url` 直接播放（失败静默）
4. 坐标铁律：后端收到什么坐标就原样回，**不要自己翻轴**；要下发 scene 系数据必须先按上节公式转点云系
5. mock 行为：按当前 world 的 scene_graph 匹配（房间名 / 20 类家具中文类别 / 户型元信息），动作引用真实 tp_id → 后端未就绪也能演示 Golden Path

## Git 协作（遵守团队规范）

- 只动 `frontend/`；不 push main、不用 `--force`、不提交密钥
- 分支 `dev/frontend`；commit 格式 `frontend: xxx`；push 前先 `git pull`
- `.env` / `.env.local` 已被 `.gitignore` 覆盖，只提交 `.env.example`

## TODO

- [x] Agent 对话面板接线（mock 实测通过；`.env.local` 改 `VITE_API_MODE=real` 切真后端）
- [x] `highlight` / `show_card` 动作执行（toast 承接）
- [x] TTS 播放（`tts_url` 直接播，失败静默）
- [x] ASR 录音按钮（PTT 按住说话，mock 轮换预设；等 `/api/agent/asr` 后端即切 real）
- [x] 进房主动讲解（`event=enter_room`，每房间每会话一次）
- [x] 部署 GitHub Pages（`.github/workflows/deploy-pages.yml`；首次需配 repo Secrets + Pages Source=GitHub Actions）
- [x] Spark 替换 LodSplat；5 套 CLOUD_RULES + ply 三级回落
- [x] 自主带看 `POST /api/agent/tour`（步 1）
- [ ] 步 2–5：highlight 3D / 信息卡 / narration GET / 对象存储（见 `docs/FE_后端对接方案.md`）
- [ ] UI 视觉重设计（护栏见 `../docs/ui-handoff.md`）
