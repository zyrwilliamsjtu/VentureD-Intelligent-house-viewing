# 部署文档（Deployment Guide）

> 覆盖：本地开发、前端部署到 GitHub Pages、后端部署到公网、点云托管、环境变量清单。
> 目标：让队友/评审能一键跑起来，或把完整 demo 部署到公网。日期：2026-08-28。

---

## 1. 部署拓扑总览

```
浏览器
 ├─ 前端（静态 SPA）→ GitHub Pages / 任意静态托管
 ├─ 3D 点云 → 静态文件（~196MB，OSS/CDN，不入 git）
 └─ 后端 FastAPI（:8000）→ Render / Railway / 云主机
       └─ 外部服务：火山方舟 LLM（doubao）+ 火山 ASR/TTS
```

三层各管各的：前端静态页、点云静态文件、后端 API。前端通过 `VITE_API_BASE` 找到后端。

---

## 2. 本地开发（最快跑起来）

### 2.1 后端（FastAPI，:8000）

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows；mac/Linux 用 source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                            # 填入火山 key（不填也能跑，stub 兜底）
uvicorn app.main:app --reload                     # http://127.0.0.1:8000
```

健康检查：`curl http://127.0.0.1:8000/health` → `{"status":"ok"}`。

### 2.2 前端（Vite，:5173）

```bash
cd frontend
npm install
copy .env.example .env.local                      # 填群核 key / 后端地址
npm run dev                                       # http://localhost:5173
```

dev 期 vite 代理：`/api` 与 `/static` 都转发到 `http://127.0.0.1:8000`（`vite.config.ts`），无跨源问题。

---

## 3. 环境变量清单

### 3.1 前端（`frontend/.env.local`，VITE_ 前缀会打包进产物）

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_API_MODE` | `mock` | `real` 走后端网关，`mock` 用本地兜底 |
| `VITE_API_BASE` | 空 | 后端地址；留空 = 同源（dev 走 proxy，生产需绝对地址如 `https://xxx.onrender.com`） |
| `VITE_AHOLO_API_KEY` | 空 | 群核 Aholo 开放平台 key |
| `VITE_AHOLO_LOD_META_URL` | 硬编码 CDN | LOD 分块元数据（0330 已内置默认） |
| `VITE_AHOLO_VOXEL_META_URL` | `/collision/voxel-meta.json` | 体素碰撞元数据 |
| `VITE_WORLD_ID` | `w_0330_840483` | 默认漫游世界 |

### 3.2 后端（`backend/.env`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173` | 允许的前端来源，多域名逗号分隔 |
| `UNDERSTANDING_PROVIDER` | `gt` | 理解层 provider |
| `CHAT_PROVIDER` / `ASR_PROVIDER` / `TTS_PROVIDER` | `stub` | 切换真实服务 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 空 | 火山方舟 doubao |
| `ASR_API_KEY` / `ASR_BASE_URL` / `ASR_APP_ID` / `ASR_ACCESS_TOKEN` / `ASR_RESOURCE_ID` | 空 | 火山 ASR |
| `TTS_API_KEY` / `TTS_BASE_URL` / `TTS_APP_ID` / `TTS_ACCESS_TOKEN` / `TTS_RESOURCE_ID` / `TTS_VOICE` | 空 | 火山 TTS（产物挂 `/static/tts`） |

> 无真实 key 时走 stub：chat 返回占位话术、ASR/TTS 空——前端降级为打字输入 + 静音气泡，demo 不挂。

---

## 4. 前端部署到 GitHub Pages

已配好自动部署（`.github/workflows/deploy-pages.yml`），推 `main` 或 `dev/frontend` 触发。

### 4.1 一次性配置（repo owner）

1. `Settings → Pages → Build and deployment → Source` 选 **GitHub Actions**。
2. `Settings → Secrets and variables → Actions` 加 4 个 secret：`VITE_AHOLO_API_KEY` / `VITE_AHOLO_LOD_META_URL` / `VITE_AHOLO_VOXEL_META_URL` / `VITE_WORLD_ID`（值同 `.env.example`；缺省也能构建，代码里有硬编码回退）。

### 4.2 发布

推 `dev/frontend` 或 `main` → Actions 自动构建 + 发布。站点地址：

```
https://zyrwilliamsjtu.github.io/VentureD-Intelligent-house-viewing/
```

### 4.3 ⚠️ 已知限制

- **3D 点云（~196MB）不入库**（`.gitignore` 排除 `public/scenes/`）。因此 Pages 上**只有 UI 静态页 + 户型图/效果图，3D 漫游加载不到本地点云**——0330 可走远端 LOD，其余四套进不去。
- **后端不在 Pages 上**（静态托管跑不了 FastAPI）。语音/问答需后端单独部署（见 §5），前端 `VITE_API_BASE` 指向它。

---

## 5. 后端部署到公网

选任一平台，部署 FastAPI（`backend/`），配好 §3.2 的 `.env`：

- **Render / Railway**：入口命令 `uvicorn app.main:app --host 0.0.0.0 --port $PORT`，根目录设 `backend/`。
- **云主机 / Docker**：`uvicorn app.main:app --host 0.0.0.0 --port 8000`，反代域名 + HTTPS。

部署后把域名填进前端 `VITE_API_BASE`（如 `https://ventureD-backend.onrender.com`），重新构建前端即可连通。TTS 产物由后端挂载的 `/static/tts/*` 提供（前端已做相对路径解析）。

---

## 6. 点云托管（完整 demo 才需要）

本地点云在 `frontend/public/scenes/{scene_id}/3dgs_compressed.ply`（~36–45MB/套，共 5 套）。放公网三选一：

1. 传到对象存储 / CDN，前端 `localPlyUrl` 改成绝对 URL；
2. 提交到 git（会超 100MB 文件阈值、clone 慢，不推荐）；
3. 仅 0330 用群核远端 LOD（当前已内置默认），其余四套暂不提供实景漫游。

---

## 7. 公网 demo 最终检查

- [ ] 前端 Pages 能打开、落地页/列表/户型图正常
- [ ] 后端公网 `/health` 返回 ok、`/api/listings` 有 5 套
- [ ] 前端 `VITE_API_BASE` 指向后端、`VITE_API_MODE=real`
- [ ] 语音问答能走通（或确认 stub 降级文案合理）
- [ ] 点云可加载（或接受仅 0330 实景）