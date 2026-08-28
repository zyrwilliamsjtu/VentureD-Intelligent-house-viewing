"""M2：handle_tour 接入 build_tour；narration story_card + session 去重。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.errors import GatewayError
from app.services.agent.chat.actions import all_tp_ids
from app.services.agent.facts import load as load_facts
from app.services.agent.service import handle_narration, handle_tour
from app.services.agent.session import store as session_store

client = TestClient(app)

WORLD = "w_0330_840483"
TOUR_PATH = [
    "room_living",
    "room_kitchen",
    "room_laundry",
    "room_study",
    "room_bedroom_3",
    "room_bedroom_second",
    "room_bathroom",
    "room_bedroom_master",
    "room_bathroom_3",
    "room_bathroom_2",
]


def test_handle_tour_steps_follow_tour_path() -> None:
    body = handle_tour(WORLD, "s_tour_m2")
    steps = body["steps"]
    assert len(steps) == len(TOUR_PATH)
    graph = load_facts(WORLD)
    assert graph is not None
    allowed = all_tp_ids(graph)
    for i, (step, expected_rid) in enumerate(zip(steps, TOUR_PATH, strict=True)):
        assert step["index"] == i
        assert step["room_id"] == expected_rid
        assert step["trajectory_point_id"] in allowed
        assert step["narration"]
        assert "audio" not in step


def test_handle_tour_missing_ids_400() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_tour("", "s_x")
    assert exc.value.status_code == 400
    assert exc.value.code == "AGENT_ERROR"
    with pytest.raises(GatewayError) as exc2:
        handle_tour(WORLD, "")
    assert exc2.value.status_code == 400


def test_handle_tour_unknown_world_404() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_tour("w_nope", "s_x")
    assert exc.value.status_code == 404
    assert exc.value.code == "WORLD_NOT_FOUND"


def test_tour_http_missing_body_400() -> None:
    resp = client.post("/api/agent/tour", json={})
    assert resp.status_code == 400
    assert resp.json()["code"] == "AGENT_ERROR"


def test_narration_story_card() -> None:
    sid = "s_nar_fresh"
    session_store.clear(sid)
    body = handle_narration(WORLD, "room_living", session_id=sid)
    assert "客厅" in body["reply_text"]
    assert "tts_url" not in body
    session_store.clear(sid)


def test_narration_unknown_room_404() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_narration(WORLD, "room_does_not_exist")
    assert exc.value.status_code == 404


def test_narration_unknown_world_404() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_narration("w_nope", "room_living")
    assert exc.value.status_code == 404
    assert exc.value.code == "WORLD_NOT_FOUND"


def test_narration_session_dedup() -> None:
    sid = "s_nar_dedup"
    session_store.clear(sid)
    first = handle_narration(WORLD, "room_living", session_id=sid)
    second = handle_narration(WORLD, "room_living", session_id=sid)
    assert "客厅" in first["reply_text"]
    assert first["reply_text"] != second["reply_text"]
    assert second["reply_text"] == "这就是客厅。"
    session_store.clear(sid)
