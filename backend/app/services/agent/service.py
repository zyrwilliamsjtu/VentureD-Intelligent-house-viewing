"""Agent 统一入口。chat 为 M1 规则版；asr/tts 仍 stub。"""

from __future__ import annotations

from typing import Any

from app.schemas.errors import GatewayError
from app.services.agent.asr.service import transcribe
from app.services.agent.chat.actions import build as build_actions
from app.services.agent.chat.grounding import retrieve
from app.services.agent.chat.intent import understand
from app.services.agent.chat.responder import generate
from app.services.agent.facts import load as load_facts
from app.services.agent.narration.service import get_narration
from app.services.agent.session import store as session_store
from app.services.agent.tts.service import synthesize


def handle_chat(
    *,
    session_id: str,
    world_id: str,
    user_text: str | None = None,
    event: str | None = None,
    room_id: str | None = None,
    **_: Any,
) -> dict:
    """intent → grounding → responder → actions；可选 tts_url/actions 空则 omit。"""
    graph = load_facts(world_id)
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")

    sess = session_store.load(session_id) or {
        "world_id": world_id,
        "history": [],
        "current_room": None,
        "tour_index": 0,
    }
    sess["world_id"] = world_id
    if room_id:
        sess["current_room"] = room_id

    intent = understand(user_text, event, sess, graph)
    grounded = retrieve(intent, user_text, graph, room_id=room_id or sess.get("current_room"))
    reply = generate(grounded, intent, graph)
    actions = build_actions(intent, grounded, graph)

    history = sess.get("history")
    if not isinstance(history, list):
        history = []
    if user_text:
        history.append({"role": "user", "text": user_text})
    history.append({"role": "assistant", "text": reply})
    sess["history"] = history
    room = grounded.get("room") or grounded.get("host_room")
    if isinstance(room, dict) and room.get("id"):
        sess["current_room"] = room["id"]
    session_store.save(session_id, sess)

    body: dict[str, Any] = {"reply_text": reply}
    if actions:
        body["actions"] = actions
    return body


def handle_asr(audio: object | None = None) -> dict:
    return transcribe(audio)


def handle_tts(text: str, *, voice: str | None = None) -> dict:
    return synthesize(text, voice=voice)


def handle_narration(world_id: str, room_id: str) -> dict:
    return get_narration(world_id, room_id)


def handle_tour(world_id: str, session_id: str | None = None) -> dict:
    """本阶段返回空 steps，保持现有网关契约测试；真实动线见 tour.build_tour（M2 接入）。"""
    _ = session_id
    load_facts(world_id)
    return {"steps": []}
