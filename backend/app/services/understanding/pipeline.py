"""L1 GT pipeline: structural split only; do not rebuild SPEC JSON."""
from __future__ import annotations

from app.services.understanding.instance.instance_source import GTInstanceSource
from app.services.understanding.output import UnderstandingOutput
from app.services.understanding.room.segmenter import GTRoomSegmenter


class GTPipeline:
    def __init__(self) -> None:
        self.segmenter = GTRoomSegmenter()
        self.instance_source = GTInstanceSource()

    def build_scene_graph(self, world_id: str, scene_data: dict) -> UnderstandingOutput:
        """组装理解层产出。GT 已是 SPEC v2.2，只走房间/实例钩子后原样返回给 B/A。"""
        self.segmenter.segment_rooms(scene_data)
        self.instance_source.get_instances(scene_data)
        return scene_data  # type: ignore[return-value]
