from app.services.agent.asr.providers.base import ASRProvider


class StubASRProvider(ASRProvider):
    def transcribe(self, audio_bytes: bytes, *, filename: str = "audio.webm") -> dict:
        _ = audio_bytes, filename
        return {"text": "", "duration_ms": 0}
