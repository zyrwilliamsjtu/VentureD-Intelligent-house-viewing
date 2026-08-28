# AI Agent 开发文档（AGENT_DEV）

> **性质**：本文件是 **PI 开发的 AI agent** 的**单一事实源**。接口字段仍以根目录 `SPEC.md` v2.3 为准；本文件管架构、坐标铁律、事实约束、分层与里程碑。
> **位置**：`backend/app/services/agent/`（Python / FastAPI **网关内模块**），与理解层（`services/understanding/`）**解耦并行**。
> **不合并**：根目录 `agent/` 为队友 Node 实现，**不动、不合入本模块**。

---

## 1. 定位

PI 在网关内实现 SPEC v2.3 五接口 + 挂牌列表由网关 `GET /api/listings` 提供：

| 接口 | 本阶段 | 目标 |
|------|--------|------|
| `POST /api/agent/chat` | **M1 规则版**（intent → grounding → responder → actions） | P2 LLM 增强 |
| `POST /api/agent/asr` | Provider：volcengine 真识别（ffmpeg→pcm16k）；失败 `{text:""}` | P0 ✅ |
| `POST /api/agent/tts` | Provider：默认 stub；失败 omit `audio_url` | P1 |
| `GET /api/agent/narration` | story_card + selling_points；可选 `session_id` 去重 | M2 打磨 |
| `POST /api/agent/tour` | **M2 已接入** `build_tour`（`tour_path` → `steps[]`） | 打磨文案 |

前端只打网关，不直连其它服务。A 负责点云落点；agent **只决定讲什么、去哪个语义锚点（tp_id）**。

---

## 2. 架构

```
A 前端 (agent.ts / asr.ts / narration.ts)
        │  HTTP
        ▼
backend/app/routers/agent.py          # 校验 session_id/world_id、错误码
        │
        ▼
app.services.agent.service             # handle_chat / asr / tts / narration / tour
        │
        ├── chat/                      # M1 规则版 + llm_provider.py（P2，失败回规则版）
        ├── narration/                 # 进房讲解
        ├── tour/                      # 带看动线
        ├── asr/providers/             # stub + openai_compat + volcengine（失败降级 stub）
        ├── tts/providers/             # stub + openai_compat + volcengine（失败 omit audio_url）
        ├── session/store.py           # session_id → 上下文（内存 dict）
        └── facts.py                   # 复用 app.data.scene_store.load_scene_graph
```

理解层只负责产出 `GET /api/scene` 的 scene_graph；agent **读同一份 GT JSON**（`facts.load`），不调用 SpatialLM、不改 mock 文件。

---

## 3. 坐标规则（铁律）

1. **只读 scene_graph（Y-up，米，房屋中心原点）**，用 `rooms[].polygon` / `instances[].position` / `trajectory_point_id`。
2. **动作只输出 `tp_id`**（scene JSON 里已有的 `trajectory_point_id`）。**禁止编造 tp_id。**
3. **不输出 `position` 型 teleport/highlight**（点云系由前端用网关 `GET /api/camera_poses/{world_id}` 或本地表换算）。
4. **不翻轴、不混算** scene 与点云。点云 Z-up 映射只存在于 A 的 `coords.ts` / PI 的 camera_poses 表。
5. `player_position` 若出现在请求里：可忽略或仅日志；**不要拿它去乘旋转矩阵**。坐标系以 SPEC 附录 A 为准（点云 **Z-up**）。
6. **逐场景坐标**：0330 的 0.573/1.087 **禁止**套到其它 world；agent 仍只出 `tp_id`，落点表按 `world_id` 读对应 `camera_poses.json`。

---

## 4. 事实约束（防幻觉）

