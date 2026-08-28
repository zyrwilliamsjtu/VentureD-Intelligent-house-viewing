"""Agent 统一入口。规则快路径 + 开放问题 LLM 路由；动作始终规则白名单。"""

from __future__ import annotations

import re
import time
from typing import Any

from app.schemas.errors import GatewayError
from app.services.agent.asr.service import transcribe
from app.services.agent.chat.actions import all_tp_ids
from app.services.agent.chat.actions import build as build_actions
from app.services.agent.chat.grounding import catalog_brief, retrieve
from app.services.agent.chat.intent import Intent, needs_llm_route, understand
from app.services.agent.chat.llm_provider import get_chat_llm_provider
from app.services.agent.chat.responder import CLARIFY_REPLY, generate
from app.services.agent.facts import load as load_facts
from app.services.agent.facts import load_listing, overlay_listing
from app.services.agent.narration.service import get_narration
from app.services.agent.session import store as session_store
from app.services.agent.synonyms import normalize_query
from app.services.agent.tour.service import build_tour
from app.services.agent.tts.service import attach_tts_url, synthesize

_INTENT_FROM_LLM = {
    "navigation": Intent.NAVIGATION,
    "property": Intent.PROPERTY,
    "instance": Intent.INSTANCE,
    "clarify": Intent.CLARIFY,
    "unknown": Intent.UNKNOWN,
    "smalltalk": Intent.SMALLTALK,
}

_BANNED = ("学区", "地铁", "物业费", "得房率", "容积率")
_ROUTE_TTL = 600.0
_ROUTE_CACHE_MAX = 256
_ROUTE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def clear_route_cache() -> None:
    _ROUTE_CACHE.clear()


def _cached_route(
    world_id: str,
    user_text: str | None,
    catalog: str,
    history: list[dict[str, Any]],
) -> dict[str, Any] | None:
    key = f"{world_id}::{normalize_query(user_text or '')}"
    now = time.monotonic()
    hit = _ROUTE_CACHE.get(key)
    if hit and now - hit[0] < _ROUTE_TTL:
        return hit[1]
    routed = get_chat_llm_provider().route(user_text, catalog, history)
    if isinstance(routed, dict):
        if len(_ROUTE_CACHE) >= _ROUTE_CACHE_MAX:
            oldest = min(_ROUTE_CACHE, key=lambda k: _ROUTE_CACHE[k][0])
            _ROUTE_CACHE.pop(oldest, None)
        _ROUTE_CACHE[key] = (now, routed)
    return routed


