"""Agent 全链路自测：自主介绍（tour/镜头/讲解）+ 用户提问 + 可选 live 语音。

conftest 默认把 ASR/TTS/CHAT 打成 stub。本文件：
- 规则/坐标/防幻觉：始终跑
- 真 LLM / 真 ASR / 真 TTS：仅 AGENT_LIVE_VOICE=1（覆盖 PROVIDER，凭证仍走 .env）
key 不打印。
"""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import BACKEND_ROOT, REPO_ROOT, llm_api_key, llm_base_url, llm_model
from app.main import app
from app.services.agent.chat.responder import SMALLTALK_REPLY, UNKNOWN_REPLY
from app.services.agent.session import store as session_store

client = TestClient(app)

WORLD = "w_0330_840483"
LIVE = os.environ.get("AGENT_LIVE_VOICE") == "1"
AUDIO_PATH = BACKEND_ROOT / "tests" / "assets" / "test_audio.m4a"
POSES_PATH = REPO_ROOT / "mock" / "real_0330" / "camera_poses.json"
SCENE_PATH = REPO_ROOT / "mock" / "real_0330" / "scene_graph.json"

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

RULE_AREA_REPLY = "三室一厅，120.1㎡。"
_LIVE_FAILS = 0
RUN: dict[str, object] = {"mode1": {}, "mode2": {}, "live": {}}


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict)
    return data


def _pose_whitelist() -> dict[str, list]:
    data = _load_json(POSES_PATH)
    return {k: v for k, v in data.items() if not str(k).startswith("_")}


def _scene() -> dict:
    return _load_json(SCENE_PATH)


def _chat(text: str, *, sid: str, event: str | None = None) -> tuple[int, dict]:
    payload: dict = {"session_id": sid, "world_id": WORLD, "user_text": text}
    if event:
        payload["event"] = event
    resp = client.post("/api/agent/chat", json=payload)
    body = resp.json()
    assert isinstance(body, dict)
    return resp.status_code, body


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


def _note_live_fail() -> None:
    global _LIVE_FAILS
    _LIVE_FAILS += 1


