# 执行日志 WORKLOG · 前端 + 坐标对拍

> **目的：白盒化。** 任何 AI 或人接管前，先读本文档 + `frontend/README.md`。
> 维护规则：每完成一个阶段/做出一个关键决策，追加一节；不删旧记录，只标记作废。
> 最后更新：2026-08-28 · 维护人：前端（@XT0018R）· 协作 AI：TRAE

---

## 0. 如何使用本文档

| 你是谁 | 看哪节 |
|---|---|
| 接管前端开发的 AI/人 | §2 状态快照 → §6 接管指引 → §5 已验证事实 |
| 后端/Agent 队友 | §4 决策记录 D3/D5（坐标铁律）→ §7 跨域待办 |
| 查历史上下文 | §3 时间线 |
| PI | §7 跨域待办（有两个待你处理的数据问题） |

---

## 1. 项目一句话

AI 代看房（48H 黑客松）：第一人称 3DGS 点云漫游 + Agent 语音带看。前端渲染/漫游/传送已全部跑通，等后端 chat 接口点亮 Agent。

---

## 2. 状态快照（2026-08-28）

| 项 | 状态 |
|---|---|
| 分支 | `dev/frontend`（基于 origin/main 718547c 新建） |
| 最新 commit | `frontend: 第一人称漫游全量落地（…）` 48 文件 9617 行 |
| 构建 | `npm run build` ✓（tsc + vite 均过） |
| 漫游 | ✓ WASD + 鼠标视角（Pointer Lock）+ Shift 快走 |
| 渲染 | ✓ Aholo Viewer LodSplat 分块 LOD 流式 |
| 碰撞 | ✓ 体素胶囊推出 + 贴地（`public/collision/`） |
| 点击传送 | ✓ 视线落点瞬移（关门房间可达） |
| Agent 传送链 | ✓ `teleportCmd` → 体素贴地 → 瞬移（mock 已实测触发） |
| 坐标映射 | ✓ 对拍转正（见 D3） |
| 房间归因 | ✓ polygon point-in-polygon → `room_id` |
| Agent 对话 | ✓ **已接线**（mock 模式 7/7 步浏览器实测通过；`VITE_API_MODE=real` 切后端） |
| **语音输入（PTT）** | ✓ **已上线**（按住说话 → asr → 自动发送；mock 轮换预设问题；沙箱实测降级路径，录音全流程待真机） |
| show_card / highlight | ✓ toast 承接（show_card 兼容平铺/嵌套两种载荷） |
| TTS 播放 | ✓ `tts_url` 直播（失败静默降级） |
| 卡点 | 后端 `/api/agent/chat` 真实现（B 侧 dev-agent 零进度）+ `/api/agent/asr` + CORS |

---

## 3. 时间线

### 阶段 1 · 框架搭建
React + Vite + Three.js 骨架；语音改按钮触发录制（非实时流）；规划 MOSS API（ASR/TTS/多模态，后端封装）。

### 阶段 2 · 架构转向（重要）
从上帝视角带看转向**第一人称漫游**；下线 AI 讲解（旧代码归档 `_parked/`），UI 留占位块等 Agent；UI 与逻辑解耦（见 D6）。

### 阶段 3 · 群核 API 接入
接入 Aholo Viewer（3DGS 渲染）；确认坐标系单位（米/毫米、Y-up/Z-up 差异）；生成 30s 测试 mock 参数；同步仓库 mock 为唯一事实源。

### 阶段 4 · 第一人称落地
Pointer Lock + WASD；AABB 碰撞（后升级为体素）；程序化户型生成（语义 JSON → 墙/分区/家具）；LOD 流式渲染配置（官方 Preset 效果优先）。

### 阶段 5 · 坐标对拍（0330，本项目最大技术风险点）
1. 先尝试 RenderCloud 对拍 → **失败废弃**（见 D2，28 次实验）
2. 改为前端查看器内对拍（SPEC 附录 A）
3. PI 提供 0330 数据集：chunked PLY（官方 splat-transform 解码）+ `labels.json`(500 实例) + `structure.json`
4. 交叉验证确定映射公式（见 D3），旧 `(x,-y,z)` 草稿作废
5. 产出 `camera_poses_fixed.json`（85 tp 点，点云系）

