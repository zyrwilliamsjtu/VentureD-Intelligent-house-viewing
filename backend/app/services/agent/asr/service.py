"""ASR：Provider 工厂 + stub 兜底。失败/超时/未配置永不抛到网关。"""

from __future__ import annotations

from app.services.agent.asr.providers import get_asr_provider
from app.services.agent.asr.providers.stub import StubASRProvider


def _audio_bytes(audio: object | None) -> tuple[bytes, str]:
    if audio is None:
        return b"", "audio.webm"
    if isinstance(audio, (bytes, bytearray)):
        return bytes(audio), "audio.webm"
    filename = getattr(audio, "filename", None) or "audio.webm"
    raw = getattr(audio, "file", None)
    if raw is not None:
        try:
            raw.seek(0)
        except Exception:
            pass
        return raw.read(), str(filename)
    read = getattr(audio, "read", None)
    if callable(read):
        data = read()
        if isinstance(data, (bytes, bytearray)):
            return bytes(data), str(filename)
    return b"", str(filename)


def transcribe(audio: object | None = None) -> dict:
    blob, name = _audio_bytes(audio)
    try:
        result = get_asr_provider().transcribe(blob, filename=name)
        if isinstance(result, dict) and "text" in result:
            ms = result.get("duration_ms", 0)
            return {"text": str(result.get("text") or ""), "duration_ms": int(ms or 0)}
    except Exception:
        pass
    return StubASRProvider().transcribe(b"")
