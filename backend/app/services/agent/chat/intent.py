"""规则版意图理解。只做关键词/event 分流，不接 LLM。"""

from __future__ import annotations

from enum import Enum
from typing import Any

from app.services.agent import facts as facts_mod
from app.services.agent.synonyms import INSTANCE_ALIAS_KEYS, ROOM_ALIAS_KEYS

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
_PROP_HINTS = ("户型", "面积", "几室", "朝向", "价格", "楼层", "层高", "多少平", "总价", "这套房", "建面", "多少钱")
_ATTR_HINTS = ("多大", "是什么", "什么牌子", "什么品牌", "容量")
_SMALLTALK = ("你好", "您好", "谢谢", "在吗", "嗨", "早上好", "hello", "hi")
_EXIST_HINTS = ("有没有", "有无", "有没有啊")


class Intent(str, Enum):
    NAVIGATION = "navigation"
    PROPERTY = "property"
    INSTANCE = "instance"
    ENTER_ROOM = "enter_room"
    SMALLTALK = "smalltalk"
    CLARIFY = "clarify"
    UNKNOWN = "unknown"


def _longest_in_text(text: str, names: list[str]) -> str | None:
    hits = [n for n in names if n and n in text]
    if not hits:
        return None
    hits.sort(key=len, reverse=True)
    return hits[0]


def room_names_of(graph: dict) -> list[str]:
    return [str(r.get("name") or "") for r in facts_mod.rooms_of(graph) if r.get("name")]


def is_existence_query(text: str) -> bool:
    """「有没有X / 有X吗」存在性问句。"""
    t = (text or "").strip()
    if not t:
        return False
    if any(h in t for h in _EXIST_HINTS):
        return True
    if t.startswith("有") and t.endswith(("吗", "么", "没", "嘛")):
        return True
    return False


def instance_keywords_of(graph: dict) -> list[str]:
    keys = list(CATEGORY_ZH.values())
    keys.extend(INSTANCE_ALIAS_KEYS)
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
    room_names = room_names_of(graph) + list(ROOM_ALIAS_KEYS)
    room_hit = _longest_in_text(text, room_names)
    inst_hit = _longest_in_text(text, instance_keywords_of(graph))
    has_nav = any(h in text for h in _NAV_HINTS)
    has_prop = any(h in text for h in _PROP_HINTS)
    has_attr = any(h in text for h in _ATTR_HINTS)
    has_entity = bool(room_hit or inst_hit)
    has_exist = is_existence_query(text)

    if is_vague_overview(text):
        return Intent.CLARIFY
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
    if has_exist:
        # 有没有X：走导航取证（命中正答 / 未命中引导），不丢给 LLM 编造
        return Intent.NAVIGATION
    if has_prop:
        return Intent.PROPERTY
    if any(s in text.lower() for s in _SMALLTALK) and not has_entity:
        return Intent.SMALLTALK
    return Intent.UNKNOWN


_VAGUE = ("怎么样", "感觉", "适不适合", "值不值", "整体印象", "整体感觉")
_SPECIFIC = ("多大", "面积", "价格", "朝向", "户型", "几室", "多少钱", "层高", "在哪", "在哪儿")


def is_vague_overview(text: str) -> bool:
    """无具体指标的「房子怎么样/适不适合」→ 澄清，不硬答。"""
    t = (text or "").strip()
    if not t or any(k in t for k in _SPECIFIC):
        return False
    about_house = any(k in t for k in ("这套房", "这房子", "这屋", "房子"))
    vague = any(k in t for k in _VAGUE) or ("适合" in t and "人" in t)
    return about_house and vague


def needs_llm_route(intent: Intent) -> bool:
    """仅开放/模糊问题走 LLM 语义理解；导航/户型/实例关键词走规则快路径。"""
    return intent == Intent.UNKNOWN


def classify_intent(
    user_text: str | None,
    *,
    event: str | None = None,
    session: dict[str, Any] | None = None,
    scene_graph: dict | None = None,
) -> Intent:
    """兼容旧签名，转发 understand。"""
    return understand(user_text, event, session, scene_graph)
