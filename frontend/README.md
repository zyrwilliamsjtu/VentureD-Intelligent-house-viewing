# AI 代看房 · 前端（VentureD 黑客松 48H）

仓库：`VentureD-Intelligent-house-viewing` · 目录：`frontend/` · 分支：`dev/frontend`

第一人称 3D 漫游 + Agent 传送。桌面 Chrome / Edge 优先，适配 1280-1440。

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
| 第一人称漫游 | WASD 移动 + 鼠标视角（Pointer Lock）+ Shift 快走 |
| 3DGS 点云渲染 | `@manycore/aholo-viewer` LodSplat，分块多级 LOD，视锥调度 |
| 体素碰撞 | splat-transform Voxel 产物（`public/collision/`），胶囊推出 + 贴地 |
| 点击传送 | 锁定时点击视线落点瞬移（解决关门房间不可达） |
| Agent 传送命令 | `store.teleportCmd` → 体素贴地校验 → 瞬移（已上线，等后端 chat 接口） |
| 坐标映射 | `scene/coords.ts`：scene(Y-up) ↔ 点云(IG 原生 Z-up)，对拍转正 |
| 房间归因 | 点云坐标 → scene 系 polygon point-in-polygon → `room_id` |

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
│   └── WalkHud.tsx         # 漫游 HUD：房源信息 / 当前房间 / Agent 占位按钮
└── _parked/                # 已下线的上帝视角+小安讲解代码，Agent 就绪后按需回迁
```

## Agent 接入状态

HUD 右上角 `AgentStub` 是占位按钮。后端 `/api/agent/chat` 就绪后：

1. `AgentChatRequest`（`types/api.ts`）字段已备好，`player_position`/`player_facing`/`room_id` 视口每 200ms 节流发布到 store
2. `actions.teleport` 的执行链路已通：`resolveTeleportCloud`（`scene/coords.ts`）→ `requestTeleport`（store）→ 视口体素贴地 → 瞬移
3. 坐标铁律：后端收到什么坐标就原样回，**不要自己翻轴**；要下发 scene 系数据必须先按上节公式转点云系

## Git 协作（遵守团队规范）

- 只动 `frontend/`；不 push main、不用 `--force`、不提交密钥
- 分支 `dev/frontend`；commit 格式 `frontend: xxx`；push 前先 `git pull`
- `.env` / `.env.local` 已被 `.gitignore` 覆盖，只提交 `.env.example`

## TODO

- [ ] `AgentStub` 接入真实 `/api/agent/chat`（等后端 P0 接口）
- [ ] `highlight` / `show_card` 动作执行（占位待做）
- [ ] TTS 播放（`tts_url` 直接播，无则调后端 tts 接口）
- [ ] 部署 GitHub Pages（`vite.config.ts` 已设 `base: './'`）
