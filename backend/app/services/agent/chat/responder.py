"""模板回复。只填 grounding 得到的字段，不从常识补全。友好引导 ≠ 编造。"""

from __future__ import annotations

from typing import Any

from app.services.agent import facts as facts_mod
from app.services.agent.chat.grounding import Facts, is_placeholder_field, is_placeholder_value, offer_topics
from app.services.agent.chat.intent import CATEGORY_ZH, Intent, _longest_in_text, is_existence_query, strip_query
from app.services.agent.synonyms import INSTANCE_ALIAS_KEYS

_SKIP_ATTR_KEYS = frozenset({"source_label"})

SMALLTALK_VARIANTS = (
    "您好，我是 AI 置业顾问小安。这套房我可以带您看房间、讲户型，您想先看哪一间？",
    "您好，我是小安。想先逛房间，还是先听户型和面积？您开口就好。",
    "您好，置业顾问小安在。房间、家具、户型我都能介绍，您想从哪问起？",
)
UNKNOWN_VARIANTS = (
    "这套房我可以带您看房间和家具，也可以介绍户型、面积。您想先看哪一间，或者问一件家具也可以。",
    "没听清您具体想问哪一块。房间带看、家具位置、户型面积我都能讲，您点一项就行。",
    "我可以按房间带您看，也可以讲户型面积。您想先看哪一间？",
)
CLARIFY_VARIANTS = (
    "这套房您更关心户型、价格还是朝向？我按您关心的讲，不瞎编。",
    "想帮您说到点上：更在意户型、价格，还是朝向？您选一个我展开。",
    "您更关心户型、价格还是朝向？定了方向我再细讲。",
)
MISSING_REPLY = "抱歉，这套房暂时没有「{q}」的可靠信息，这项暂未提供。"

# 兼容旧测试常量
SMALLTALK_REPLY = SMALLTALK_VARIANTS[0]
UNKNOWN_REPLY = UNKNOWN_VARIANTS[0]
CLARIFY_REPLY = CLARIFY_VARIANTS[0]


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


def _host_name(graph: dict, inst: dict) -> str:
    iid = inst.get("id")
    for room in graph.get("rooms") or []:
        if not isinstance(room, dict):
            continue
        for item in room.get("instances") or []:
            if isinstance(item, dict) and (item is inst or item.get("id") == iid):
                return str(room.get("name") or "屋里")
    return "屋里"


def _existence_reply(facts: Facts, scene_graph: dict, salt: int) -> str:
    insts = list(facts.get("instances") or [])
    if facts.get("instance") and facts["instance"] not in insts:
        insts.insert(0, facts["instance"])
    if insts:
        bits: list[str] = []
        seen: set[str] = set()
        for inst in insts:
            name = _zh_category(inst)
            where = _host_name(scene_graph, inst)
            key = f"{where}:{name}"
            if key in seen:
                continue
            seen.add(key)
            bits.append(f"{where}有{name}")
        core = "，".join(bits)
        if len(bits) == 1:
            # 有的，客厅有一张餐桌
            where_name = bits[0].replace("有", "有一张", 1) if "有" in bits[0] else bits[0]
            return f"有的，{where_name}。"
        variants = (
            f"有的，{core}。",
            f"有的，{core}，我可以带您去看。",
        )
        return _pick(variants, salt)
    rooms = list(facts.get("room_hits") or [])
    if facts.get("room") and facts["room"] not in rooms:
        rooms.insert(0, facts["room"])
    if rooms:
        names: list[str] = []
        for room in rooms:
            n = str(room.get("name") or "").strip()
            if n and n not in names:
                names.append(n)
        label = "、".join(names) if names else "相关房间"
        return f"有的，这套房有{label}。"
    asked = _existence_object_name(str(facts.get("query") or ""))
    return f"这套房里没有找到{asked}。" + _guide_tail(scene_graph)


def _existence_object_name(query: str) -> str:
    q = strip_query(query)
    hit = _longest_in_text(q, list(CATEGORY_ZH.values()) + list(INSTANCE_ALIAS_KEYS))
    return hit or q or "这项"


def _guide_tail(graph: dict) -> str:
    return f"不过我可以{offer_topics(graph)}，您看需要吗？"


