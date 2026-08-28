"""规则版意图理解。只做关键词/event 分流，不接 LLM。"""

from __future__ import annotations

from enum import Enum
from typing import Any

from app.services.agent import facts as facts_mod

# SPEC §1.2 类别 → 中文（含本图中可能不存在的 stove，便于「灶台」问句落到 grounding 而非瞎编）
CATEGORY_ZH: dict[str, str] = {
    "bed": "床",
    "sofa": "沙发",
    "tv_cabinet": "电视柜",
    "stove": "灶台",
    "dining_table": "餐桌",
    "chair": "椅子",
    "wardrobe": "衣柜",
    "desk": "书桌",
    "refrigerator": "冰箱",
    "washing_machine": "洗衣机",
    "toilet": "马桶",
    "shower": "淋浴",
    "sink": "洗手台",
    "cabinet": "橱柜",
    "coffee_table": "茶几",
    "lamp": "灯",
    "curtain": "窗帘",
    "bedside_table": "床头柜",
    "bookshelf": "书架",
    "plant": "绿植",
}

ZH_TO_CATEGORY: dict[str, str] = {zh: cat for cat, zh in CATEGORY_ZH.items()}

_NAV_HINTS = ("在哪", "在哪儿", "带我去", "去看看", "怎么去", "位置", "带我")
_PROP_HINTS = ("户型", "面积", "几室", "朝向", "价格", "楼层", "层高", "多少平", "总价", "这套房", "建面")
_ATTR_HINTS = ("多大", "是什么", "什么牌子", "什么品牌", "容量")
_SMALLTALK = ("你好", "您好", "谢谢", "在吗", "嗨", "早上好", "hello", "hi")


class Intent(str, Enum):
    NAVIGATION = "navigation"
    PROPERTY = "property"
    INSTANCE = "instance"
    ENTER_ROOM = "enter_room"
    SMALLTALK = "smalltalk"
    UNKNOWN = "unknown"


def _longest_in_text(text: str, names: list[str]) -> str | None:
    hits = [n for n in names if n and n in text]
    if not hits:
        return None
    hits.sort(key=len, reverse=True)
    return hits[0]


def room_names_of(graph: dict) -> list[str]:
    return [str(r.get("name") or "") for r in facts_mod.rooms_of(graph) if r.get("name")]


def instance_keywords_of(graph: dict) -> list[str]:
    keys = list(CATEGORY_ZH.values())
    for inst in facts_mod.instances_of(graph):
        tag = inst.get("tag")
        if tag:
            keys.append(str(tag))
        attrs = inst.get("attrs")
        if isinstance(attrs, dict):
            for val in attrs.values():
                if val and str(val) not in ("refrigerator",):
                    s = str(val)
                    if any("\u4e00" <= ch <= "\u9fff" for ch in s):
                        keys.append(s)
    return keys


def understand(
    user_text: str | None,
    event: str | None,
    session: dict[str, Any] | None,
    scene_graph: dict | None,
) -> Intent:
    """event=enter_room 优先；否则按房间/实例词 + 意图词分流。"""
    _ = session
    if event == "enter_room":
        return Intent.ENTER_ROOM

    text = (user_text or "").strip()
    if not text:
        return Intent.UNKNOWN

    graph = scene_graph or {}
    room_hit = _longest_in_text(text, room_names_of(graph))
    inst_hit = _longest_in_text(text, instance_keywords_of(graph))
    has_nav = any(h in text for h in _NAV_HINTS)
    has_prop = any(h in text for h in _PROP_HINTS)
    has_attr = any(h in text for h in _ATTR_HINTS)
    has_entity = bool(room_hit or inst_hit)

    if has_nav:
        return Intent.NAVIGATION
    if inst_hit and has_attr:
        return Intent.INSTANCE
    if has_prop and not inst_hit:
        return Intent.PROPERTY
    if room_hit:
        return Intent.NAVIGATION
    if inst_hit:
        return Intent.INSTANCE if has_attr else Intent.NAVIGATION
    if has_prop:
        return Intent.PROPERTY
    if any(s in text.lower() for s in _SMALLTALK) and not has_entity:
        return Intent.SMALLTALK
    return Intent.UNKNOWN


def classify_intent(
    user_text: str | None,
    *,
    event: str | None = None,
    session: dict[str, Any] | None = None,
    scene_graph: dict | None = None,
) -> Intent:
    """兼容旧签名，转发 understand。"""
    return understand(user_text, event, session, scene_graph)
