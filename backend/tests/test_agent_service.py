"""Agent 服务层测试：facts / session / handle_* SPEC 形状。不含完整 chat 逻辑。"""

from __future__ import annotations

import pytest

from app.schemas.errors import GatewayError
from app.services.agent import (
    handle_asr,
    handle_chat,
    handle_narration,
    handle_tour,
    handle_tts,
)
from app.services.agent import facts
from app.services.agent.session import store as session_store
from app.services.agent.tour.service import build_tour

WORLD_0330 = "w_0330_840483"
WORLD_MOCK = "w_mock_001"


def test_facts_load_0330_has_10_rooms_75_instances() -> None:
    graph = facts.load(WORLD_0330)
    assert graph is not None
    assert graph.get("world_id") == WORLD_0330
    rooms = facts.rooms_of(graph)
    assert len(rooms) == 10
    assert len(facts.instances_of(graph)) == 75
    coord = graph.get("coord")
    assert isinstance(coord, dict)
    assert coord.get("up") == "Y"


def test_facts_load_mock_world() -> None:
    graph = facts.load(WORLD_MOCK)
    assert graph is not None
    assert graph.get("world_id") == WORLD_MOCK
    assert facts.rooms_of(graph)


def test_facts_unknown_world_returns_none() -> None:
    assert facts.load("w_does_not_exist") is None


def test_session_load_save_clear() -> None:
    sid = "s_agent_service_test"
    session_store.clear(sid)
    assert session_store.load(sid) is None
    saved = session_store.save(
        sid,
        {
            "world_id": WORLD_0330,
            "history": [{"role": "user", "text": "hi"}],
            "current_room": "room_living",
            "tour_index": 1,
        },
    )
    assert saved["world_id"] == WORLD_0330
    loaded = session_store.load(sid)
    assert loaded is not None
    assert loaded["current_room"] == "room_living"
    assert loaded["tour_index"] == 1
    assert loaded["history"][0]["text"] == "hi"
    session_store.clear(sid)
    assert session_store.load(sid) is None


def test_handle_asr_stub_spec_shape() -> None:
    body = handle_asr(None)
    assert body["text"] == ""
    assert body["duration_ms"] == 0


def test_handle_tts_stub_omits_audio() -> None:
    body = handle_tts("主卧约15平", voice="female_sales")
    assert body == {}
    assert "audio_url" not in body


def test_handle_narration_living_room() -> None:
    body = handle_narration(WORLD_0330, "room_living")
    assert "reply_text" in body
    assert isinstance(body["reply_text"], str)
    assert body["reply_text"]
    assert "tts_url" not in body


def test_handle_narration_missing_room_404() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_narration(WORLD_0330, "room_does_not_exist")
    assert exc.value.status_code == 404
    assert exc.value.code == "AGENT_ERROR"


def test_handle_tour_stub_empty_steps() -> None:
    body = handle_tour(WORLD_0330, "s_test")
    assert body == {"steps": []}


def test_build_tour_simple_from_scene_graph() -> None:
    body = build_tour(WORLD_0330)
    steps = body["steps"]
    assert isinstance(steps, list)
    assert len(steps) >= 1
    first = steps[0]
    assert "room_id" in first
    assert "trajectory_point_id" in first or "narration" in first


def test_handle_chat_stub_spec_shape() -> None:
    sid = "s_chat_stub"
    session_store.clear(sid)
    body = handle_chat(
        session_id=sid,
        world_id=WORLD_0330,
        user_text="沙发在哪里",
        room_id="room_living",
    )
    assert "reply_text" in body
    assert isinstance(body["reply_text"], str)
    assert body["reply_text"]
    assert "tts_url" not in body
    # M1：导航问句可带 actions；空则 omit
    if "actions" in body:
        assert isinstance(body["actions"], list)
        assert body["actions"]
    sess = session_store.load(sid)
    assert sess is not None
    assert sess["world_id"] == WORLD_0330
    assert sess["current_room"] == "room_living"
    session_store.clear(sid)
