# InteriorGS 0330_840483 → SPEC scene_graph

## 数据来源

- 数据集：[spatialverse/InteriorGS](https://huggingface.co/datasets/spatialverse/InteriorGS)（gated）
- 场景 id：`0330_840483`
- 发布方：群核 Manycore / SpatialVerse（SAGE-3D 配套室内 3DGS）
- 本机原始文件（**不入库**）：`E:\科研\ventureD_data\interiorgs\scenes\0330_840483\`
  - `3dgs_compressed.ply`、`structure.json`、`labels.json`、`occupancy.png`、`occupancy.json`

本目录 `mock/real_0330/` 只含转换后的小文件（`scene_graph.json`、`camera_poses.json`、本文档）。

## 转换脚本

- `E:\科研\ventureD_data\interiorgs\scripts\06_make_scene_graph.py`
- 探索脚本：`06_explore_0330.py`（字段探测，不写入契约文件）

`world_id`：`w_0330_840483`

## 坐标转换

InteriorGS 官方为右手系、**Z-up**、米；`rooms[].profile` 在 XY 地面；3DGS 轴为 `XYZ = (Right, Back, Up)`。

SPEC v2.2 契约层为右手系、**Y-up**、地面 XZ、`polygon = [x, z]`、`origin = house_center`。

已拍板映射（保持右手系）：

```
(x, y, z)_Zup  →  (x, z, -y)_Yup
polygon [IG_x, IG_y]  →  [IG_x, -IG_y]
再减去房间质心均值
```

本场景 `house_center` 偏移：**(0.573, -1.087)**（SPEC 的 X / Z）。

点云层（A 玩家）为 **-Y up**。`camera_poses.json` 草稿由 scene Y-up `(x,y,z)` 再按 `(x,-y,z)` 翻转，**待对拍，不保证绝对精度**。

## 房间类型推断

`structure.json` **没有** `room_type` / `ins`（与官方文档不一致，HF discussion #5 亦确认）。类型按「落在该房间 polygon 内的 `labels.json` 实例标签」推断：

| 规则 | SPEC `type` | `name` |
|---|---|---|
| sofa / tv / 茶几（客餐一体不拆餐厅） | `living_room` | 客厅 |
| refrigerator（本场景无灶） | `kitchen` | 厨房 |
| washing_machine + sink，无马桶/淋浴 | `bathroom` | 洗衣间 |
| shower / toilet | `bathroom` | 卫生间… |
| bed；面积最大为主卧 | `bedroom` | 主卧 / 次卧 / 卧室3 |
| desk 且无 bed | `study` | 书房 |

厨房内的 `wardrobe` **保留**（PI 拍板）。

## 实例映射

只保留 SPEC §1.2 的 20 类枚举；其余（书、饰品、酒杯、墙板等）omit。

- **排除 `downlights`**
- `lamp` 仅 `floor lamp` / `table lamp`

## polygon 简化

Douglas-Peucker，`eps = 0.08 m`，简化后 ≥ 3 顶点；输出为俯视逆时针（`polygon_winding: ccw_top`）。

## 占位字段

| 字段 | 状态 |
|---|---|
| `house.total_area` | 实测房间面积之和（约 120.1 ㎡） |
| `house.facts.ceiling_height` | **2.8**（`walls[].height` 实测） |
| `house.title` / `orientation` / `floor` / `price` / `tags` | **占位**，数据集无这些字段 |
| 物业费 / 得房率 / 学区等 | **未填**（禁止编造） |

## 待办

- [ ] **坐标对拍**（scene Y-up ↔ 点云 -Y up）完成后，用实测值更新 `camera_poses.json` 并转正附录 A
- [ ] 后端 `GET /api/scene/{world_id}`：`w_0330_840483` → 本目录；`w_mock_001` → 手写 `mock/scene_graph.json`
