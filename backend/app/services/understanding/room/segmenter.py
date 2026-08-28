"""GT room split: pass through scene_graph rooms (no geometry)."""
from __future__ import annotations


class GTRoomSegmenter:
    def segment_rooms(self, scene_data: dict) -> list[dict]:
        rooms = scene_data.get("rooms")
        if not isinstance(rooms, list):
            return []
        return rooms
