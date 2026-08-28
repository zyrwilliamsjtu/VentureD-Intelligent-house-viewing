# AI 代看房 · 前端（VentureD 黑客松 48H）

仓库：`VentureD-Intelligent-house-viewing` · 目录：`frontend/` · 分支：`dev/frontend`

第一人称 3D 漫游 + Agent 传送。桌面 Chrome / Edge 优先，适配 1280-1440。

> **接管/协作前必读：[WORKLOG.md](./WORKLOG.md)** —— 全程执行日志（时间线、关键决策 D1-D6、已验证事实、接管指引、跨域待办）。任何 AI 或人接手先读它。

## 文档导航

| 你是 | 先读 |
|---|---|
| 后端 / Agent 同学 | **[docs/backend-handbook.md](./docs/backend-handbook.md)**（联调三步 + 数据字典 + 坐标铁律 + 已知坑） |
| 要实现 chat/asr 接口 | [docs/agent-api.md](./docs/agent-api.md)（Agent 契约实现版）+ 根目录 `SPEC.md` §3（唯一事实源） |
| 想了解界面（设计语言/页面/全部文案/素材） | **[docs/ui-design.md](./docs/ui-design.md)**（UI 唯一整理稿） |
| 想了解产品架构（系统/前端/后端/数据流） | **`../docs/architecture.md`**（五级 Mermaid 架构图） |
| 承接 Agent 板块（新执行方） | 根目录 **`docs/agent-handoff.md`**（自包含需求书：接口契约/坐标铁律/数据字典/路线图/自测清单） |
| 改 UI | **`../docs/ui-handoff.md`**（护栏说明：store 只读字段/固定类名/层级约定/体验底线）+ WORKLOG D6 |

## 快速开始

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

默认 **mock 模式**：无需后端即可漫游（群核 Aholo Viewer + 3DGS 点云 + LOD 流式 + 体素碰撞）。

`.env.local`（不入库）需配置：

```
VITE_AHOLO_API_KEY=xxx            # labs.aholo3d.cn 申请
VITE_AHOLO_LOD_META_URL=xxx       # World API 返回的 lodMetaPath
VITE_AHOLO_VOXEL_META_URL=/collision/voxel-meta.json
VITE_WORLD_ID=w_0330_840483       # 对拍世界 ID，见 scene/coords.ts
```

参照 `.env.example` 复制填写。

## 当前能力（全部跑通）

| 能力 | 说明 |
|---|---|
| 高端落地页 | 对齐 LuxeEstate Demo：白玻璃吸顶导航 / 实景 Hero / 玻璃搜索卡（位置·户型·价格筛选，真联动列表）/ 数据条 / 精选房源图卡 / 顾问团 / 预约表单 / 深色页脚 |
| 实景素材 | 首页精选卡封面用用户效果图、列表卡户型图用用户平面图（`public/assets/`，`src/data/houseImages.ts` 映射；缺图自动回退 Unsplash/点云 SVG） |
| 性能优化 | 落地页纯 DOM 不挂 3D 引擎（不下载点云），列表页暂停点云渲染，进漫游秒开（见 WORKLOG 阶段 22） |
| 第一人称漫游 | WASD 移动 + 鼠标视角（Pointer Lock）+ Shift 快走 |
| 3DGS 点云渲染 | `@manycore/aholo-viewer` LodSplat，分块多级 LOD，视锥调度 |
| 体素碰撞 | splat-transform Voxel 产物（`public/collision/`），胶囊推出 + 贴地 |
| 点击传送 | 锁定时点击视线落点瞬移（解决关门房间不可达） |
| Agent 传送命令 | `store.teleportCmd` → 体素贴地校验 → 瞬移（已上线，等后端 chat 接口） |
| 坐标映射 | `scene/coords.ts`：scene(Y-up) ↔ 点云(IG 原生 Z-up)，对拍转正 |
| 房间归因 | 点云坐标 → scene 系 polygon point-in-polygon → `room_id` |
| 语音输入（PTT） | 按住说话 → `/api/agent/asr` → 识别文字自动发送（mock 轮换预设问题；权限拒绝/空文本降级） |
| 进房主动讲解 | `room_id` 切换防抖触发 `event=enter_room` → toast + TTS（每房间每会话一次） |

