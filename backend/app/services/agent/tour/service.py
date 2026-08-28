"""带看动线：按 tour_path 生成 steps（index / room_id / tp_id / narration / selling_points）。"""

from __future__ import annotations

from typing import Any

from app.schemas.errors import GatewayError
from app.services.agent.facts import load as load_facts, rooms_of


def _tp_set(graph: dict) -> set[str]:
    ids: set[str] = set()
    for room in rooms_of(graph):
        tp = room.get("trajectory_point_id")
        if isinstance(tp, str) and tp:
            ids.add(tp)
        for inst in room.get("instances") or []:
            if isinstance(inst, dict):
                itp = inst.get("trajectory_point_id")
                if isinstance(itp, str) and itp:
                    ids.add(itp)
    return ids


def _narration_of(room: dict) -> str:
    card = (room.get("story_card") or "").strip()
    if card:
        return card
    name = str(room.get("name") or "").strip()
    area = room.get("area")
    if name and area is not None:
        return f"{name}约{area}平。"
    return name


def build_tour(world_id: str | None = None, scene_graph: dict | None = None) -> dict:
    """按 tour_path 顺序生成 steps。无真实 tp_id 的房间跳过。"""
    graph = scene_graph if scene_graph is not None else load_facts(world_id or "")
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    allowed = _tp_set(graph)
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
        tp = room.get("trajectory_point_id")
        if not isinstance(tp, str) or tp not in allowed:
            continue
        step: dict[str, Any] = {
            "index": len(steps),
            "room_id": room_id,
            "trajectory_point_id": tp,
        }
        narr = _narration_of(room)
        if narr:
            step["narration"] = narr
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            step["selling_points"] = [str(p) for p in points if p]
        steps.append(step)
    return {"steps": steps}
