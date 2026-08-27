# 驻 · AI 置业顾问

输入一句话或一段视频生成/重建一套房，AI 置业顾问带客户在 3D 房里走、随时被提问、主动讲卖点，一键分享给客户。

## 目录结构
- `backend/`  理解层 + 建房 + 相机封装（Python）
- `agent/`    销售 agent（Python）
- `frontend/` 前端 Web（React/Vite）
- `mock/`     场景数据（scene_graph.json = 三级语义样例，camera_poses.json = 轨迹点机位参考）

## 接口契约
见 `SPEC.md`（24h 冻结）


> mock 为符合 SPEC v2.0 的样例数据，非契约；契约以 SPEC.md 为准。camera_poses.json 为 PI/A 内部参考，非契约字段。