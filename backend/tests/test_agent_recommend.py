"""POST /api/agent/recommend：真实 5 套中推荐 1 套，非法 id 丢弃。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.errors import GatewayError
from app.services.agent.recommend.service import handle_recommend, rule_recommend, _real_pool

client = TestClient(app)
STUDY = "我想要有书房的"
REAL_IDS = {
    "listing_0330_840483",
    "listing_0469_840829",
    "listing_0259_840804",
    "listing_0309_840544",
    "listing_0836_841149",
}


def test_rule_study_picks_0259() -> None:
    pool = _real_pool(None)
    item, reason = rule_recommend(STUDY, pool)
    assert item is not None
    assert item["id"] == "listing_0259_840804"
    assert "小驻" in reason
    assert "书房" in reason or "澜庭" in reason


def test_recommend_study_stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.agent.recommend.service.ask_llm", lambda *a, **k: None)
    body = handle_recommend(session_id="s_rec", user_text=STUDY)
    assert body["listing_id"] == "listing_0259_840804"
    assert body["listing_id"] in REAL_IDS
    assert "小驻" in body["reason"]
    assert "学区" not in body["reason"]


def test_recommend_llm_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.agent.recommend.service.ask_llm",
        lambda *a, **k: {
            "listing_id": "listing_0469_840829",
            "reason": "小驻推荐翡翠云邸：四室一厅约136平，客厅开间大。",
        },
    )
    body = handle_recommend(session_id="s_rec", user_text="想要四房")
    assert body["listing_id"] == "listing_0469_840829"
    assert "翡翠云邸" in body["reason"] or "四室" in body["reason"]


def test_recommend_illegal_id_discarded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.agent.recommend.service.ask_llm",
        lambda *a, **k: {"listing_id": "listing_fake_999", "reason": "虚构学区房"},
    )
    body = handle_recommend(session_id="s_rec", user_text=STUDY)
    assert body["listing_id"] in REAL_IDS
    assert body["listing_id"] != "listing_fake_999"
    assert "学区" not in body["reason"]


def test_recommend_llm_timeout_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.agent.recommend.service.ask_llm", lambda *a, **k: None)
    body = handle_recommend(session_id="s_rec", user_text="四房给老人住")
    assert body["listing_id"] == "listing_0469_840829"


def test_recommend_unmatched_guides() -> None:
    body = handle_recommend(session_id="s_rec", user_text="要海边别墅带电梯")
    assert "listing_id" not in body
    assert "换个说法" in body["reason"]


def test_recommend_missing_ids_400() -> None:
    with pytest.raises(GatewayError) as exc:
        handle_recommend(session_id="", user_text=STUDY)
    assert exc.value.status_code == 400
    with pytest.raises(GatewayError) as exc2:
        handle_recommend(session_id="s_x", user_text="  ")
    assert exc2.value.status_code == 400


def test_recommend_http() -> None:
    resp = client.post(
        "/api/agent/recommend",
        json={"session_id": "s_http", "user_text": STUDY},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["listing_id"] in REAL_IDS
    assert body["reason"]
    assert "listing_fake" not in body["reason"]


def test_recommend_http_400() -> None:
    resp = client.post("/api/agent/recommend", json={"user_text": STUDY})
    assert resp.status_code == 400
    assert resp.json()["code"] == "AGENT_ERROR"