### 阶段 6 · Agent 契约 v1.1 + 链路落地
`types/api.ts` 契约类型（`AgentChatRequest/Response/Action`）；`scene/coords.ts` 坐标映射/房间归因/tp 表模块；store 加 `player` 上下文（200ms 节流发布）+ `teleportCmd`；视口订阅执行传送；`docs/agent-api.md` 升 v1.1。

### 阶段 7 · 验证与入库
75/75 物体 tp 复核 <2cm；7/7 房间锚点落位；构建通过；推送 `dev/frontend`（沙箱无 git 凭证，走 bundle 交付，见 §6.4）。

### 阶段 8 · Agent 接线（2026-08-28）
`AgentStub` 占位 → 真对话面板（`WalkHud.tsx`）。新增 `services/agent.ts`（session_id 管理 + mock/real 双实现，30s 超时，错误 `{code,message}`）与 `scene/agentActions.ts`（动作执行器 + TTS 播放）。mock 按当前 world 的 scene_graph 关键词匹配（房间名 → 传送+卡；20 类家具中文类别 → 传送+属性卡；元信息问答），动作引用真实 tp_id → 后端未就绪也能演练 Golden Path。浏览器实测 7/7 步通过（见 §5）。

### 阶段 16 · PI 网关联调打通（2026-08-28 深夜）
PI 交付：scene/camera_poses 真实现 + agent 路由契约层 stub（chat 返回固定文案、asr 空文本，语义逻辑待 Agent AI 接入）。联调发现并修三处：
1. **real 模式进入被锁死**：`api.ts getHouse` 打旧契约路径 `/api/houses/{id}`（后端只有 `/api/scene/`），失败即 `houseError` 禁用进入按钮。修复：real 失败自动降级本地 mock（house 本为前端展示数据），进入永不阻塞，Agent 仍走网关。
2. **跨源 fetch 失败**：浏览器对回环地址的页面级 fetch 被 CORS/代理拦（导航可通、fetch 不通）。修复：`vite.config.ts` 加 `server.proxy`（`/api` → `127.0.0.1:8000`），`agent.ts`/`asr.ts` BASE 默认空=同源相对路径，`VITE_API_BASE` 仅跨机直连时填。**本机联调从此零 CORS 配置**。
3. 修复过程中引入的 `@vite/plugin-react` 手误（少 js）导致 dev 起不来，字节级排查后已改回。
实测（后端 uvicorn + 前端 real）：CORS 预检✓、chat 200 收到 stub 回复✓、asr multipart✓、错误格式 `{code,message}`✓、scene/camera_poses 数据与 tp 表一致✓、console 无红错✓。`/api/houses` 404 降级为预期行为。
联调方式已写入 `.env.example` 注释（BASE 留空走代理）。

### 阶段 14 · 进房主动讲解 + dev 调试钩子（2026-08-28 深夜）
`scene/narration.ts`：订阅 `player.room_id` 切换（视口 200ms 节流发布的 polygon 归因），防抖 700ms 触发 `agentChat(event='enter_room')`，回答 toast（房间名+讲解词）+ TTS；每房间每会话只讲一次（Set 去重防踱步刷屏），失败静默；未对拍世界 room_id=null 自然不触发（D3 恒等降级兼容）。`agent.ts` 导出 `loadScene` 复用做房间名映射。`main.tsx` 加 dev-only `window.__appStore` 调试钩子（生产构建不含，联调测试用）。浏览器实测：触发/单房间去重/切房触发全过，console 无红错（防抖快速切换未自动化，逻辑为计时器清除，人工复核即可）。

### 阶段 15 · Pages 部署 + UI 护栏（2026-08-28 深夜）
`.github/workflows/deploy-pages.yml`：推 main/dev/frontend 自动构建部署 GitHub Pages（vite `base:'./'` 已就绪）；env 从 repo Secrets 注入（VITE_AHOLO_API_KEY 等 4 项，见 workflow 头注释，首次需 Settings→Pages 选 GitHub Actions）。`docs/ui-handoff.md`：UI 重设计护栏（store 只读字段表、固定类名清单、pointer-events 层级不许破坏、事件绑定原样保留、体验底线清单、自测命令），交给 UI AI 防其改坏已实测链路。

