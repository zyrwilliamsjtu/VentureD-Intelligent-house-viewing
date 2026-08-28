"""Demo 全流程端到端（理解层 + listings + scene/camera + agent）。

conftest 默认 stub ASR/TTS/CHAT。真实 LLM/语音仅 AGENT_LIVE_VOICE=1。
关键数据写入 _demo_flow_run.json（不入库）。
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import BACKEND_ROOT, REPO_ROOT, llm_api_key, llm_base_url, llm_model
from app.data import listing_store
from app.main import app
from app.services.agent.chat.responder import SMALLTALK_REPLY, UNKNOWN_REPLY
from app.services.agent.session import store as session_store

client = TestClient(app)

LIVE = os.environ.get("AGENT_LIVE_VOICE") == "1"
AUDIO_PATH = BACKEND_ROOT / "tests" / "assets" / "test_audio.m4a"

WORLD_0469 = "w_0469_840829"
LISTING_0469 = "listing_0469_840829"
WORLD_0259 = "w_0259_840804"
LISTING_0259 = "listing_0259_840804"

REAL_WORLDS = [
    "w_0330_840483",
    "w_0469_840829",
    "w_0259_840804",
    "w_0309_840544",
    "w_0836_841149",
]

RUN: dict[str, object] = {"steps": {}, "perf_ms": {}, "live": {}}
_LIVE_FAILS = 0


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def _snake(key: str) -> bool:
    return key == key.lower() and " " not in key


def _enable_live_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")


def _enable_live_voice(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASR_PROVIDER", "volcengine")
    monkeypatch.setenv("TTS_PROVIDER", "volcengine")
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")


def _live_or_skip() -> None:
    if not LIVE:
        pytest.skip("AGENT_LIVE_VOICE!=1")
    if _LIVE_FAILS >= 3:
        pytest.skip("真实 API 已连续失败 3 次，止损")


@pytest.fixture(scope="module", autouse=True)
def _dump_run() -> None:
    yield
    dump = BACKEND_ROOT / "tests" / "acceptance" / "_demo_flow_run.json"
    dump.write_text(json.dumps(RUN, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print("\n===== demo flow RUN =====")
    print(dump.read_text(encoding="utf-8"))


def test_01_listings_five_snake_worlds() -> None:
    t0 = time.perf_counter()
    resp = client.get("/api/listings")
    elapsed = _ms(t0)
    RUN["perf_ms"]["listings"] = elapsed  # type: ignore[index]
    assert resp.status_code == 200, resp.text
    body = resp.json()
    listings = body["listings"]
    assert len(listings) == 5
    for item in listings:
        for key in item:
            assert _snake(key), key
        assert item["world_id"] in REAL_WORLDS
        assert item["is_real"] is True
    worlds = {i["world_id"] for i in listings}
    assert worlds == set(REAL_WORLDS)
    RUN["steps"]["01_listings"] = {  # type: ignore[index]
        "ok": True,
        "n": 5,
        "ms": elapsed,
        "ids": [i["id"] for i in listings],
    }


def test_02_enter_0469_scene_and_poses() -> None:
    t0 = time.perf_counter()
    scene = client.get(f"/api/scene/{WORLD_0469}")
    scene_ms = _ms(t0)
    t1 = time.perf_counter()
    poses = client.get(f"/api/camera_poses/{WORLD_0469}")
    pose_ms = _ms(t1)
    RUN["perf_ms"]["scene_0469"] = scene_ms  # type: ignore[index]
    RUN["perf_ms"]["camera_poses_0469"] = pose_ms  # type: ignore[index]
    assert scene.status_code == 200, scene.text
    assert poses.status_code == 200, poses.text
    sbody = scene.json()
    pbody = poses.json()
    assert sbody["world_id"] == WORLD_0469
    assert sbody["coord"]["up"] == "Y"
    assert pbody["world_id"] == WORLD_0469
    assert isinstance(pbody["poses"], dict) and pbody["poses"]
    RUN["steps"]["02_enter_0469"] = {  # type: ignore[index]
        "ok": True,
        "rooms": len(sbody.get("rooms") or []),
        "n_poses": len(pbody["poses"]),
        "scene_ms": scene_ms,
        "pose_ms": pose_ms,
    }


def test_03_tour_0469_ten_steps_whitelist() -> None:
    poses = client.get(f"/api/camera_poses/{WORLD_0469}").json()["poses"]
    t0 = time.perf_counter()
    resp = client.post(
        "/api/agent/tour",
        json={"world_id": WORLD_0469, "session_id": "s_demo_tour"},
    )
    elapsed = _ms(t0)
    RUN["perf_ms"]["tour_0469"] = elapsed  # type: ignore[index]
    assert resp.status_code == 200, resp.text
    steps = resp.json()["steps"]
    assert len(steps) == 10, [s.get("room_id") for s in steps]
    tps = []
    for i, step in enumerate(steps):
        assert step["index"] == i
        tp = step["trajectory_point_id"]
        assert tp in poses, f"tp {tp} 不在 0469 白名单"
        tps.append(tp)
    RUN["steps"]["03_tour"] = {"ok": True, "ms": elapsed, "tps": tps}  # type: ignore[index]
    session_store.clear("s_demo_tour")


def test_04_nav_master_with_listing_id() -> None:
    poses = client.get(f"/api/camera_poses/{WORLD_0469}").json()["poses"]
    sid = "s_demo_nav"
    session_store.clear(sid)
    t0 = time.perf_counter()
    resp = client.post(
        "/api/agent/chat",
        json={
            "session_id": sid,
            "world_id": WORLD_0469,
            "listing_id": LISTING_0469,
            "user_text": "主卧在哪",
        },
    )
    elapsed = _ms(t0)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "主卧" in body["reply_text"]
    actions = body.get("actions") or []
    assert actions and actions[0]["type"] == "teleport"
    tp = actions[0]["tp_id"]
    assert tp == "tp_bedroom_master"
    assert tp in poses
    assert "position" not in actions[0]
    RUN["steps"]["04_nav"] = {  # type: ignore[index]
        "ok": True,
        "ms": elapsed,
        "tp_id": tp,
        "xyz": poses[tp],
        "reply": body["reply_text"],
    }
    session_store.clear(sid)


def test_05_free_qa_grounded_rule_or_live(monkeypatch: pytest.MonkeyPatch) -> None:
    sid = "s_demo_free"
    session_store.clear(sid)
    payload = {
        "session_id": sid,
        "world_id": WORLD_0469,
        "listing_id": LISTING_0469,
        "user_text": "这套房适合什么人住",
    }
    t0 = time.perf_counter()
    resp = client.post("/api/agent/chat", json=payload)
    elapsed = _ms(t0)
    assert resp.status_code == 200, resp.text
    reply = (resp.json().get("reply_text") or "").strip()
    assert reply
    grounded = ("135.9" in reply) or ("四室" in reply) or ("136" in reply)
    assert grounded, f"规则版自由答应 grounded 户型/面积: {reply}"
    RUN["steps"]["05_free_qa_rule"] = {  # type: ignore[index]
        "ok": True,
        "ms": elapsed,
        "reply": reply,
        "mode": "rule_stub",
    }
    RUN["perf_ms"]["chat_free_qa_rule"] = elapsed  # type: ignore[index]
    session_store.clear(sid)

    if not LIVE:
        return
    _live_or_skip()
    if not (llm_api_key() and llm_base_url() and llm_model()):
        pytest.skip("LLM 未配置")
    _enable_live_chat(monkeypatch)
    times: list[int] = []
    replies: list[str] = []
    try:
        for i in range(3):
            session_store.clear(f"{sid}_{i}")
            t1 = time.perf_counter()
            live = client.post(
                "/api/agent/chat",
                json={**payload, "session_id": f"{sid}_{i}"},
            )
            times.append(_ms(t1))
            assert live.status_code == 200, live.text
            text = (live.json().get("reply_text") or "").strip()
            replies.append(text)
            assert text not in (SMALLTALK_REPLY, UNKNOWN_REPLY)
            assert "请问您想问什么" not in text
            ok = ("135.9" in text) or ("四室" in text) or ("主卧" in text) or ("客厅" in text)
            assert ok, f"live 自由答未 grounded: {text}"
    except Exception:
        global _LIVE_FAILS
        _LIVE_FAILS += 1
        raise
    mean = sum(times) / len(times)
    RUN["live"]["free_qa"] = {  # type: ignore[index]
        "replies": replies,
        "times_ms": times,
        "mean_ms": round(mean, 1),
        "min_ms": min(times),
        "max_ms": max(times),
    }
    RUN["perf_ms"]["chat_free_qa_live_mean"] = round(mean, 1)  # type: ignore[index]


def test_06_price_0469_matches_listing() -> None:
    listings = {i["id"]: i for i in client.get("/api/listings").json()["listings"]}
    expect = listings[LISTING_0469]["price"]
    sid = "s_demo_price"
    session_store.clear(sid)
    t0 = time.perf_counter()
    resp = client.post(
        "/api/agent/chat",
        json={
            "session_id": sid,
            "world_id": WORLD_0469,
            "listing_id": LISTING_0469,
            "user_text": "这套多少钱",
        },
    )
    elapsed = _ms(t0)
    assert resp.status_code == 200, resp.text
    reply = resp.json()["reply_text"]
    assert expect in reply, reply
    assert "490万" in reply
    assert "数据未提供" not in reply
    RUN["steps"]["06_price_0469"] = {  # type: ignore[index]
        "ok": True,
        "ms": elapsed,
        "price": expect,
        "reply": reply,
    }
    session_store.clear(sid)


@pytest.mark.skipif(not LIVE, reason="live PTT opt-in")
def test_07_live_asr_chat_tts_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    _live_or_skip()
    if not AUDIO_PATH.is_file():
        pytest.skip("missing test_audio.m4a")
    _enable_live_voice(monkeypatch)
    sid = "s_demo_ptt"
    session_store.clear(sid)
    blob = AUDIO_PATH.read_bytes()
    timings: dict[str, int] = {}
    try:
        t0 = time.perf_counter()
        asr = client.post(
            "/api/agent/asr",
            files={"audio": ("test_audio.m4a", blob, "audio/mp4")},
        )
        timings["asr_ms"] = _ms(t0)
        assert asr.status_code == 200, asr.text
        text = (asr.json().get("text") or "").strip()
        assert text, asr.json()

        t1 = time.perf_counter()
        chat = client.post(
            "/api/agent/chat",
            json={
                "session_id": sid,
                "world_id": WORLD_0469,
                "listing_id": LISTING_0469,
                "user_text": text,
            },
        )
        timings["chat_ms"] = _ms(t1)
        assert chat.status_code == 200, chat.text
        reply = (chat.json().get("reply_text") or "").strip()
        assert reply

        t2 = time.perf_counter()
        tts = client.post("/api/agent/tts", json={"text": reply})
        timings["tts_ms"] = _ms(t2)
        assert tts.status_code == 200, tts.text
        url = tts.json().get("audio_url") or chat.json().get("tts_url") or ""
        assert str(url).startswith("/static/tts/"), (tts.json(), chat.json())
        audio = client.get(str(url))
        assert audio.status_code == 200
        assert len(audio.content) > 100
        timings["total_ms"] = timings["asr_ms"] + timings["chat_ms"] + timings["tts_ms"]
        RUN["live"]["ptt"] = {  # type: ignore[index]
            "asr_text": text,
            "reply": reply,
            "tts_url": url,
            "tts_bytes": len(audio.content),
            "timings_ms": timings,
        }
        RUN["perf_ms"]["ptt_loop"] = timings  # type: ignore[index]
        RUN["steps"]["07_ptt"] = {"ok": True, "asr_text": text}  # type: ignore[index]
    except Exception:
        global _LIVE_FAILS
        _LIVE_FAILS += 1
        raise
    finally:
        session_store.clear(sid)


def test_08_switch_house_new_session_price() -> None:
    """模拟前端方案 A：换房重置 session_id。"""
    sid_old = "s_demo_0469_sess"
    sid_new = "s_demo_0259_sess"
    session_store.clear(sid_old)
    session_store.clear(sid_new)
    first = client.post(
        "/api/agent/chat",
        json={
            "session_id": sid_old,
            "world_id": WORLD_0469,
            "listing_id": LISTING_0469,
            "user_text": "这套多少钱",
        },
    )
    assert "490万" in first.json()["reply_text"]
    second = client.post(
        "/api/agent/chat",
        json={
            "session_id": sid_new,
            "world_id": WORLD_0259,
            "listing_id": LISTING_0259,
            "user_text": "这套多少钱",
        },
    )
    assert second.status_code == 200, second.text
    reply = second.json()["reply_text"]
    assert "460万" in reply
    assert "490万" not in reply
    old = session_store.load(sid_old)
    new = session_store.load(sid_new)
    assert old and old.get("world_id") == WORLD_0469
    assert new and new.get("world_id") == WORLD_0259
    RUN["steps"]["08_switch"] = {  # type: ignore[index]
        "ok": True,
        "old_world": WORLD_0469,
        "new_world": WORLD_0259,
        "reply_0259": reply,
    }
    session_store.clear(sid_old)
    session_store.clear(sid_new)


def test_09_llm_bad_url_and_listings_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/api/v3")
    sid = "s_demo_fallback"
    session_store.clear(sid)
    resp = client.post(
        "/api/agent/chat",
        json={
            "session_id": sid,
            "world_id": WORLD_0469,
            "listing_id": LISTING_0469,
            "user_text": "主卧在哪",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "主卧" in body["reply_text"]
    assert (body.get("actions") or [])[0]["tp_id"] == "tp_bedroom_master"
    session_store.clear(sid)

    monkeypatch.setattr(listing_store, "LISTINGS_PATH", Path("/no/such/listings.json"))
    bad = client.get("/api/listings")
    assert bad.status_code == 500
    err = bad.json()
    assert err["code"] == "LISTINGS_UNAVAILABLE"
    assert "traceback" not in json.dumps(err).lower()
    RUN["steps"]["09_degrade"] = {  # type: ignore[index]
        "ok": True,
        "llm_fallback_status": 200,
        "listings_unavailable": err,
        "note": "listings 500 由前端硬编码兜底（SPEC §2.6 / §8）",
    }


def test_10_unknown_world_404_not_500() -> None:
    for path in (
        "/api/scene/w_does_not_exist",
        "/api/camera_poses/w_does_not_exist",
    ):
        resp = client.get(path)
        assert resp.status_code == 404
        body = resp.json()
        assert body["code"] == "WORLD_NOT_FOUND"
        assert set(body.keys()) == {"code", "message"}
        blob = json.dumps(body, ensure_ascii=False)
        assert "Traceback" not in blob
        assert "api_key" not in blob.lower()
        assert ".env" not in blob
    chat = client.post(
        "/api/agent/chat",
        json={
            "session_id": "s_demo_unknown",
            "world_id": "w_does_not_exist",
            "user_text": "hi",
        },
    )
    assert chat.status_code == 404
    assert chat.json()["code"] == "WORLD_NOT_FOUND"
    RUN["steps"]["10_unknown"] = {"ok": True, "chat_status": 404}  # type: ignore[index]


def test_voice_stub_omits_and_not_500() -> None:
    asr = client.post(
        "/api/agent/asr",
        files={"audio": ("x.webm", b"\x00\x00", "audio/webm")},
    )
    assert asr.status_code == 200, asr.text
    assert asr.json().get("text") == ""
    tts = client.post("/api/agent/tts", json={"text": "主卧约15平"})
    assert tts.status_code == 200, tts.text
    assert "audio_url" not in tts.json()


def test_concurrent_sessions_do_not_mix() -> None:
    def _ask(sid: str, world: str, listing: str, price_token: str) -> tuple[str, str]:
        session_store.clear(sid)
        resp = client.post(
            "/api/agent/chat",
            json={
                "session_id": sid,
                "world_id": world,
                "listing_id": listing,
                "user_text": "这套多少钱",
            },
        )
        assert resp.status_code == 200, resp.text
        reply = resp.json()["reply_text"]
        assert price_token in reply
        sess = session_store.load(sid) or {}
        return str(sess.get("world_id")), reply

    with ThreadPoolExecutor(max_workers=3) as pool:
        f1 = pool.submit(_ask, "s_conc_a", WORLD_0469, LISTING_0469, "490万")
        f2 = pool.submit(_ask, "s_conc_b", WORLD_0259, LISTING_0259, "460万")
        f3 = pool.submit(_ask, "s_conc_c", "w_0330_840483", "listing_0330_840483", "430万")
        w1, r1 = f1.result()
        w2, r2 = f2.result()
        w3, r3 = f3.result()
    assert w1 == WORLD_0469 and "490万" in r1 and "460万" not in r1
    assert w2 == WORLD_0259 and "460万" in r2 and "490万" not in r2
    assert w3 == "w_0330_840483" and "430万" in r3
    session_store.clear("s_conc_a")
    session_store.clear("s_conc_b")
    session_store.clear("s_conc_c")


def test_error_body_no_secrets() -> None:
    resp = client.get("/api/scene/w_does_not_exist")
    blob = json.dumps(resp.json(), ensure_ascii=False)
    assert not re.search(r"(sk-|AKLT|token=|Bearer )", blob, re.I)
    assert "Traceback" not in blob
    assert "File \"" not in blob
