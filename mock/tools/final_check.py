"""复跑坐标对拍验收：camera_poses.json ↔ scene_graph.json。

正向：X = x+ox, Y = (-oz)−z, Z = y
逆向：x = X−ox, y = Z, z = (-oz)−Y
阈值 1cm。偏移从 origin.json 读取，禁止套用 0330。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOM_EYE_Y = 0.5
THRESH_M = 0.01


def scene_to_pc(x: float, y: float, z: float, ox: float, oz_neg: float) -> tuple[float, float, float]:
    return (x + ox, oz_neg - z, y)


def pc_to_scene(X: float, Y: float, Z: float, ox: float, oz_neg: float) -> tuple[float, float, float]:
    return (X - ox, Z, oz_neg - Y)


def dist(a, b) -> float:
    return math.sqrt(sum((ai - bi) ** 2 for ai, bi in zip(a, b)))


def polygon_centroid(poly: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    n = len(poly)
    return sum(xs) / n, sum(zs) / n


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-dir", type=Path, required=True)
    args = parser.parse_args()
    scene_dir = args.scene_dir
    origin = json.loads((scene_dir / "origin.json").read_text(encoding="utf-8"))
    ox = float(origin["ox"])
    oz_neg = float(origin["pc_offset_y_const"])
    scene = json.loads((scene_dir / "scene_graph.json").read_text(encoding="utf-8"))
    poses = json.loads((scene_dir / "camera_poses.json").read_text(encoding="utf-8"))

    rooms_ok = rooms_all = 0
    inst_ok = inst_all = 0
    max_res = 0.0
    missing: list[str] = []
    worst: tuple[str, float] | None = None

    for room in scene["rooms"]:
        rooms_all += 1
        tp = room["trajectory_point_id"]
        if tp not in poses:
            missing.append(tp)
            continue
        cx, cz = polygon_centroid(room["polygon"])
        expected = scene_to_pc(cx, ROOM_EYE_Y, cz, ox, oz_neg)
        got = tuple(poses[tp])
        d = dist(expected, got)
        max_res = max(max_res, d)
        if worst is None or d > worst[1]:
            worst = (tp, d)
        if d < THRESH_M:
            rooms_ok += 1
        back = pc_to_scene(*got, ox, oz_neg)
        if dist(back, (cx, ROOM_EYE_Y, cz)) >= THRESH_M:
            print(f"WARN inverse fail room {tp}: {back}")

        for inst in room.get("instances") or []:
            itp = inst.get("trajectory_point_id")
            if not itp:
                continue
            inst_all += 1
            if itp not in poses:
                missing.append(itp)
                continue
            x, y, z = inst["position"]
            expected = scene_to_pc(x, y, z, ox, oz_neg)
            got = tuple(poses[itp])
            d = dist(expected, got)
            max_res = max(max_res, d)
            if worst is None or d > worst[1]:
                worst = (itp, d)
            if d < THRESH_M:
                inst_ok += 1
            back = pc_to_scene(*got, ox, oz_neg)
            if dist(back, (x, y, z)) >= THRESH_M:
                print(f"WARN inverse fail inst {itp}: {back}")

    n_poses = len([k for k in poses if k != "_note"])
    print(f"scene={origin.get('scene_id')} ox={ox} Y_const={oz_neg}")
    print(f"poses: {n_poses}")
    print(f"rooms: {rooms_ok}/{rooms_all} hit (<{THRESH_M}m)")
    print(f"instances: {inst_ok}/{inst_all} <1cm")
    print(f"max residual: {max_res:.4f}m worst={worst}")
    if missing:
        print("missing:", missing)
        return 1
    ok = rooms_ok == rooms_all and inst_ok == inst_all and n_poses == rooms_all + inst_all
    if not ok:
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
