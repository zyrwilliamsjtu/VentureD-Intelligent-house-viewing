"""GET /api/listings + 5 套真实 world 路由 + listing_id 问答 + 对拍抽样."""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.main import app
from app.services.agent.service import handle_chat
from app.services.agent.session import store as session_store

client = TestClient(app)

REAL_WORLDS = [
    "w_0330_840483",
    "w_0469_840829",
    "w_0259_840804",
    "w_0309_840544",
    "w_0836_841149",
]
LISTING_0469 = "listing_0469_840829"
REQUIRED_LISTING_KEYS = {
    "id",
    "title",
    "layout",
    "area",
    "orientation",
    "floor",
    "price",
    "price_num",
    "tags",
    "highlight",
    "world_id",
    "is_real",
}


def _snake(key: str) -> bool:
    return key == key.lower() and " " not in key


def test_listings_five_real_snake_case() -> None:
    resp = client.get("/api/listings")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"listings"}
    listings = body["listings"]
    assert len(listings) == 5
    worlds = {item["world_id"] for item in listings}
    assert worlds == set(REAL_WORLDS)
    ids = {item["id"] for item in listings}
    assert ids == {f"listing_{w[2:]}" for w in REAL_WORLDS}
    for item in listings:
        for key in item:
            assert _snake(key), key
        assert REQUIRED_LISTING_KEYS <= set(item.keys())
        assert item["is_real"] is True
        assert item["world_id"] in REAL_WORLDS
        scene = client.get(f"/api/scene/{item['world_id']}")
        assert scene.status_code == 200


@pytest.mark.parametrize("world_id", REAL_WORLDS)
def test_scene_five_worlds_200(world_id: str) -> None:
    resp = client.get(f"/api/scene/{world_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["world_id"] == world_id
    assert body["coord"]["unit"] == "m"
    assert body["coord"]["up"] == "Y"


@pytest.mark.parametrize("world_id", REAL_WORLDS)
def test_camera_poses_five_worlds_200(world_id: str) -> None:
    resp = client.get(f"/api/camera_poses/{world_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["world_id"] == world_id
    poses = body["poses"]
    assert isinstance(poses, dict) and poses
    assert "_note" not in poses


def test_unknown_world_still_404() -> None:
    for path in ("/api/scene/w_does_not_exist", "/api/camera_poses/w_does_not_exist"):
        resp = client.get(path)
        assert resp.status_code == 404
        assert resp.json()["code"] == "WORLD_NOT_FOUND"


def test_chat_with_listing_id_answers_listing_price() -> None:
    session_store.clear("s_listing_price")
    body = handle_chat(
        session_id="s_listing_price",
        world_id="w_0469_840829",
        user_text="这套多少钱",
        listing_id=LISTING_0469,
    )
    assert "490万" in body["reply_text"]
    assert "待对拍" not in body["reply_text"]
    assert "数据未提供" not in body["reply_text"]


def test_chat_without_listing_id_0330_price_placeholder() -> None:
    session_store.clear("s_no_listing")
    body = handle_chat(
        session_id="s_no_listing",
        world_id="w_0330_840483",
        user_text="这套多少钱",
    )
    assert "430万" not in body["reply_text"]
    assert "数据未提供" in body["reply_text"]


def _dist(a, b) -> float:
    return math.sqrt(sum((ai - bi) ** 2 for ai, bi in zip(a, b)))


@pytest.mark.parametrize(
    "scene_dir,world_id",
    [
        (REPO_ROOT / "mock" / "0469_840829", "w_0469_840829"),
        (REPO_ROOT / "mock" / "0259_840804", "w_0259_840804"),
    ],
)
def test_align_sample_instances_under_1cm(scene_dir: Path, world_id: str) -> None:
    origin = json.loads((scene_dir / "origin.json").read_text(encoding="utf-8"))
    scene = json.loads((scene_dir / "scene_graph.json").read_text(encoding="utf-8"))
    poses = json.loads((scene_dir / "camera_poses.json").read_text(encoding="utf-8"))
    ox = float(origin["ox"])
    yconst = float(origin["pc_offset_y_const"])
    checked = 0
    for room in scene["rooms"]:
        for inst in room.get("instances") or []:
            tp = inst.get("trajectory_point_id")
            if not tp or tp not in poses:
                continue
            x, y, z = inst["position"]
            expected = (x + ox, yconst - z, y)
            got = tuple(poses[tp])
            assert _dist(expected, got) < 0.01, (world_id, tp)
            checked += 1
            if checked >= 8:
                return
    assert checked >= 1
