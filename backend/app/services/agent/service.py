"""Agent 统一入口。本阶段：session/facts 占位 + SPEC 结构 stub；chat 逻辑在 M1。"""

from __future__ import annotations

from typing import Any

from app.services.agent.asr.service import transcribe
from app.services.agent.facts import load as load_facts
from app.services.agent.narration.service import get_narration
from app.services.agent.session import store as session_store
from app.services.agent.tts.service import synthesize

_STUB_CHAT_REPLY = "（stub）契约测试回复，agent 逻辑待接入。"


def handle_chat(
    *,
    session_id: str,
    world_id: str,
    user_text: str | None = None,
    event: str | None = None,
    room_id: str | None = None,
    **_: Any,
) -> dict:
    """Chat stub：落会话、尝试加载事实，返回仅含 reply_text 的 SPEC 响应。

    完整意图/grounding/动作见 M1。可选 tts_url / actions 无值则 omit。
    """
    graph = load_facts(world_id)
    sess = session_store.load(session_id) or {
        "world_id": world_id,
        "history": [],
        "current_room": None,
        "tour_index": 0,
    }
    sess["world_id"] = world_id
    if room_id:
        sess["current_room"] = room_id
    if user_text:
        history = sess.get("history")
        if not isinstance(history, list):
            history = []
        history.append({"role": "user", "text": user_text})
        sess["history"] = history
    session_store.save(session_id, sess)
    _ = graph  # M1 将接入 grounding
    _ = event
    return {"reply_text": _STUB_CHAT_REPLY}


def handle_asr(audio: object | None = None) -> dict:
    return transcribe(audio)


def handle_tts(text: str, *, voice: str | None = None) -> dict:
    return synthesize(text, voice=voice)


def handle_narration(world_id: str, room_id: str) -> dict:
    return get_narration(world_id, room_id)


def handle_tour(world_id: str, session_id: str | None = None) -> dict:
    """本阶段返回空 steps，保持现有网关契约测试；真实动线见 tour.build_tour（M2 接入）。"""
    _ = session_id
    _ = world_id
    # 校验 world 存在但不改响应形状（test_tour_stub 断言 steps == []）
    load_facts(world_id)
    return {"steps": []}
