"""进程内会话上下文。session_id → {world_id, history, current_room, tour_index}。"""

from __future__ import annotations

from typing import Any

# 进程内 dict：单 worker 够用；多进程/重启会丢。M4 前不换存储。
_SESSIONS: dict[str, dict[str, Any]] = {}

_EMPTY_KEYS = ("world_id", "history", "current_room", "tour_index", "narrated_rooms")


def _default(world_id: str | None = None) -> dict[str, Any]:
    return {
        "world_id": world_id,
        "history": [],
        "current_room": None,
        "tour_index": 0,
        "narrated_rooms": [],
    }


def load(session_id: str) -> dict[str, Any] | None:
    """无此会话返回 None（不自动创建）。"""
    if not session_id:
        return None
    data = _SESSIONS.get(session_id)
    if data is None:
        return None
    return dict(data)


def save(session_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """覆盖写入；缺省字段补齐。返回写入后的副本。"""
    if not session_id:
        raise ValueError("session_id 必填")
    merged = _default()
    merged.update({k: data[k] for k in _EMPTY_KEYS if k in data})
    if "history" in merged and not isinstance(merged["history"], list):
        merged["history"] = []
    if "narrated_rooms" in merged and not isinstance(merged["narrated_rooms"], list):
        merged["narrated_rooms"] = []
    _SESSIONS[session_id] = merged
    return dict(merged)


def clear(session_id: str) -> None:
    _SESSIONS.pop(session_id, None)
