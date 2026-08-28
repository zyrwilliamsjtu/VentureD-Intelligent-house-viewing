"""带看动线：按 tour_path 生成 steps（index / room_id / tp_id / narration / speech / selling_points）。

speech 为规则模板，不进 LLM；数字与实例只来自 scene_graph（+ 可选 listing 亮点）。
# 待确认：实例过少的房间 speech 仅「房间名+面积」，不硬凑亮点。
"""

from __future__ import annotations

import re
from typing import Any

from app.schemas.errors import GatewayError
from app.services.agent.facts import listing_for_world, load as load_facts, rooms_of
from app.services.agent.synonyms import zh_label_for_category

_HERO_ORDER = (
    "bed",
    "sofa",
    "dining_table",
    "desk",
    "refrigerator",
    "tv_cabinet",
    "wardrobe",
    "bedside_table",
    "coffee_table",
    "stove",
    "washing_machine",
    "bookshelf",
    "toilet",
    "shower",
    "sink",
    "cabinet",
    "chair",
)
_SKIP_CATS = frozenset({"curtain"})
_LOW_CATS = frozenset({"plant", "lamp", "chair"})
_MAX_ITEMS = 5


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


def _is_placeholder(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and (not value.strip() or value.startswith("待")):
        return True
    return False


def _is_bath(room: dict) -> bool:
    if str(room.get("type") or "") == "bathroom":
        return True
    name = str(room.get("name") or "")
    return "卫生" in name or "浴室" in name


def _is_bedroom(room: dict) -> bool:
    if str(room.get("type") or "") == "bedroom":
        return True
    name = str(room.get("name") or "")
    return "卧" in name and "卫生" not in name


def _compact(text: str) -> str:
    return re.sub(r"[\s。．.，,、]", "", text or "")


def _short_narration(room: dict) -> str:
    name = str(room.get("name") or "").strip()
    area = room.get("area")
    if name and isinstance(area, (int, float)):
        return f"{name}约{area}平。"
    return name


def _is_area_only_card(card: str, name: str, area: Any) -> bool:
    compact = _compact(card)
    if not compact:
        return True
    if name and compact == _compact(name):
        return True
    if name and isinstance(area, (int, float)):
        for unit in ("平", "平米", "㎡"):
            if compact == _compact(f"{name}约{area}{unit}"):
                return True
    return False


def _join_items(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return f"配有{items[0]}。"
    return f"配有{'、'.join(items[:-1])}和{items[-1]}。"


def _furniture_zh(room: dict) -> list[str]:
    insts = room.get("instances") or []
    seen: set[str] = set()
    for inst in insts:
        if not isinstance(inst, dict):
            continue
        cat = str(inst.get("category") or "").strip()
        if not cat or cat in _SKIP_CATS:
            continue
        seen.add(cat)
    heroes = [c for c in _HERO_ORDER if c in seen]
    extras = [c for c in seen if c not in heroes and c not in _SKIP_CATS]
    ordered = heroes + extras
    if "dining_table" in seen or "desk" in seen:
        ordered = [c for c in ordered if c != "chair"]
    if len([c for c in ordered if c not in _LOW_CATS]) >= 3:
        ordered = [c for c in ordered if c not in _LOW_CATS]
    names: list[str] = []
    for cat in ordered[:_MAX_ITEMS]:
        zh = zh_label_for_category(cat)
        if zh and zh not in names:
            names.append(zh)
    return names


def _ensuite(room: dict, rooms_by_id: dict) -> bool:
    if _is_bath(room) or not _is_bedroom(room):
        return False
    for aid in room.get("adjacent_rooms") or []:
        if not isinstance(aid, str):
            continue
        adj = rooms_by_id.get(aid)
        if isinstance(adj, dict) and _is_bath(adj):
            return True
    return False


def _layout_clause(room: dict, rooms_by_id: dict) -> str:
    names: list[str] = []
    for aid in room.get("adjacent_rooms") or []:
        if not isinstance(aid, str):
            continue
        adj = rooms_by_id.get(aid)
        if not isinstance(adj, dict) or _is_bath(adj):
            continue
        n = str(adj.get("name") or "").strip()
        if n and n != "其他" and n not in names:
            names.append(n)
    rname = str(room.get("name") or "")
    rtype = str(room.get("type") or "")
    if rtype == "living_room" or rname == "客厅" or len(names) > 2:
        if (_is_bedroom(room) or rtype == "study" or "书房" in rname) and "客厅" in names:
            return "与客厅相邻。"
        return ""
    if not names:
        return ""
    if len(names) == 1:
        return f"与{names[0]}相邻。"
    return f"与{'、'.join(names[:2])}相邻。"


def _speech_of(
    room: dict,
    rooms_by_id: dict[str, dict],
    *,
    listing: dict | None = None,
    is_first: bool = False,
) -> str:
    name = str(room.get("name") or "").strip() or "这里"
    area = room.get("area")
    sentences: list[str] = []

    if is_first and isinstance(listing, dict):
        hl = str(listing.get("highlight") or "").strip()
        if hl and not _is_placeholder(hl) and "InteriorGS" not in hl:
            sentences.append(hl if hl.endswith("。") else hl + "。")

    lead = f"这里是{name}"
    if isinstance(area, (int, float)):
        lead += f"，约{area}平"
    sentences.append(lead + "。")

    layout = _layout_clause(room, rooms_by_id)
    if layout:
        sentences.append(layout)

    items = _furniture_zh(room)
    if items:
        sentences.append(_join_items(items))

    if _ensuite(room, rooms_by_id):
        sentences.append("带独立卫生间。")

    blob = "".join(sentences)
    card = str(room.get("story_card") or "").strip()
    if card and not _is_area_only_card(card, name, area):
        if _compact(card) not in _compact(blob):
            sentences.append(card if card.endswith("。") else card + "。")
            blob = "".join(sentences)

    points = room.get("selling_points")
    if isinstance(points, list):
        for raw in points:
            p = str(raw).strip()
            if p and p not in blob and _compact(p) not in _compact(blob):
                sentences.append(p if p.endswith("。") else p + "。")
                blob = "".join(sentences)

    return "".join(sentences)


def build_tour(
    world_id: str | None = None,
    scene_graph: dict | None = None,
    listing: dict | None = None,
) -> dict:
    """按 tour_path 顺序生成 steps。无真实 tp_id 的房间跳过。"""
    graph = scene_graph if scene_graph is not None else load_facts(world_id or "")
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    wid = world_id or graph.get("world_id")
    if listing is None and isinstance(wid, str):
        listing = listing_for_world(wid)
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
        narr = _short_narration(room)
        if narr:
            step["narration"] = narr
        speech = _speech_of(room, rooms_by_id, listing=listing, is_first=len(steps) == 0)
        if speech:
            step["speech"] = speech
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            step["selling_points"] = [str(p) for p in points if p]
        steps.append(step)
    return {"steps": steps}
