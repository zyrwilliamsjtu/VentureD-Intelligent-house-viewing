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
from app.services.agent.synonyms import INSTANCE_ALIAS_KEYS, categories_for_text, room_name_needles

PLACEHOLDER_VALUES = frozenset({"待对拍", "待确认"})


class Facts(TypedDict):
    missing: bool
    query: str
    room: dict | None
    instance: dict | None
    host_room: dict | None
    house: dict | None
    asked_keys: list[str]
    hints: str
    instances: list
    room_hits: list


def _facts(**kwargs: Any) -> Facts:
    base: Facts = {
        "missing": False,
        "query": "",
        "room": None,
        "instance": None,
        "host_room": None,
        "house": None,
        "asked_keys": [],
        "hints": "",
        "instances": [],
        "room_hits": [],
    }
    base.update(kwargs)  # type: ignore[typeddict-item]
    return base


def empty_facts(query: str = "", *, graph: dict | None = None) -> Facts:
    hints = offer_topics(graph) if graph else ""
    return _facts(missing=True, query=query, hints=hints)


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
    hits = find_rooms_in_text(graph, text)
    return hits[0] if hits else None


def find_rooms_in_text(graph: dict, text: str) -> list[dict]:
    """房间别名展开 + 名称/id 包含匹配，返回全部命中（短名优先）。"""
    t = (text or "").strip()
    if not t:
        return []
    needles = room_name_needles(t)
    name = _longest_in_text(t, room_names_of(graph))
    if name and name not in needles:
        needles.append(name)
    if not needles:
        return []
    hits: list[dict] = []
    seen: set[str] = set()
    for room in facts_mod.rooms_of(graph):
        if not isinstance(room, dict):
            continue
        rid = str(room.get("id") or "")
        rname = str(room.get("name") or "")
        blob = f"{rid} {rname}".lower()
        ok = False
        for n in needles:
            nl = n.lower()
            if nl and (nl in rname or nl in rid.lower() or nl in blob):
                ok = True
                break
        if not ok:
            continue
        key = rid or rname
        if key in seen:
            continue
        seen.add(key)
        hits.append(room)
    hits.sort(key=lambda r: len(str(r.get("name") or "")))
    return hits


def _inst_blob(inst: dict) -> str:
    cat = str(inst.get("category") or "")
    zh = CATEGORY_ZH.get(cat, cat)
    tag = str(inst.get("tag") or "")
    attrs = inst.get("attrs") if isinstance(inst.get("attrs"), dict) else {}
    extra = " ".join(str(v) for v in attrs.values() if v)
    return f"{cat} {zh} {tag} {extra}".lower()


def find_instances_in_text(graph: dict, text: str) -> list[tuple[dict, dict]]:
    """别名展开 + 类别/中英标签包含匹配，返回全部 (instance, host_room)。"""
    t = (text or "").strip()
    if not t:
        return []
    cats = categories_for_text(t, extra_zh=CATEGORY_ZH)
    keys = instance_keywords_of(graph)
    hit = _longest_in_text(t, keys)
    if hit:
        mapped = ZH_TO_CATEGORY.get(hit)
        if mapped:
            cats.add(mapped)
    needles = {n.lower() for n in ([hit] if hit else []) if n}
    needles.update(c.lower() for c in cats)
    needles.update(CATEGORY_ZH[c].lower() for c in cats if c in CATEGORY_ZH)
    if not cats and not needles:
        return []
    hits: list[tuple[dict, dict]] = []
    seen: set[str] = set()
    for room in facts_mod.rooms_of(graph):
        if not isinstance(room, dict):
            continue
        for inst in room.get("instances") or []:
            if not isinstance(inst, dict):
                continue
            cat = str(inst.get("category") or "")
            blob = _inst_blob(inst)
            matched = bool(cat and cat in cats)
            if not matched:
                for n in needles:
                    if n and (n == cat or n in blob or cat.lower() in n):
                        matched = True
                        break
            if not matched:
                continue
            iid = str(inst.get("id") or id(inst))
            if iid in seen:
                continue
            seen.add(iid)
            hits.append((inst, room))
    return hits


def find_instance_in_text(graph: dict, text: str) -> tuple[dict | None, dict | None]:
    hits = find_instances_in_text(graph, text)
    if not hits:
        return None, None
    return hits[0]


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