### 阶段 12 · 语音按钮上线（2026-08-28 深夜）
按住说话（PTT）→ `POST /api/agent/asr` → 识别文字自动发送走 chat 链路。`_parked/audio/recorder.ts` 回迁为 `services/recorder.ts`（PttRecorder，webm/mp4 自动探测）；新增 `services/asr.ts`（mock/real 双实现，asr 超时 10s 按 SPEC §0；mock 轮换「主卧在哪/冰箱在哪/这套房多大」演练 Golden Path）；`WalkHud.tsx` 抽出 `sendText()` 统一发送入口 + voice 状态机（pressSeq 防授权期孤儿录音、<300ms 误触丢弃、15s 自动停、`{"text":""}` 按「没听清」toast）；`types/api.ts` 追加 `AsrResponse`。CSS 类名 `voice-btn/voice-recording` 固定，UI 重设计只改样式。浏览器实测：打字链路无回归、权限拒绝降级 toast 正确、console 无红错；沙箱无麦克风，录音全流程待真机复测（本机 localhost 或 Pages HTTPS 均满足 getUserMedia 安全上下文）。

### 阶段 13 · 修 resume-overlay 遮挡 AI 入口（2026-08-28 深夜）
测试语音按钮时发现的**既有 bug**：全屏 `resume-overlay` 在 DOM 末尾且无 z-index，指针未锁定时（如 ESC 后）物理遮挡"AI 讲解 · 询问"按钮，点击只会触发指针锁定、面板永远打不开。修复：`hud-tr` z-index:23、`resume-overlay` 显式 z-index:21，层叠意图显式化。复测面板可正常展开。

### 阶段 11 · B 板块交接（2026-08-28 晚）
B 无法继续合作，agent 板块转由 A+PI 承接。整理自包含需求书 `docs/agent-handoff.md`（接口契约、坐标铁律、数据字典含真实房间全表、MOSS 选型、24h 最小可用路线、自测清单、Git 规范、已知坑），可直接交给任何 AI/开发者开工。示例坐标已按 `scene_graph.json` 实测值修正（room_id 真实格式 `room_bedroom_master`）。

### 阶段 10 · 交接文档（2026-08-28 下午）
后端接手视角缺口补齐：`frontend/docs/backend-handbook.md`（五分钟跑通、文档地图、接口清单+前端调用点、tp 表/scene_graph 数据字典、联调三步含硬编码冒烟响应、坐标铁律、5 条已知坑）+ `frontend/docs/agent-api.md` v1.1 入库。契约事实源仍是根目录 SPEC，手册只补实测行为不重复定义。

### 阶段 9 · 远端同步确认（2026-08-28 早）
PI 已把对拍结论合入 main：根目录 `camera_poses.json` 换转正版、SPEC 附录 A 写死实测公式（引用了我们的 75/75 数据）。⚠️ 但 SPEC **正文 5 处仍是旧「-Y up」结论未同步**（§0 坐标表/§3.1/§4.2/§4.3/§9），已提醒站会同步。后端 FastAPI 骨架 + `GET /api/scene/{world_id}` 已合并；B 的 `dev-agent` 零进度。

---

## 4. 关键决策记录（ADR）

### D1 · 第一人称替代上帝视角
用户拍板：要"人走进房间"的环游，不要俯瞰。旧上帝视角+小安讲解代码全部进 `_parked/`，不删（Agent 就绪后按需回迁）。

### D2 · RenderCloud 不用于室内渲染（已归档，勿重试）
**结论：spatial-gen 世界用 RenderCloud 渲染不出室内家具**（28 次实验全部如此）。室内内容以微小低 alpha 高斯存在，ParticleField 溅射渲染无法呈现。spatial-gen 世界本质是"全景球"（原点为全景机位、半径约 9 原生单位），无真实房间几何。
**影响：demo 主画面 = 前端本地渲染器，不依赖 RenderCloud 出室内图**；RenderCloud 仅可作外观环视加分项。详见 `mock/real_0330/SOURCE.md` 尾部归档节。

