# 理解层重构计划（REFACTOR PLAN）

> 性质：本文件是**理解层重构的单一事实源**。所有阶段状态、变更、反馈、踩坑记录统一登记于此。
> 机制：每完成一个阶段 → 在下方"阶段状态表"标 ✅ 已完成，并在"变更记录"登记，**同时更新 `backend/README.md` 对应章节**。
> 原则：小步快跑，一次只换一个步骤；每步有验收（与 GT 对比）+ 回退（不达标用 GT）；demo 主线永不依赖理解层。

## 目标

把理解层中当前由 GT 替代的部分，逐步替换为真引擎（SpatialLM / 几何 / 规则），产出与 GT 对比验证的 scene_graph，同时保持对外接口（`GET /api/scene`）不变。

## 设计（5 步管线 + source 开关）

```
输入：0330 3DGS(ply)
  ├─ 步骤1 房间划分   source: gt | engine（俯视图+几何）
  ├─ 步骤2 实例提取   source: gt | engine（SpatialLM/CLIP）
  ├─ 步骤3 房间类型   source: gt | engine（由实例推断）
  ├─ 步骤4 拓扑+动线  source: gt | engine（门/几何相邻 → tour_path）
  ├─ 步骤5 组装+tp    source: gt | engine（生成自洽 tp + camera_poses）
  └─ 全量评测 → 达标用 engine / 回退 GT
```

- 每步独立 `source` 配置（gt / engine），一次只切换一个步骤，其余保持 gt。
- 每步独立验收（与 GT 对比 IoU/准确率/误差）+ 回退（不达标用 GT）。

## 被 GT 替代的完整清单

| # | 部分 | 现状（GT） | 未来（真引擎） | 阶段 |
|---|---|---|---|---|
| 1 | 房间提取与定位 | rooms polygon（GT structure） | 俯视图 + 几何划分 | S1 |
| 2 | 实例提取（双引擎） | instances（GT labels，75 个） | SpatialLM 逐房检测 | S2 |
| 3 | 房间类型推断 | rooms.type/name（GT） | 由实例推断 | S3 |
| 4 | 拓扑（邻接） | topology/adjacent_rooms（GT） | 门/墙洞/几何相邻 | S4 |
| 5 | 带看动线 | tour_path（转换+手动） | 由拓扑生成 | S4 |
| 6 | tp / camera_poses | 手拟 + 对拍转正 | 自洽生成 | S5 |

（不需要替换：house 元数据 / coord / story_card / selling_points）

## 阶段状态表

| 阶段 | 内容 | 前置 | 验收（vs GT） | 状态 |
|---|---|---|---|---|
| S0 | SpatialLM 部署验证（Linux/WSL+权重+smoke） | 3dgs_standard.ply | 官方 Testset 一条 ply 能出 wall/bbox | ⏳ 进行中 |
| S1 | 房间划分（俯视图+几何） | 独立 | 房间 polygon 与 GT 匹配 ≥ 阈值 | ⬜ 未开始 |
| S2 | 实例提取（SpatialLM 逐房） | S0 | 实例与 GT IoU/位置误差 | ⬜ 未开始 |
| S3 | 房间类型推断（由实例） | S2 | 类型准确率 ≥ 80% | ⬜ 未开始 |
| S4 | 拓扑+动线（门/几何） | S1+S2 | 拓扑一致率；tour_path 可达 | ⬜ 未开始 |
| S5 | 组装+tp 自洽（完整 scene_graph） | S1-S4 | 全量与 GT 一致性 | ⬜ 未开始 |

（状态用：⬜ 未开始 / ⏳ 进行中 / ✅ 已完成 / 🔴 受阻 / ↩️ 回退）

## 变更记录

| 日期 | 阶段 | 变更 | 结果 |
|---|---|---|---|
| 2026-08-28 | - | 重构计划建立，S0 启动 | - |

## 反馈 / 踩坑记录

| 日期 | 阶段 | 反馈/踩坑 | 处理 |
|---|---|---|---|
| 2026-08-28 | - | - | - |

## 回退/降级策略

- SpatialLM 部署失败 → S2 改 CLIP 2D→3D 投影，或放弃 S2 保留 S1 几何房间划分
- 某步评测不达标 → 该步回退 gt，其余继续
- 时间不够 → 停在已完成的阶段，其余回 GT
