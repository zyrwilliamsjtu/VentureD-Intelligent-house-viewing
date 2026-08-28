"""Load scene JSON by world_id and enforce SPEC coord checks."""
from __future__ import annotations

import json

from app.schemas.errors import GatewayError
from app.services.understanding.providers import get_provider


def _coord_ok(scene: dict) -> bool:
    coord = scene.get("coord")
    if not isinstance(coord, dict):
        return False
    return coord.get("unit") == "m" and coord.get("up") == "Y"


def get_scene(world_id: str) -> dict:
    try:
        scene = get_provider().get_scene_graph(world_id)
    except NotImplementedError:
        raise GatewayError(500, "SCENE_GRAPH_EMPTY", "场景语义数据为空") from None
    except (OSError, ValueError, json.JSONDecodeError):
        raise GatewayError(500, "SCENE_GRAPH_EMPTY", "场景语义数据为空") from None
    if scene is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    if not _coord_ok(scene):
        raise GatewayError(500, "SCENE_GRAPH_EMPTY", "场景语义数据为空")
    return scene
