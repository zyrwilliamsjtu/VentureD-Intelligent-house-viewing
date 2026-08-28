# 驻 · AI 置业顾问

输入一句话或一段视频生成/重建一套房，AI 置业顾问带客户在 3D 房里走、随时被提问、主动讲卖点，一键分享给客户。

## 目录结构
- `backend/`  理解层 + 建房 + 相机封装（Python）
- `agent/`    销售 agent（Python）
- `frontend/` 前端 Web（React/Vite）
- `docs/`     团队文档
  - `GIT_WORKFLOW.md`     Git 分支/提交/合并规则（全队必读）
  - `agent-handoff.md`    Agent 板块自包含需求书（交给新执行方即可开工）
  - `ui-handoff.md`       UI 重设计护栏说明（固定类名/store 只读/层级约定）
- `mock/`              场景与 agent 数据
  - `scene_graph.json`     手写 mock（w_mock_001，开发基线）
  - `camera_poses.json`    tp_id → 点云坐标映射表（w_mock_001）
  - `agent_responses.json` agent 接口响应样例
  - `real_0330/`           真实数据版（来自 InteriorGS 0330_840483）
    - `scene_graph.json`    SPEC 格式，w_0330_840483
    - `camera_poses.json`   tp 表（已对拍转正，85 点点云系，见 frontend/WORKLOG D3）
    - `SOURCE.md`           数据来源、转换脚本、坐标状态说明

## 接口契约
见 `SPEC.md`（24h 冻结）

手写 mock 为开发基线，真实场景 mock 见 `mock/real_0330/`；契约以 `SPEC.md` 为准。
