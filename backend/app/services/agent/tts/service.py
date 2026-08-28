"""TTS：Provider + 同文本缓存 + stub 兜底。

PI 确认：真实 TTS 有音频。POST /api/agent/tts 返回 {} 仅当：
1. TTS_PROVIDER=stub（测试 conftest / 未配真实 provider）→ 契约即 {}。
2. 真实 provider 未配齐或合成抛错后回落 stub → {}。
配齐 volcengine/openai_compat 且合成成功返回 {audio_url}。
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.agent.tts.providers import get_tts_provider
from app.services.agent.tts.providers.stub import StubTTSProvider

log = logging.getLogger(__name__)

# text|voice → audio_url（进程内；重启丢失）
_CACHE: dict[str, str] = {}
last_tts_error: str = ""


def _cache_key(text: str, voice: str | None) -> str:
    return f"{voice or ''}::{text}"


def clear_tts_cache() -> None:
    _CACHE.clear()


def synthesize(text: str, *, voice: str | None = None) -> dict:
    global last_tts_error
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
            last_tts_error = ""
            _CACHE[key] = str(url)
            return {"audio_url": str(url)}
        last_tts_error = "provider returned empty"
    except Exception as exc:
        last_tts_error = str(exc)[:240]
        log.warning("TTS synthesize failed: %s", last_tts_error)
    return StubTTSProvider().synthesize(text, voice=voice)


def attach_tts_url(body: dict[str, Any], text: str, *, voice: str | None = None) -> dict[str, Any]:
    """chat/narration：配了真实 TTS 且合成成功则写入 tts_url；stub 省略字段。"""
    try:
        tts_body = synthesize(text, voice=voice)
        url = tts_body.get("audio_url") if isinstance(tts_body, dict) else None
        if url:
            body["tts_url"] = str(url)
    except Exception:
        pass
    return body
