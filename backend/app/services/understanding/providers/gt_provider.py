"""Default provider: pass through GT scene_graph as understanding output."""
from __future__ import annotations

from app.data.scene_store import load_scene_graph
from app.services.understanding.output import UnderstandingOutput
from app.services.understanding.pipeline import GTPipeline
from app.services.understanding.providers.base import SceneUnderstandingProvider


class GTProvider(SceneUnderstandingProvider):
    name = "gt"

    def __init__(self) -> None:
        self._pipeline = GTPipeline()

    def get_scene_graph(self, world_id: str) -> UnderstandingOutput | None:
        """理解层产出（当前：GT 透传）。消费方 = B agent 知识库 + A 前端图纸。"""
        scene_data = load_scene_graph(world_id)
        if scene_data is None:
            return None
        return self._pipeline.build_scene_graph(world_id, scene_data)
