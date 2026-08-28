"""TTS：Provider + 同文本缓存 + stub 兜底。"""

from __future__ import annotations

from app.services.agent.tts.providers import get_tts_provider
from app.services.agent.tts.providers.stub import StubTTSProvider

# text|voice → audio_url（进程内；重启丢失）
_CACHE: dict[str, str] = {}


def _cache_key(text: str, voice: str | None) -> str:
    return f"{voice or ''}::{text}"


def clear_tts_cache() -> None:
    _CACHE.clear()


def synthesize(text: str, *, voice: str | None = None) -> dict:
    if not (text or "").strip():
        return {}
    key = _cache_key(text, voice)
    hit = _CACHE.get(key)
    if hit:
        return {"audio_url": hit}
    try:
        result = get_tts_provider().synthesize(text, voice=voice)
        url = result.get("audio_url") if isinstance(result, dict) else None
        if url:
            _CACHE[key] = str(url)
            return {"audio_url": str(url)}
    except Exception:
        pass
    return StubTTSProvider().synthesize(text, voice=voice)