def _nums(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", text or ""))


def _reply_grounded(reply: str | None, allowed_blob: str, fallback: str) -> str:
    text = (reply or "").strip()
    if not text:
        return fallback
    if any(w in text for w in _BANNED) and not any(w in allowed_blob for w in _BANNED):
        return fallback
    extra = _nums(text) - _nums(allowed_blob) - _nums(fallback)
    # 允许话术里的少量序号；拦明显编造大数
    if any(len(n.replace(".", "")) >= 3 and n not in _nums(allowed_blob) for n in extra):
        return fallback
    return text


def _whitelist(actions: list[dict[str, Any]], graph: dict) -> list[dict[str, Any]]:
    allowed = all_tp_ids(graph)
    out: list[dict[str, Any]] = []
    for act in actions:
        if not isinstance(act, dict):
            continue
        if "position" in act:
            act = {k: v for k, v in act.items() if k != "position"}
        tp = act.get("tp_id")
        if act.get("type") in ("teleport", "highlight"):
            if not isinstance(tp, str) or tp not in allowed:
                continue
        out.append(act)
    return out


def _query_from_route(raw: dict[str, Any], user_text: str | None, intent: Intent) -> str:
    room = raw.get("room")
    cat = raw.get("category")
    if intent == Intent.NAVIGATION and isinstance(room, str) and room.strip():
        return f"{room.strip()}在哪"
    if intent in (Intent.NAVIGATION, Intent.INSTANCE) and isinstance(cat, str) and cat.strip():
        return cat.strip()
    if intent == Intent.PROPERTY:
        keys = raw.get("asked_keys")
        if isinstance(keys, list) and keys:
            label = {"orientation": "朝向", "price": "价格", "total_area": "面积", "type": "户型"}.get(
                str(keys[0]), "这套房"
            )
            return f"这套房{label}"
    return (user_text or "").strip()


def handle_chat(
    *,
    session_id: str,
    world_id: str,
    user_text: str | None = None,
    event: str | None = None,
    room_id: str | None = None,
    listing_id: str | None = None,
    audio: Any = None,
    **_: Any,
) -> dict:
    """intent → grounding → responder → actions；开放问题可 LLM 路由。"""
    graph = load_facts(world_id)
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    listing = load_listing(listing_id)
    graph = overlay_listing(graph, listing)

    sess = session_store.load(session_id) or {
        "world_id": world_id,
        "history": [],
        "current_room": None,
        "tour_index": 0,
    }
    sess["world_id"] = world_id
    if listing_id:
        sess["listing_id"] = listing_id
    if room_id:
        sess["current_room"] = room_id

    history = sess.get("history") if isinstance(sess.get("history"), list) else []
    here = room_id or sess.get("current_room")
    intent = understand(user_text, event, sess, graph)
    grounded = retrieve(intent, user_text, graph, room_id=here)
    reply = generate(
        grounded,
        intent,
        graph,
        history=history if isinstance(history, list) else None,
        current_room=str(here) if here else None,
    )
    actions = build_actions(intent, grounded, graph)

    if needs_llm_route(intent):
        try:
            routed = _cached_route(
                world_id,
                user_text,
                catalog_brief(graph),
                history if isinstance(history, list) else [],
            )
        except Exception:
            routed = None
        if isinstance(routed, dict):
            conf = routed.get("confidence")
            try:
                conf_n = float(conf) if conf is not None else 0.7
            except (TypeError, ValueError):
                conf_n = 0.7
            if routed.get("clarify") or conf_n < 0.45:
                intent = Intent.CLARIFY
                grounded = retrieve(intent, user_text, graph, room_id=here)
                reply = _reply_grounded(
                    str(routed.get("reply") or routed.get("reply_text") or ""),
                    catalog_brief(graph),
                    CLARIFY_REPLY,
                ) or CLARIFY_REPLY
                if "户型" not in reply and "价格" not in reply:
                    reply = CLARIFY_REPLY
                actions = []
            else:
                llm_intent = str(routed.get("intent") or "").lower()
                mapped = _INTENT_FROM_LLM.get(llm_intent, Intent.UNKNOWN)
                if mapped == Intent.NAVIGATION or llm_intent.startswith("nav"):
                    # 导航绝不采用 LLM 话术：规则版取证；原文取不到则回落引导
                    intent = Intent.NAVIGATION
                    grounded = retrieve(intent, user_text, graph, room_id=here)
                    if grounded.get("missing"):
                        intent = Intent.UNKNOWN
                        grounded = retrieve(intent, user_text, graph, room_id=here)
                        reply = generate(
                            grounded,
                            intent,
                            graph,
                            history=history if isinstance(history, list) else None,
                            current_room=str(here) if here else None,
                        )
                        actions = []
                    else:
                        reply = generate(
                            grounded,
                            intent,
                            graph,
                            history=history if isinstance(history, list) else None,
                            current_room=str(here) if here else None,
                        )
                        actions = _whitelist(build_actions(intent, grounded, graph), graph)
                else:
                    q = _query_from_route(routed, user_text, mapped)
                    grounded = retrieve(mapped, q, graph, room_id=here)
                    intent = mapped
                    rule = generate(
                        grounded,
                        intent,
                        graph,
                        history=history if isinstance(history, list) else None,
                        current_room=str(here) if here else None,
                    )
                    blob = catalog_brief(graph) + " " + rule
                    reply = _reply_grounded(
                        str(routed.get("reply") or routed.get("reply_text") or ""),
                        blob,
                        rule,
                    )
                    actions = _whitelist(build_actions(intent, grounded, graph), graph)

    actions = _whitelist(actions, graph)

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
    # 仅语音输入（chat 带 audio）才合成；打字请求省略 tts_url
    if audio is not None:
        return attach_tts_url(body, reply)
    return body


def handle_asr(audio: object | None = None) -> dict:
    return transcribe(audio)


def handle_tts(text: str, *, voice: str | None = None) -> dict:
    return synthesize(text, voice=voice)


def handle_narration(
    world_id: str,
    room_id: str,
    session_id: str | None = None,
    listing_id: str | None = None,
) -> dict:
    body = get_narration(world_id, room_id, session_id=session_id, listing_id=listing_id)
    return attach_tts_url(body, str(body.get("reply_text") or ""))


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
    # 待确认：tour 步骤多，构建时全量 TTS 会拖慢带看；逐步播放由前端 POST /tts 合成
    return build_tour(scene_graph=graph)
