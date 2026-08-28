"""Map world_id to camera_poses.json. Read-only."""
from __future__ import annotations

import json
from pathlib import Path

from app.config import REPO_ROOT

WORLD_POSE_FILES: dict[str, Path] = {
    "w_mock_001": REPO_ROOT / "mock" / "camera_poses.json",
    "w_0330_840483": REPO_ROOT / "mock" / "real_0330" / "camera_poses.json",
}


def load_camera_poses(world_id: str) -> dict | None:
    """Return tp_id → [x,y,z] map, or None if world_id is unknown.

    Drops documentation-only keys such as `_note`.
    """
    path = WORLD_POSE_FILES.get(world_id)
    if path is None:
        return None
    if not path.is_file():
        raise FileNotFoundError(str(path))
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("camera_poses root must be an object")
    poses: dict = {}
    for key, value in data.items():
        if key.startswith("_"):
            continue
        poses[key] = value
    return poses
