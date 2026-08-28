"""多世界一致性：listings ↔ scene/camera_poses ↔ chat 问价，防演示穿帮。"""
from __future__ import annotations

import json
import math
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.main import app
from app.services.agent.session import store as session_store

client = TestClient(app)

WORLD_DIRS: dict[str, Path] = {
    "w_0330_840483": REPO_ROOT / "mock" / "real_0330",
    "w_0469_840829": REPO_ROOT / "mock" / "0469_840829",
    "w_0259_840804": REPO_ROOT / "mock" / "0259_840804",
    "w_0309_840544": REPO_ROOT / "mock" / "0309_840544",
    "w_0836_841149": REPO_ROOT / "mock" / "0836_841149",
}

# 点云 XY 为地面（含平移后可达十几米）；Z 为高度（房间锚点约 0.5m）
XY_ABS = 30.0
Z_MIN, Z_MAX = -1.0, 5.0


def _listings() -> list[dict]:
    resp = client.get("/api/listings")
    assert resp.status_code == 200
    return resp.json()["listings"]


def test_listings_area_matches_scene_house_total() -> None:
    diffs: list[str] = []
    for item in _listings():
        world = item["world_id"]
        scene = client.get(f"/api/scene/{world}").json()
        house_area = float(scene["house"]["total_area"])
        listed = float(item["area"])
        if abs(house_area - listed) > 0.05:
            diffs.append(f"{world}: listing.area={listed} scene.total_area={house_area}")
    assert not diffs, "挂牌面积与 scene 总面积不一致: " + "; ".join(diffs)


def test_each_real_world_has_ten_rooms() -> None:
    for item in _listings():
        world = item["world_id"]
        scene = client.get(f"/api/scene/{world}").json()
        n = len(scene.get("rooms") or [])
        assert n == 10, f"{world} rooms={n}"


def test_each_listing_world_scene_and_poses_200() -> None:
    for item in _listings():
        world = item["world_id"]
        s = client.get(f"/api/scene/{world}")
        p = client.get(f"/api/camera_poses/{world}")
        assert s.status_code == 200, world
        assert p.status_code == 200, world
        assert s.json()["world_id"] == world
        assert p.json()["world_id"] == world
        assert p.json()["poses"]


def test_chat_price_matches_listing_for_all_five() -> None:
    for item in _listings():
        sid = f"s_consis_{item['id']}"
        session_store.clear(sid)
        resp = client.post(
            "/api/agent/chat",
            json={
                "session_id": sid,
                "world_id": item["world_id"],
                "listing_id": item["id"],
                "user_text": "这套多少钱",
            },
        )
        assert resp.status_code == 200, resp.text
        reply = resp.json()["reply_text"]
        assert item["price"] in reply, f"{item['id']}: want {item['price']} got {reply}"
        assert str(item["price_num"]) in reply.replace("万", "")
        session_store.clear(sid)


def test_chat_without_listing_id_0330_price_unavailable() -> None:
    sid = "s_consis_no_listing"
    session_store.clear(sid)
    resp = client.post(
        "/api/agent/chat",
        json={
            "session_id": sid,
            "world_id": "w_0330_840483",
            "user_text": "这套多少钱",
        },
    )
    assert resp.status_code == 200, resp.text
    reply = resp.json()["reply_text"]
    assert "430万" not in reply
    assert "数据未提供" in reply
    session_store.clear(sid)


def _origin_offset(world_id: str) -> tuple[float, float] | None:
    d = WORLD_DIRS[world_id]
    origin_path = d / "origin.json"
    if origin_path.is_file():
        o = json.loads(origin_path.read_text(encoding="utf-8"))
        return float(o["ox"]), float(o["pc_offset_y_const"])
    if world_id == "w_0330_840483":
        return 0.573, 1.087
    return None


def test_camera_poses_zup_range_and_anchor_roundtrip() -> None:
    """各套独立标定：房间 tp 高度≈0.5；抽 1–2 锚点 scene↔poses <1cm。"""
    for item in _listings():
        world = item["world_id"]
        scene = client.get(f"/api/scene/{world}").json()
        poses = client.get(f"/api/camera_poses/{world}").json()["poses"]
        rooms = scene.get("rooms") or []
        checked = 0
        for room in rooms:
            tp = room.get("trajectory_point_id")
            if not tp or tp not in poses:
                continue
            xyz = poses[tp]
            assert isinstance(xyz, list) and len(xyz) == 3
            x, y, z = (float(xyz[0]), float(xyz[1]), float(xyz[2]))
            assert all(math.isfinite(v) for v in (x, y, z)), (world, tp, xyz)
            assert abs(x) <= XY_ABS and abs(y) <= XY_ABS, f"{world} {tp} XY {xyz}"
            assert Z_MIN <= z <= Z_MAX, f"{world} {tp} Z(高度) {z}"
            assert abs(z - 0.5) < 0.05, f"{world} {tp} 房间锚点高度应为 ~0.5，实际 {z}"
            off = _origin_offset(world)
            if off:
                ox, yconst = off
                poly = room.get("polygon") or []
                if len(poly) >= 3:
                    cx = sum(p[0] for p in poly) / len(poly)
                    cz = sum(p[1] for p in poly) / len(poly)
                    expected = (cx + ox, yconst - cz, 0.5)
                    dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(expected, (x, y, z))))
                    assert dist < 0.01, f"{world} {tp} 残差 {dist:.4f}m"
            checked += 1
            if checked >= 2:
                break
        assert checked >= 1, world
