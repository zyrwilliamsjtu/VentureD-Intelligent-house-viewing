"""L1 GT pipeline: structural split only; do not rebuild SPEC JSON."""
from __future__ import annotations

from app.services.understanding.instance.instance_source import GTInstanceSource
from app.services.understanding.room.segmenter import GTRoomSegmenter


class GTPipeline:
    def __init__(self) -> None:
        self.segmenter = GTRoomSegmenter()
        self.instance_source = GTInstanceSource()

    def build_scene_graph(self, world_id: str, scene_data: dict) -> dict:
        # Hooks for a future DualEngineProvider. GT JSON is already SPEC v2.2.
        self.segmenter.segment_rooms(scene_data)
        self.instance_source.get_instances(scene_data)
        return scene_data
