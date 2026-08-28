"""P1 TTS：stub、缓存、降级。"""

from __future__ import annotations

import pytest

from app.services.agent.tts.providers.stub import StubTTSProvider
from app.services.agent.tts.service import clear_tts_cache, synthesize


def test_stub_omits_audio_url() -> None:
    assert StubTTSProvider().synthesize("主卧约15平", voice="female_sales") == {}
    assert synthesize("主卧约15平") == {}


def test_cache_hits_second_call(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_tts_cache()
    calls = {"n": 0}

    class _Fake:
        def synthesize(self, text: str, *, voice: str | None = None) -> dict:
            calls["n"] += 1
            return {"audio_url": "https://example.invalid/a.mp3"}

    monkeypatch.setattr(
        "app.services.agent.tts.service.get_tts_provider",
        lambda: _Fake(),
    )
    a = synthesize("hello", voice="v1")
    b = synthesize("hello", voice="v1")
    assert a == b == {"audio_url": "https://example.invalid/a.mp3"}
    assert calls["n"] == 1
    clear_tts_cache()


def test_openai_compat_unconfigured_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_tts_cache()
    monkeypatch.setenv("TTS_PROVIDER", "openai_compat")
    monkeypatch.setenv("TTS_API_KEY", "")
    monkeypatch.setenv("TTS_BASE_URL", "")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_BASE_URL", "")
    assert synthesize("主卧朝南") == {}