def offer_topics(graph: dict) -> str:
    """可答方向（仅 scene_graph 里有的名字），供引导话术与 LLM。"""
    names: list[str] = []
    for room in facts_mod.rooms_of(graph):
        name = str(room.get("name") or "").strip()
        if not name or name == "其他" or name in names:
            continue
        names.append(name)
        if len(names) >= 3:
            break
    cats: list[str] = []
    for inst in facts_mod.instances_of(graph):
        if not isinstance(inst, dict):
            continue
        cat = str(inst.get("category") or "")
        zh = CATEGORY_ZH.get(cat, cat)
        if zh and zh not in cats:
            cats.append(zh)
        if len(cats) >= 3:
            break
    house = facts_mod.house_of(graph) or {}
    bits: list[str] = []
    if names:
        bits.append("带您看看" + "、".join(names))
    if house.get("type") and not is_placeholder_value(house.get("type")):
        bits.append("介绍一下户型")
    elif house.get("total_area") and not is_placeholder_value(house.get("total_area")):
        bits.append("介绍一下面积")
    if cats:
        bits.append("问问" + "、".join(cats))
    if not bits:
        return "介绍一下这套房里能看到的房间"
    if len(bits) == 1:
        return bits[0]
    return bits[0] + "，或者" + bits[1]


def catalog_brief(graph: dict) -> str:
    """给 LLM 路由用的短目录：只列真实存在的房间名/家具类/挂牌字段，不塞整份 JSON。"""
    rooms = [str(r.get("name") or "") for r in facts_mod.rooms_of(graph) if r.get("name")]
    cats: list[str] = []
    for inst in facts_mod.instances_of(graph):
        if not isinstance(inst, dict):
            continue
        zh = CATEGORY_ZH.get(str(inst.get("category") or ""), "")
        if zh and zh not in cats:
            cats.append(zh)
    house = facts_mod.house_of(graph) or {}
    lines = [
        "房间名（仅这些）：" + "、".join(rooms[:12]),
        "家具类别（仅这些）：" + "、".join(cats[:16]),
    ]
    for key, label in (("type", "户型"), ("total_area", "面积"), ("price", "价格"), ("orientation", "朝向")):
        val = house.get(key)
        if val is not None and not is_placeholder_value(val):
            lines.append(f"{label}={val}")
        else:
            lines.append(f"{label}=数据未提供")
    return "\n".join(lines)


def retrieve(
    intent: Intent,
    user_text: str | None,
    scene_graph: dict,
    *,
    room_id: str | None = None,
) -> Facts:
    text = (user_text or "").strip()
    house = facts_mod.house_of(scene_graph) or None
    hints = offer_topics(scene_graph)

    if intent in (Intent.UNKNOWN, Intent.SMALLTALK, Intent.CLARIFY):
        return _facts(missing=False, query=text, house=house, hints=hints)

    if intent == Intent.ENTER_ROOM:
        room = facts_mod.find_room_by_id(scene_graph, room_id) if room_id else None
        if room is None:
            return empty_facts(room_id or text, graph=scene_graph)
        return _facts(query=text, room=room, house=house, hints=hints)

    if intent == Intent.PROPERTY:
        asked = _asked_property_keys(text) or ["type", "total_area"]
        return _facts(query=text, house=house, asked_keys=asked, hints=hints)

    inst_hits = find_instances_in_text(scene_graph, text)
    inst, host = (inst_hits[0] if inst_hits else (None, None))
    room_hits = find_rooms_in_text(scene_graph, text)
    room = room_hits[0] if room_hits else None

    if intent == Intent.NAVIGATION:
        inst_hit = _longest_in_text(text, instance_keywords_of(scene_graph))
        if inst is not None and (inst_hit or categories_for_text(text, extra_zh=CATEGORY_ZH)):
            return _facts(
                query=text,
                instance=inst,
                host_room=host,
                house=house,
                hints=hints,
                instances=[i for i, _ in inst_hits],
                room_hits=room_hits,
            )
        if room is not None:
            return _facts(query=text, room=room, house=house, hints=hints, room_hits=room_hits)
        if inst is not None:
            return _facts(
                query=text,
                instance=inst,
                host_room=host,
                house=house,
                hints=hints,
                instances=[i for i, _ in inst_hits],
            )
        zh = _longest_in_text(text, list(CATEGORY_ZH.values()) + list(INSTANCE_ALIAS_KEYS))
        return empty_facts(zh or text, graph=scene_graph)

    if intent == Intent.INSTANCE:
        if inst is None:
            zh = _longest_in_text(text, list(CATEGORY_ZH.values()))
            return empty_facts(zh or text, graph=scene_graph)
        return _facts(
            query=text,
            instance=inst,
            host_room=host,
            house=house,
            hints=hints,
            instances=[i for i, _ in inst_hits],
        )

    return empty_facts(text, graph=scene_graph)
