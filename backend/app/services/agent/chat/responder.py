"""模板回复。只填 grounding 得到的字段，不从常识补全。"""

from __future__ import annotations

from app.services.agent.chat.grounding import Facts, is_placeholder_field, is_placeholder_value
from app.services.agent.chat.intent import CATEGORY_ZH, Intent

_SKIP_ATTR_KEYS = frozenset({"source_label"})

SMALLTALK_REPLY = "您好，我是 AI 置业顾问小安，可以带您了解这套房。"
UNKNOWN_REPLY = "我可以帮您了解这套房（房间、家具、户型）。请问您想问什么？"
MISSING_REPLY = "这套房里没有关于「{q}」的可靠信息。"


def _zh_category(inst: dict) -> str:
    cat = str(inst.get("category") or "")
    return CATEGORY_ZH.get(cat, cat or "这件家具")


def _public_attrs(inst: dict) -> dict[str, str]:
    raw = inst.get("attrs")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, val in raw.items():
        if key in _SKIP_ATTR_KEYS or val is None:
            continue
        text = str(val).strip()
        if not text or is_placeholder_value(text):
            continue
        out[str(key)] = text
    return out


def generate(facts: Facts, intent: Intent, scene_graph: dict) -> str:
    _ = scene_graph
    if intent == Intent.SMALLTALK:
        return SMALLTALK_REPLY
    if intent == Intent.UNKNOWN and not facts["missing"]:
        return UNKNOWN_REPLY

    if facts["missing"]:
        q = facts.get("query") or "这项"
        return MISSING_REPLY.format(q=q)

    if intent == Intent.ENTER_ROOM:
        room = facts["room"] or {}
        card = str(room.get("story_card") or "").strip()
        if card:
            return card
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            return "；".join(str(p) for p in points if p)
        return MISSING_REPLY.format(q=room.get("name") or "这个房间")

    if intent == Intent.NAVIGATION:
        inst = facts["instance"]
        if inst is not None:
            host = facts["host_room"] or {}
            name = _zh_category(inst)
            where = host.get("name") or "屋里"
            return f"好的，带您去看{name}，在{where}。"
        room = facts["room"] or {}
        name = str(room.get("name") or "那里")
        card = str(room.get("story_card") or "").strip()
        if card:
            return f"好的，带您去{name}。{card}"
        return f"好的，带您去{name}。"

    if intent == Intent.PROPERTY:
        return _property_reply(facts)

    if intent == Intent.INSTANCE:
        inst = facts["instance"] or {}
        name = _zh_category(inst)
        attrs = _public_attrs(inst)
        tag = inst.get("tag")
        bits = [f"{k}:{v}" for k, v in attrs.items()]
        if tag and str(tag) not in bits:
            bits.insert(0, str(tag))
        if not bits:
            return f"这套房的{name}没有更多信息。"
        return f"{name}：{'，'.join(bits)}。"

    return UNKNOWN_REPLY


def _property_reply(facts: Facts) -> str:
    house = facts["house"] or {}
    asked = facts.get("asked_keys") or ["type", "total_area"]
    chunks: list[str] = []
    missing_named: list[str] = []

    labels = {
        "type": "户型",
        "total_area": "面积",
        "orientation": "朝向",
        "price": "价格",
        "floor": "楼层",
        "ceiling_height": "层高",
    }

    for key in asked:
        if key == "ceiling_height":
            blob = house.get("facts") if isinstance(house.get("facts"), dict) else {}
            val = blob.get("ceiling_height")
        else:
            val = house.get(key)
        if is_placeholder_field(house, key) or is_placeholder_value(val):
            missing_named.append(labels.get(key, key))
            continue
        if key == "total_area" and val is not None:
            chunks.append(f"{val}㎡")
        elif key == "ceiling_height" and val is not None:
            chunks.append(f"层高{val}米")
        elif val:
            chunks.append(str(val))

    if chunks and not missing_named:
        return "，".join(chunks) + "。"
    if chunks and missing_named:
        return "，".join(chunks) + "。" + "、".join(missing_named) + "数据未提供。"
    if missing_named:
        return "、".join(missing_named) + "数据未提供。"
    return MISSING_REPLY.format(q="户型")
