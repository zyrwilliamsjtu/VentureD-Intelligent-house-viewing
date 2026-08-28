"""P1 volcengine TTS V3：未配置降级、mock chunked 流、缓存。"""

from __future__ import annotations

import base64
import json
import os

import pytest

from app.services.agent.tts.providers import get_tts_provider
from app.services.agent.tts.providers.volcengine import VolcengineTTSProvider
from app.services.agent.tts.service import clear_tts_cache, synthesize


def _clear_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TTS_PROVIDER", "volcengine")
    monkeypatch.setenv("TTS_APP_ID", "")
    monkeypatch.setenv("TTS_ACCESS_TOKEN", "")
    monkeypatch.setenv("TTS_SECRET_KEY", "")
    monkeypatch.setenv("TTS_RESOURCE_ID", "")


def test_unconfigured_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_tts_cache()
    _clear_creds(monkeypatch)
    assert isinstance(get_tts_provider(), VolcengineTTSProvider)
    assert synthesize("主卧朝南") == {}


def test_mock_v3_stream_returns_static_url(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    clear_tts_cache()
    monkeypatch.setenv("TTS_PROVIDER", "volcengine")
    monkeypatch.setenv("TTS_APP_ID", "app")
    monkeypatch.setenv("TTS_ACCESS_TOKEN", "tok")
    monkeypatch.setenv("TTS_RESOURCE_ID", "res")
    monkeypatch.setattr(
        "app.services.agent.tts.providers.volcengine.tts_output_dir",
        lambda: tmp_path,
    )

    class _Stream:
        status_code = 200

        def __enter__(self) -> "_Stream":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def iter_lines(self):
            yield json.dumps(
                {"code": 0, "data": base64.b64encode(b"ID3fake").decode("ascii")}
            )
            yield json.dumps({"code": 20000000, "data": None})

    class _Client:
        def __init__(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs

        def __enter__(self) -> "_Client":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def stream(self, method: str, url: str, headers: dict, json: dict) -> _Stream:
            assert method == "POST"
            assert url.endswith("/api/v3/tts/unidirectional")
            assert headers.get("X-Api-Access-Key") == "tok"
            assert json["req_params"]["text"] == "你好"
            return _Stream()

    monkeypatch.setattr(
        "app.services.agent.tts.providers.volcengine.httpx.Client",
        _Client,
    )
    body = synthesize("你好")
    url = body.get("audio_url") or ""
    assert url.startswith("/static/tts/")
    assert url.endswith(".mp3")
    files = list(tmp_path.glob("*.mp3"))
    assert len(files) == 1
    assert files[0].read_bytes() == b"ID3fake"
    clear_tts_cache()


def test_cache_skips_second_provider_call(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_tts_cache()
    calls = {"n": 0}

    class _Fake:
        def synthesize(self, text: str, *, voice: str | None = None) -> dict:
            _ = text, voice
            calls["n"] += 1
            return {"audio_url": "/static/tts/cached.mp3"}

    monkeypatch.setattr(
        "app.services.agent.tts.service.get_tts_provider",
        lambda: _Fake(),
    )
    a = synthesize("同一句", voice="v1")
    b = synthesize("同一句", voice="v1")
    assert a == b == {"audio_url": "/static/tts/cached.mp3"}
    assert calls["n"] == 1
    clear_tts_cache()


@pytest.mark.skipif(os.environ.get("AGENT_LIVE_VOICE") != "1", reason="live TTS opt-in")
def test_live_tts_smoke() -> None:
    clear_tts_cache()
    body = synthesize("你好，欢迎了解这套房")
    assert body.get("audio_url", "").startswith("/static/tts/")
    clear_tts_cache()
