"""Load scene JSON by world_id and enforce SPEC coord checks."""
from __future__ import annotations

import json

from app.data.scene_store import load_scene_graph
from app.schemas.errors import GatewayError


def _coord_ok(scene: dict) -> bool:
    coord = scene.get("coord")
    if not isinstance(coord, dict):
        return False
    return coord.get("unit") == "m" and coord.get("up") == "Y"


def get_scene(world_id: str) -> dict:
    try:
        scene = load_scene_graph(world_id)
    except (OSError, ValueError, json.JSONDecodeError):
        raise GatewayError(500, "SCENE_GRAPH_EMPTY", "场景语义数据为空") from None
    if scene is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    if not _coord_ok(scene):
        raise GatewayError(500, "SCENE_GRAPH_EMPTY", "场景语义数据为空")
    return scene
