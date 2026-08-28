"""GET /api/camera_poses/{world_id} — SPEC routing."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_real_world_returns_poses() -> None:
    resp = client.get("/api/camera_poses/w_0330_840483")
    assert resp.status_code == 200
    body = resp.json()
    assert body["world_id"] == "w_0330_840483"
    poses = body["poses"]
    assert isinstance(poses, dict)
    assert "_note" not in poses
    assert "tp_living" in poses
    assert isinstance(poses["tp_living"], list)
    assert len(poses["tp_living"]) == 3


def test_mock_world_returns_poses() -> None:
    resp = client.get("/api/camera_poses/w_mock_001")
    assert resp.status_code == 200
    body = resp.json()
    assert body["world_id"] == "w_mock_001"
    poses = body["poses"]
    assert "tp_living" in poses
    assert len(poses["tp_living"]) == 3


def test_unknown_world_returns_spec_error() -> None:
    resp = client.get("/api/camera_poses/w_does_not_exist")
    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == "WORLD_NOT_FOUND"
    assert body["message"] == "世界不存在"


def test_0309_and_0836_have_tp_living_from_kitchen() -> None:
    """无独立客厅：tp_living 复用已对拍 tp_kitchen，禁止编造新点。"""
    for world, kitchen in (
        ("w_0309_840544", [-0.658, -0.125, 0.5]),
        ("w_0836_841149", [-0.353, -0.892, 0.5]),
    ):
        resp = client.get(f"/api/camera_poses/{world}")
        assert resp.status_code == 200, world
        poses = resp.json()["poses"]
        assert "tp_living" in poses
        assert poses["tp_living"] == kitchen
        assert poses["tp_living"] == poses["tp_kitchen"]
        assert "_tp_living_source" not in poses
