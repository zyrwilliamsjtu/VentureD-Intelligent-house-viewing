"""进房讲解：读 rooms[].story_card / selling_points。无内容按 SPEC 404。"""

from __future__ import annotations

from app.schemas.errors import GatewayError
from app.services.agent.facts import find_room_by_id, load as load_facts


def get_narration(world_id: str, room_id: str) -> dict:
    graph = load_facts(world_id)
    if graph is None:
        raise GatewayError(404, "WORLD_NOT_FOUND", "世界不存在")
    room = find_room_by_id(graph, room_id)
    if room is None:
        raise GatewayError(404, "AGENT_ERROR", "无对应讲解内容")
    text = (room.get("story_card") or "").strip()
    if not text:
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            text = "；".join(str(p) for p in points if p)
    if not text:
        raise GatewayError(404, "AGENT_ERROR", "无对应讲解内容")
    # SPEC §0：可选字段无值时省略（不发 tts_url）
    return {"reply_text": text}
