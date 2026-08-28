"""P0 ASR：stub 与未配置 openai_compat 降级。"""

from __future__ import annotations

import httpx
import pytest

from app.services.agent.asr.providers import get_asr_provider
from app.services.agent.asr.providers.stub import StubASRProvider
from app.services.agent.asr.service import transcribe


def test_stub_provider_empty_text() -> None:
    body = StubASRProvider().transcribe(b"\x00\x00")
    assert body == {"text": "", "duration_ms": 0}


def test_factory_default_stub() -> None:
    assert isinstance(get_asr_provider(), StubASRProvider)


def test_transcribe_none_audio_stub_shape() -> None:
    body = transcribe(None)
    assert body["text"] == ""
    assert body["duration_ms"] == 0


def test_openai_compat_unconfigured_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "openai_compat")
    monkeypatch.setenv("ASR_API_KEY", "")
    monkeypatch.setenv("ASR_BASE_URL", "")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_BASE_URL", "")
    body = transcribe(b"\x00\x00")
    assert body["text"] == ""
    assert body["duration_ms"] == 0


def test_openai_compat_timeout_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "openai_compat")
    monkeypatch.setenv("ASR_API_KEY", "sk-test-not-real")
    monkeypatch.setenv("ASR_BASE_URL", "https://example.invalid/v1")

    class _TimeoutClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs

        def __enter__(self) -> "_TimeoutClient":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs
            raise httpx.TimeoutException("asr timeout")

    monkeypatch.setattr(
        "app.services.agent.asr.providers.openai_compat.httpx.Client",
        _TimeoutClient,
    )
    body = transcribe(b"\x00\x00")
    assert body["text"] == ""
    assert body["duration_ms"] == 0
