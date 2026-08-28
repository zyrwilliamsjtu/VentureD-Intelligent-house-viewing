from app.config import asr_provider_name
from app.services.agent.asr.providers.base import ASRProvider
from app.services.agent.asr.providers.openai_compat import OpenAICompatASRProvider
from app.services.agent.asr.providers.stub import StubASRProvider

_REGISTRY: dict[str, type[ASRProvider]] = {
    "stub": StubASRProvider,
    "openai_compat": OpenAICompatASRProvider,
}


def get_asr_provider(name: str | None = None) -> ASRProvider:
    key = (name if name is not None else asr_provider_name()).strip().lower() or "stub"
    cls = _REGISTRY.get(key, StubASRProvider)
    return cls()