- 只陈述 **当前 world 的 scene_graph 里有的** `house` / `rooms` / `instances` / `selling_points` / `story_card` / `attrs`。
- 问不存在的物体或房间：**明确说没有可靠信息**，不猜、不从常识补。
- **0330 无 `stove`（灶台）** 实例；厨房不要讲灶台配置。
- `house.orientation` / `floor` / `price` 及部分 tags 在 scene_graph 中常为 **「待对拍」占位**：**不要深加工成卖点**；无 `listing_id` 时被问到就说数据未提供。
- **有 `listing_id`**：价格 / 面积 / 朝向 / 楼层 / 挂牌卖点以 listing 为准；与 scene_graph 冲突时 **listing 赢**。
- `confidence` 仅内部参考，不向用户报模型分数。

---

## 4.1 多世界 + listing_id

| scene_id | world_id | scene_graph / poses | listing_id |
|----------|----------|---------------------|------------|
| `0330_840483` | `w_0330_840483` | `mock/real_0330/` | `listing_0330_840483` |
| `0469_840829` | `w_0469_840829` | `mock/0469_840829/` | `listing_0469_840829` |
| `0259_840804` | `w_0259_840804` | `mock/0259_840804/` | `listing_0259_840804` |
| `0309_840544` | `w_0309_840544` | `mock/0309_840544/` | `listing_0309_840544` |
| `0836_841149` | `w_0836_841149` | `mock/0836_841149/` | `listing_0836_841149` |

手写 mock：`w_mock_001`（`mock/scene_graph.json`），无真实挂牌则 chat 不带 `listing_id`。

**事实源优先级**：`listing` 挂牌（价格/朝向/楼层/面积/卖点）> `scene_graph.house` > 明确说没有。`facts.load(world_id)` 对 5 套通用（同一 `scene_store` 索引）。

**会话隔离方案 A**：前端换房重置 `session_id`。

坐标铁律：点云 Z-up；tp 白名单；偏移见各 `SOURCE.md`，**禁止套用 0330 公式**。

---

## 5. 接口契约速查（SPEC v2.3 §3）

字段命名 snake_case；可选无值 **omit**（不发 `null` / 空 `actions`）。错误顶层 `{code, message}`。

| 方法 | 必填 | 成功体要点 |
|------|------|------------|
| `POST /chat` | `session_id`, `world_id`；`user_text` 与 `audio` 二选一；**可选 `listing_id`** | `{reply_text}`；可选 `tts_url`, `actions` |
| `POST /asr` | multipart `audio` | `{text, duration_ms?}`；空语音 `text=""` |
| `POST /tts` | JSON `text` | `{audio_url}` 或 `{}` |
| `GET /narration` | `world_id`, `room_id`；**可选** `session_id` / `listing_id` | `{reply_text}`；无内容 **404** |
| `POST /tour` | `world_id`, `session_id` | `{steps:[{index, room_id, trajectory_point_id, narration, selling_points?}]}` |

超时：chat 30s / asr 10s / tts 15s。`session_id` **前端生成**，后端按它记 history / current_room / tour_index。

---

## 6. 实现分层

| 层 | 内容 | 依赖 |
|----|------|------|
| **L0 规则版** | 关键词意图 + scene_graph 检索 + 模板回复 + tp_id 动作 | 无外部 API；保 demo |
| **L1 / P2 LLM 增强** | 同一 grounding，LLM 只改写话术 | `CHAT_PROVIDER=openai_compat`；失败回退 L0 |
| **P0 ASR / P1 TTS** | 真实语音；失败保持 stub 形状 | `ASR_PROVIDER` / `TTS_PROVIDER` |

L0 与 L1 **共用** facts / session / actions 铁律，避免两套幻觉源。

---

## 7. 与前端对接

PI 已定（2026-08-28）：

- 演示世界为上表 5 套真实 `world_id`（默认仍可从 0330 进）。
- **camera_poses 走网关** `GET /api/camera_poses/{world_id}`（前端执行 tp→点云；agent 仍只出 tp_id）。

