# 产品架构图（每一级）

> 「AI 代看房 · VentureD」的分层架构图，按粒度从大到小共五级：系统总架构 → 前端模块 → 后端 Agent → 页面/状态流转 → 数据流时序。
> 图表用 Mermaid 绘制，GitHub / 支持 Mermaid 的编辑器里会直接渲染。日期：2026-08-28。

---

## 1. 系统总架构（一级）

```mermaid
flowchart TB
    subgraph C["客户端（桌面浏览器 Chrome / Edge）"]
        UI["React 前端 SPA<br/>落地页 / 列表 / 漫游 HUD"]
        VIEWER["@manycore/aholo-viewer<br/>3DGS 点云渲染 + 体素碰撞 + 点击传送"]
    end

    subgraph RENDER["群核 / 渲染数据源"]
        PLY["本地 3DGS ply<br/>public/scenes（~196MB，不入库）"]
        LOD["远端 LOD 分块<br/>holo-cos.aholo3d.cn"]
    end

    subgraph GW["Python FastAPI 网关（:8000）"]
        ROUTER["Routers：scene · listings · camera_poses · agent"]
        AGENT["Agent 服务：chat / asr / tts / narration / tour"]
        UNDER["理解层：房间 / 实例 / 拓扑（三级语义）"]
        DATA["数据：scene_graph · listings · camera_poses"]
    end

    subgraph EXT["外部服务"]
        LLM["火山方舟 doubao（LLM）"]
        ASR["火山 ASR（openspeech.bytedance.com）"]
        TTS["火山 TTS V3（SeedTTS2.0）"]
    end

    UI --> ROUTER
    UI --> VIEWER
    VIEWER --> PLY
    VIEWER --> LOD
    ROUTER --> AGENT
    AGENT --> UNDER
    UNDER --> DATA
    AGENT --> LLM
    AGENT --> ASR
    AGENT --> TTS
    ROUTER --> DATA
```

要点：前端只跟网关 + 群核 viewer 打交道；Agent 能力内聚在 Python 网关里；外部只依赖 LLM / ASR / TTS 三个服务；点云数据走本地文件或群核 CDN，不入 git。

---

## 2. 前端模块架构（二级）

```mermaid
flowchart TB
    APP["App.tsx<br/>视图流转 + 3D 视口按需挂载"]
    STORE["store/useAppStore（zustand）<br/>view / listing / filters / player / teleport / toast"]

    APP --> SPLASH["Splash.tsx<br/>落地页（纯 DOM，不挂 3D）"]
    APP --> LIST["HouseList.tsx<br/>房源列表 + 筛选"]
    APP --> HUD["WalkHud.tsx<br/>漫游 HUD + AI 对话面板"]
    APP --> VP["AholoViewport.tsx<br/>3D 视口（非 splash 才挂载）"]

    SPLASH --> STORE
    LIST --> STORE
    HUD --> STORE
    VP --> STORE

    LIST --> LIST_SVC["services/listings.ts<br/>GET /api/listings"]
    HUD --> AGENT_SVC["services/agent.ts<br/>chat / narration / tts / tour"]
    HUD --> ASR_SVC["services/asr.ts<br/>POST /api/agent/asr"]
    HUD --> ACT["scene/agentActions.ts<br/>动作执行 + TTS 播放"]
    VP --> COORDS["scene/coords.ts<br/>坐标映射 / tp 表 / 房间归因"]
    VP --> VOXEL["scene/voxel.ts<br/>体素碰撞"]
    VP --> STORE
```

要点：`useAppStore` 是唯一状态中枢——组件只读 store，逻辑只写 store（UI 与数据流解耦）；3D 视口、坐标、体素是独立模块。

---

## 3. 后端 Agent 架构（三级）

```mermaid
flowchart TB
    R["routers/agent.py（/api/agent/*）"]
    R --> CHAT["chat<br/>intent → grounding → responder → actions"]
    R --> ASR["asr → 转写"]
    R --> TTS["tts → 合成（同文本缓存）"]
    R --> NAR["narration → 进房讲解"]
    R --> TOUR["tour → 带看动线"]

    CHAT --> FACTS["load_facts：读 scene_graph（三级语义）"]
    CHAT --> INTENT["intent 识别<br/>问房 / 导航 / 价格 / 属性"]
    CHAT --> GROUND["grounding：房间 / 实例 / 事实定位"]
    CHAT --> RESP["responder.generate<br/>规则版 → LLM 兜底"]
    CHAT --> ACTS["build_actions<br/>teleport / highlight / show_card"]

    RESP --> LLM["LLM Provider（火山方舟 doubao）"]
    ASR --> ASRP["ASR Provider"]
    TTS --> TTSP["TTS Provider（volcengine → /static/tts/*.mp3）"]
```

要点：chat 是 P0 主链路；话术必须基于 scene_graph 事实，不编造；导航 / 价格口径锁定，不走 LLM 改写。

---

## 4. 页面 / 状态流转（四级）

```mermaid
stateDiagram-v2
    [*] --> Splash
    Splash --> List : 开始看房 / 搜索房源（带筛选）
    List --> Walk : 点击房源卡（选房并重置会话）
    Walk --> List : ‹ 返回（3D 不卸载）
    Walk --> Walk : WASD 移动 / 点击传送 / T 呼 AI / ESC 释放
```

---

## 5. 数据流时序（五级）· 一次语音问答

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant G as 网关
    participant A as Agent

    U->>F: 按住 🎙 说话（≤15s）
    F->>G: POST /api/agent/asr（audio，multipart）
    G-->>F: {text, duration_ms}
    F->>G: POST /api/agent/chat（text + session_id + world_id + 玩家上下文）
    G->>A: intent → grounding → responder
    A-->>F: {reply_text, tts_url, actions[]}
    F->>F: 显示气泡 + 播放 TTS + 执行 actions（teleport 瞬移）
```

---

## 附：降级矩阵（任一环节缺失，demo 不挂）

| 缺失项 | 降级 |
|---|---|
| 后端 chat 不可达 | 前端报「Agent 暂不可用」，不阻塞漫游 |
| asr 失败 / 空语音 | 打字输入 / 提示「没听清」 |
| tts / tts_url 缺失 | 前端本地 TTS 或静音气泡 |
| 点云未就绪 | 房间 HUD / 对话仍工作；渲染提示加载进度 |
| 坐标对拍缺失 | room_id=null，agent 只输出文本 / tp_id |
