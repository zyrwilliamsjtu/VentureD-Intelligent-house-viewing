"""Future dual-engine provider (stub)."""
from app.services.understanding.providers.base import SceneUnderstandingProvider


class DualEngineProvider(SceneUnderstandingProvider):
    name = "dual_engine"

    def get_scene_graph(self, world_id: str) -> dict:
        raise NotImplementedError("双引擎未实现，请使用 GT provider")
