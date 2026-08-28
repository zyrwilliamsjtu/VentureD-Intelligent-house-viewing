"""局域网静态托管：SPA 不挡 /api；/ply 防路径穿越。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import frontend_dist_dir
from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_api_listings_not_shadowed() -> None:
    r = client.get("/api/listings")
    assert r.status_code == 200
    body = r.json()
    rows = body if isinstance(body, list) else body.get("listings")
    assert isinstance(rows, list)
    assert len(rows) >= 1


def test_ply_unknown_404() -> None:
    r = client.get("/ply/no_such_scene.ply")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "NOT_FOUND"


def test_ply_rejects_odd_name() -> None:
    r = client.get("/ply/not-valid.ply")
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


def test_spa_index_if_built() -> None:
    dist = frontend_dist_dir()
    if dist is None:
        return
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")