## 坐标系（对拍转正，2026-08-28）

**穿网关的坐标一律点云系：IG 原生、右手系、Z-up、米。**

```
scene(x,y,z) → 点云:  [ x + 0.573, 1.087 − z, y ]
点云(X,Y,Z) → scene:   [ X − 0.573, Z, 1.087 − Y ]
```

- 对拍依据：`labels.json` 500 实例交叉验证，75/75 tp 点 <2cm，房间锚点 7/7 落位
- 按 `world_id` 索引（`scene/coords.ts` 的 `CLOUD_RULES`），未登记世界恒等降级（`room_id=null`）
- tp 表：`public/mock/real_0330/camera_poses.json`（85 点，点云系）

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
│   ├── AholoViewport.tsx   # 3D 视口：LOD+碰撞+传送+Agent 上下文发布
│   ├── voxel.ts            # 体素碰撞运行时查询
│   └── coords.ts           # 坐标映射 / 房间归因 / tp 表（对拍转正）
├── components/
│   └── WalkHud.tsx         # 漫游 HUD：房源信息 / 当前房间 / Agent 对话面板
├── services/
│   ├── agent.ts            # Agent 客户端：session_id + mock/real 双实现
│   ├── asr.ts              # 语音识别客户端（mock/real，10s 超时）
│   └── recorder.ts         # PTT 录音器（webm/mp4 自动探测，≤15s）
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
3. `actions` 执行（`scene/agentActions.ts`）：`teleport` → `resolveTeleportCloud` → 体素贴地瞬移；`show_card`/`highlight` → toast 承接（show_card 兼容平铺与 `data` 嵌套两种载荷）；`tts_url` 直接播放（失败静默；相对 `/static/...` 已做 dev 代理 + 直连前缀解析，见 WORKLOG 阶段 23）
4. 坐标铁律：后端收到什么坐标就原样回，**不要自己翻轴**；要下发 scene 系数据必须先按上节公式转点云系
5. mock 行为：按当前 world 的 scene_graph 匹配（房间名 / 20 类家具中文类别 / 户型元信息），动作引用真实 tp_id → 后端未就绪也能演示 Golden Path

### 后端接口对账清单（2026-08-28 · `origin/main` 真实后端）

| 后端接口 | 前端接入点 | 状态 |
|---|---|---|
| `GET /health` | —（未使用，非必需） | 未接（无需） |
| `GET /api/scene/{world_id}` | `services/api.ts getHouse` | ✅ |
| `GET /api/listings` | `services/listings.ts` | ✅ |
| `GET /api/camera_poses/{world_id}` | `scene/coords.ts loadTpTable` | ✅ |
| `POST /api/agent/chat` | `services/agent.ts agentChat` | ✅ |
| `POST /api/agent/asr` | `services/asr.ts agentAsr` | ✅ |
| `POST /api/agent/tts` | `services/agent.ts synthesizeTts` | ✅ |
| `GET /api/agent/narration` | `services/agent.ts getNarration` | ✅ |
| `POST /api/agent/tour` | `services/agent.ts getTour` | ✅ |
| `GET /static/tts/*`（TTS 产物） | `scene/agentActions.ts playTts` | ✅（已补 dev 代理 + 相对路径解析） |

唯一发现并已修复的缺口：后端 TTS/chat 返回**相对** `/static/tts/*.mp3`，前端此前直接 `new Audio()` 会打到前端端口 404。现已加 `/static` vite 代理 + `VITE_API_BASE` 前缀解析（见 WORKLOG 阶段 23）。

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
- [ ] 后端 `/api/agent/chat` 就绪后联调（`VITE_API_MODE=real` + `VITE_API_BASE`）
- [x] UI 视觉重设计（LuxeEstate 浅色奢华落地页 + 列表页同风格，见 WORKLOG 阶段 20）
- [ ] 后端 `/api/agent/chat` 真实 key 就绪后全链路联调（ASR/TTS 已接好，`VITE_API_MODE=real` 即切）
