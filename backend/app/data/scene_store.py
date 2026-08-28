"""Map world_id to scene_graph.json on disk. Read-only."""
from __future__ import annotations

import json
from pathlib import Path

from app.config import REPO_ROOT

# world_id → path relative to repo root (SPEC §7 routing)
WORLD_FILES: dict[str, Path] = {
    "w_mock_001": REPO_ROOT / "mock" / "scene_graph.json",
    "w_0330_840483": REPO_ROOT / "mock" / "real_0330" / "scene_graph.json",
    "w_0469_840829": REPO_ROOT / "mock" / "0469_840829" / "scene_graph.json",
    "w_0259_840804": REPO_ROOT / "mock" / "0259_840804" / "scene_graph.json",
    "w_0309_840544": REPO_ROOT / "mock" / "0309_840544" / "scene_graph.json",
    "w_0836_841149": REPO_ROOT / "mock" / "0836_841149" / "scene_graph.json",
}


def load_scene_graph(world_id: str) -> dict | None:
    """Return parsed JSON, or None if world_id is unknown."""
    path = WORLD_FILES.get(world_id)
    if path is None:
        return None
    if not path.is_file():
        raise FileNotFoundError(str(path))
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("scene_graph root must be an object")
    return data
