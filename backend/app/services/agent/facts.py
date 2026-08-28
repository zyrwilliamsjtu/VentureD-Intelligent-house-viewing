"""scene_graph 加载与事实抽取。加载复用 app.data.scene_store，不重复读盘逻辑。"""

from __future__ import annotations

from typing import Any

from app.data.scene_store import load_scene_graph


def load(world_id: str) -> dict | None:
    """加载 SPEC 结构 scene_graph dict；未知 world_id 返回 None。"""
    return load_scene_graph(world_id)


def rooms_of(graph: dict) -> list[dict]:
    rooms = graph.get("rooms")
    return rooms if isinstance(rooms, list) else []


def instances_of(graph: dict) -> list[dict]:
    """扁平化全部房间内实例。"""
    out: list[dict] = []
    for room in rooms_of(graph):
        insts = room.get("instances")
        if not isinstance(insts, list):
            continue
        for inst in insts:
            if isinstance(inst, dict):
                out.append(inst)
    return out


def find_room_by_id(graph: dict, room_id: str) -> dict | None:
    for room in rooms_of(graph):
        if room.get("id") == room_id:
            return room
    return None


def find_rooms_by_name(graph: dict, name: str) -> list[dict]:
    """按房间中文名子串检索。本阶段简单占位，M1 grounding 再收紧。"""
    if not name:
        return []
    needle = name.strip()
    return [r for r in rooms_of(graph) if needle in str(r.get("name") or "")]


def find_instances_by_category(graph: dict, category: str) -> list[dict]:
    """按 instance_category 精确匹配。本阶段简单占位。"""
    if not category:
        return []
    return [i for i in instances_of(graph) if i.get("category") == category]


def find_instances_by_query(graph: dict, query: str) -> list[dict]:
    """按 tag / id / category 子串检索。本阶段简单占位，不保证消歧。"""
    if not query:
        return []
    needle = query.strip().lower()
    hits: list[dict] = []
    for inst in instances_of(graph):
        blob = " ".join(
            str(inst.get(k) or "")
            for k in ("id", "category", "tag")
        ).lower()
        if needle in blob:
            hits.append(inst)
    return hits


def house_of(graph: dict) -> dict[str, Any]:
    house = graph.get("house")
    return house if isinstance(house, dict) else {}
