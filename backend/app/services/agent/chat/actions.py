"""动作生成签名。铁律：只输出 scene_graph 里已有的 tp_id，不编造、不输出 position。"""

from __future__ import annotations

from typing import Any

from app.services.agent.chat.intent import Intent


def compose_actions(intent: Intent, grounded: dict[str, Any]) -> list[dict[str, Any]]:
    """生成 SPEC §4 actions（优先 teleport.tp_id）。无锚点则返回 []（由调用方 omit）。

    本阶段仅签名。
    """
    raise NotImplementedError("M1: action composition (tp_id only)")