def _pick(options: tuple[str, ...], salt: int) -> str:
    if not options:
        return ""
    return options[abs(salt) % len(options)]


def _bridge(history: list[dict[str, Any]] | None, current_room: str | None) -> str:
    """最近一轮用户问题 + 当前房间，用于连贯，不编造事实。"""
    if not history:
        return ""
    last_user = ""
    for item in reversed(history):
        if isinstance(item, dict) and item.get("role") == "user" and item.get("text"):
            last_user = str(item["text"]).strip()
            break
    bits: list[str] = []
    if last_user:
        bits.append(f"您刚提到「{last_user[:24]}」")
    if current_room:
        bits.append("我们还在当前房间")
    if not bits:
        return ""
    return "；".join(bits) + "。"


def generate(
    facts: Facts,
    intent: Intent,
    scene_graph: dict,
    *,
    history: list[dict[str, Any]] | None = None,
    current_room: str | None = None,
) -> str:
    salt = len(history or [])
    ctx = _bridge(history, current_room)

    if intent == Intent.SMALLTALK:
        return _pick(SMALLTALK_VARIANTS, salt)
    if intent == Intent.CLARIFY:
        return _pick(CLARIFY_VARIANTS, salt)
    if intent == Intent.UNKNOWN and not facts["missing"]:
        extra = f"比如我可以{offer_topics(scene_graph)}。"
        body = _pick(UNKNOWN_VARIANTS, salt) + extra
        return (ctx + body) if ctx else body

    if facts["missing"]:
        q = facts.get("query") or "这项"
        if is_existence_query(str(facts.get("query") or "")) or intent == Intent.EXISTENCE:
            asked = _existence_object_name(str(q))
            return f"这套房里没有找到{asked}。" + _guide_tail(scene_graph)
        return MISSING_REPLY.format(q=q) + _guide_tail(scene_graph)

    if intent == Intent.HOUSE_OVERVIEW:
        return _overview_reply(facts, scene_graph, salt)

    if intent == Intent.ENTER_ROOM:
        room = facts["room"] or {}
        card = str(room.get("story_card") or "").strip()
        if card:
            return card
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            return "；".join(str(p) for p in points if p)
        return MISSING_REPLY.format(q=room.get("name") or "这个房间") + _guide_tail(scene_graph)

    if intent == Intent.EXISTENCE:
        return _existence_reply(facts, scene_graph, salt)

    if intent == Intent.NAVIGATION:
        if is_existence_query(str(facts.get("query") or "")):
            return _existence_reply(facts, scene_graph, salt)
        if facts.get("already_here"):
            room = facts["room"] or {}
            name = str(room.get("name") or "这里")
            card = str(room.get("story_card") or "").strip()
            lead = f"您已经在{name}了，我帮您介绍一下。"
            if card and card not in lead:
                lead += card
            return lead
        inst = facts["instance"]
        if inst is not None:
            host = facts["host_room"] or {}
            name = _zh_category(inst)
            where = host.get("name") or "屋里"
            variants = (
                f"好的，这就带您去看{where}的{name}，我帮您看一下。",
                f"请跟我来，去{where}看{name}。",
                f"没问题，带您去{where}的{name}。",
            )
            text = _pick(variants, salt)
            return f"{ctx}{text}" if ctx else text
        room = facts["room"] or {}
        name = str(room.get("name") or "那里")
        area = room.get("area")
        card = str(room.get("story_card") or "").strip()
        if isinstance(area, (int, float)):
            variants = (
                f"好的，这就带您去{name}，{name}约 {area} 平。",
                f"请跟我来，带您去{name}，大约 {area} 平。",
                f"没问题，带您去{name}看看，约 {area} 平。",
            )
            lead = _pick(variants, salt)
        else:
            lead = f"好的，这就带您去{name}。"
        if card:
            lead = f"{lead}{card}" if lead.endswith("。") else f"{lead}。{card}"
        return f"{ctx}{lead}" if ctx else lead

    if intent == Intent.PROPERTY:
        return _property_reply(facts, scene_graph, salt)

    if intent == Intent.INSTANCE:
        inst = facts["instance"] or {}
        name = _zh_category(inst)
        host = facts["host_room"] or {}
        where = str(host.get("name") or "").strip()
        attrs = _public_attrs(inst)
        tag = inst.get("tag")
        bits = [f"{k}:{v}" for k, v in attrs.items()]
        if tag and str(tag) not in bits:
            bits.insert(0, str(tag))
        prefix = f"{where}的{name}" if where else name
        if not bits:
            return f"{prefix}我帮您看一下，这套房没有更多尺寸或品牌信息。"
        variants = (
            f"{prefix}，我帮您看一下：{'，'.join(bits)}。",
            f"这边是{prefix}：{'，'.join(bits)}。",
        )
        return _pick(variants, salt)

    extra = f"比如我可以{offer_topics(scene_graph)}。"
    return _pick(UNKNOWN_VARIANTS, salt) + extra


