"""GET /api/camera_poses/{world_id} — tp_id → 点云坐标。"""
from __future__ import annotations

import json

from app.data.pose_store import load_camera_poses
from app.schemas.errors import GatewayError


def get_camera_poses(world_id: str) -> dict:
    try:
        poses = load_camera_poses(world_id)
    except (OSError, ValueError, json.JSONDecodeError):
        raise GatewayError(500, "SCENE_GRAPH_EMPTY", "场景语义数据为空") from None
    if poses is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    return {"world_id": world_id, "poses": poses}
