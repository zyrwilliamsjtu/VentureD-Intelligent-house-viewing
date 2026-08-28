"""P0 volcengine ASR：未配置降级 + mock WebSocket 协议。"""

from __future__ import annotations

import gzip
import json
import struct

import pytest

from app.services.agent.asr.providers import get_asr_provider
from app.services.agent.asr.providers import volcengine as asr_mod
from app.services.agent.asr.providers.volcengine import (
    VolcengineASRProvider,
    extract_text,
    handshake_headers,
    pack_audio_only,
    pack_full_client_request,
    parse_server_frame,
)
from app.services.agent.asr.service import transcribe


def test_unconfigured_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "volcengine")
    monkeypatch.setenv("ASR_APP_ID", "")
    monkeypatch.setenv("ASR_ACCESS_TOKEN", "")
    monkeypatch.setenv("ASR_SECRET_KEY", "")
    monkeypatch.setenv("ASR_RESOURCE_ID", "")
    assert isinstance(get_asr_provider(), VolcengineASRProvider)
    body = transcribe(b"\x00\x00")
    assert body == {"text": "", "duration_ms": 0}


def test_handshake_headers_official_keys() -> None:
    headers = handshake_headers(
        app_id="appid",
        access_token="tok",
        resource_id="res-1",
        secret_key="sec",
    )
    assert headers["X-Api-App-Key"] == "appid"
    assert headers["X-Api-Access-Key"] == "tok"
    assert headers["X-Api-Resource-Id"] == "res-1"
    assert headers["X-Api-Secret-Key"] == "sec"
    assert headers["X-Api-Connect-Id"]


def test_pack_and_parse_roundtrip() -> None:
    frame = pack_full_client_request(1, audio_format="ogg", codec="opus")
    assert frame[0] >> 4 == 1
    audio = pack_audio_only(2, b"abc", is_last=True)
    assert audio[1] >> 4 == 0b0010


def test_extract_text() -> None:
    assert extract_text({"result": {"text": "主卧"}}) == "主卧"
    assert extract_text({}) == ""


def _server_text_frame(text: str) -> bytes:
    payload = gzip.compress(json.dumps({"result": {"text": text}}).encode("utf-8"))
    header = asr_mod._header(asr_mod._SERVER_FULL, asr_mod._NEG_WITH_SEQ, asr_mod._JSON)
    out = bytearray(header)
    out.extend(struct.pack(">i", 1))
    out.extend(struct.pack(">I", len(payload)))
    out.extend(payload)
    parsed = parse_server_frame(bytes(out))
    assert extract_text(parsed.get("payload")) == text
    return bytes(out)


def test_mock_websocket_protocol(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "volcengine")
    monkeypatch.setenv("ASR_APP_ID", "app")
    monkeypatch.setenv("ASR_ACCESS_TOKEN", "tok")
    monkeypatch.setenv("ASR_RESOURCE_ID", "res")
    monkeypatch.setenv("ASR_SECRET_KEY", "")
    frames = [_server_text_frame("你好"), _server_text_frame("你好欢迎")]

    class _FakeWS:
        def __init__(self) -> None:
            self.sent: list[bytes] = []
            self._i = 0

        async def __aenter__(self) -> "_FakeWS":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def send(self, data: bytes) -> None:
            self.sent.append(data)

        async def recv(self) -> bytes:
            idx = min(self._i, len(frames) - 1)
            self._i += 1
            return frames[idx]

    def _connect(*args: object, **kwargs: object) -> _FakeWS:
        assert "additional_headers" in kwargs or "extra_headers" in kwargs
        return _FakeWS()

    import websockets

    monkeypatch.setattr(websockets, "connect", _connect)
    body = transcribe(b"\x00\x01\x02\x03")
    assert body["text"] == "你好欢迎"
    assert body["duration_ms"] >= 0
