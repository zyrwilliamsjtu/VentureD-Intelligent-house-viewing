"""GET /api/scene/{world_id} — SPEC routing and coord checks."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_real_world_returns_scene_with_coord() -> None:
    resp = client.get("/api/scene/w_0330_840483")
    assert resp.status_code == 200
    body = resp.json()
    assert body["world_id"] == "w_0330_840483"
    assert body["coord"]["unit"] == "m"
    assert body["coord"]["up"] == "Y"


def test_mock_world_returns_scene_with_coord() -> None:
    resp = client.get("/api/scene/w_mock_001")
    assert resp.status_code == 200
    body = resp.json()
    assert body["world_id"] == "w_mock_001"
    assert body["coord"]["unit"] == "m"
    assert body["coord"]["up"] == "Y"


def test_unknown_world_returns_spec_error() -> None:
    resp = client.get("/api/scene/w_does_not_exist")
    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == "WORLD_NOT_FOUND"
    assert body["message"] == "世界不存在"