| 前端 | 打网关 |
|------|--------|
| `frontend/src/services/agent.ts` | `POST /api/agent/chat`（JSON，30s） |
| `frontend/src/services/asr.ts` | `POST /api/agent/asr`（multipart `audio`，10s） |
| `frontend/src/services/recorder.ts` | PTT 只录音、不打网关；见 §13 格式对照 |
| `frontend/src/scene/narration.ts` | chat `event=enter_room` 为主；可选 `GET /api/agent/narration`（可带 `session_id` 去重；不带则每次都讲） |


`VITE_API_MODE=real` 且 `VITE_API_BASE` 空 = 同源 `/api`（Vite 代理 8000）。  
`frontend/src/services/realApi.ts` 仍含旧 `/api/houses`、`/api/chat`——**待确认**废弃，不在本模块处理。

HUD 动作：`teleport.tp_id` → `coords.resolveTeleportCloud` → 体素贴地。agent 不要发 `position`。

---

## 8. 里程碑

| ID | 内容 | 状态 |
|----|------|------|
| **M0** | 骨架 + facts/session + asr/tts stub + narration 简单实现 + chat stub + AGENT_DEV | ✅ |
| **M1** | 规则版 `handle_chat`：intent / grounding / responder / actions | ✅ |
| **M2** | narration 打磨 + session 去重；`handle_tour` 接入 `build_tour` | ✅ |
| **M3** | router 与契约测试对齐 | ✅ |
| **P0** | ASR Provider（stub + openai_compat + volcengine WebSocket） | ✅ 真实识别已通（ffmpeg→pcm16k） |
| **P1** | TTS Provider（stub + volcengine V3 SeedTTS2.0 + 缓存） | ⏳ 进行中（已冒烟） |
| **P2 / M4** | chat LLM 增强（规则版保底） | ⏳ 进行中（ep 接入点 chat/completions 已通） |

---

## 9. 数据源

| 数据 | 路径 | 用途 |
|------|------|------|
| GT scene_graph | `mock/real_0330/` + `mock/{scene_id}/` | 5 套真实，`coord.up=Y` |
| 挂牌 | `mock/listings.json` | `facts.load_listing(listing_id)` |
| 手写 mock | `mock/scene_graph.json` | `w_mock_001` 开发基线 |
| 加载代码 | `backend/app/data/scene_store.py` | `facts.load` **只包装**，不复制读盘 |
| tp 表 | 各目录 `camera_poses.json` | 前端/网关；agent **不读点云坐标** |

未知 `world_id`：`facts.load` → `None`（与 scene 路由 `WORLD_NOT_FOUND` 同源表）。

---

## 10. 开发原则

1. **与理解层解耦**：不改 pipeline/provider；agent 失败不影响 `GET /api/scene`。
2. **独立可测**：`backend/tests/test_agent_service.py` 不依赖 LLM。
3. **GT 兜底**：事实只来自入库 JSON；理解层换 DualEngine 后仍可先绑 GT world。
4. **契约稳定**：先 SPEC 再改字段；omit 空可选。
5. **小步提交**：外部 API 失败必须降级；key 不入库。

---

## 11. 代码地图

```
backend/app/services/agent/
├── __init__.py          # 导出 handle_*
├── service.py           # 统一入口
├── facts.py             # load + 简单检索
├── session/store.py     # 内存 load/save/clear
├── chat/                # M1 规则版 + llm_provider.py（P2）
├── narration/service.py
├── tour/service.py
├── asr/providers/       # stub / openai_compat / volcengine
├── tts/providers/       # stub / openai_compat / volcengine；缓存在 tts/service.py
```

会话存储为**进程内 dict**，重启丢失——多 worker **待确认**是否改 Redis（demo 单进程可接受）。

---