### D3 · 点云坐标系 = IG 原生 Z-up（核心结论，作废旧草稿）
```
scene(x,y,z) → 点云:  [ x + 0.573, 1.087 − z, y ]
点云(X,Y,Z) → scene:   [ X − 0.573, Z, 1.087 − Y ]
```
- 点云系：IG 原生、**右手系、Z-up**（地板 z≈0，层高 2.8m）、米
- ⚠️ **旧草稿「-Y up，(x,−y,z)」已作废**——点云不是 -Y up
- 依据：`labels.json` 500 实例 bbox 交叉验证 + `structure.json` 房间范围比对
- 按 `world_id` 索引（`scene/coords.ts` 的 `CLOUD_RULES`），未登记世界**恒等降级**（room_id=null，坐标不映射）

### D4 · tp 表规格
`camera_poses.json`：**85 点 = 75 物体锚点 + 10 房间锚点**，全点云系。房间锚点眼高统一 1.5m。键名即 `tp_id`（如 `tp_bedroom_master`、`tp_sofa_417`）。

### D5 · Agent 坐标铁律（写给后端）
穿网关坐标（`player_position`/`player_facing`/`actions.position`）一律点云系。**收到什么坐标就原样回什么坐标，禁止自己乘矩阵/翻轴**。要下发 scene 系数据（如 scene_graph.json 的 polygon）必须先按 D3 公式转点云系。`teleport` 优先 `tp_id`（查表），其次 `position`（直接用）。

### D6 · UI/逻辑解耦（UI 可随意重做）
UI 只从 store 读状态，逻辑只往 store 写。重做 UI 只要新 HUD 继续读 `useAppStore` 同批字段，3D 视口/坐标/传送一行不动。约定：Agent 接线逻辑放 `services/`，`WalkHud.tsx` 只留触发函数，缩小与后端队友的合并冲突面。

---

## 5. 已验证事实（复核数据，可直接引用）

| 验证项 | 方法 | 结果 |
|---|---|---|
| 物体型 tp ↔ labels.json bbox 中心 | 8 角点均值比对 | **75/75 命中，残差 <2cm**（实测亚毫米） |
| 房间锚点 ∈ structure.json 房间轮廓 | profile polygon point-in-polygon | **7/7 全部落位**，眼高 1.5m |
| 映射公式锚点残差 | 3 锚点计算 | 0.0003m |
| 点云与 structure.json 房间范围重合 | chunk 主体坐标范围比对 | 完全重合 |
| 密钥泄漏检查 | 全库 grep API key | 无（.env.local 已被 gitignore 排除） |
| 构建 | `npm run build` | ✓ tsc + vite 通过 |
| Agent 对话链路（mock） | 浏览器实测：开面板→问主卧/冰箱/户型→收起 | **7/7 步通过**，回复正确、信息卡弹出、面板收起正常、console 无红色错误 |

复核脚本：`mock/real_0330/align_check.py`（PI 侧）、本文档同批 node 脚本（见 git 历史会话）。

---

## 6. 接管指引（给下一个 AI）

### 6.1 环境搭建
```bash
cd frontend && npm install
cp .env.example .env.local   # 填下表 4 项
npm run dev                   # http://localhost:5173
```
`.env.local` 必填：

| 变量 | 值 | 说明 |
|---|---|---|
| `VITE_AHOLO_API_KEY` | labs.aholo3d.cn 申请 | 群核开放平台 |
| `VITE_AHOLO_LOD_META_URL` | World API 的 lodMetaPath | LOD 分块元数据 |
| `VITE_AHOLO_VOXEL_META_URL` | `/collision/voxel-meta.json` | 默认即可 |
| `VITE_WORLD_ID` | `w_0330_840483` | **对拍世界 ID，填错则无房间归因/tp 表** |