def _overview_reply(facts: Facts, scene_graph: dict, salt: int) -> str:
    """规则版总览：户型/面积/主卧客厅，自然口吻，不用挂牌标题。"""
    house = facts["house"] or {}
    layout = house.get("type")
    area = house.get("total_area")
    price = house.get("price")
    highlight = ""
    blob = house.get("facts") if isinstance(house.get("facts"), dict) else {}
    if isinstance(blob, dict) and blob.get("highlight"):
        highlight = str(blob["highlight"]).strip()
    rooms = [r for r in facts_mod.rooms_of(scene_graph) if isinstance(r, dict)]
    master = next((r for r in rooms if str(r.get("name") or "") == "主卧"), None)
    living = next((r for r in rooms if str(r.get("name") or "") == "客厅"), None)
    named = [str(r.get("name")) for r in rooms if r.get("name") and r.get("name") != "其他"]
    bed_n = sum(1 for r in rooms if _is_bed_name(r))

    head_bits: list[str] = []
    if layout and not is_placeholder_value(layout):
        head_bits.append(f"这套是{layout}")
    if area is not None and not is_placeholder_value(area):
        head_bits.append(f"约{area}㎡")
    if not head_bits:
        head_bits.append("这套房我带您看过结构")
    lead = "、".join(head_bits)
    extras: list[str] = []
    if master and isinstance(master.get("area"), (int, float)):
        extras.append(f"主卧约{master['area']}平")
    if living and isinstance(living.get("area"), (int, float)):
        extras.append(f"客厅约{living['area']}平")
    if bed_n:
        extras.append(f"一共{bed_n}间卧室")
    if price and not is_placeholder_value(price):
        extras.append(f"挂牌大约{price}")
    if highlight and "InteriorGS" not in highlight:
        extras.append(highlight.rstrip("。"))
    mid = "，".join(extras)
    invite = "您想先看客厅还是主卧？" if ("客厅" in named and "主卧" in named) else "您想先从哪一间看起？"
    if mid:
        variants = (
            f"{lead}，{mid}。{invite}",
            f"{lead}。{mid}。需要的话我再带您走一圈。",
        )
        return _pick(variants, salt)
    return f"{lead}。{invite}"


def _is_bed_name(room: dict) -> bool:
    name = str(room.get("name") or "")
    return str(room.get("type") or "") == "bedroom" or ("卧" in name and "卫生间" not in name)


def _property_reply(facts: Facts, scene_graph: dict, salt: int) -> str:
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
            chunks.append(f"建面约 {val}㎡")
        elif key == "ceiling_height" and val is not None:
            chunks.append(f"层高{val}米")
        elif key == "type" and val:
            chunks.append(f"户型是{val}")
        elif val:
            chunks.append(str(val))

    guide = _guide_tail(scene_graph)
    if chunks and not missing_named:
        core = "，".join(chunks)
        variants = (
            f"这套房{core}。需要的话我可以再带您看看房间。",
            f"先说数字：这套房{core}。想看房间随时说。",
        )
        return _pick(variants, salt)
    if chunks and missing_named:
        miss = "、".join(missing_named)
        return "这套房" + "，".join(chunks) + f"。{miss}暂未提供（数据未提供）。{guide}"
    if missing_named:
        miss = "、".join(missing_named)
        return f"抱歉，这套房暂时没有{miss}信息，这项暂未提供（数据未提供）。{guide}"
    return MISSING_REPLY.format(q="户型") + guide
