# 驻 · AI 置业顾问

> **一页总览**：[`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) · 前端 [`frontend/docs/FRONTEND_ARCH.md`](./frontend/docs/FRONTEND_ARCH.md) · 后端 [`backend/README.md`](./backend/README.md) · 契约 [`SPEC.md`](./SPEC.md)

输入一句话或一段视频生成/重建一套房，AI 置业顾问带客户在 3D 房里走、随时被提问、主动讲卖点，一键分享给客户。

## 目录结构
- `backend/`  理解层 + 建房 + 相机封装（Python）
- `agent/`    销售 agent（Python）
- `frontend/` 前端 Web（React/Vite）
- `mock/`              场景与 agent 数据
  - `scene_graph.json`     手写 mock（w_mock_001，开发基线）
  - `camera_poses.json`    tp_id → 点云坐标映射表（w_mock_001，待对拍）
  - `agent_responses.json` agent 接口响应样例
  - `real_0330/`           真实数据版（来自 InteriorGS 0330_840483）
    - `scene_graph.json`    SPEC 格式，w_0330_840483
    - `camera_poses.json`   tp_id → 点云坐标映射表（待对拍）
    - `SOURCE.md`           数据来源、转换脚本、坐标状态说明

## 接口契约
见 `SPEC.md`（24h 冻结）

手写 mock 为开发基线，真实场景 mock 见 `mock/real_0330/`；契约以 `SPEC.md` 为准。
