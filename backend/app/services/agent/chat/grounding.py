"""从 scene_graph 精确取证。匹配不到 → missing，禁止编造。"""

from __future__ import annotations

from typing import Any, TypedDict

from app.services.agent import facts as facts_mod
from app.services.agent.chat.intent import (
    CATEGORY_ZH,
    ZH_TO_CATEGORY,
    Intent,
    _longest_in_text,
    instance_keywords_of,
    room_names_of,
)

PLACEHOLDER_VALUES = frozenset({"待对拍", "待确认"})


class Facts(TypedDict):
    missing: bool
    query: str
    room: dict | None
    instance: dict | None
    host_room: dict | None
    house: dict | None
    asked_keys: list[str]


def _facts(**kwargs: Any) -> Facts:
    base: Facts = {
        "missing": False,
        "query": "",
        "room": None,
        "instance": None,
        "host_room": None,
        "house": None,
        "asked_keys": [],
    }
    base.update(kwargs)  # type: ignore[typeddict-item]
    return base


def empty_facts(query: str = "") -> Facts:
    return _facts(missing=True, query=query)


def is_placeholder_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and (value in PLACEHOLDER_VALUES or value.startswith("待")):
        return True
    return False


def is_placeholder_field(house: dict | None, key: str) -> bool:
    if not house:
        return True
    if key == "ceiling_height":
        blob = house.get("facts") if isinstance(house.get("facts"), dict) else {}
        return is_placeholder_value(blob.get("ceiling_height"))
    return is_placeholder_value(house.get(key))


def find_room_in_text(graph: dict, text: str) -> dict | None:
    name = _longest_in_text(text, room_names_of(graph))
    if not name:
        return None
    hits = facts_mod.find_rooms_by_name(graph, name)
    return hits[0] if hits else None


def find_instance_in_text(graph: dict, text: str) -> tuple[dict | None, dict | None]:
    keys = instance_keywords_of(graph)
    hit = _longest_in_text(text, keys)
    if not hit:
        return None, None
    category = ZH_TO_CATEGORY.get(hit)
    for room in facts_mod.rooms_of(graph):
        for inst in room.get("instances") or []:
            if not isinstance(inst, dict):
                continue
            if category and inst.get("category") == category:
                return inst, room
            if inst.get("tag") and hit == str(inst.get("tag")):
                return inst, room
            attrs = inst.get("attrs") if isinstance(inst.get("attrs"), dict) else {}
            if hit in {str(v) for v in attrs.values()}:
                return inst, room
    return None, None


def _asked_property_keys(text: str) -> list[str]:
    asked: list[str] = []

    def add(key: str) -> None:
        if key not in asked:
            asked.append(key)

    if any(k in text for k in ("朝向", "哪朝")):
        add("orientation")
    if any(k in text for k in ("面积", "多大", "多少平", "几平", "建面")):
        add("total_area")
    if "这套房" in text:
        add("type")
        add("total_area")
    if any(k in text for k in ("户型", "几室")):
        add("type")
    if any(k in text for k in ("价格", "总价", "多少钱")):
        add("price")
    if "楼层" in text:
        add("floor")
    if "层高" in text:
        add("ceiling_height")
    return asked


def retrieve(
    intent: Intent,
    user_text: str | None,
    scene_graph: dict,
    *,
    room_id: str | None = None,
) -> Facts:
    text = (user_text or "").strip()
    house = facts_mod.house_of(scene_graph) or None

    if intent in (Intent.UNKNOWN, Intent.SMALLTALK):
        return _facts(missing=False, query=text, house=house)

    if intent == Intent.ENTER_ROOM:
        room = facts_mod.find_room_by_id(scene_graph, room_id) if room_id else None
        if room is None:
            return empty_facts(room_id or text)
        return _facts(query=text, room=room, house=house)

    if intent == Intent.PROPERTY:
        asked = _asked_property_keys(text) or ["type", "total_area"]
        return _facts(query=text, house=house, asked_keys=asked)

    inst, host = find_instance_in_text(scene_graph, text)
    room = find_room_in_text(scene_graph, text)

    if intent == Intent.NAVIGATION:
        inst_hit = _longest_in_text(text, instance_keywords_of(scene_graph))
        if inst is not None and inst_hit:
            return _facts(query=text, instance=inst, host_room=host, house=house)
        if room is not None:
            return _facts(query=text, room=room, house=house)
        if inst is not None:
            return _facts(query=text, instance=inst, host_room=host, house=house)
        zh = _longest_in_text(text, list(CATEGORY_ZH.values()))
        return empty_facts(zh or text)

    if intent == Intent.INSTANCE:
        if inst is None:
            zh = _longest_in_text(text, list(CATEGORY_ZH.values()))
            return empty_facts(zh or text)
        return _facts(query=text, instance=inst, host_room=host, house=house)

    return empty_facts(text)
