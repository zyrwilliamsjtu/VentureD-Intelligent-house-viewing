"""0330 camera_poses 转正：scene Y-up → 点云 IG 原生 Z-up。

映射公式（SPEC 附录 A，2026-08-28 实测写死）：
    X_pc = x + 0.573
    Y_pc = 1.087 − z
    Z_pc = y

用法（在 mock/real_0330/ 下）：
    python fix_poses.py
写出 camera_poses.json（覆盖）。不引入新假设。
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCENE = HERE / "scene_graph.json"
OUT = HERE / "camera_poses.json"

OX = 0.573
OZ = 1.087  # Y_pc = OZ − z
ROOM_EYE_Y = 0.5  # 房间锚点沿用质心 + 眼高 0.5m（与草稿版一致）
NOTE = (
    "0330 坐标对拍转正（2026-08-28），映射公式见 SPEC 附录 A："
    "scene→点云 X=x+0.573, Y=1.087−z, Z=y。"
)


def r3(v: float) -> float:
    return round(float(v), 3)


def scene_to_pc(x: float, y: float, z: float) -> list[float]:
    return [r3(x + OX), r3(OZ - z), r3(y)]


def polygon_centroid(poly: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    n = len(poly)
    return sum(xs) / n, sum(zs) / n


def main() -> None:
    scene = json.loads(SCENE.read_text(encoding="utf-8"))
    poses: dict = {"_note": NOTE}
    for room in scene["rooms"]:
        cx, cz = polygon_centroid(room["polygon"])
        poses[room["trajectory_point_id"]] = scene_to_pc(cx, ROOM_EYE_Y, cz)
        for inst in room.get("instances") or []:
            tp = inst.get("trajectory_point_id")
            if not tp:
                continue
            x, y, z = inst["position"]
            poses[tp] = scene_to_pc(x, y, z)
    OUT.write_text(json.dumps(poses, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n = len(poses) - 1
    print(f"wrote {OUT.name}: {n} poses")


if __name__ == "__main__":
    main()
