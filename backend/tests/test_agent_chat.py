"""M1 规则版 handle_chat：意图 / 取证 / 回复 / tp_id 动作。"""

from __future__ import annotations

import pytest

from app.schemas.errors import GatewayError
from app.services.agent.chat.actions import all_tp_ids
from app.services.agent.facts import load as load_facts
from app.services.agent.service import handle_chat
from app.services.agent.session import store as session_store

WORLD = "w_0330_840483"
WORLD_MOCK = "w_mock_001"


def _chat(
    text: str | None,
    *,
    sid: str = "s_m1",
    event: str | None = None,
    room_id: str | None = None,
    world: str = WORLD,
) -> dict:
    session_store.clear(sid)
    return handle_chat(
        session_id=sid,
        world_id=world,
        user_text=text,
        event=event,
        room_id=room_id,
    )


def test_navigation_master_bedroom() -> None:
    body = _chat("主卧在哪")
    assert "主卧" in body["reply_text"]
    assert body["actions"][0]["type"] == "teleport"
    assert body["actions"][0]["tp_id"] == "tp_bedroom_master"
    assert "position" not in body["actions"][0]


def test_navigation_sofa_tp() -> None:
    body = _chat("沙发在哪")
    tps = {a["tp_id"] for a in body["actions"] if "tp_id" in a}
    assert "tp_sofa_417" in tps or "tp_living" in tps
    assert body["actions"][0]["tp_id"] in ("tp_sofa_417", "tp_living")


def test_property_area() -> None:
    body = _chat("这套房多大")
    assert "120.1" in body["reply_text"]
    assert "待对拍" not in body["reply_text"]


def test_instance_fridge_0330_no_hallucinated_capacity() -> None:
    """0330 冰箱 attrs 仅 source_label，不得编造 501升（501升只在 w_mock_001）。"""
    body = _chat("冰箱多大")
    assert "501" not in body["reply_text"]
    assert "没有更多信息" in body["reply_text"] or "冰箱" in body["reply_text"]


def test_instance_fridge_mock_has_capacity() -> None:
    body = _chat("冰箱多大", world=WORLD_MOCK)
    assert "501升" in body["reply_text"]


def test_enter_room_story_card() -> None:
    body = _chat(None, event="enter_room", room_id="room_living")
    assert "客厅" in body["reply_text"]
    assert "actions" not in body


def test_smalltalk() -> None:
    body = _chat("你好")
    assert "小安" in body["reply_text"]
    assert "actions" not in body


def test_unknown() -> None:
    body = _chat("今天天气如何")
    assert "请问您想问什么" in body["reply_text"] or "想先看哪一间" in body["reply_text"]
    assert "actions" not in body


def test_missing_instance() -> None:
    body = _chat("钢琴在哪")
    assert "没有" in body["reply_text"] and "可靠信息" in body["reply_text"]
    assert "actions" not in body


def test_stove_not_invented() -> None:
    body = _chat("灶台在哪")
    assert "灶台" in body["reply_text"]
    assert "没有" in body["reply_text"]
    assert "U型" not in body["reply_text"]
    assert "actions" not in body


def test_orientation_placeholder_not_embellished() -> None:
    body = _chat("这套房朝向怎么样")
    assert "暂未提供" in body["reply_text"] or "数据未提供" in body["reply_text"]
    assert "南" not in body["reply_text"]


def test_all_action_tp_ids_exist_in_graph() -> None:
    graph = load_facts(WORLD)
    assert graph is not None
    allowed = all_tp_ids(graph)
    for q in ("主卧在哪", "沙发在哪", "厨房在哪", "这套房多大", "冰箱多大"):
        body = _chat(q, sid=f"s_tp_{q}")
        for act in body.get("actions") or []:
            if "tp_id" in act:
                assert act["tp_id"] in allowed, act


def test_session_history_multi_turn() -> None:
    sid = "s_multi"
    session_store.clear(sid)
    handle_chat(session_id=sid, world_id=WORLD, user_text="你好")
    handle_chat(session_id=sid, world_id=WORLD, user_text="主卧在哪")
    sess = session_store.load(sid)
    assert sess is not None
    roles = [h["role"] for h in sess["history"]]
    assert roles.count("user") == 2
    assert roles.count("assistant") == 2
    assert sess["current_room"] == "room_bedroom_master"
    session_store.clear(sid)


def test_unknown_world_404() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_chat(session_id="s_x", world_id="w_nope", user_text="hi")
    assert exc.value.status_code == 404
    assert exc.value.code == "WORLD_NOT_FOUND"


def test_nav_friendly_grounded_area() -> None:
    body = _chat("主卧在哪")
    assert "这就带您去主卧" in body["reply_text"] or "带您去主卧" in body["reply_text"]
    assert "20.1" in body["reply_text"]
    assert body["actions"][0]["type"] == "teleport"
    assert body["actions"][0]["tp_id"] == "tp_bedroom_master"
    assert "position" not in body["actions"][0]


def test_missing_guides_not_hallucinate() -> None:
    body = _chat("钢琴在哪")
    text = body["reply_text"]
    assert "暂未提供" in text
    assert "可靠信息" in text
    assert "您看需要吗" in text or "带您看看" in text
    assert "施坦威" not in text
    assert "actions" not in body


def test_0469_no_fridge_guides() -> None:
    body = _chat("冰箱多大", world="w_0469_840829")
    text = body["reply_text"]
    assert "冰箱" in text
    assert "暂未提供" in text
    assert "501" not in text
    assert "升" not in text
    assert "actions" not in body


def test_unknown_natural_guide() -> None:
    body = _chat("今天天气如何")
    text = body["reply_text"]
    assert "天气" not in text or "暂未" in text or "房间" in text
    assert "户型" in text or "房间" in text or "家具" in text
    assert "actions" not in body


def test_instance_combines_teleport_highlight_card() -> None:
    body = _chat("冰箱多大")
    kinds = [a["type"] for a in body.get("actions") or []]
    assert "teleport" in kinds
    assert "highlight" in kinds
    assert "show_card" in kinds
    tps = [a.get("tp_id") for a in body["actions"] if a.get("tp_id")]
    assert len(tps) == len(set(tps)) or kinds.count("teleport") == 1
    for a in body["actions"]:
        assert "position" not in a


def test_navigation_no_duplicate_teleport() -> None:
    body = _chat("主卧在哪")
    teles = [a for a in body["actions"] if a["type"] == "teleport"]
    assert len(teles) == 1
    assert teles[0]["tp_id"] == "tp_bedroom_master"

