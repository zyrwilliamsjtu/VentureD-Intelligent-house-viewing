# InteriorGS 0469_840829 → SPEC scene_graph

## 数据来源

- 数据集：[spatialverse/InteriorGS](https://huggingface.co/datasets/spatialverse/InteriorGS)
- 场景 id：`0469_840829`　`world_id`：`w_0469_840829`
- 原始文件（**不入库**）：`E:\科研\ventureD_data\interiorgs\scenes\0469_840829\`
- 转换：沿用 0330 标准（`mock/CONVERT_PIPELINE.md` / `mock/tools/`），story_card 为「XX约X平。」

## 坐标（本场景独立标定，禁止套用 0330）

| 项 | 值 |
|---|---|
| house_center `ox, oz`（SPEC XZ） | **2.839056, 3.219509** |
| scene→点云 | `X = x + 2.839056`，`Y = -3.219509 − z`，`Z = y` |

ply AABB 覆盖 structure XY；标签锚点 577/577 落入 ply。对拍：10/10 房间、75/75 实例 **<1cm**，最大残差 0.0006m。

## 产出摘要

- 房间 10（四室一厅）、实例 75、tp 85
- `house.orientation/floor/price` 仍为「待对拍」；挂牌见 `mock/listings.json`
