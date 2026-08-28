"""P0 volcengine ASR：未配置/骨架未实现 → stub 降级。"""

from __future__ import annotations

import pytest

from app.services.agent.asr.providers import get_asr_provider
from app.services.agent.asr.providers.volcengine import (
    VolcengineASRProvider,
    handshake_headers,
)
from app.services.agent.asr.service import transcribe


def test_unconfigured_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "volcengine")
    monkeypatch.setenv("ASR_APP_ID", "")
    monkeypatch.setenv("ASR_ACCESS_TOKEN", "")
    assert isinstance(get_asr_provider(), VolcengineASRProvider)
    body = transcribe(b"\x00\x00")
    assert body == {"text": "", "duration_ms": 0}


def test_configured_skeleton_still_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "volcengine")
    monkeypatch.setenv("ASR_APP_ID", "app-test")
    monkeypatch.setenv("ASR_ACCESS_TOKEN", "token")
    body = transcribe(b"\x00\x00")
    assert body["text"] == ""
    assert body["duration_ms"] == 0


def test_handshake_headers_official_keys() -> None:
    headers = handshake_headers(
        app_id="appid",
        access_token="tok",
        resource_id="volc.bigasr.sauc.duration",
    )
    assert headers["X-Api-App-Key"] == "appid"
    assert headers["X-Api-Access-Key"] == "tok"
    assert headers["X-Api-Resource-Id"] == "volc.bigasr.sauc.duration"
    assert headers["X-Api-Connect-Id"]
