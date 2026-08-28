# 驻 · AI 置业顾问（VentureD）

第一人称 **3D 高斯溅射（3DGS）看房** + 网关内 AI 置业顾问「**小驻**」：在 5 套真实 InteriorGS 室内里走、提问、听讲解、按动线带看。

> **最终版已合 `main`（2026-08-29）**。演示请用 **Cursor IDE 内置预览** 打开本地页（外置 Chrome 在本机 WebGL 上容易卡，见下文）。

**截图**：请本地跑通后自行截 Splash / 列表 / 3D HUD 放仓库（不强制入库大图）。

---

## 功能

- 三层页面：落地 Splash → 房源列表（筛选）→ 详情 2D 户型 → 第一人称漫游
- 5 套真实挂牌（楼盘名 + 编号）；**问问小驻** 从真实 5 套荐 1 套（不编造房源）
- WASD + 鼠标漫游；**B** 带看；**M** 俯瞰图 + 位置光点；**V** 回起点
- 对话 / 按住说话；进房讲解；动作只落地 `tp_id`（防幻觉）
- 无 LLM key 时规则版 + stub；无 ply 时列表/详情/对话仍可跑，3D 提示点云失败

---

## 环境

| | 要求 |
|---|---|
| Node | ≥ 18 |
| Python | ≥ 3.10 |
| 浏览器 | **Cursor 内置 Simple Browser / Preview**（推荐）；外置 Chrome 需硬件加速，仍可能卡 |
| 可选 | 数据盘 InteriorGS `3dgs_compressed.ply`（不出画也能看 UI） |
| 可选 | `ffmpeg`（真实 ASR 转 pcm；stub 不需要） |
| 可选 | 火山方舟 / 豆包凭证（只写 `backend/.env`） |

---

## 快速开始

```bash
git clone https://github.com/zyrwilliamsjtu/VentureD-Intelligent-house-viewing.git
cd VentureD-Intelligent-house-viewing
```

**后端**

```bash
cd backend
python -m pip install -r requirements.txt
copy .env.example .env   # Windows；macOS/Linux: cp .env.example .env
# 默认 ASR/TTS/CHAT 均为 stub，无需 key
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**前端**（另开终端）

```bash
cd frontend
npm install
# 联调网关：复制 .env.example 为 .env.local，设 VITE_API_MODE=real（不要提交 .env.local）
npm run dev
```

终端会打印 `http://localhost:5173/`。用 **Cursor 内置预览** 打开该地址（步骤见下节）。

无 key：对话走规则版。无 ply：进 3D 会「点云加载失败」，可关失败层；列表 / 2D 户型 / 问问小驻仍可用。

---

## 用 Cursor IDE 打开网页（推荐）

产品侧已放弃依赖外置浏览器：本机 WebGL + HUD 在 **Cursor 内嵌预览里更稳**。

1. Cursor 打开本仓库文件夹。
2. 按上面起好 **backend :8000** 与 **frontend :5173**。
3. 打开预览：
   - 命令面板（Ctrl+Shift+P / Cmd+Shift+P）→ 搜 **Simple Browser: Show** → 输入 `http://localhost:5173`
   - 或看面板 **Ports**：5173 → Open in Browser / Preview
   - 部分版本：命令 **Simple Browser: Show** 后粘贴 Vite 给出的 Local / Network URL
4. 预览里完成 Splash → 列表 → 详情 →（有 ply 时）3D。

**不要**用 `file://` 打开 `dist/index.html`。局域网给他人看：见 [`docs/DEPLOY_局域网.md`](./docs/DEPLOY_局域网.md)（`npm run build` + `uvicorn --host 0.0.0.0`）。他人设备仍是普通浏览器，3D 卡顿见该文档的 `[perf]` 说明。

---

## 环境变量

| 文件 | 用途 |
|------|------|
| [`backend/.env.example`](./backend/.env.example) | 复制为 `backend/.env`。`LLM_*` / 豆包 `ASR_*` `TTS_*` **只填变量值到 .env，禁止入库** |
| [`frontend/.env.example`](./frontend/.env.example) | 复制为 `frontend/.env.local`。`VITE_API_MODE=real` 打网关；`VITE_SPLAT_URL_*` 只写 URL、不写密钥 |
| [`frontend/.env.production`](./frontend/.env.production) | `npm run build` 用：同源 `/api` + `/ply` |

申请方舟 / 豆包：见 [`docs/AGENT_DEV.md`](./docs/AGENT_DEV.md) §13。不申请则保持 `*_PROVIDER=stub`。

---

## 数据准备（ply 不入库）

GT 已在仓库：`mock/` 下 `scene_graph` / `camera_poses` / `listings.json`（5 套 + `w_mock_001`）。

点云 **不提交 git**。本机约定：

```
E:\科研\ventureD_data\interiorgs\scenes\{scene_id}\3dgs_compressed.ply
```

例如 `0330_840483`、`0469_840829`、`0259_840804`、`0309_840544`、`0836_841149`。

来源：[spatialverse/InteriorGS](https://huggingface.co/datasets/spatialverse/InteriorGS)（gated，需 HF 权限）。转换与坐标见各 `mock/*/SOURCE.md`。

| 模式 | ply | 行为 |
|------|-----|------|
| dev Vite | 数据盘存在 | `/ply/{scene}.ply` 由 `vite.config.ts` 只读映射 |
| 局域网 uvicorn | `PLY_SCENES_DIR` 指向 scenes | FastAPI `GET /ply/{scene}.ply` |
| 都没有 | — | 3D 失败层「点云加载失败」（可关）；UI 其余可用 |

对象存储：`VITE_SPLAT_URL_{world_id}` **# 待确认** bucket。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [`SPEC.md`](./SPEC.md) | 接口契约（字段语义） |
| [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) | 一页总览（最终版） |
| [`docs/AGENT_UX_收官记录.md`](./docs/AGENT_UX_收官记录.md) | 小驻 UX 历轮功能说明 |
| [`frontend/docs/FRONTEND_ARCH.md`](./frontend/docs/FRONTEND_ARCH.md) | 前端视口 / HUD / 九接口 |
| [`backend/README.md`](./backend/README.md) | 网关 / 降级链 / 测试 |
| [`docs/AGENT_DEV.md`](./docs/AGENT_DEV.md) | agent 实现与凭证变量名 |
| [`docs/DEPLOY_局域网.md`](./docs/DEPLOY_局域网.md) | 一进程托管给同网段 |
| [`docs/GIT_WORKFLOW.md`](./docs/GIT_WORKFLOW.md) | 分支与提交纪律 |

日常开发仍建议功能分支 + PR；本次收官由 PI 授权将 `feat/agent-ux` 合入 `main`。

---

## 测试

```bash
cd backend
python -m pytest tests -q
cd ../frontend
npx tsc --noEmit
```

---

## 许可

[MIT](./LICENSE)（**# 待确认**：若需 Apache-2.0 / 其它牌照由 PI 替换 `LICENSE` 即可）。

InteriorGS 点云与 gated 数据集条款以 Hugging Face 页面为准，**不要把 ply 放进本仓库**。
