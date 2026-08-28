"""scene Y-up → 点云 IG 原生 Z-up，写出 camera_poses.json。

公式（与 0330 相同形态，平移量必须来自本场景 origin.json）：
    X_pc = x + ox
    Y_pc = (-oz) − z
    Z_pc = y

0330 专属硬编码 0.573/1.087 已移除；禁止套用。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOM_EYE_Y = 0.5


def r3(v: float) -> float:
    return round(float(v), 3)


def scene_to_pc(x: float, y: float, z: float, ox: float, oz_neg: float) -> list[float]:
    return [r3(x + ox), r3(oz_neg - z), r3(y)]


def polygon_centroid(poly: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    n = len(poly)
    return sum(xs) / n, sum(zs) / n


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-dir", type=Path, required=True, help="含 scene_graph.json 与 origin.json")
    args = parser.parse_args()
    scene_dir = args.scene_dir
    scene_path = scene_dir / "scene_graph.json"
    origin_path = scene_dir / "origin.json"
    out_path = scene_dir / "camera_poses.json"
    origin = json.loads(origin_path.read_text(encoding="utf-8"))
    ox = float(origin["ox"])
    oz_neg = float(origin["pc_offset_y_const"])
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    note = (
        f"{origin.get('scene_id')} 坐标对拍："
        f"scene→点云 X=x+{ox}, Y={oz_neg}−z, Z=y（本场景 house_center，禁止套用 0330）。"
    )
    poses: dict = {"_note": note}
    for room in scene["rooms"]:
        cx, cz = polygon_centroid(room["polygon"])
        poses[room["trajectory_point_id"]] = scene_to_pc(cx, ROOM_EYE_Y, cz, ox, oz_neg)
        for inst in room.get("instances") or []:
            tp = inst.get("trajectory_point_id")
            if not tp:
                continue
            x, y, z = inst["position"]
            poses[tp] = scene_to_pc(x, y, z, ox, oz_neg)
    out_path.write_text(json.dumps(poses, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out_path}: {len(poses) - 1} poses ox={ox} Y_const={oz_neg}")


if __name__ == "__main__":
    main()
