"""回复生成签名。M1：只陈述 grounding 结果，不幻觉。"""

from __future__ import annotations

from typing import Any

from app.services.agent.chat.intent import Intent


def compose_reply(intent: Intent, grounded: dict[str, Any]) -> str:
    """根据意图与已检索事实生成 reply_text。本阶段仅签名。"""
    raise NotImplementedError("M1: reply composition")