@pytest.fixture(scope="module", autouse=True)
def _print_run_summary() -> None:
    yield
    dump = BACKEND_ROOT / "tests" / "acceptance" / "_full_link_run.json"
    dump.write_text(json.dumps(RUN, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print("\n===== 全链路自测 RUN 摘要 =====")
    print(dump.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 模式一：自主介绍（路线规划 + 镜头 + 讲解）
# ---------------------------------------------------------------------------


def test_mode1_tour_steps_whitelist_and_inventory() -> None:
    whitelist = _pose_whitelist()
    assert len(whitelist) == 85
    scene = _scene()
    assert scene.get("tour_path") == TOUR_PATH

    resp = client.post(
        "/api/agent/tour",
        json={"world_id": WORLD, "session_id": "s_full_tour"},
    )
    assert resp.status_code == 200, resp.text
    steps = resp.json().get("steps")
    assert isinstance(steps, list)
    assert len(steps) == 10
    assert [s["room_id"] for s in steps] == TOUR_PATH

    inventory: list[dict] = []
    rooms_by_id = {r["id"]: r for r in scene.get("rooms") or []}
    for i, step in enumerate(steps):
        assert step["index"] == i
        assert step["room_id"] == TOUR_PATH[i]
        tp = step["trajectory_point_id"]
        assert isinstance(tp, str) and tp
        assert tp in whitelist, f"tp {tp} 不在 camera_poses 85 键白名单"
        assert step.get("narration"), f"{step['room_id']} narration 为空"
        assert "selling_points" not in step
        room = rooms_by_id[step["room_id"]]
        assert tp == room.get("trajectory_point_id")
        inventory.append(
            {
                "index": i,
                "room_id": step["room_id"],
                "name": room.get("name"),
                "tp_id": tp,
                "narration": step["narration"],
            }
        )
    RUN["mode1"]["tour_steps"] = inventory
    session_store.clear("s_full_tour")


def test_mode1_camera_pose_chain() -> None:
    whitelist = _pose_whitelist()
    tour = client.post(
        "/api/agent/tour",
        json={"world_id": WORLD, "session_id": "s_full_cam"},
    )
    assert tour.status_code == 200
    steps = tour.json()["steps"]

    cam = client.get(f"/api/camera_poses/{WORLD}")
    assert cam.status_code == 200, cam.text
    poses = cam.json().get("poses")
    assert isinstance(poses, dict)
    assert len(poses) == 85

    chain: list[dict] = []
    z_vals: list[float] = []
    for step in steps:
        tp = step["trajectory_point_id"]
        xyz = poses.get(tp)
        assert xyz is not None, f"API poses 缺 {tp}"
        assert list(xyz) == list(whitelist[tp])
        assert isinstance(xyz, list) and len(xyz) == 3
        x, y, z = (float(xyz[0]), float(xyz[1]), float(xyz[2]))
        assert all(math.isfinite(v) for v in (x, y, z)), f"{tp} 含 NaN/Inf"
        assert -20.0 <= x <= 20.0 and -20.0 <= y <= 20.0, f"{tp} XY 超房屋量级: {xyz}"
        assert -0.5 <= z <= 4.0, f"{tp} Z(点云 Z-up 高度) 超量级: {z}"
        z_vals.append(z)
        chain.append({"room_id": step["room_id"], "tp_id": tp, "xyz": [x, y, z]})
    RUN["mode1"]["camera_chain"] = chain
    RUN["mode1"]["z_range"] = [min(z_vals), max(z_vals)]
    session_store.clear("s_full_cam")


def test_mode1_narration_per_room() -> None:
    rows: list[dict] = []
    for room_id in TOUR_PATH:
        resp = client.get(
            "/api/agent/narration",
            params={"world_id": WORLD, "room_id": room_id},
        )
        assert resp.status_code == 200, f"{room_id}: {resp.text}"
        body = resp.json()
        text = body.get("reply_text") or ""
        assert text.strip(), f"{room_id} 讲解词为空"
        assert "tts_url" not in body
        rows.append({"room_id": room_id, "reply_text": text})
    RUN["mode1"]["narrations"] = rows


@pytest.mark.skipif(not LIVE, reason="live TTS opt-in")
def test_mode1_live_narration_tts(monkeypatch: pytest.MonkeyPatch) -> None:
    _live_or_skip()
    _enable_live_voice(monkeypatch)
    sampled = ["room_living", "room_bedroom_master"]
    urls: list[str] = []
    try:
        for room_id in sampled:
            nar = client.get(
                "/api/agent/narration",
                params={"world_id": WORLD, "room_id": room_id},
            )
            assert nar.status_code == 200
            text = nar.json()["reply_text"]
            t0 = time.perf_counter()
            tts = client.post("/api/agent/tts", json={"text": text})
            ms = int((time.perf_counter() - t0) * 1000)
            assert tts.status_code == 200, tts.text
            url = tts.json().get("audio_url") or ""
            assert url.startswith("/static/tts/"), f"{room_id} TTS 无 URL: {tts.json()}"
            audio = client.get(url)
            assert audio.status_code == 200
            assert len(audio.content) > 100
            urls.append(url)
            RUN.setdefault("live", {})
            live = RUN["live"]
            assert isinstance(live, dict)
            live[f"tts_{room_id}"] = {"url": url, "ms": ms, "bytes": len(audio.content)}
    except Exception:
        _note_live_fail()
        raise


# ---------------------------------------------------------------------------
# 模式二：用户提问
# ---------------------------------------------------------------------------


def test_mode2_nav_master_bedroom() -> None:
    sid = "s_full_nav"
    session_store.clear(sid)
    code, body = _chat("主卧在哪", sid=sid)
    assert code == 200, body
    assert "主卧" in body.get("reply_text", "")
    assert "带您去主卧" in body.get("reply_text", "")
    assert "无法判断" not in body.get("reply_text", "")
    actions = body.get("actions") or []
    assert actions
    assert actions[0].get("type") == "teleport"
    assert actions[0].get("tp_id") == "tp_bedroom_master"
    assert "position" not in actions[0]
    whitelist = _pose_whitelist()
    assert actions[0]["tp_id"] in whitelist
    RUN["mode2"]["nav_master"] = {
        "reply_text": body["reply_text"],
        "tp_id": actions[0]["tp_id"],
        "xyz": whitelist["tp_bedroom_master"],
    }
    session_store.clear(sid)


def test_mode2_instance_sofa() -> None:
    sid = "s_full_sofa"
    session_store.clear(sid)
    code, body = _chat("沙发在哪", sid=sid)
    assert code == 200, body
    reply = body.get("reply_text") or ""
    assert "沙发" in reply and "客厅" in reply
    tps = [a.get("tp_id") for a in (body.get("actions") or [])]
    assert "tp_sofa_417" in tps or "tp_living" in tps, tps
    assert tps[0] in _pose_whitelist()
    RUN["mode2"]["sofa"] = {"reply_text": reply, "tp_ids": tps}
    session_store.clear(sid)


def test_mode2_property_area() -> None:
    sid = "s_full_area"
    session_store.clear(sid)
    code, body = _chat("这套房多大", sid=sid)
    assert code == 200, body
    reply = body.get("reply_text") or ""
    assert "120.1" in reply
    assert "待对拍" not in reply
    RUN["mode2"]["area"] = {"reply_text": reply}
    session_store.clear(sid)


def test_mode2_followup_kitchen_same_session() -> None:
    sid = "s_full_follow"
    session_store.clear(sid)
    code1, first = _chat("客厅怎么样", sid=sid)
    assert code1 == 200, first
    code2, second = _chat("那厨房呢", sid=sid)
    assert code2 == 200, second
    reply = second.get("reply_text") or ""
    assert "厨房" in reply
    assert "5.6" in reply
    assert "灶台" not in reply
    assert "U型" not in reply
    RUN["mode2"]["followup"] = {
        "first": first.get("reply_text"),
        "second": reply,
    }
    session_store.clear(sid)


def test_mode2_hallucination_guards() -> None:
    sid = "s_full_guard"
    session_store.clear(sid)
    _, stove = _chat("有灶台吗", sid=sid)
    stove_text = stove.get("reply_text") or ""
    assert "没有" in stove_text or "可靠信息" in stove_text or "数据未提供" in stove_text
    assert "U型" not in stove_text
    assert "501" not in stove_text

    _, missing = _chat("钢琴在哪", sid="s_full_piano")
    miss_text = missing.get("reply_text") or ""
    assert "没有" in miss_text and "可靠信息" in miss_text
    assert "actions" not in missing

    _, fridge = _chat("冰箱多大", sid="s_full_fridge")
    fridge_text = fridge.get("reply_text") or ""
    assert "501" not in fridge_text

    _, orient = _chat("这套房朝向怎么样", sid="s_full_orient")
    orient_text = orient.get("reply_text") or ""
    assert "数据未提供" in orient_text
    assert "南" not in orient_text

    RUN["mode2"]["guards"] = {
        "stove": stove_text,
        "piano": miss_text,
        "fridge": fridge_text,
        "orientation": orient_text,
    }
    session_store.clear(sid)
    session_store.clear("s_full_piano")
    session_store.clear("s_full_fridge")
    session_store.clear("s_full_orient")


def test_mode2_llm_bad_url_falls_back_not_500(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/api/v3")
    sid = "s_full_fallback"
    session_store.clear(sid)
    code, body = _chat("主卧在哪", sid=sid)
    assert code == 200, body
    assert "主卧" in (body.get("reply_text") or "")
    assert (body.get("actions") or [])[0]["tp_id"] == "tp_bedroom_master"
    RUN["mode2"]["fallback_bad_url"] = {"status": code, "reply_text": body.get("reply_text")}
    session_store.clear(sid)


@pytest.mark.skipif(not LIVE, reason="live LLM opt-in")
def test_mode2_live_nav_keeps_rule_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    """导航即使开了真 LLM 也不改写，保证与 teleport 一致。"""
    _live_or_skip()
    _enable_live_chat(monkeypatch)
    sid = "s_full_nav_live"
    session_store.clear(sid)
    try:
        code, body = _chat("主卧在哪", sid=sid)
        assert code == 200, body
        reply = body.get("reply_text") or ""
        assert "带您去主卧" in reply
        assert "无法判断" not in reply
        assert (body.get("actions") or [])[0].get("tp_id") == "tp_bedroom_master"
        RUN["live"]["nav_rule"] = {"reply_text": reply, "tp_id": "tp_bedroom_master"}
    except Exception:
        _note_live_fail()
        raise
    finally:
        session_store.clear(sid)


@pytest.mark.skipif(not LIVE, reason="live LLM opt-in")
def test_mode2_live_free_qa_not_template(monkeypatch: pytest.MonkeyPatch) -> None:
    _live_or_skip()
    if not (llm_api_key() and llm_base_url() and llm_model()):
        pytest.skip("LLM 未配置")
    _enable_live_chat(monkeypatch)
    sid = "s_full_free"
    session_store.clear(sid)
    t0 = time.perf_counter()
    try:
        code, body = _chat("这套房适合什么人住", sid=sid)
        reply = (body.get("reply_text") or "").strip()
        # 方舟偶发失败会降级成规则版面积句；再试一次
        if code == 200 and reply == RULE_AREA_REPLY:
            session_store.clear(sid)
            code, body = _chat("这套房适合什么人住", sid=sid)
            reply = (body.get("reply_text") or "").strip()
    except Exception:
        _note_live_fail()
        raise
    ms = int((time.perf_counter() - t0) * 1000)
    if code != 200:
        _note_live_fail()
    assert code == 200, body
    assert reply
    assert reply != RULE_AREA_REPLY
    assert reply != SMALLTALK_REPLY
    assert reply != UNKNOWN_REPLY
    assert "请问您想问什么" not in reply
    grounded = ("120.1" in reply) or ("三室" in reply) or ("客厅" in reply) or ("主卧" in reply)
    assert grounded, f"自由答未 grounded 户型/面积/房间: {reply}"
    assert "灶台" not in reply
    assert "501" not in reply
    RUN["live"]["free_qa"] = {"reply_text": reply, "ms": ms}
    session_store.clear(sid)


@pytest.mark.skipif(not LIVE, reason="live voice opt-in")
def test_mode2_live_asr_chat_tts_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    _live_or_skip()
    if not AUDIO_PATH.is_file():
        pytest.skip("missing test_audio.m4a")
    _enable_live_voice(monkeypatch)
    sid = "s_full_voice"
    session_store.clear(sid)
    blob = AUDIO_PATH.read_bytes()
    timings: dict[str, int] = {}
    try:
        t0 = time.perf_counter()
        asr = client.post(
            "/api/agent/asr",
            files={"audio": ("test_audio.m4a", blob, "audio/mp4")},
        )
        timings["asr_ms"] = int((time.perf_counter() - t0) * 1000)
        assert asr.status_code == 200, asr.text
        asr_body = asr.json()
        text = (asr_body.get("text") or "").strip()
        assert text, f"POST /api/agent/asr 空转写: {asr_body}"

        t1 = time.perf_counter()
        chat_code, chat_body = _chat(text, sid=sid)
        timings["chat_ms"] = int((time.perf_counter() - t1) * 1000)
        assert chat_code == 200, chat_body
        reply = (chat_body.get("reply_text") or "").strip()
        assert reply, chat_body
        assert reply != UNKNOWN_REPLY
        if "主卧" in text:
            assert "带您去主卧" in reply
            assert "无法判断" not in reply
            assert (chat_body.get("actions") or [])[0].get("tp_id") == "tp_bedroom_master"

        t2 = time.perf_counter()
        tts = client.post("/api/agent/tts", json={"text": reply})
        timings["tts_ms"] = int((time.perf_counter() - t2) * 1000)
        assert tts.status_code == 200, tts.text
        url = tts.json().get("audio_url") or chat_body.get("tts_url") or ""
        assert str(url).startswith("/static/tts/"), f"无 TTS URL: tts={tts.json()} chat={chat_body}"
        audio = client.get(str(url))
        assert audio.status_code == 200
        assert len(audio.content) > 100
        timings["total_ms"] = timings["asr_ms"] + timings["chat_ms"] + timings["tts_ms"]
        RUN["live"]["voice_loop"] = {
            "asr_text": text,
            "asr_duration_ms": asr_body.get("duration_ms"),
            "chat_reply": reply,
            "actions": chat_body.get("actions"),
            "tts_url": url,
            "tts_bytes": len(audio.content),
            "timings_ms": timings,
        }
    except Exception:
        _note_live_fail()
        raise
    finally:
        session_store.clear(sid)
