from __future__ import annotations

from abc import ABC, abstractmethod


class SceneUnderstandingProvider(ABC):
    name: str

    @abstractmethod
    def get_scene_graph(self, world_id: str) -> dict | None:
        """返回 SPEC v2.2 格式 scene_graph。未知 world 返回 None。"""
        ...
