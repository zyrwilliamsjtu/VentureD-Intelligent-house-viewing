"""中文别名 → 场景类别 / 房间名。grounding 用展开 + 包含匹配，禁止用别名编造不存在的物体。"""

from __future__ import annotations

# 用户说法 → 实例 category（英文，与 scene_graph 一致）。一词可对应多类。
INSTANCE_ALIASES: dict[str, tuple[str, ...]] = {
    "桌子": ("dining_table", "desk"),
    "餐桌": ("dining_table",),
    "饭桌": ("dining_table",),
    "餐台": ("dining_table",),
    "dining table": ("dining_table",),
    "dining_table": ("dining_table",),
    "书桌": ("desk",),
    "写字台": ("desk",),
    "电脑桌": ("desk",),
    "沙发": ("sofa",),
    "冰箱": ("refrigerator",),
    "冰柜": ("refrigerator",),
    "洗衣机": ("washing_machine",),
    "茶几": ("coffee_table",),
    "椅子": ("chair",),
    "凳子": ("chair",),
    "衣柜": ("wardrobe",),
    "柜子": ("cabinet", "wardrobe"),
    "橱柜": ("cabinet",),
    "电视": ("tv_cabinet",),
    "电视机": ("tv_cabinet",),
    "电视柜": ("tv_cabinet",),
    "灯": ("lamp",),
    "吊灯": ("lamp",),
    "灯具": ("lamp",),
    "灶台": ("stove",),
    "灶具": ("stove",),
    "床": ("bed",),
    "马桶": ("toilet",),
    "淋浴": ("shower",),
    "洗手台": ("sink",),
    "窗帘": ("curtain",),
    "床头柜": ("bedside_table",),
    "书架": ("bookshelf",),
    "绿植": ("plant",),
    "植物": ("plant",),
    "table": ("dining_table", "desk"),
    "desk": ("desk",),
    "sofa": ("sofa",),
    "fridge": ("refrigerator",),
    "refrigerator": ("refrigerator",),
}

# 用户说法 → 房间中文名片段（与 scene_graph rooms[].name 包含匹配）
ROOM_ALIASES: dict[str, tuple[str, ...]] = {
    "主卧": ("主卧",),
    "主卧室": ("主卧",),
    "次卧": ("次卧",),
    "次卧室": ("次卧",),
    "卧室": ("主卧", "次卧"),
    "睡觉": ("主卧", "次卧"),
    "睡觉的地方": ("主卧", "次卧"),
    "睡觉的地儿": ("主卧", "次卧"),
    "休息的地方": ("主卧", "次卧"),
    "卫生间": ("卫生间",),
    "厕所": ("卫生间",),
    "洗手间": ("卫生间",),
    "浴室": ("卫生间",),
    "洗漱": ("卫生间",),
    "上厕所": ("卫生间",),
    "厨房": ("厨房",),
    "厨房间": ("厨房",),
    "客厅": ("客厅",),
    "起居室": ("客厅",),
    "书房": ("书房",),
    "看书": ("书房",),
    "看书的地方": ("书房",),
    "学习": ("书房",),
    "学习的地方": ("书房",),
    "办公的地方": ("书房",),
    "洗衣间": ("洗衣间",),
    "洗衣房": ("洗衣间",),
    "bathroom": ("卫生间",),
    "kitchen": ("厨房",),
    "living": ("客厅",),
    "bedroom": ("主卧",),
}


def _sorted_keys(mapping: dict[str, tuple[str, ...]]) -> list[str]:
    return sorted(mapping.keys(), key=len, reverse=True)


INSTANCE_ALIAS_KEYS: tuple[str, ...] = tuple(_sorted_keys(INSTANCE_ALIASES))
ROOM_ALIAS_KEYS: tuple[str, ...] = tuple(_sorted_keys(ROOM_ALIASES))


def categories_for_text(text: str, *, extra_zh: dict[str, str] | None = None) -> set[str]:
    """用户话里提到的实例 category 集合（别名展开 + 中英标签）。"""
    t = (text or "").strip()
    if not t:
        return set()
    cats: set[str] = set()
    lower = t.lower()
    matched: list[str] = []
    for alias in INSTANCE_ALIAS_KEYS:
        hit = alias in lower if alias.isascii() else alias in t
        if hit:
            matched.append(alias)
    matched = [a for a in matched if not any(a != b and a in b for b in matched)]
    for alias in matched:
        cats.update(INSTANCE_ALIASES[alias])
    zh_map = extra_zh or {}
    for cat, zh in zh_map.items():
        if zh and zh in t:
            cats.add(cat)
        if cat and cat in lower:
            cats.add(cat)
    return cats


def room_name_needles(text: str) -> list[str]:
    """用户话里的房间名检索词（长词优先，已按别名展开）。"""
    t = (text or "").strip()
    if not t:
        return []
    needles: list[str] = []
    lower = t.lower()
    for alias in ROOM_ALIAS_KEYS:
        hit = alias in lower if alias.isascii() else alias in t
        if not hit:
            continue
        for name in ROOM_ALIASES[alias]:
            if name not in needles:
                needles.append(name)
    return needles


def normalize_query(text: str) -> str:
    return "".join((text or "").split()).lower()


# category → 中文展示名（tour speech 用；只覆盖 scene 已有类）
CATEGORY_ZH: dict[str, str] = {
    "dining_table": "餐桌",
    "desk": "书桌",
    "sofa": "沙发",
    "refrigerator": "冰箱",
    "washing_machine": "洗衣机",
    "coffee_table": "茶几",
    "chair": "椅子",
    "wardrobe": "衣柜",
    "cabinet": "柜子",
    "tv_cabinet": "电视柜",
    "lamp": "灯",
    "stove": "灶台",
    "bed": "床",
    "toilet": "马桶",
    "shower": "淋浴",
    "sink": "洗手台",
    "curtain": "窗帘",
    "bedside_table": "床头柜",
    "bookshelf": "书架",
    "plant": "绿植",
}


def zh_label_for_category(category: str) -> str:
    """实例 category → 中文名；未知类返回空串（不把英文标签念出来）。"""
    cat = (category or "").strip()
    if not cat:
        return ""
    if cat in CATEGORY_ZH:
        return CATEGORY_ZH[cat]
    for alias, cats in INSTANCE_ALIASES.items():
        if cat in cats and not alias.isascii():
            return alias
    return ""
