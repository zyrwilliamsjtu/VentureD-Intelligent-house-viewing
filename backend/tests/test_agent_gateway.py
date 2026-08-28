"""Agent gateway stubs — SPEC v2.2 §3 response shapes only."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_stub_json() -> None:
    resp = client.post(
        "/api/agent/chat",
        json={
            "session_id": "s_test",
            "world_id": "w_0330_840483",
            "user_text": "沙发在哪里",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "reply_text" in body
    assert isinstance(body["reply_text"], str)
    assert body["reply_text"]
    assert "tts_url" not in body
    assert "actions" not in body


def test_chat_requires_session_and_world() -> None:
    resp = client.post("/api/agent/chat", json={"user_text": "hi"})
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "AGENT_ERROR"


def test_asr_stub() -> None:
    resp = client.post(
        "/api/agent/asr",
        files={"audio": ("clip.webm", b"\x00\x00", "audio/webm")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == ""
    assert body["duration_ms"] == 0


def test_tts_stub() -> None:
    resp = client.post("/api/agent/tts", json={"text": "主卧约15平", "voice": "female_sales"})
    assert resp.status_code == 200
    body = resp.json()
    assert "audio_url" not in body
    assert body == {}


def test_narration_stub() -> None:
    resp = client.get(
        "/api/agent/narration",
        params={"world_id": "w_0330_840483", "room_id": "room_living"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "reply_text" in body
    assert "tts_url" not in body


def test_tour_stub() -> None:
    resp = client.post(
        "/api/agent/tour",
        json={"world_id": "w_0330_840483", "session_id": "s_test"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["steps"] == []
