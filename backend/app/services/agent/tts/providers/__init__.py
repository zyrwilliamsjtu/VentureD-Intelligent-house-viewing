from app.config import tts_provider_name
from app.services.agent.tts.providers.base import TTSProvider
from app.services.agent.tts.providers.openai_compat import OpenAICompatTTSProvider
from app.services.agent.tts.providers.stub import StubTTSProvider

_REGISTRY: dict[str, type[TTSProvider]] = {
    "stub": StubTTSProvider,
    "openai_compat": OpenAICompatTTSProvider,
}


def get_tts_provider(name: str | None = None) -> TTSProvider:
    key = (name if name is not None else tts_provider_name()).strip().lower() or "stub"
    cls = _REGISTRY.get(key, StubTTSProvider)
    return cls()
