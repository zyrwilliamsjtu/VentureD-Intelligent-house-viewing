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


def test_attach_tts_url_writes_field(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.agent.tts.service import attach_tts_url

    clear_tts_cache()
    monkeypatch.setattr(
        "app.services.agent.tts.service.get_tts_provider",
        lambda: type("P", (), {"synthesize": staticmethod(lambda text, voice=None: {"audio_url": "/static/tts/a.mp3"})})(),
    )
    body = attach_tts_url({"reply_text": "你好"}, "你好")
    assert body["tts_url"] == "/static/tts/a.mp3"
    clear_tts_cache()


def test_narration_omits_tts_even_when_provider_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    """转房讲解只上屏：GET /narration 不再附 tts_url（语音问答 / 带看才发声）。"""
    from app.services.agent.service import handle_narration
    from app.services.agent.session import store as session_store

    clear_tts_cache()
    monkeypatch.setattr(
        "app.services.agent.tts.service.get_tts_provider",
        lambda: type("P", (), {"synthesize": staticmethod(lambda text, voice=None: {"audio_url": "/static/tts/n.mp3"})})(),
    )
    sid = "s_nar_tts"
    session_store.clear(sid)
    body = handle_narration("w_0330_840483", "room_living", session_id=sid)
    assert "客厅" in body["reply_text"]
    assert "tts_url" not in body
    session_store.clear(sid)
    clear_tts_cache()
