"""Provider factory (optional; GET /api/scene cases stay in test_scene.py)."""
import pytest

from app.services.understanding.providers import get_provider
from app.services.understanding.providers.dual_engine_provider import DualEngineProvider
from app.services.understanding.providers.gt_provider import GTProvider


def test_factory_default_is_gt() -> None:
    provider = get_provider("gt")
    assert isinstance(provider, GTProvider)
    assert provider.name == "gt"


def test_factory_dual_engine_is_stub() -> None:
    provider = get_provider("dual_engine")
    assert isinstance(provider, DualEngineProvider)
    with pytest.raises(NotImplementedError, match="双引擎未实现"):
        provider.get_scene_graph("w_0330_840483")


def test_factory_unknown_raises() -> None:
    with pytest.raises(ValueError, match="未知 UNDERSTANDING_PROVIDER"):
        get_provider("not_a_provider")
