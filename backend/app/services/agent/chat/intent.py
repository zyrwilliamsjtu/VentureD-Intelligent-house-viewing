"""意图枚举 + 理解函数签名。规则版实现见里程碑 M1，本阶段不实现逻辑。"""

from __future__ import annotations

from enum import Enum


class Intent(str, Enum):
    NAVIGATION = "navigation"  # 去某房间 / 带我去
    PROPERTY = "property"  # 户型/面积/朝向/价格等 house 字段
    INSTANCE = "instance"  # 家具/实例在哪、属性
    ENTER_ROOM = "enter_room"  # event=enter_room 进房讲解
    SMALLTALK = "smalltalk"  # 寒暄
    UNKNOWN = "unknown"


def classify_intent(user_text: str | None, *, event: str | None = None) -> Intent:
    """规则版意图理解（M1）。

    计划：event=enter_room → ENTER_ROOM；否则按房间名/类别词/户型词/寒暄词分流。
    本阶段仅签名，调用将 raise NotImplementedError。
    """
    raise NotImplementedError("M1: rule-based intent classification")
