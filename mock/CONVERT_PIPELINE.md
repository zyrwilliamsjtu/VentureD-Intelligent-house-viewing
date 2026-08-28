# InteriorGS → SPEC 转换链路清单（0330 标准，已参数化）

> 产出格式与 0330 一致；**坐标偏移每场景独立标定，禁止套用 0330 的 0.573 / 1.087**。
> 原始数据在数据盘，**不入库**；转换产物入 `mock/{scene_id}/`。

## 数据位置

| 项 | 路径 | 入库 |
|---|---|---|
| 原始 5 文件 | `E:\科研\ventureD_data\interiorgs\scenes\{scene_id}\`（`3dgs_compressed.ply` / `structure.json` / `labels.json` / `occupancy.png` / `occupancy.json`） | 否 |
| 可选 xyzrgb ply | 同目录 `3dgs_standard.ply`（`scripts/convert_supersplat_to_ply.py`） | 否 |
| 转换产物 | 仓库 `mock/{scene_id}/scene_graph.json` + `camera_poses.json` + `SOURCE.md` + `origin.json` | 是 |
| 0330 历史路径 | `mock/real_0330/`（兼容已有 world 索引，不搬迁） | 是 |

`world_id` = `w_{scene_id}`。当前 5 套：`0330_840483`、`0469_840829`、`0259_840804`、`0309_840544`、`0836_841149`。

## 步骤

| # | 步骤 | 脚本 / 命令 | 输入 | 输出 | 参数化 | 0330 曾硬编码 |
|---|---|---|---|---|---|---|
| 1 | ply 解压（可选；标定用 compressed chunk AABB 即可） | `python scripts/convert_supersplat_to_ply.py -i .../3dgs_compressed.ply -o .../3dgs_standard.ply` | compressed ply | xyzrgb ply（数据盘） | 已有 `-i/-o`；默认路径仍指向 0330 | 默认 in/out 写死 0330（调用时必须传参） |
| 2 | structure/labels → scene_graph | `python mock/tools/make_scene_graph.py --scene-id {id}` | 数据盘 structure.json + labels.json | `mock/{id}/scene_graph.json` + `origin.json` | `--scene-id` / `--out` | 原 `06_make_scene_graph.py` 写死 `0330_840483`、title、ceiling 2.8 |
| 3 | 坐标标定 | `python mock/tools/calibrate.py --scene-id {id} --mock-dir mock/{id}` | compressed ply AABB + structure XY + origin.json | 控制台 + `calibrate_report.json` | 每场景独立 | 无独立脚本；0330 偏移手写进 `fix_poses.py` |
| 4 | camera_poses | `python mock/tools/fix_poses.py --scene-dir mock/{id}` | scene_graph + origin.json | `camera_poses.json` | 偏移读 origin.json | `OX=0.573` `OZ=1.087` 写死 |
| 5 | 对拍验收 | `python mock/tools/final_check.py --scene-dir mock/{id}` | scene_graph + camera_poses + origin | PASS / 残差 | 同上 | 同上 |

story_card 格式保持 **「{房间名}约{面积}平。」**，不新增文案风格。实例 `tp_{category}_{ins_id}` 沿用 0330。

## 偏移公式（形态同 0330，数值每场景不同）

scene (Y-up, house_center) → 点云 (IG Z-up)：

```
X_pc = x + ox
Y_pc = (-oz) − z
Z_pc = y
```

`ox, oz` = 房间质心均值（SPEC XZ），由步骤 2 打印并写入 `origin.json`。0330 实测为 `ox=0.573, oz=-1.087`（即 `Y_const=1.087`），**仅 0330**。

## 历史脚本（数据盘，不入库）

- `E:\科研\ventureD_data\interiorgs\scripts\06_make_scene_graph.py` — 0330 原版（硬编码）
- `E:\科研\ventureD_data\interiorgs\scripts\06_explore_0330.py` — 字段探测
- 仓库 `mock/real_0330/fix_poses.py` / `final_check.py` — 0330 转正遗留（仍硬编码，勿用于新场景）
