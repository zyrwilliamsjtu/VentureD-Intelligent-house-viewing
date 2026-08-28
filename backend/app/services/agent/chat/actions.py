"""动作只输出 scene_graph 里已有的 tp_id，不编造、不含 position。"""

from __future__ import annotations

from typing import Any

from app.services.agent import facts as facts_mod
from app.services.agent.chat.grounding import Facts
from app.services.agent.chat.intent import Intent
from app.services.agent.chat.responder import _public_attrs, _zh_category


def all_tp_ids(graph: dict) -> set[str]:
    ids: set[str] = set()
    for room in facts_mod.rooms_of(graph):
        tp = room.get("trajectory_point_id")
        if isinstance(tp, str) and tp:
            ids.add(tp)
        for inst in room.get("instances") or []:
            if isinstance(inst, dict):
                itp = inst.get("trajectory_point_id")
                if isinstance(itp, str) and itp:
                    ids.add(itp)
    return ids


def _teleport(tp_id: str, label: str, allowed: set[str]) -> dict[str, str] | None:
    if tp_id not in allowed:
        return None
    return {"type": "teleport", "tp_id": tp_id, "label": label}


def _highlight(tp_id: str, allowed: set[str]) -> dict[str, str] | None:
    if tp_id not in allowed:
        return None
    return {"type": "highlight", "tp_id": tp_id}


def _append(actions: list[dict[str, Any]], act: dict[str, Any] | None) -> None:
    if not act:
        return
    kind = act.get("type")
    tp = act.get("tp_id")
    if kind in ("teleport", "highlight") and isinstance(tp, str):
        if any(a.get("type") == kind and a.get("tp_id") == tp for a in actions):
            return
    if kind == "show_card" and any(a.get("type") == "show_card" for a in actions):
        return
    actions.append(act)


def _instance_card(inst: dict) -> dict[str, Any]:
    name = _zh_category(inst)
    attrs = _public_attrs(inst)
    lines = [f"{k}: {v}" for k, v in attrs.items()]
    tag = inst.get("tag")
    if tag:
        lines.insert(0, str(tag))
    if not lines:
        lines = [f"这套房的{name}没有更多信息"]
    return {"type": "show_card", "title": name, "lines": lines}


def build(intent: Intent, facts: Facts, scene_graph: dict) -> list[dict[str, Any]]:
    # 无法回答：只靠话术引导，不强行动作
    if facts.get("already_here"):
        return []
    if facts["missing"] or intent in (
        Intent.ENTER_ROOM,
        Intent.ROOM_INTRO,
        Intent.SMALLTALK,
        Intent.UNKNOWN,
        Intent.CLARIFY,
        Intent.HOUSE_OVERVIEW,
    ):
        return []

    allowed = all_tp_ids(scene_graph)
    actions: list[dict[str, Any]] = []

    if intent in (Intent.NAVIGATION, Intent.EXISTENCE):
        inst = facts["instance"]
        host = facts["host_room"]
        room = facts["room"]
        if inst is not None:
            name = _zh_category(inst)
            itp = inst.get("trajectory_point_id")
            rtp = (host or {}).get("trajectory_point_id")
            fly = itp if isinstance(itp, str) and itp else rtp
            if isinstance(fly, str) and fly:
                _append(actions, _teleport(fly, f"小驻带您去看{name}", allowed))
            if isinstance(itp, str) and itp:
                _append(actions, _highlight(itp, allowed))
            _append(actions, _instance_card(inst))
            return actions
        if room is not None:
            name = str(room.get("name") or "那里")
            rtp = room.get("trajectory_point_id")
            if isinstance(rtp, str) and rtp:
                _append(actions, _teleport(rtp, f"小驻带您去{name}", allowed))
        return actions

    if intent == Intent.PROPERTY:
        house = facts["house"] or {}
        title = str(house.get("title") or "户型")
        lines: list[str] = []
        for key, label in (("type", None), ("total_area", "建面")):
            val = house.get(key)
            if val is None:
                continue
            from app.services.agent.chat.grounding import is_placeholder_field

            if is_placeholder_field(house, key):
                continue
            if key == "total_area":
                lines.append(f"{label} {val}㎡")
            else:
                lines.append(str(val))
        if lines:
            actions.append({"type": "show_card", "title": title, "lines": lines})
        return actions

    if intent == Intent.INSTANCE:
        inst = facts["instance"]
        if inst is None:
            return []
        name = _zh_category(inst)
        host = facts["host_room"] or {}
        rtp = host.get("trajectory_point_id")
        itp = inst.get("trajectory_point_id")
        fly = rtp if isinstance(rtp, str) and rtp else itp
        if isinstance(fly, str) and fly:
            _append(actions, _teleport(fly, f"小驻带您去看{name}", allowed))
        if isinstance(itp, str) and itp:
            _append(actions, _highlight(itp, allowed))
        _append(actions, _instance_card(inst))
        return actions

    return []
