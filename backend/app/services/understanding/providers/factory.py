"""Route UNDERSTANDING_PROVIDER → provider instance."""
from __future__ import annotations

from app.config import understanding_provider
from app.services.understanding.providers.base import SceneUnderstandingProvider
from app.services.understanding.providers.dual_engine_provider import DualEngineProvider
from app.services.understanding.providers.gt_provider import GTProvider

_REGISTRY: dict[str, type[SceneUnderstandingProvider]] = {
    "gt": GTProvider,
    "dual_engine": DualEngineProvider,
}


def get_provider(name: str | None = None) -> SceneUnderstandingProvider:
    key = (name if name is not None else understanding_provider()).strip().lower()
    cls = _REGISTRY.get(key)
    if cls is None:
        known = ", ".join(sorted(_REGISTRY))
        raise ValueError(
            f"未知 UNDERSTANDING_PROVIDER={key!r}，请使用: {known}"
        )
    return cls()
