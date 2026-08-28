"""带看动线：按 tour_path 拼 steps（room_id / tp_id / narration / selling_points）。"""

from __future__ import annotations

from typing import Any

from app.schemas.errors import GatewayError
from app.services.agent.facts import load as load_facts, rooms_of


def build_tour(world_id: str) -> dict:
    graph = load_facts(world_id)
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    rooms_by_id = {r.get("id"): r for r in rooms_of(graph) if r.get("id")}
    path = graph.get("tour_path")
    if not isinstance(path, list):
        path = []
    steps: list[dict[str, Any]] = []
    for room_id in path:
        if not isinstance(room_id, str):
            continue
        room = rooms_by_id.get(room_id)
        if not isinstance(room, dict):
            continue
        step: dict[str, Any] = {"room_id": room_id}
        tp = room.get("trajectory_point_id")
        if tp:
            step["trajectory_point_id"] = tp
        card = (room.get("story_card") or "").strip()
        if card:
            step["narration"] = card
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            step["selling_points"] = points
        steps.append(step)
    return {"steps": steps}
