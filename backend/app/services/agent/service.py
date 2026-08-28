"""Agent 统一入口。chat 规则版保底 + 可选 LLM 增强；asr/tts 走 Provider（失败降级 stub）。"""

from __future__ import annotations

from typing import Any

from app.schemas.errors import GatewayError
from app.services.agent.asr.service import transcribe
from app.services.agent.chat.actions import build as build_actions
from app.services.agent.chat.grounding import retrieve
from app.services.agent.chat.intent import understand
from app.services.agent.chat.llm_provider import get_chat_llm_provider
from app.services.agent.chat.responder import generate
from app.services.agent.facts import load as load_facts
from app.services.agent.narration.service import get_narration
from app.services.agent.session import store as session_store
from app.services.agent.tour.service import build_tour
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
    try:
        enhanced = get_chat_llm_provider().enhance(
            grounded,
            user_text,
            sess.get("history") if isinstance(sess.get("history"), list) else [],
        )
        if enhanced:
            reply = enhanced
    except Exception:
        pass

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
    try:
        tts_body = synthesize(reply)
        url = tts_body.get("audio_url") if isinstance(tts_body, dict) else None
        if url:
            body["tts_url"] = str(url)
    except Exception:
        pass
    return body


def handle_asr(audio: object | None = None) -> dict:
    return transcribe(audio)


def handle_tts(text: str, *, voice: str | None = None) -> dict:
    return synthesize(text, voice=voice)


def handle_narration(world_id: str, room_id: str, session_id: str | None = None) -> dict:
    return get_narration(world_id, room_id, session_id=session_id)


def handle_tour(world_id: str, session_id: str | None = None) -> dict:
    """接入 build_tour：按 tour_path 返回非空 steps（无 tp 的房间跳过）。"""
    if not world_id or not session_id:
        raise GatewayError(400, "AGENT_ERROR", "world_id 与 session_id 必填")
    graph = load_facts(world_id)
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    sess = session_store.load(session_id) or {
        "world_id": world_id,
        "history": [],
        "current_room": None,
        "tour_index": 0,
        "narrated_rooms": [],
    }
    sess["world_id"] = world_id
    session_store.save(session_id, sess)
    return build_tour(scene_graph=graph)
