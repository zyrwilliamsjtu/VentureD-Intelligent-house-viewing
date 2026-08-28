# 局域网部署（P1）

> 目标：同一 Wi-Fi / 有线网的他人用浏览器打开 `http://<你的局域网IP>:8000`，**不依赖 Cursor**。  
> 接口契约不变。ply / `.env` / key **不入库**。  
> **P2**（云服务器 + 对象存储）后置，见文末 `# 待确认`。

---

## 一次构建 + 一进程托管

在 **装过依赖的那台开发机** 上：

```powershell
cd frontend
npm ci
npm run build
```

`vite build` 读取 `.env.production`：`VITE_API_MODE=real`、`VITE_API_BASE` 为空（请求打到同一主机的 `/api` 与 `/ply`）。

然后：

```powershell
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0`：允许局域网网卡接入（不要只用 127.0.0.1）。
- 启动日志若提示 `frontend/dist 不存在`：先完成上面的 `npm run build`。
- ply 默认读 `E:\科研\ventureD_data\interiorgs\scenes\{scene}\3dgs_compressed.ply`。可改 `backend/.env`：`PLY_SCENES_DIR=...`（只写本机路径，**不要提交 .env**）。

本机自检：浏览器打开 `http://127.0.0.1:8000`（Ctrl+F5），走完 Splash → 列表 → 详情 → 3D。

---

## 他人怎么打开

1. 查本机局域网 IPv4（PowerShell：`ipconfig`，看「无线局域网」或以太网的 **IPv4 地址**，如 `192.168.1.23`）。
2. 他人设备连**同一局域网**，浏览器访问：`http://192.168.1.23:8000`（换成你的 IP）。
3. Windows 若拦入站：防火墙放行 **TCP 8000**，或临时允许 Python。

手机 4G / 访客 Wi-Fi **打不开**（不在同一网）。家里 AP 隔离也会拦设备互访。

---

## 路径对照

| URL | 来源 |
|-----|------|
| `/` ` /assets/*` | `frontend/dist`（SPA，`html=True`） |
| `/api/*` | 原网关路由（挂载 SPA **之前**注册，不会被静态文件盖住） |
| `/static/tts/*` | 后端 TTS 缓存 |
| `/ply/{scene}.ply` | 数据盘 `{PLY_SCENES_DIR}/{scene}/3dgs_compressed.ply` 只读 |
| `/health` | `{status: ok}` |

不要用 `file://` 打开 `dist/index.html`：没有网关、ply 也跨不了源。

---

## 外置 Chrome 若 3D 卡顿

与 Cursor 内置预览不是同一套 GPU/缩放。请：

1. Chrome → 设置 → 系统 → **使用硬件加速**（开）。
2. 关掉无关标签和会注入页面的扩展，再进 3D。
3. 控制台看 `[boot] ... dpr=` 与走动时 `[perf] fps=`。Windows 显示缩放 150% 时 dpr 约 1.5（代码上限 1.5）。
4. 代码侧：`powerPreference: 'high-performance'`，`antialias: false`。**# 待确认**：未改 Spark 内部 renderer。

---

## P2 后置（# 待确认）

- 公网云主机 + HTTPS 反代。
- ply 上对象存储后填 `VITE_SPLAT_URL_{world_id}`（只在 `.env` / CI 密钥里写真实 URL，仓库只保留变量名）再 `npm run build`。