### 6.2 文件地图（改哪里看这里）
| 路径 | 职责 | 改动风险 |
|---|---|---|
| `src/scene/AholoViewport.tsx` | 3D 视口：渲染/碰撞/传送/Agent 上下文发布 | 高（核心循环） |
| `src/scene/coords.ts` | 坐标映射/房间归因/tp 表（D3 落地处） | 高（契约） |
| `src/scene/voxel.ts` | 体素碰撞运行时查询 | 中 |
| `src/store/useAppStore.ts` | 全局态：player/teleportCmd/toast | 中 |
| `src/types/api.ts` | 契约类型（**字段改动需群同步**） | 高（对后端承诺） |
| `src/components/WalkHud.tsx` | HUD + Agent 对话面板（UI 层，逻辑在 services/scene） | 低（UI 随便改，见 D6） |
| `src/services/agent.ts` | Agent 客户端：session_id + mock/real 双实现 | 中（联调入口） |
| `src/scene/agentActions.ts` | Agent 动作执行器（teleport/show_card/highlight + TTS） | 中 |
| `src/services/` | API 客户端 + mock 切换 | 中 |
| `_parked/` | 旧上帝视角代码，只读归档 | 无 |
| `public/mock/real_0330/` | tp 表 + scene_graph（**前端用副本**，根目录 mock 归 PI） | 只读 |

### 6.3 不变量（动了会坏）
1. 坐标一律点云系穿网关（D3/D5）
2. `CLOUD_RULES` 未登记的世界恒等降级，勿给未对拍世界做映射
3. tp 表解析只认 `[x,y,z]` 数组、跳过 `_` 前缀键
4. `upSign` 由体素网格自动探测，勿写死
5. 传送落点必须过体素贴地校验（防穿地/悬空）

### 6.4 验证命令
```bash
npm run build                    # 必过
# tp 表复核（根目录执行）：比对 camera_poses.json 与 labels.json bbox 中心
```

### 6.5 待办（按优先级）
- [x] P0：Agent 对话接线（mock 已通；后端就绪后 `VITE_API_MODE=real` 即切换）
- [x] P1：`show_card` / `highlight` 动作执行（toast 承接；3D 高亮标记可后续升级）
- [x] P1：TTS 播放（`tts_url` 直接播，失败静默降级）
- [ ] P0：等后端 `/api/agent/chat` 真实现后联调（改 `.env.local` 的 `VITE_API_MODE=real` + `VITE_API_BASE`）
- [x] P1：ASR 录音按钮（2026-08-28 上线，见阶段 12；`/api/agent/asr` 后端就绪后 real 模式即用）
- [x] P1：进房主动讲解（2026-08-28 上线，见阶段 14；`event=enter_room` → toast + TTS）
- [x] P2：GitHub Pages 部署（workflow `deploy-pages.yml` 入库，见阶段 15；首次需配 Secrets + Pages Source）
- [ ] P2：UI 重设计（架构已解耦，见 D6；护栏文档 `docs/ui-handoff.md` 已交 UI AI）

### 6.6 交付通道说明
本沙箱无 git 推送凭证（终端 push 不可用），代码经 **git bundle** 交付：`frontend-dev-frontend.bundle`（含完整历史）。已由维护人推送到 `origin/dev/frontend`。后续会话若 GitHub 连接器可用则直接推。

---

## 7. 跨域待办（不归前端，需转告）

| # | 事项 | 责任域 | 状态 |
|---|---|---|---|
| 1 | 根目录 `mock/real_0330/camera_poses.json` 旧草稿 | PI（@zyrwilliamsjtu） | ✅ **已办**（2026-08-28 main `b1afb93` 换转正版，SPEC 附录 A 同步写死公式） |
| 2 | `agent-api.md` v1.1 入仓库 | PI / agent | ✅ **已办**（A 侧放 `frontend/docs/agent-api.md`；另附 `frontend/docs/backend-handbook.md` 联调手册） |
| 3 | `/api/agent/chat` + `/api/agent/asr` + CORS | 后端 | 🔴 **B 已退出**，转 A+PI 承接；需求书见 `docs/agent-handoff.md`，待新执行方按 24h 路线开工 |
| 4 | tp 表按 `world_id` 入库 | agent | ⏳ 前端本地已可直接用（`public/mock/real_0330/camera_poses.json`） |
| 5 | SPEC 正文 5 处旧「-Y up」结论未同步附录 A | PI | 🔴 **新增**：§0 坐标表/§3.1/§4.2/§4.3/§9 仍写 -Y up 与「对拍完成前 room_id 恒 null」，B 读正文会做反坐标轴 |

