"""复跑 0330 坐标对拍验收：camera_poses.json ↔ scene_graph.json。

正向：X = x+0.573, Y = 1.087−z, Z = y
逆向：x = X−0.573, y = Z, z = 1.087−Y

实例：用 position 对拍，阈值 1cm。
房间：用 polygon 顶点均值 + 眼高 0.5m 对拍。
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCENE = HERE / "scene_graph.json"
POSES = HERE / "camera_poses.json"

OX = 0.573
OZ = 1.087
ROOM_EYE_Y = 0.5
THRESH_M = 0.01


def scene_to_pc(x: float, y: float, z: float) -> tuple[float, float, float]:
    return (x + OX, OZ - z, y)


def pc_to_scene(X: float, Y: float, Z: float) -> tuple[float, float, float]:
    return (X - OX, Z, OZ - Y)


def dist(a, b) -> float:
    return math.sqrt(sum((ai - bi) ** 2 for ai, bi in zip(a, b)))


def polygon_centroid(poly: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    n = len(poly)
    return sum(xs) / n, sum(zs) / n


def main() -> int:
    scene = json.loads(SCENE.read_text(encoding="utf-8"))
    poses = json.loads(POSES.read_text(encoding="utf-8"))
    rooms_ok = rooms_all = 0
    inst_ok = inst_all = 0
    max_res = 0.0
    missing: list[str] = []

    for room in scene["rooms"]:
        rooms_all += 1
        tp = room["trajectory_point_id"]
        if tp not in poses:
            missing.append(tp)
            continue
        cx, cz = polygon_centroid(room["polygon"])
        expected = scene_to_pc(cx, ROOM_EYE_Y, cz)
        got = tuple(poses[tp])
        d = dist(expected, got)
        max_res = max(max_res, d)
        if d < THRESH_M:
            rooms_ok += 1
        back = pc_to_scene(*got)
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
            expected = scene_to_pc(x, y, z)
            got = tuple(poses[itp])
            d = dist(expected, got)
            max_res = max(max_res, d)
            if d < THRESH_M:
                inst_ok += 1
            back = pc_to_scene(*got)
            if dist(back, (x, y, z)) >= THRESH_M:
                print(f"WARN inverse fail inst {itp}: {back}")

    n_poses = len([k for k in poses if k != "_note"])
    print(f"poses: {n_poses}")
    print(f"rooms: {rooms_ok}/{rooms_all} hit (<{THRESH_M}m)")
    print(f"instances: {inst_ok}/{inst_all} <1cm")
    print(f"max residual: {max_res:.4f}m")
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
