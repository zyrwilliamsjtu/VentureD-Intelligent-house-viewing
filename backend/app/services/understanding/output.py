"""理解层核心产出（PI 板块交付物）。

本模块不改变 GET /api/scene 的 JSON 形状，只把「产出是什么、给谁用」写进类型与文档，
便于代码与 SPEC v2.2 对齐、将来 DualEngineProvider 替换 GT 透传。
"""
from __future__ import annotations

from typing import Any, TypedDict


class UnderstandingOutput(TypedDict, total=False):
    """理解层的核心产出 = SPEC v2.2 三级语义 `scene_graph`。

    结构：
        house / rooms[] / rooms[].instances[] + coord + tour_path + topology

    内容（PI 原定职责）：
        - 三级拓扑：house → rooms → instances，以及 topology.adjacency
        - 房间位置：rooms[].polygon + trajectory_point_id
        - 实例位置：instances[].position + bbox3d + trajectory_point_id

    消费方：
        - B 的 agent：场景知识库（房间/实例/坐标/拓扑 → 回答、卖点、导航）
        - A 的前端：图纸（小地图 / 标注 / 镜头映射）

    来源机制：
        - 当前：GTProvider 从 mock scene_graph.json 透传
        - 未来：DualEngineProvider 计算产出
        对外格式始终遵循 SPEC v2.2，本类型只是标注，不另造字段。
    """

    world_id: str
    coord: dict[str, Any]
    house: dict[str, Any]
    rooms: list[dict[str, Any]]
    tour_path: list[str]
    topology: dict[str, Any]