## 12. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-28 | 建立骨架、facts/session、asr/tts stub、narration 简单实现、chat stub、router 接入 handle_* |
| 2026-08-28 | M1 规则版 handle_chat（intent/grounding/responder/actions）；SPEC §3.1 改为点云 Z-up |
| 2026-08-28 | M2 handle_tour 接入 build_tour；narration 拼 selling_points + 可选 session 去重；SPEC §4.2 Z-up |
| 2026-08-28 | 接真实 API：ASR/TTS/chat-LLM Provider 抽象 + stub 兜底（P0/P1/P2）；key 仅 .env |
| 2026-08-28 | chat 切火山方舟（openai_compat）；volcengine TTS V1 + ASR 骨架；凭证仅 .env |
| 2026-08-28 | chat 接方舟 ep 接入点（completions 真通）；TTS 升级 V3 SeedTTS2.0；ASR WebSocket 真实现 |
| 2026-08-28 | ASR 真实识别：ffmpeg 把 webm/m4a 转到 pcm16k；前端 PTT 格式对齐；live 转写「这栋房子的主卧在哪？」 |
| 2026-08-28 | 多世界 + listing_id：5 套 world 表；挂牌优先于 scene_graph；逐场景坐标铁律 |

---

## 13. API 接入

**决策（PI，2026-08-28）**：agent 接真实 API（ASR / TTS / chat LLM），与理解层一样用 **Provider 抽象 + stub 兜底 + 环境变量热切换**。

### 供应商

- **chat**：火山方舟推理接入点 `ep-...`（Doubao-Seed-Evolving）。`POST {LLM_BASE_URL}/chat/completions`（本轮实测 **chat/completions 可用**）；若 404 / 不支持该路径则自动改 `POST {LLM_BASE_URL}/responses`（`messages` → `input`）。BASE 已含 `/api/v3`，**不要再拼 `/v1`**。凭证只在 `.env` 的 `LLM_*`。
- **TTS**：豆包 **V3 HTTP Chunked** `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`（SeedTTS2.0）。鉴权 `X-Api-App-Id` / `X-Api-Access-Key` / `X-Api-Resource-Id`（可选 `X-Api-Secret-Key`，待确认）。官方 2.0 字符版 resource 为 `seed-tts-2.0`；若 `.env` 填的是控制台数字资源包 ID 且返回 45000030，会再试 `seed-tts-2.0`。音频落到 `/static/tts/{uuid}.mp3`。
- **ASR**：豆包 **WebSocket 流式识别 1.0** `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`。鉴权 `X-Api-App-Key` / `X-Api-Access-Key` / `X-Api-Resource-Id`（可选 Secret-Key，待确认）。二进制帧（gzip + sequence + 负包）已实现。官方输入仅 **pcm / wav / ogg / mp3**；前端 webm/m4a 一律 ffmpeg 转到 **16kHz 单声道 pcm_s16le** 后申报 `format=pcm` `codec=raw`。数字资源包 ID 失败时再试 `volc.bigasr.sauc.duration`。
- 凭证只在 `backend/.env`（**未跟踪、禁止入库**）。`.env.example` 只列变量名。

### 前端录音格式 ↔ 后端 ASR

只读核对 `origin/dev/frontend` 与 `origin/main` 的 `frontend/src/services/recorder.ts`（**未改前端**）：

| 项 | 实际 |
|----|------|
| `MediaRecorder` mime | 优先 `audio/webm;codecs=opus`，其次 `audio/webm`，再次 `audio/mp4` |
| Chrome / Edge | 容器 **webm** + 编码 **opus**；上传文件名 `voice.webm` |
| Safari | `audio/mp4`（AAC）；`audioExt` 得到 **m4a**，上传 `voice.m4a` |
| 采样率 | `getUserMedia({ audio: true })`，**不**改采样率、**不**转码 |
| 分片 | `MediaRecorder.start(200)`（200ms timeslice） |
| 时长上限 | `WalkHud` 自动停 **15s**（SPEC 音频 ≤15s）；`recorder.ts` 本身无上限 |
| 上传 | `asr.ts` FormData 字段名 **`audio`**，超时 10s |

后端处理（`asr/providers/volcengine.py`）：

