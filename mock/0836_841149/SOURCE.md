# InteriorGS 0836_841149 → SPEC scene_graph

## 数据来源

- 场景 id：`0836_841149`　`world_id`：`w_0836_841149`
- 原始文件（**不入库**）：`E:\科研\ventureD_data\interiorgs\scenes\0836_841149\`
- 转换：0330 标准流程（`mock/CONVERT_PIPELINE.md`）

## 坐标（本场景独立标定，禁止套用 0330）

| 项 | 值 |
|---|---|
| house_center `ox, oz` | **0.314266, 0.446865** |
| scene→点云 | `X = x + 0.314266`，`Y = -0.446865 − z`，`Z = y` |

ply 覆盖 structure XY；锚点 491/491。对拍：10/10 房间、86/86 实例 **<1cm**，最大残差 0.0007m。

## 产出摘要

- 房间 10（三室一厅）、实例 86、tp 96
- 客餐厨一体按 0330 规则标成 `room_kitchen`（32 平，内含沙发/餐桌）——未改推断规则
