"""事实检索签名。M1 实现：只从 scene_graph 取证，禁止编造。"""

from __future__ import annotations

from typing import Any

from app.services.agent.chat.intent import Intent


def ground(
    intent: Intent,
    graph: dict,
    *,
    user_text: str | None = None,
    room_id: str | None = None,
) -> dict[str, Any]:
    """把意图落到 scene_graph 事实（房间/实例/house）。

    返回结构由 M1 约定（如 {rooms, instances, house_facts, missing: bool}）。
    本阶段仅签名。
    """
    raise NotImplementedError("M1: fact grounding from scene_graph")
