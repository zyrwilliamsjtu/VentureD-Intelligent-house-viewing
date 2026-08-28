"""GT instances: read from scene_graph rooms (no recognition)."""
from __future__ import annotations


class GTInstanceSource:
    def get_instances(self, scene_data: dict) -> list[dict]:
        rooms = scene_data.get("rooms")
        if not isinstance(rooms, list):
            return []
        out: list[dict] = []
        for room in rooms:
            if not isinstance(room, dict):
                continue
            insts = room.get("instances") or []
            if isinstance(insts, list):
                out.extend(insts)
        return out
