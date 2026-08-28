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
