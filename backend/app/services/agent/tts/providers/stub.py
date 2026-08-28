from app.services.agent.tts.providers.base import TTSProvider


class StubTTSProvider(TTSProvider):
    def synthesize(self, text: str, *, voice: str | None = None) -> dict:
        _ = text, voice
        return {}