```
前端 blob（webm/opus 或 m4a/AAC 或 wav）
  → 本机 ffmpeg：-ac 1 -ar 16000 -acodec pcm_s16le
  → WebSocket 按 pcm/raw、每包 6400 bytes（约 200ms）发送
  → 失败/无 ffmpeg：detect_audio_format（webm 按 ogg+opus 申报，待确认）→ 仍失败则 stub {text:"", duration_ms:0}
```

官方文档未列 m4a/webm，**必须转码**。本机已有 ffmpeg 8.1；CI/他机若无 ffmpeg，转码用例 skip，识别走回退（质量无保证）。**不要把 ffmpeg 写进 pip**（系统依赖）。

测试资产：`backend/tests/assets/test_audio.m4a`（PI 提供，66510 bytes ≈ 65KB，小于 5MB，已入库）。根目录 `20260828_145144.m4a` 为原件副本，不入库。

### 真实识别结果（2026-08-28）

- 输入：`test_audio.m4a` → ffmpeg pcm 107178 bytes，`duration_ms=3349`
- 转写：**「这栋房子的主卧在哪？」**
- 耗时：约 4.5s（第二次约 5.4s），**一次成功**，小于 SPEC 10s
- 接口形状：`{"text": "这栋房子的主卧在哪？", "duration_ms": 3349}`

### `AGENT_LIVE_VOICE`

pytest 默认把 `ASR_PROVIDER`/`TTS_PROVIDER` 打成 stub（避免 CI 打外网）。真实语音冒烟：

```
# 需本机 backend/.env 已配 ASR_* / TTS_*，且 PATH 有 ffmpeg
set AGENT_LIVE_VOICE=1
pytest backend/tests/test_asr_volcengine.py::test_live_asr_m4a backend/tests/test_tts_volcengine.py::test_live_tts_smoke -v
```

ASR live 用例**直接实例化** `VolcengineASRProvider`（不走工厂），因此不受 conftest 的 stub 覆盖。未设该变量时这两条 skip。

### 配置（只写变量名）

| 变量 | 作用 | 缺省 |
|------|------|------|
| `CHAT_PROVIDER` | `stub` / `openai_compat` | `stub` |
| `ASR_PROVIDER` / `TTS_PROVIDER` | `stub` / `openai_compat` / `volcengine` | `stub` |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | chat 方舟；`LLM_MODEL` 为 `ep-...` | 空或不达 → 规则版 |
| `TTS_APP_ID` / `TTS_ACCESS_TOKEN` / `TTS_SECRET_KEY` / `TTS_RESOURCE_ID` / `TTS_VOICE` | 豆包 TTS V3 | 空 → stub；音色缺省 `zh_female_vv_uranus_bigtts`（待确认） |
| `ASR_APP_ID` / `ASR_ACCESS_TOKEN` / `ASR_SECRET_KEY` / `ASR_RESOURCE_ID` | 豆包 ASR WS | 空 → stub |

真实 key **只允许**出现在本机 `backend/.env`。`.env.example` 与文档只列变量名。

### 降级链（demo 永不挂）

```
ASR：volcengine WebSocket（超时 10s）→ stub {text:"", duration_ms:0}
TTS：volcengine V3 HTTP Chunked（超时 15s）+ 同文本缓存 → {}（omit audio_url）
chat：规则版始终先跑 → 方舟 chat/completions（失败则 responses）成功才替换 reply_text；失败/未配置保持规则版；actions 仍由规则版产出
```

热切换：改 `.env` 里 `*_PROVIDER` 后重启 uvicorn（或新进程读环境）。

### 里程碑

| ID | 内容 | 状态 |
|----|------|------|
| P0 | ASR | ✅ 真实识别已通（ffmpeg→pcm16k；转写见上） |
| P1 | TTS + chat 可选 tts_url | ⏳ V3 SeedTTS2.0 已冒烟出 mp3 |
| P2 | chat LLM 增强 | ⏳ 方舟 ep 接入点，chat/completions 四项过 |