---

## 8. 变更记录

| 日期 | 变更 | commit |
|---|---|---|
| 2026-08-28 | 初版：阶段 1-7 全量记录 + D1-D6 决策 + 验证数据 | `d0eb8ce` |
| 2026-08-28 | 阶段 8 Agent 接线（对话面板 + mock/real 服务 + 动作执行器 + TTS）+ 阶段 9 远端同步确认；跨域待办 #1 标已办、新增 #5 SPEC 正文矛盾 | 本次提交 |
| 2026-08-28 | 阶段 10 交接文档：`docs/backend-handbook.md`（联调三步+数据字典+坐标铁律+已知坑）+ `docs/agent-api.md` 入库，README 加文档导航；待办 #2 标已办 | 本次提交 |
| 2026-08-28 | 阶段 12/13：语音按钮（PTT→ASR→自动发送）上线 + 修 resume-overlay 遮挡 AI 入口 | 本次提交 |
| 2026-08-28 | 阶段 14/15：进房主动讲解（enter_room→toast+TTS）+ Pages 部署 workflow + UI 护栏文档 | 本次提交 |

### 阶段 13 · 黑屏根因修复：坐标系错位（2026-08-28 深夜）
**症状**：加载仪表盘到"场景就绪"但持续黑屏。**根因**：① 点云为 IG 原生 Z-up（coords.ts 头注已写明，层高落在 Z 轴），而视口相机/重力/碰撞全部按 Y 轴当竖直轴 → 相机横躺；② 体素网格帧与点云帧不同（23.8×13.8×39.6m vs ~11×10×3.7m），voxel 出生点把相机放到点云区域外。**修复**：相机改轴向无关（规则表 `up:'z'`），出生点改用 tp_living（与点云同帧的对拍产物）+ 眼高 1.0；0330 体素规则级停用（`voxel:false`），点击传送降级为视线冲刺 2.2m；Agent 传送按 z 轴 +1.0 落位；新增 **V 键视角校准**循环 5 个出生候选（A–E），现场定了哪个能见再固化。旧 Y-up 素材路径行为不变。

