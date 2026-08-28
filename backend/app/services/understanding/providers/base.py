from __future__ import annotations

from abc import ABC, abstractmethod

from app.services.understanding.output import UnderstandingOutput


class SceneUnderstandingProvider(ABC):
    name: str

    @abstractmethod
    def get_scene_graph(self, world_id: str) -> UnderstandingOutput | None:
        """返回理解层核心产出（SPEC v2.2 scene_graph），供 B agent / A 前端消费。

        未知 world_id 返回 None。
        """
        ...
