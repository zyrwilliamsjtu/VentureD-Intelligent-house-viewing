# 理解层重构计划（REFACTOR PLAN）

> 后端板块总览改读 [`backend/README.md`](../backend/README.md)；项目一页 [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)。  
> 性质：本文件是**理解层重构的阶段账本**。所有阶段状态、变更、反馈、踩坑记录统一登记于此。
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

| 阶段 | 内容 | 前置 | 验收（vs GT） | 状态 | 备注 |
|---|---|---|---|---|---|
| S0 | SpatialLM 部署验证（Linux/WSL+权重+smoke） | 3dgs_standard.ply | 官方 Testset 一条 ply 能出 wall/bbox | 🔴 受阻 | flash-attn 笔记本编译失败（RTX 4060 8GB，sm_89 无 wheel、源码编译 OOM）。环境与权重已存档于 WSL `/home/zangy/spatiallm-s0/`（不删、不入 git）。demo 主线继续 GT。SpatialLM 降级为可选加分，日后有 Linux 服务器 / ≥16GB 显存再回填。 |
| S1 | 房间划分（俯视图+几何） | 独立 | 房间 polygon 与 GT 匹配 ≥ 阈值 | ⬜ 未开始 | - |
| S2 | 实例提取（SpatialLM 逐房） | S0 | 实例与 GT IoU/位置误差 | ⬜ 未开始 | 依赖 S0；S0 受阻后本步降为可选加分 |
| S3 | 房间类型推断（由实例） | S2 | 类型准确率 ≥ 80% | ⬜ 未开始 | - |
| S4 | 拓扑+动线（门/几何） | S1+S2 | 拓扑一致率；tour_path 可达 | ⬜ 未开始 | - |
| S5 | 组装+tp 自洽（完整 scene_graph） | S1-S4 | 全量与 GT 一致性 | ⬜ 未开始 | - |

（状态用：⬜ 未开始 / ⏳ 进行中 / ✅ 已完成 / 🔴 受阻 / ↩️ 回退）

## 变更记录

| 日期 | 阶段 | 变更 | 结果 |
|---|---|---|---|
| 2026-08-28 | - | 重构计划建立，S0 启动 | - |
| 2026-08-28 | S0 | WSL2 环境/权重/torch CUDA 已通；flash-attn 笔记本编译失败。PI 止损：demo 主线继续 GT，后续开发主线转 agent | 🔴 受阻存档 |

## 反馈 / 踩坑记录

| 日期 | 阶段 | 反馈/踩坑 | 处理 |
|---|---|---|---|
| 2026-08-28 | S0 | 无 lock 的 `poetry install` 在 pytorch 源挂起约 28min | 改 pip 安装 `torch==2.4.1+cu124` |
| 2026-08-28 | S0 | 第二次 poetry 仍长时间不落 transformers | 按 pyproject 用 pip 装其余依赖（成功） |
| 2026-08-28 | S0 | `pip install -e SpatialLM` 隔离构建找不到 setuptools | 改 `PYTHONPATH`，不装 editable |
| 2026-08-28 | S0 | flash-attn GitHub 预编译 wheel 404 | 改源码编译 |
| 2026-08-28 | S0 | 源码编译 `nvcc` 失败 **exit 137（OOM）**，同时编了 sm_80+sm_90（4060 实为 sm_89） | 拟 `TORCH_CUDA_ARCH_LIST=8.9 MAX_JOBS=1` 再试；**该次编译已被 PI 叫停** |
| 2026-08-28 | S0 | 显存 8188 MiB = 门槛下限（推荐 12–24GB） | smoke 尚未跑，OOM 风险仍在 |
| 2026-08-28 | S0 | flash-attn 3 次编译失败（wheel 404 / 挂起 / nvcc OOM 137）；poetry 死等改 pip；4060 为 sm_89。详见 `docs/SpatialLM_部署指南.md` 附录。 | PI 止损：S0 受阻存档，不删 WSL 环境 |

## 回退/降级策略

- **S0 受阻 → 双引擎降级为可选加分；主线用 GT + agent**（demo 不依赖 SpatialLM / 理解层真引擎）
- SpatialLM 部署失败 → S2 改 CLIP 2D→3D 投影，或放弃 S2 保留 S1 几何房间划分（均非本阶段主线）
- 某步评测不达标 → 该步回退 gt，其余继续
- 时间不够 → 停在已完成的阶段，其余回 GT
- 日后有 Linux 服务器 / ≥16GB 显存 → 从 WSL 存档 `/home/zangy/spatiallm-s0/` 回填 S0，再决定是否开 S2