### 阶段 17 · PI 三决策落实：主链路统一 + world_id 统一 + tp 表走网关（2026-08-28 下午）
**背景**：PI《前端联调决策通知（1143）》三项已定决策。**顺带修掉一个真 bug**：`App.tsx` 写死 `HOUSE_ID='w_mock_001'`，与 3D 场景（0330 世界）错位——HUD/Agent 语义数据加载的是 w_mock_001 的 scene_graph，real 模式下还会先打一发不存在的 `/api/houses/w_mock_001`（后端无此路由，404 后降级）。
1. **决策 1（废弃 realApi 旧路径）**：`api.ts` 重写，主链路 = `agent.ts`（`/api/agent/chat`、`/api/agent/asr`）+ `GET /api/scene/{world_id}`（real 路径，10s 超时，world_id 回显校验）；`realApi.ts` 头部打"遗留代码"标记，主链路零引用（全仓 grep 验证：仅 api.ts 曾引用，已摘除）。
2. **决策 2（world_id 统一 w_0330_840483，P0）**：`App.tsx` / `AholoViewport.tsx` 统一 `(VITE_WORLD_ID || 'w_0330_840483')`；`.env.example` 默认值同步。`mock/data.ts` 按 world 参数化（0330 → `public/mock/real_0330/`，根目录仍 w_mock_001），抽出 `houseFromSceneGraph(scene, poses?)` 供网关/本地两路复用；0330 无 `timeline.json` → timeline 可空（`loadRepoScene` catch 置 null，`mockGetTour` 空表降级）；兼容两种 pose 形态（根目录 `{position,look_at}` / 0330 纯 V3，后者无机位朝向 → zone.camera 缺省）。
3. **决策 3（camera_poses 走网关，P1）**：`coords.ts` `loadTpTable` 改两级：real 先 `GET /api/camera_poses/{world_id}`（响应 `{world_id, poses}`，5s 超时，空表视为失败）→ 失败降级本地 `public/mock/real_0330/camera_poses.json`（同一份对拍产物）；mock 模式直连本地。控制台可见来源标注（`tp 表（网关）` / `tp 表（本地 fallback）`）。
4. **数据漂移修复（联调时实测发现）**：本地 fallback 副本与仓库正本不一致——10 个房间级 tp 点 z 值旧版 1.5 / 正版 0.5（PI `4cf31a7` 已转正仓库正本，前端副本停留在 `d0eb8ce` 未同步）。旧副本会让出生点落在 **z=2.5m**（眼高约定 +1.0 后几乎贴 2.8m 层高天花板，加剧黑屏/贴顶）。已同步副本与正本一致（`tp_living=[0.061,0.934,0.5]` → 出生眼高 1.5m 归位）。scene_graph 两边逐字段比对一致，无需同步。
5. **Pages 子路径 404 修复（黑屏又一根因）**：`coords.ts` / `AholoViewport.tsx` 原写死绝对路径 `/mock/...`、`/collision/...`，GitHub Pages 部署在 `/<repo>/` 子路径下全部 404 → tp 表加载不到 → 出生点退化。已改 `import.meta.env.BASE_URL` 相对拼接（与 `agent.ts` 同策略），子路径部署可命中。
6. **交付状态警告**：本沙箱 `dev/frontend` 一度领先 `origin/dev/frontend` **10 个提交**（含阶段 13 黑屏根因修复三连 `777a5ab`/`9f52aad`/`c63ce44`）——即线上/队友本地从未拿到黑屏修复。本次连同三决策修复一并出 bundle，**收到后必须 fetch+merge+push**，勿再积压。
**验证**：`npm run build`（tsc + vite）✓；沙箱内起后端 + vite dev（proxy `/api`）实测：`GET /api/camera_poses/w_0330_840483` 返回 85 点（含 tp_living）、`GET /api/scene/w_0330_840483` 返回 10 房间 scene_graph（coord Y/m），与前端解析形状逐字段吻合；本地 fallback 文件同步后 HTTP 200 且 tp_living 已转正。


### 阶段 18 · 架构决策：砍 TS agent，MOSS 三件套并入 PI 网关（2026-08-28 下午）
**实测依据**：`dev-agent` 分支（agent/ 目录，TS）拉取实测为空壳——chat/asr/tts 全部 handler 写死（问"冰箱在哪"也回"带您去主卧"）、无 world_id 校验（invalid_world 返回 200）、ASR/TTS 假实现、提交信息虚标"CodeBuddy SDK + MOSS 双路"（代码零痕迹）。同期实测 PI 网关（`411b332`）全链路可用：chat 规则版 grounding 真定位（冰箱→`tp_refrigerator_582`+highlight）、tour 10 房间、narration 去重、camera_poses 85 点、25 单测全绿、错误契约正确。**决策（方案 A）**：agent 能力（MOSS LLM/ASR/TTS）并入 PI 的 Python 网关（插入点：`chat/responder.generate` 分层降级、`asr/service.py`、`tts/service.py`），规则版流水线保留为 LLM 故障兜底；`dev-agent` 分支不合并留档。作业书：`/workspace/pi-brief-moss-integration.md`（用户转交 PI）。另发现 `dev-backend` 的 SPEC §4.2 已把坐标约定修正为 IG 原生 Z-up、agent 只输出 tp_id——与前端 `coords.ts` 对拍结论一致，坐标系争议了结。待办：前端 bundle 重推（黑屏修复 `c63ce44`/`9baa3d3` 仍未上 origin）→ dev/frontend 合 main → dev-backend 合 main。
