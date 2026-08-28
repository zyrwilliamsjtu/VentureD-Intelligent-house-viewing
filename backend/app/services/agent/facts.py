"""scene_graph 加载与事实抽取。加载复用 app.data.scene_store，不重复读盘逻辑。"""

from __future__ import annotations

from typing import Any

from app.data.listing_store import get_listing
from app.data.scene_store import load_scene_graph
from app.schemas.errors import GatewayError


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


def load_listing(listing_id: str | None) -> dict | None:
    """按 listing_id 取挂牌；未知 id 返回 None（chat 回退 scene_graph）。"""
    return get_listing(listing_id)


def listing_for_world(world_id: str) -> dict | None:
    """按 world_id 取挂牌；无挂牌或读盘失败返回 None（tour 不阻塞）。"""
    if not world_id:
        return None
    try:
        from app.data.listing_store import list_listings

        for item in list_listings():
            if isinstance(item, dict) and item.get("world_id") == world_id:
                return item
    except GatewayError:
        return None
    return None


def overlay_listing(graph: dict, listing: dict | None) -> dict:
    """挂牌覆盖 house 的价格/面积/朝向/楼层等。world_id 不一致则不覆盖（待确认：当前保守）。"""
    if not listing or not isinstance(listing, dict):
        return graph
    listing_world = listing.get("world_id")
    if listing_world and listing_world != graph.get("world_id"):
        return graph
    house = dict(house_of(graph))
    if listing.get("title"):
        house["title"] = listing["title"]
    if listing.get("layout"):
        house["type"] = listing["layout"]
    if listing.get("area") is not None:
        house["total_area"] = listing["area"]
    for key in ("orientation", "floor", "price"):
        if listing.get(key):
            house[key] = listing[key]
    if isinstance(listing.get("tags"), list):
        house["tags"] = listing["tags"]
    facts_blob = dict(house.get("facts") or {}) if isinstance(house.get("facts"), dict) else {}
    if listing.get("floor"):
        facts_blob["floor"] = listing["floor"]
    if listing.get("highlight"):
        facts_blob["highlight"] = listing["highlight"]
    house["facts"] = facts_blob
    out = dict(graph)
    out["house"] = house
    return out


def house_of(graph: dict) -> dict[str, Any]:
    house = graph.get("house")
    return house if isinstance(house, dict) else {}
