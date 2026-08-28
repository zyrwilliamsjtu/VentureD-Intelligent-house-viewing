"""进房讲解：story_card + selling_points；可选 session 去重。"""

from __future__ import annotations

from app.schemas.errors import GatewayError
from app.services.agent.facts import find_room_by_id, load as load_facts
from app.services.agent.session import store as session_store


def _compose_reply(room: dict) -> str:
    card = (room.get("story_card") or "").strip()
    points = room.get("selling_points")
    extras: list[str] = []
    if isinstance(points, list):
        extras = [str(p).strip() for p in points if p and str(p).strip()]
    parts: list[str] = []
    if card:
        parts.append(card)
    for p in extras:
        if p and p not in card:
            parts.append(p)
    return "；".join(parts)


def get_narration(world_id: str, room_id: str, session_id: str | None = None) -> dict:
    """GET /narration 契约仅 world_id+room_id。

    session_id 为可选扩展（只增不改）：有则按会话 narrated_rooms 去重；
    无则不去重（契约不带 session_id 时的降级，见 AGENT_DEV）。
    """
    graph = load_facts(world_id)
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    room = find_room_by_id(graph, room_id)
    if room is None:
        raise GatewayError(404, "AGENT_ERROR", "无对应讲解内容")
    name = str(room.get("name") or "这里")
    text = _compose_reply(room)
    if not text:
        raise GatewayError(404, "AGENT_ERROR", "无对应讲解内容")

    if session_id:
        sess = session_store.load(session_id) or {
            "world_id": world_id,
            "history": [],
            "current_room": None,
            "tour_index": 0,
            "narrated_rooms": [],
        }
        sess["world_id"] = world_id
        narrated = sess.get("narrated_rooms")
        if not isinstance(narrated, list):
            narrated = []
        if room_id in narrated:
            # 同会话已讲过：短句，不重复 story_card
            return {"reply_text": f"这就是{name}。"}
        narrated.append(room_id)
        sess["narrated_rooms"] = narrated
        sess["current_room"] = room_id
        session_store.save(session_id, sess)

    return {"reply_text": text}
