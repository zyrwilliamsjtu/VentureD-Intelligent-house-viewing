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
        assert step.get("speech")
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
    assert second["reply_text"] == "小驻带您看看客厅。"
    session_store.clear(sid)


def _step(body: dict, room_id: str) -> dict:
    for step in body["steps"]:
        if step["room_id"] == room_id:
            return step
    raise AssertionError(f"missing step {room_id}")


def test_tour_speech_grounded_master_0330() -> None:
    """主卧 speech 模板：面积+真实实例+邻接卫生间；不上屏长稿与短 narration 分离。"""
    body = handle_tour(WORLD, "s_tour_speech_master")
    step = _step(body, "room_bedroom_master")
    assert step["narration"] == "主卧约20.1平。"
    speech = step["speech"]
    assert "小驻带您看看主卧" in speech
    assert "20.1" in speech
    for token in ("床", "衣柜", "床头柜", "独立卫生间"):
        assert token in speech, token
    assert "双人床" not in speech  # 未在 GT 标注尺寸，不编造
    assert "地铁" not in speech
    session_store.clear("s_tour_speech_master")


def test_tour_speech_living_has_furniture_not_listing_tags() -> None:
    body = handle_tour(WORLD, "s_tour_speech_living")
    step = _step(body, "room_living")
    speech = step["speech"]
    assert "客厅" in speech and "52.6" in speech
    for token in ("沙发", "餐桌", "电视柜"):
        assert token in speech, token
    assert "近地铁" not in speech
    assert "学区" not in speech
    session_store.clear("s_tour_speech_living")


def test_tour_speech_does_not_invent_missing_fridge() -> None:
    """0469 无冰箱实例：厨房 speech 不得出现冰箱。"""
    body = handle_tour("w_0469_840829", "s_tour_0469")
    kitchen = _step(body, "room_kitchen")
    assert "冰箱" not in (kitchen.get("speech") or "")
    session_store.clear("s_tour_0469")


def test_tour_speech_no_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(*_a, **_k):
        raise AssertionError("tour 不得调用 LLM")

    monkeypatch.setattr("app.services.agent.chat.llm_provider.get_chat_llm_provider", _boom)
    body = handle_tour(WORLD, "s_tour_no_llm")
    assert body["steps"]
    assert all(s.get("speech") for s in body["steps"])
    session_store.clear("s_tour_no_llm")


def test_tour_mock_selling_points_in_speech() -> None:
    body = handle_tour("w_mock_001", "s_tour_mock")
    living = _step(body, "room_living")
    assert living.get("selling_points")
    speech = living["speech"]
    assert "24" in speech or "客厅" in speech
    assert "落地窗" in speech or "采光" in speech
    assert len(living["narration"]) < len(speech)
    session_store.clear("s_tour_mock")
